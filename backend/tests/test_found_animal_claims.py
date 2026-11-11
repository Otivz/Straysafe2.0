"""
Found-animal notices, sightings and ownership claims, built on the existing neighborhood-alert capability
(routes/lost_pet_alerts.py, routes/ownership_claims.py, routes/cases.py).

  - a found-animal notice is a lost-pet alert of type 'found_animal': requested, reviewed and published separately
  - the publication policy decides whether a resident's request is published at once; a private complaint, a nuisance
    or a safety concern never is
  - other residents see the AREA of a sighting, never the pin; neighbors never see the marks that prove ownership
  - a claim is made on a PUBLISHED notice, is reviewed by the Subdivision Admin, and never establishes ownership
Offline: throwaway SQLite, never app.main. Run from the backend folder:  python tests/test_found_animal_claims.py
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)
from datetime import datetime
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "found_animal.db")
os.environ.setdefault("JWT_SECRET_KEY", "found-animal-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.case_records import OwnershipClaim  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import cases, lost_pet_alerts, ownership_claims  # noqa: E402
from app.utils import case_policy  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
assert run_case_alignment(engine)["errors"] == []
api = FastAPI()
for router in (lost_pet_alerts.router, ownership_claims.router, cases.router):
    api.include_router(router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


for rid, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.commit()


def user(name, role, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@found.test", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


finder = user("Finn Finder", 1)
claimant = user("Cora Claimant", 1)
claimant2 = user("Carl Claimant", 1)
neighbor = user("Nina Neighbor", 1)
far_resident = user("Far Resident", 1, subdivision=2)
leader = user("Leader One", 2)
other_leader = user("Leader Two", 2, subdivision=2)
admin = user("Admin One", 4)


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


LOSTCAT = db.query(ReportCategory).filter(ReportCategory.category_name == "Lost Pet").one().category_id
FOUND = db.query(ReportCategory).filter(ReportCategory.category_name == "Found / Unidentified Animal").one().category_id
NUISANCE = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").one().category_id
COLLAR = "Brown dog with a red collar and a scar on the left ear"


def found_report(**kw):
    r = Report(user_id=finder.user_id, subdivision_id=1, category_id=FOUND, current_status_id=2, animal_type="Dog", animal_color="Brown",
               description=COLLAR, latitude=Decimal("14.80123450"), longitude=Decimal("121.00456780"), landmark="Gate 2", **kw)
    db.add(r)
    db.commit()
    return r.report_id


def fresh(model, key):
    db.expire_all()
    return db.get(model, key)


def settings(**publication):
    body = case_policy.default_settings().model_dump(mode="json")
    body["publication"].update(publication)
    res = client.put("/cases/settings/1", json=body, headers=H(leader))
    assert res.status_code == 200, res.text


def notes(user_id, like):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == user_id, Notification.title.like(like)).count()


# ============================================================================================================
# 1. Requesting a found-animal notice (separate from submitting the report and from publishing)
# ============================================================================================================
rid = found_report()
ask = {"alert_type": "found_animal"}
check("a neighbor can't ask for a found-animal notice", client.post(f"/lost-pet-alerts/reports/{rid}/request", json=ask, headers=H(neighbor)).status_code == 403)
check("a found animal isn't a lost pet: the default alert type is refused for it",
      client.post(f"/lost-pet-alerts/reports/{rid}/request", json={}, headers=H(leader)).status_code == 409)
lost = Report(user_id=finder.user_id, subdivision_id=1, category_id=LOSTCAT, current_status_id=2, animal_type="Dog", latitude=Decimal("14.8"), longitude=Decimal("121.0"), description="[LOST PET REPORT] missing")
db.add(lost)
db.commit()
check("...and a lost-pet report can't get a found-animal notice", client.post(f"/lost-pet-alerts/reports/{lost.report_id}/request", json=ask, headers=H(leader)).status_code == 409)
nuisance = Report(user_id=finder.user_id, subdivision_id=1, category_id=NUISANCE, current_status_id=2, animal_type="Dog", latitude=Decimal("14.8"), longitude=Decimal("121.0"))
db.add(nuisance)
db.commit()
check("a nuisance case can't carry a found-animal notice", client.post(f"/lost-pet-alerts/reports/{nuisance.report_id}/request", json=ask, headers=H(leader)).status_code == 409)
private = found_report(is_sensitive=True)
res = client.post(f"/lost-pet-alerts/reports/{private}/request", json=ask, headers=H(finder))
check("a private complaint is never published as a notice", res.status_code == 409 and "private" in res.text.lower(), res.text)
check("a pin outside the coverage area is refused, server side", client.post(f"/lost-pet-alerts/reports/{rid}/request", json={**ask, "last_seen_lat": 15.5, "last_seen_lng": 121.9}, headers=H(finder)).status_code == 400)

settings()   # default publication policy: review first
res = client.post(f"/lost-pet-alerts/reports/{rid}/request", json=ask, headers=H(finder))
alert_id = res.json()["alert_id"]
check("the finder's request goes to the leader for review (policy: review)", res.status_code == 200 and res.json()["status"] == "requested" and res.json()["alert_type"] == "found_animal", res.text)
alert = fresh(LostPetAlert, alert_id)
check("a found-animal alert has no owner and no pet", alert.owner_id is None and alert.pet_id is None)
check("residents were NOT told yet (submitting and publishing are different steps)", notes(neighbor.user_id, "Found animal%") == 0)
check("the leader was asked to review it", notes(leader.user_id, "Found-animal notice requested") == 1)
check("a second request while one is open is refused", client.post(f"/lost-pet-alerts/reports/{rid}/request", json=ask, headers=H(finder)).status_code == 409)

# ============================================================================================================
# 2. Claims need a PUBLISHED notice
# ============================================================================================================
claim_body = {"statement": "She is my dog Brownie, missing since Monday. She has a scar on her left ear.", "evidence": ["photos", "markings"]}
check("before publication a claim is refused: residents can't see the case", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(claimant)).status_code == 404)
check("only the leader publishes it", client.post(f"/lost-pet-alerts/{alert_id}/activate", json={}, headers=H(finder)).status_code == 403
      and client.post(f"/lost-pet-alerts/{alert_id}/activate", json={}, headers=H(other_leader)).status_code == 403)
res = client.post(f"/lost-pet-alerts/{alert_id}/activate", json={"leader_message": "Please contact the guardhouse."}, headers=H(leader))
check("the leader publishes the notice", res.status_code == 200 and res.json()["status"] == "active", res.text)
check("residents of the subdivision are told, in found-animal words", notes(neighbor.user_id, "Found animal: is it yours?") == 1 and notes(claimant.user_id, "Found animal: is it yours?") == 1)
check("...not the finder (they get their own message) and not another subdivision", notes(finder.user_id, "Found animal%") == 0 and notes(finder.user_id, "Your found-animal notice is live") == 1 and notes(far_resident.user_id, "Found animal%") == 0)
msg = db.query(Notification).filter(Notification.user_id == neighbor.user_id, Notification.title.like("Found animal%")).one().message
check("...and the notification does not give away the marks that prove ownership", "scar" not in msg and "collar" not in msg, msg)

# ============================================================================================================
# 3. What residents see: the area, never the pin; never the proof of ownership
# ============================================================================================================
as_neighbor = client.get(f"/lost-pet-alerts/{alert_id}", headers=H(neighbor)).json()
as_leader = client.get(f"/lost-pet-alerts/{alert_id}", headers=H(leader)).json()
as_finder = client.get(f"/lost-pet-alerts/{alert_id}", headers=H(finder)).json()
check("a neighbor sees the animal's looks but not its distinguishing marks or the finder's words",
      as_neighbor["pet"]["species"] == "Dog" and as_neighbor["pet"]["color"] == "Brown" and as_neighbor["pet"]["description"] is None and as_neighbor["pet"]["distinguishing_marks"] is None, as_neighbor["pet"])
check("the leader sees everything", as_leader["pet"]["description"] == COLLAR)
check("a neighbor sees the area of the last-seen place (~110 m), flagged as generalized",
      as_neighbor["last_seen"]["latitude"] == 14.801 and as_neighbor["last_seen"]["longitude"] == 121.005 and as_neighbor["last_seen"]["generalized"] is True, as_neighbor["last_seen"])
check("the leader sees the exact pin", as_leader["last_seen"]["latitude"] == 14.8012345 and as_leader["last_seen"]["longitude"] == 121.0045678 and as_leader["last_seen"]["generalized"] is False)
check("the person who found it is not 'the owner': they see what a neighbor sees", as_finder["pet"]["description"] is None and as_finder["last_seen"]["generalized"] is True)
check("an animal with no owner shows no owner name", as_neighbor["owner_first_name"] is None)
check("a resident of another subdivision can't open the notice", client.get(f"/lost-pet-alerts/{alert_id}", headers=H(far_resident)).status_code == 404)

# sightings: anyone in the subdivision, with the area shown to everyone but the leader and the person who made it
res = client.post(f"/lost-pet-alerts/{alert_id}/sightings", data={"latitude": "14.8012345", "longitude": "121.0036789", "accuracy_confirmed": "true", "description": "By the clubhouse"}, headers=H(claimant2))
check("a resident submits a sighting of the found animal", res.status_code == 200 and res.json()["duplicate"] is False, res.text)
mine = res.json()["sighting"]
check("the person who submitted it sees their own exact pin", mine["latitude"] == 14.8012345 and mine["longitude"] == 121.0036789 and mine["coordinates_generalized"] is False)
seen_by_neighbor = client.get(f"/lost-pet-alerts/{alert_id}", headers=H(neighbor)).json()["sightings"][0]
seen_by_leader = client.get(f"/lost-pet-alerts/{alert_id}", headers=H(leader)).json()["sightings"][0]
check("another resident sees the AREA of the sighting (3 decimals), not the spot, and no name",
      seen_by_neighbor["latitude"] == 14.801 and seen_by_neighbor["longitude"] == 121.004 and seen_by_neighbor["coordinates_generalized"] is True and seen_by_neighbor["reported_by"] == "A neighbor", seen_by_neighbor)
check("the leader sees the exact pin and who reported it", seen_by_leader["latitude"] == 14.8012345 and seen_by_leader["longitude"] == 121.0036789 and seen_by_leader["reported_by"] == "Carl Claimant")
check("a sighting pinned outside the coverage area is refused", client.post(f"/lost-pet-alerts/{alert_id}/sightings", data={"latitude": "15.5", "longitude": "121.9", "accuracy_confirmed": "true"}, headers=H(neighbor)).status_code == 400)
latest = client.get(f"/lost-pet-alerts/{alert_id}", headers=H(neighbor)).json()["latest_sighting"]
check("the summary's latest sighting is generalized for a neighbor too", latest["latitude"] == 14.801 and latest["coordinates_generalized"] is True)

# ============================================================================================================
# 4. Ownership claims
# ============================================================================================================
check("the person who reported the animal can't claim it", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(finder)).status_code == 409)
check("a resident of another subdivision can't claim it (404)", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(far_resident)).status_code == 404)
check("staff don't submit claims", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(leader)).status_code == 404)
check("unknown evidence is refused", client.post(f"/reports/{rid}/ownership-claims", json={**claim_body, "evidence": ["vibes"]}, headers=H(claimant)).status_code == 422)
check("evidence links must be https", client.post(f"/reports/{rid}/ownership-claims", json={**claim_body, "evidence_urls": ["http://x.test/a.jpg"]}, headers=H(claimant)).status_code == 422)
someone_elses_pet = Pet(owner_id=neighbor.user_id, pet_name="Rex", pet_type="Dog", status="Active")
my_pet = Pet(owner_id=claimant.user_id, pet_name="Brownie", pet_type="Dog", status="Active")
db.add_all([someone_elses_pet, my_pet])
db.commit()
check("a claim can only name a pet registered to the claimant", client.post(f"/reports/{rid}/ownership-claims", json={**claim_body, "claimed_pet_id": someone_elses_pet.pet_id}, headers=H(claimant)).status_code == 422)
res = client.post(f"/reports/{rid}/ownership-claims", json={**claim_body, "claimed_pet_id": my_pet.pet_id, "evidence_urls": ["https://res.example.test/proof.jpg"]}, headers=H(claimant))
claim1 = res.json()["claim_id"]
check("a resident claims the found animal", res.status_code == 201 and res.json()["status"] == "submitted", res.text)
check("the claimant's own view has no staff-only fields", "claimant_user_id" not in res.json() and "evidence_urls" not in res.json() and "reviewed_by" not in res.json(), res.json())
check("the case now reads 'claimed' (not confirmed)", fresh(Report, rid).ownership_status == "claimed" and fresh(Report, rid).ownership_owner_id is None)
check("the leader was told about the claim", notes(leader.user_id, "New ownership claim") == 1)
check("a second open claim by the same resident is refused", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(claimant)).status_code == 409)
res = client.post(f"/reports/{rid}/ownership-claims", json={"statement": "He is Max, I have vet records for him.", "evidence": ["vet"]}, headers=H(claimant2))
claim2 = res.json()["claim_id"]
check("a second resident claims the same animal", res.status_code == 201)
check("two open claims: the case reads 'disputed' until staff decide", fresh(Report, rid).ownership_status == "disputed")
check("a claimant sees only their own claims", [c["claim_id"] for c in client.get(f"/reports/{rid}/ownership-claims/mine", headers=H(claimant)).json()] == [claim1]
      and client.get(f"/reports/{rid}/ownership-claims/mine", headers=H(neighbor)).json() == [])
check("a resident can't list the case's claims", client.get(f"/cases/{rid}/claims", headers=H(claimant)).status_code == 403)
check("another subdivision's leader can't", client.get(f"/cases/{rid}/claims", headers=H(other_leader)).status_code == 403)
staff_view = client.get(f"/cases/{rid}/claims", headers=H(leader)).json()
check("staff see every claim, who made it, the named pet and the evidence links",
      [c["claimant_name"] for c in staff_view] == ["Cora Claimant", "Carl Claimant"] and staff_view[0]["claimed_pet_id"] == my_pet.pet_id and staff_view[0]["evidence_urls"] == ["https://res.example.test/proof.jpg"], staff_view)
check("the case record lists them for staff too", len(client.get(f"/cases/{rid}", headers=H(leader)).json()["claims"]) == 2)

# review: never an automatic ownership
check("a resident can't review", client.post(f"/cases/{rid}/claims/{claim1}/review", json={"decision": "accepted"}, headers=H(claimant)).status_code == 403)
check("asking for more information needs saying what", client.post(f"/cases/{rid}/claims/{claim1}/review", json={"decision": "needs_info"}, headers=H(leader)).status_code == 422)
res = client.post(f"/cases/{rid}/claims/{claim1}/review", json={"decision": "needs_info", "note": "Please send a photo of the scar."}, headers=H(leader))
check("the leader asks for more information", res.status_code == 200 and res.json()["status"] == "needs_info" and res.json()["review_note"].startswith("Please send"), res.text)
check("the claimant is told, with the question", db.query(Notification).filter(Notification.user_id == claimant.user_id, Notification.title == "Ownership claim update", Notification.message.like("%photo of the scar%")).count() == 1)
res = client.post(f"/cases/{rid}/claims/{claim1}/review", json={"decision": "accepted", "note": "Photo matches."}, headers=H(leader))
check("the leader accepts the first claim", res.status_code == 200 and res.json()["status"] == "accepted")
rep = fresh(Report, rid)
check("ACCEPTING A CLAIM DOES NOT ESTABLISH OWNERSHIP: no owner set, never 'confirmed'", rep.ownership_status != "confirmed" and rep.ownership_owner_id is None, (rep.ownership_status, rep.ownership_owner_id))
log = db.query(AuditLog).filter(AuditLog.action == "OWNERSHIP_CLAIM_REVIEWED").order_by(AuditLog.log_id.desc()).first()
check("...and the audit log says so", log.new_values["ownership_confirmed_by_this"] is False and log.new_values["claim_status"] == "accepted")
check("an accepted claim can't be reviewed again", client.post(f"/cases/{rid}/claims/{claim1}/review", json={"decision": "rejected", "note": "changed my mind"}, headers=H(leader)).status_code == 409)
res = client.post(f"/cases/{rid}/claims/{claim2}/review", json={"decision": "rejected", "note": "The vet record does not match this dog."}, headers=H(leader))
check("the competing claim is not accepted", res.status_code == 200 and res.json()["status"] == "rejected")
check("with no claim left open and one accepted, the case reads 'under review' (the ownership decision is still to be made)", fresh(Report, rid).ownership_status == "under_review")
check("a claim of another case can't be reviewed through this one", client.post(f"/cases/{found_report()}/claims/{claim1}/review", json={"decision": "rejected", "note": "wrong case"}, headers=H(leader)).status_code == 404)

# ownership is its own decision, with evidence
res = client.put(f"/cases/{rid}/assessment", json={"ownership": {"status": "confirmed", "owner_user_id": claimant.user_id, "evidence": ["registry"]}}, headers=H(leader))
check("registration alone still can't confirm ownership", res.status_code == 422)
res = client.put(f"/cases/{rid}/assessment", json={"ownership": {"status": "confirmed", "owner_user_id": claimant.user_id, "evidence": ["photos", "markings", "statement"], "note": "Photo and scar match."}}, headers=H(leader))
check("the leader confirms ownership explicitly, with evidence", res.status_code == 200 and res.json()["ownership"]["status"] == "confirmed" and res.json()["ownership"]["owner_user_id"] == claimant.user_id, res.text)
check("a claim on a case whose ownership is confirmed does not overturn it", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(neighbor)).status_code == 201 and fresh(Report, rid).ownership_status == "confirmed")

# withdrawing
cw = client.post(f"/reports/{rid}/ownership-claims", json={**claim_body, "evidence": []}, headers=H(far_resident))
check("(sanity) another subdivision still can't claim", cw.status_code == 404)
mine_neighbor = client.get(f"/reports/{rid}/ownership-claims/mine", headers=H(neighbor)).json()[0]["claim_id"]
check("only the claimant can withdraw", client.post(f"/ownership-claims/{mine_neighbor}/withdraw", headers=H(claimant)).status_code == 404)
check("the claimant withdraws their claim", client.post(f"/ownership-claims/{mine_neighbor}/withdraw", headers=H(neighbor)).json()["status"] == "withdrawn")
check("...twice is refused", client.post(f"/ownership-claims/{mine_neighbor}/withdraw", headers=H(neighbor)).status_code == 409)

# ============================================================================================================
# 5. Closing the case closes the notice; claims after that are refused
# ============================================================================================================
res = client.post(f"/cases/{rid}/close", json={"disposition": "resolved_intervention", "reason": "The animal was returned to its confirmed owner."}, headers=H(leader))
check("the case is closed", res.status_code == 200 and res.json()["case"]["case_status"] == "closed", res.text)
alert = fresh(LostPetAlert, alert_id)
check("the central closure hook closed the notice (a found animal's alert too)", alert.status == "closed" and alert.close_outcome == "reunited", (alert.status, alert.close_outcome))
check("the claims and the sightings are kept as history", db.query(OwnershipClaim).filter(OwnershipClaim.report_id == rid).count() == 3 and db.query(LostPetSighting).filter(LostPetSighting.alert_id == alert_id).count() == 1)
check("no new claim is accepted on a closed case", client.post(f"/reports/{rid}/ownership-claims", json=claim_body, headers=H(far_resident)).status_code in (404, 409))
check("no new sighting is accepted either", client.post(f"/lost-pet-alerts/{alert_id}/sightings", data={"latitude": "14.8012", "longitude": "121.0036", "accuracy_confirmed": "true"}, headers=H(neighbor)).status_code == 409)

# ============================================================================================================
# 6. Publication policy: when a resident's request is published at once
# ============================================================================================================
check("policy unit: only a lost-pet or found-animal notice of a non-sensitive case can be 'immediate'",
      (lambda s: (case_policy.publication_mode(s, "found_animal", False), case_policy.publication_mode(s, "lost_pet", False), case_policy.publication_mode(s, "found_animal", True),
                  case_policy.publication_mode(s, "nuisance", False), case_policy.publication_mode(s, "safety", False), case_policy.publication_mode(s, "other", False)))
      (case_policy.CaseSettings(publication={"lost_pet": "immediate", "found_animal": "immediate"}))
      == ("immediate", "immediate", "review", "review", "review", "review"))
settings(found_animal="immediate")
rid2 = found_report()
res = client.post(f"/lost-pet-alerts/reports/{rid2}/request", json=ask, headers=H(finder))
check("policy 'immediate': the finder's request is published at once, by the policy (nobody activated it)",
      res.status_code == 200 and res.json()["status"] == "active" and fresh(LostPetAlert, res.json()["alert_id"]).activated_by is None, res.text)
check("...and residents are told", notes(neighbor.user_id, "Found animal: is it yours?") == 2)
rid3 = found_report()
res = client.post(f"/lost-pet-alerts/reports/{rid3}/request", json=ask, headers=H(leader))
check("a leader's own request still waits for their explicit activation (publishing is a separate step)", res.json()["status"] == "requested")
sens = found_report(is_sensitive=True)
check("a sensitive case is refused whatever the policy", client.post(f"/lost-pet-alerts/reports/{sens}/request", json=ask, headers=H(finder)).status_code == 409)
settings()

# ============================================================================================================
# 7. Lost-pet alerts keep working, with the same privacy for neighbors
# ============================================================================================================
owner_pet = Pet(owner_id=claimant.user_id, pet_name="Brownie", pet_type="Dog", status="Lost")
db.add(owner_pet)
db.commit()
lost2 = Report(user_id=claimant.user_id, subdivision_id=1, category_id=LOSTCAT, current_status_id=2, animal_type="Dog", pet_id=owner_pet.pet_id, description="[LOST PET REPORT] Brownie is missing",
               latitude=Decimal("14.80123450"), longitude=Decimal("121.00456780"), landmark="Gate 2")
db.add(lost2)
db.commit()
res = client.post(f"/lost-pet-alerts/reports/{lost2.report_id}/request", json={"last_seen_lat": 14.8012345, "last_seen_lng": 121.0045678}, headers=H(claimant))
lost_alert = res.json()["alert_id"]
check("the owner of a lost pet asks for a notice and it is published at once (no review for a missing pet)", res.status_code == 200 and res.json()["alert_type"] == "lost_pet" and res.json()["status"] == "active", res.text)
as_owner = client.get(f"/lost-pet-alerts/{lost_alert}", headers=H(claimant)).json()
as_neighbor = client.get(f"/lost-pet-alerts/{lost_alert}", headers=H(neighbor)).json()
check("the pet's owner keeps the exact last-seen pin", as_owner["last_seen"]["latitude"] == 14.8012345 and as_owner["last_seen"]["generalized"] is False)
check("a neighbor gets the area for a lost pet too", as_neighbor["last_seen"]["latitude"] == 14.801 and as_neighbor["last_seen"]["generalized"] is True)
check("...and the lost pet's description is still shown to neighbors (so they can recognize it)", as_neighbor["pet"]["description"] is not None)

print(f"\n{PASSED} checks passed")
