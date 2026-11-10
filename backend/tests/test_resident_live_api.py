"""
What the connected Resident UI relies on that the older endpoints did not give it (all additive):

  GET  /reports/?mine=true                  only the reports the signed-in person filed
  case_outcome on a report                  how a closed case ended, in neutral words, for the people involved only
  GET  /cases/categories                    each kind of concern with the stored id a report is filed with
  GET  /ownership-claims/mine               every claim the resident made, across cases, and nobody else's
  POST /ownership-claims/{id}/info          the claimant answers "more information needed"; the claim goes back under review

Offline: a throwaway SQLite file through tests/_isolated_db.py, a tiny FastAPI app, never app.main and never the configured
database. Run from the backend folder:
    python tests/test_resident_live_api.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from app.routes import cases, lost_pet_alerts, ownership_claims, reports  # noqa: E402

api = _isolated_db.build_app(reports.router, cases.router, lost_pet_alerts.router, ownership_claims.router)
ids = _isolated_db.create_schema_and_seed()

from app.database import SessionLocal  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Report, ReportCategory  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


def user(name, role=1, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@resident.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


rita = db.get(User, ids["resident"])
leader = db.get(User, ids["leader"])
ola = user("Ola Other")
claimant = user("Cara Claimant")
cat = {c.category_name: c.category_id for c in db.query(ReportCategory).all()}


def mk(owner, category, status=1, visibility="Private", **extra):
    r = Report(user_id=owner.user_id, subdivision_id=1, category_id=cat[category], current_status_id=status, animal_type="Dog", visibility=visibility,
               latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2", description="A dog", **extra)
    db.add(r)
    db.commit()
    return r.report_id


# ============================================================================================== MY REPORTS
mine_a = mk(rita, "Animal Nuisance")
mine_b = mk(rita, "Lost Pet")
public_other = mk(ola, "Found / Unidentified Animal", visibility="Public", verification_status="verified_true")
private_other = mk(ola, "Animal Nuisance")

r = client.get("/reports/", params={"mine": "true"}, headers=H(rita))
got = {x["report_id"] for x in r.json()}
check("mine=true returns only the reports I filed", r.status_code == 200 and {mine_a, mine_b, ids["report"]} <= got and not ({public_other, private_other} & got), str(got))
r = client.get("/reports/", headers=H(rita))
got_all = {x["report_id"] for x in r.json()}
check("without it the older scope is unchanged (mine, plus what is public; never another resident's private report)", {mine_a, mine_b} <= got_all and private_other not in got_all)
check("a page of my reports can be asked for", len(client.get("/reports/", params={"mine": "true", "limit": 1}, headers=H(rita)).json()) == 1)
check("another resident's mine=true shows only theirs", {x["report_id"] for x in client.get("/reports/", params={"mine": "true"}, headers=H(ola)).json()} == {public_other, private_other})

# ================================================================================================ OUTCOME
closed = mk(rita, "Animal Nuisance", status=11, closure_disposition="owner_compliance", closure_reason="PRIVATE staff reasoning about a neighbour.")
body = client.get(f"/reports/{closed}", headers=H(rita)).json()
check("the reporter sees how their closed case ended, in neutral words", body["case_status"] == "closed" and body["case_outcome"]["label"]
      and body["case_outcome"]["outcome"] == "resolved" and body["case_outcome"]["closed_at"], str(body.get("case_outcome")))
check("never the officer's private reasoning", "PRIVATE staff reasoning" not in str(body))
check("an open case has no outcome", client.get(f"/reports/{mine_a}", headers=H(rita)).json()["case_outcome"] is None)
db.get(Report, closed).visibility = "Public"
db.get(Report, closed).verification_status = "verified_true"
db.commit()
seen_by_neighbour = client.get(f"/reports/{closed}", headers=H(ola))
check("a neighbour reading a public closed report gets no outcome field", seen_by_neighbour.status_code == 200 and seen_by_neighbour.json().get("case_outcome") is None, seen_by_neighbour.text[:200])
check("staff get it too", client.get(f"/reports/{closed}", headers=H(leader)).json()["case_outcome"]["outcome"] == "resolved")

# ============================================================================================= CATEGORIES
c = client.get("/cases/categories", headers=H(rita)).json()
by_id = {x["id"]: x for x in c["categories"]}
check("every kind of concern comes with the stored id a report is filed with", set(by_id) == {"lost_pet", "found_animal", "nuisance", "safety", "injured", "other"}
      and by_id["lost_pet"]["category_id"] == cat["Lost Pet"] and by_id["nuisance"]["category_id"] == cat["Animal Nuisance"]
      and by_id["found_animal"]["category_id"] == cat["Found / Unidentified Animal"], str(c))

# older reports keep the category they were filed under; the screens need to know what kind each one is
for older_name in ("Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed", "Something Else Entirely"):
    db.add(ReportCategory(category_name=older_name))
db.commit()
cat = {x.category_name: x.category_id for x in db.query(ReportCategory).all()}
stored = {x["category_id"]: x["family"] for x in client.get("/cases/categories", headers=H(rita)).json()["stored_categories"]}
check("every stored category is listed with the kind it is read as", set(stored) == set(cat.values()), str(stored))
check("the six current ones read as themselves", stored[cat["Lost Pet"]] == "lost_pet" and stored[cat["Animal Nuisance"]] == "nuisance"
      and stored[cat["Animal Safety Concern"]] == "safety" and stored[cat["Injured / Distressed Animal"]] == "injured"
      and stored[cat["Found / Unidentified Animal"]] == "found_animal" and stored[cat["Other Animal Concern"]] == "other", str(stored))
check("older ones read as the kind the server already treats them as", stored[cat["Injured"]] == "injured" and stored[cat["Aggressive"]] == "safety"
      and stored[cat["Rabies Risk"]] == "safety" and stored[cat["Roaming Animal"]] == "nuisance" and stored[cat["Rescue Needed"]] == "injured", str(stored))
check("an unknown one reads as other, never as something it is not", stored[cat["Something Else Entirely"]] == "other")
check("the filing ids of the six are unchanged by older rows", {x["id"]: x["category_id"] for x in client.get("/cases/categories", headers=H(rita)).json()["categories"]}["injured"] == cat["Injured / Distressed Animal"])

# ================================================================================================== CLAIMS
found = mk(ola, "Found / Unidentified Animal", visibility="Public", verification_status="verified_true")
alert = LostPetAlert(report_id=found, subdivision_id=1, status="active", alert_type="found_animal", owner_id=None, requested_by=leader.user_id,
                     last_seen_location="Gate 2", activated_at=datetime.now())
db.add(alert)
db.commit()

check("no claims yet", client.get("/ownership-claims/mine", headers=H(claimant)).json() == [])
r = client.post(f"/reports/{found}/ownership-claims", json={"statement": "That is my dog Bantay, he has a scar on his ear.", "evidence": ["photos"]}, headers=H(claimant))
check("a resident claims the found animal", r.status_code == 201 and r.json()["status"] == "submitted", r.text)
claim_id = r.json()["claim_id"]
other_claim = client.post(f"/reports/{found}/ownership-claims", json={"statement": "Actually he is mine, I have his vaccination card.", "evidence": []}, headers=H(rita))
check("another resident claims it too", other_claim.status_code == 201, other_claim.text)

mine = client.get("/ownership-claims/mine", headers=H(claimant)).json()
check("my claims list has mine only, with the case and the notice it is on", [c["claim_id"] for c in mine] == [claim_id] and mine[0]["report_id"] == found
      and mine[0]["alert_id"] == alert.alert_id and mine[0]["status"] == "submitted")
check("and nobody else's evidence or reviewer detail", "claimant_user_id" not in mine[0] and "evidence_urls" not in mine[0])

too_early = client.post(f"/ownership-claims/{claim_id}/info", json={"text": "He answers to the name Bantay."}, headers=H(claimant))
check("information can only be added once the subdivision asked for it (409)", too_early.status_code == 409, too_early.text)

asked = client.post(f"/cases/{found}/claims/{claim_id}/review", json={"decision": "needs_info", "note": "Describe the scar and where he sleeps."}, headers=H(leader))
check("the Leader asks for more information", asked.status_code == 200, asked.text)
check("the claimant sees what was asked", client.get("/ownership-claims/mine", headers=H(claimant)).json()[0]["status"] == "needs_info"
      and client.get("/ownership-claims/mine", headers=H(claimant)).json()[0]["review_note"] == "Describe the scar and where he sleeps.")

check("another resident cannot answer for them (404)", client.post(f"/ownership-claims/{claim_id}/info", json={"text": "I am someone else."}, headers=H(ola)).status_code == 404)
check("too short is refused (422)", client.post(f"/ownership-claims/{claim_id}/info", json={"text": "x"}, headers=H(claimant)).status_code == 422)
check("so is nothing at all (422)", client.post(f"/ownership-claims/{claim_id}/info", json={}, headers=H(claimant)).status_code == 422)

before = db.query(Notification).filter(Notification.user_id == leader.user_id, Notification.title == "Ownership claim updated").count()
r = client.post(f"/ownership-claims/{claim_id}/info", json={"text": "The scar is on the left ear. He sleeps on the porch."}, headers=H(claimant))
check("the claimant answers", r.status_code == 200 and r.json()["status"] == "under_review", r.text)
db.expire_all()
from app.models.case_records import OwnershipClaim  # noqa: E402
row = db.get(OwnershipClaim, claim_id)
check("the answer is added to the statement, dated, and the original is kept", row.statement.startswith("That is my dog Bantay") and "The scar is on the left ear." in row.statement
      and "\n\nAdded " in row.statement)
check("the Leader is told", db.query(Notification).filter(Notification.user_id == leader.user_id, Notification.title == "Ownership claim updated").count() == before + 1)
check("the claim cannot take a second answer until asked again (409)", client.post(f"/ownership-claims/{claim_id}/info", json={"text": "One more thing."}, headers=H(claimant)).status_code == 409)

# ================================================================================================== NOTICES
lost_report = mine_b
requested = LostPetAlert(report_id=lost_report, subdivision_id=1, status="requested", alert_type="lost_pet", owner_id=rita.user_id, requested_by=rita.user_id,
                         last_seen_location="Gate 2", requested_at=datetime.now())
db.add(requested)
db.commit()
r = client.get("/lost-pet-alerts/mine", headers=H(rita))
mine_alerts = r.json().get("results", [])
check("my notices include the one still waiting for review", r.status_code == 200 and [a["alert_id"] for a in mine_alerts] == [requested.alert_id] and mine_alerts[0]["status"] == "requested", r.text)
check("not another resident's active notice", alert.alert_id not in [a["alert_id"] for a in mine_alerts])
found_mine = {a["alert_id"] for a in client.get("/lost-pet-alerts/mine", headers=H(ola)).json()["results"]}
check("the resident who reported a found animal has its notice in theirs", alert.alert_id in found_mine)
check("a Leader is sent to the notice list instead (403)", client.get("/lost-pet-alerts/mine", headers=H(leader)).status_code == 403)
pub = client.get("/cases/categories", headers=H(rita)).json()["publication"]
check("the categories answer says how notices are published here", pub == {"lost_pet": "review", "found_animal": "review"}, str(pub))

print(f"\n{PASSED} checks passed.")
