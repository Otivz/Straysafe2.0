"""
Registration-first Lost Pet reports (utils/lost_pet_rules.py, approved 2026-11-11).

  - a Lost Pet report needs the resident's OWN registered, active pet (server side, whatever the screen shows)
  - one active lost report per pet; a closed one can be followed by a new one; reopening cannot leave two
  - what the report says about the animal, and the snapshot of the pet, come from the pet record, never from the request
  - a report cannot become (or stop being) a Lost Pet report by being re-categorised, and the old text marker cannot be used
  - a lost-pet notice needs the owner's own registered pet
  - a pet with an active lost report cannot be removed, merged away or deleted
  - a resident cannot set owner, registrant, verification or status on a pet; only dogs and cats; photo addresses are checked
  - the Leader's case detail names the registered pet, the owner and how to reach them, as reported vs now, scoped to the subdivision
  - a Leader can link an office-registered pet to a resident account only with evidence, and the resident must accept
Offline: a throwaway SQLite file through tests/_isolated_db.py, never app.main and never the configured database.
Run from the backend folder:  python tests/test_lost_pet_registration_first.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Query

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.db_migrations.case_alignment import run_case_alignment
from app.limiter import limiter
from app.models.lost_pet_alert import LostPetAlert
from app.models.pet import Pet
from app.models.pet_history import PetHistory
from app.models.pet_owner_confirmation import PetOwnerConfirmation
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.user import Barangay, Subdivision, User
from app.routes import cases, lost_pet_alerts, pet_ownership, pets, reports
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, lost_pet_alerts.router, pets.router, pet_ownership.router):
    api.include_router(router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


# The real database numbers its categories like this: five older ones, then "Lost Pet" as 6 (older code recognises it by that id)
CATEGORY_NAMES = ["Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed", "Lost Pet", "Found / Unidentified Animal",
                  "Animal Nuisance", "Animal Safety Concern", "Injured / Distressed Animal", "Other Animal Concern"]
for i, name in enumerate(CATEGORY_NAMES, start=1):
    db.add(ReportCategory(category_id=i, category_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Test City"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for status_id in range(1, 19):
    db.add(ReportStatus(status_id=status_id, status_name=f"Status {status_id}"))
db.commit()
assert run_case_alignment(engine)["errors"] == []
LOST, NUISANCE, FOUND = 6, 8, 7


def user(name, role=1, subdivision=1, phone="09170001111"):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@lostpet.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone=phone, address="Blk 9 Lot 15")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


rita, omar, olga = user("Rita Santos"), user("Omar Reyes"), user("Olga Cruz", subdivision=2)
leader, leader2, admin = user("Leader Lee", 2), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)


def pet(owner, name, kind="Dog", **kw):
    p = Pet(owner_id=owner.user_id if owner else None, pet_name=name, pet_type=kind, breed=kw.pop("breed", "Shih Tzu"),
            color_markings=kw.pop("color_markings", "white and gold"), distinctive_markings=kw.pop("markings", "pink collar"),
            gender=kw.pop("gender", "Male"), registered_by_user_id=kw.pop("registered_by", owner.user_id if owner else None),
            registered_by_name=kw.pop("registered_by_name", owner.name if owner else None), photo_url=kw.pop("photo", f"https://res.cloudinary.com/x/{name}.jpg"), **kw)
    db.add(p)
    db.commit()
    return p


mochi, kiko, bantay = pet(rita, "Mochi"), pet(rita, "Kiko", "Cat", breed="Persian", color_markings="gray"), pet(omar, "Bantay", breed="Aspin")
gone, archived = pet(rita, "Gone", status="Deceased"), pet(rita, "Old", status="Archived")
olga_pet = pet(olga, "Olga Dog")

NEW = {"latitude": 14.8008, "longitude": 121.0036, "subdivision_id": 1, "category_id": LOST, "description": "Slipped out of the gate this morning."}
SEEN = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(hours=2)).replace(microsecond=0).isoformat()


def file(who, **kw):
    return client.post("/reports/", json={**NEW, **kw}, headers=H(who))


def dbr(report_id):
    db.expire_all()
    return db.get(Report, report_id)


def close(report_id):
    r = dbr(report_id)
    r.case_status, r.current_status_id, r.closure_disposition, r.closure_reason, r.closed_at = "closed", 9, "pet_recovered", "Pet is home", datetime.now()
    db.commit()


# ================================================================================ 1. filing needs the resident's own registered pet
calls = []
original = Query.with_for_update


def spy(self, *a, **k):
    calls.append(1)
    return original(self, *a, **k)


Query.with_for_update = spy
res = file(rita, pet_id=mochi.pet_id, last_seen_at=SEEN, animal_type="Cat", animal_breed="Not the breed", animal_color="Purple", is_possible_owned=True,
           custody_status="Claimed by Owner", verified_actual_bite=True, estimated_size="Large")
Query.with_for_update = original
check("a resident files a lost report for their own registered pet", res.status_code == 200, res.text[:300])
first = res.json()["report_id"]
row = dbr(first)
check("the report is about the pet: the animal's details come from the pet record, not from the request",
      row.pet_id == mochi.pet_id and row.animal_type == "Dog" and row.animal_breed == "Shih Tzu" and "white and gold" in (row.animal_color or "")
      and row.animal_count == 1 and not row.is_possible_owned and row.custody_status == "Sighting" and row.estimated_size is None,
      f"{row.animal_type}/{row.animal_breed}/{row.animal_color}/{row.custody_status}/{row.estimated_size}")
check("a verification flag sent by the resident is ignored", not row.verified_actual_bite)
check("filing locks the pet row and re-reads the pet's reports with a locking read (what serialises two requests together on MySQL)", len(calls) >= 2, str(len(calls)))
check("the pet is marked Lost", (db.expire_all() or db.get(Pet, mochi.pet_id).status) == "Lost")
snap = row.pet_snapshot
check("the server stored a snapshot of the pet as filed", isinstance(snap, dict) and snap["pet"]["name"] == "Mochi" and snap["pet"]["breed"] == "Shih Tzu"
      and snap["pet"]["color"] == "white and gold" and snap["pet"]["sex"] == "Male" and snap["pet"]["markings"] == "pink collar"
      and snap["pet"]["species"] == "Dog" and snap["pet"]["owner_name"] == "Rita Santos" and snap["pet"]["declared_by_owner"] is True
      and snap["pet"]["photos"] == [mochi.photo_url], str(snap))
check("...with the last-seen time the resident gave and the place", snap["last_seen"]["at"] == SEEN and snap["last_seen"]["latitude"] == 14.8008, str(snap["last_seen"]))
check("a resident never receives the snapshot", "pet_snapshot" not in client.get(f"/reports/{first}", headers=H(rita)).json())

no_pet = file(rita)
check("a lost report with no pet is refused with the sentence the screen shows (422)", no_pet.status_code == 422 and no_pet.json()["detail"] == "Register your pet first to report it missing.", no_pet.text)
check("someone else's pet is refused (404), and so is a pet that does not exist", file(rita, pet_id=bantay.pet_id).status_code == 404
      and file(rita, pet_id=99999).status_code == 404)
check("a pet from another subdivision is refused too", file(rita, pet_id=olga_pet.pet_id).status_code == 404)
check("a deceased pet cannot be reported missing (409)", file(rita, pet_id=gone.pet_id).status_code == 409)
check("an archived record cannot be reported missing (409)", file(rita, pet_id=archived.pet_id).status_code == 409)
check("a last-seen time in the future is refused (400)", file(omar, pet_id=bantay.pet_id, last_seen_at=(datetime.now() + timedelta(days=2)).isoformat()).status_code == 400)
check("a Leader cannot file a Lost Pet report (403)", file(leader, pet_id=mochi.pet_id).status_code == 403)
check("nothing was created by the refused requests", db.query(Report).filter(Report.category_id == LOST).count() == 1)

# ================================================================================================= 2. one active report per pet
dup = file(rita, pet_id=mochi.pet_id)
body = dup.json()["detail"]
check("a second active lost report for the same pet is refused (409) and names the first", dup.status_code == 409 and body["code"] == "LOST_REPORT_EXISTS"
      and body["report_id"] == first and "already has an active lost-pet report" in body["message"], dup.text)
other_pet = file(rita, pet_id=kiko.pet_id, last_seen_at=SEEN)
check("another registered pet of the same resident stays reportable", other_pet.status_code == 200, other_pet.text[:200])
second_report = other_pet.json()["report_id"]
omar_report = file(omar, pet_id=bantay.pet_id)
check("and so is another resident's pet", omar_report.status_code == 200, omar_report.text[:200])

close(first)
again = file(rita, pet_id=mochi.pet_id)
check("once the first one is closed, the pet can be reported missing again", again.status_code == 200, again.text[:200])
third = again.json()["report_id"]
reopen = client.post(f"/cases/{first}/reopen", json={"reason": "The pet was seen again."}, headers=H(leader))
check("reopening the old closed report is refused while the pet has another active one (409)", reopen.status_code == 409 and "another active lost-pet report" in reopen.text, reopen.text)
close(third)
reopen = client.post(f"/cases/{first}/reopen", json={"reason": "The pet was seen again."}, headers=H(leader))
check("...and allowed once that one is closed too", reopen.status_code == 200, reopen.text[:200])

# ======================================================================== 3. re-categorising and the old marker cannot get round it
nuisance = file(rita, category_id=NUISANCE, description="A dog barks all night by the clubhouse.", pet_id=mochi.pet_id, animal_type="Dog")
check("a complaint is filed as before", nuisance.status_code == 200, nuisance.text[:200])
nuisance_id = nuisance.json()["report_id"]
check("a pet named on a resident's complaint is not linked (a pet is linked to a case by the Leader's own decision)", dbr(nuisance_id).pet_id is None)
check("a resident cannot turn a complaint into a lost report (409)", client.patch(f"/reports/{nuisance_id}", json={"category_id": LOST}, headers=H(rita)).status_code == 409)
check("a resident cannot turn a lost report into another kind (409)", client.patch(f"/reports/{second_report}", json={"category_id": NUISANCE}, headers=H(rita)).status_code == 409)
check("a Leader cannot either (409)", client.patch(f"/reports/{nuisance_id}", json={"category_id": LOST}, headers=H(leader)).status_code == 409)
check("an ordinary change of category still works", client.patch(f"/reports/{nuisance_id}", json={"category_id": 11}, headers=H(rita)).status_code == 200)
check("the old text marker cannot be written into a new report (400)", file(rita, category_id=11, description="[LOST PET REPORT] my dog").status_code == 400)
check("...or into an edited one (400)", client.patch(f"/reports/{nuisance_id}", json={"description": "[lost pet report] sneaky"}, headers=H(rita)).status_code == 400)

# ========================================================================================================= 4. the notice
ask = client.post(f"/lost-pet-alerts/reports/{second_report}/request", json={"alert_type": "lost_pet", "owner_note": "Answers to Kiko."}, headers=H(rita))
check("the report already published its own notice, so asking again is refused (409, no second notice)", ask.status_code == 409 and "already active" in ask.text, ask.text[:200])
check("another resident cannot (403)", client.post(f"/lost-pet-alerts/reports/{omar_report.json()['report_id']}/request", json={"alert_type": "lost_pet"}, headers=H(rita)).status_code == 403)
# an older lost report with no pet link (nothing in the live database; kept compatible)
legacy = Report(user_id=rita.user_id, subdivision_id=1, category_id=LOST, current_status_id=1, animal_type="Dog", description="Older lost report",
                latitude=14.8008, longitude=121.0036, landmark="Gate 2")
db.add(legacy)
db.commit()
res = client.post(f"/lost-pet-alerts/reports/{legacy.report_id}/request", json={"alert_type": "lost_pet"}, headers=H(rita))
check("a resident cannot ask for a notice on a lost report that names no registered pet (409)", res.status_code == 409 and "Register your pet first" in res.text, res.text)
res = client.post(f"/lost-pet-alerts/reports/{legacy.report_id}/request", json={"alert_type": "lost_pet"}, headers=H(leader))
check("a Leader can still prepare one for such an older report", res.status_code == 200, res.text[:200])
marker_only = Report(user_id=rita.user_id, subdivision_id=1, category_id=11, current_status_id=1, animal_type="Dog", latitude=14.8008, longitude=121.0036,
                     description="[LOST PET REPORT] pretending", landmark="Gate 2")
db.add(marker_only)
db.commit()
res = client.post(f"/lost-pet-alerts/reports/{marker_only.report_id}/request", json={"alert_type": "lost_pet"}, headers=H(rita))
check("a report that only carries the old text marker is not a lost report for a notice (409)", res.status_code == 409 and "Lost Pet Reports only" in res.text, res.text)

# ========================================================================= 5. a pet with an active report is not removed
check("a resident cannot remove a pet that has an active lost report (409)", client.delete(f"/pets/{kiko.pet_id}", headers=H(rita)).status_code == 409)
check("...with a message that says why", "active lost-pet report" in client.delete(f"/pets/{kiko.pet_id}", headers=H(rita)).text)
double = pet(rita, "Kiko Two", "Cat")
check("an administrator cannot delete such a pet for good (409)", client.delete(f"/pets/{kiko.pet_id}/permanent", headers=H(admin)).status_code == 409)
kiko2 = pet(rita, "Kiko Dup", "Cat")
res = client.post(f"/pets/{kiko.pet_id}/merge-into", json={"keep_pet_id": kiko2.pet_id, "reason": "same cat"}, headers=H(admin))
check("a record with an active lost report is not merged away (409)", res.status_code == 409 and "merged" in res.text, res.text)
close(second_report)
check("once the report is closed the pet can be removed", client.delete(f"/pets/{kiko.pet_id}", headers=H(rita)).status_code == 200)
check("a pet that never had a report can always be removed", client.delete(f"/pets/{double.pet_id}", headers=H(rita)).status_code == 200)

# ====================================================================================== 6. what a resident cannot set on a pet
check("a resident cannot register a pet for another owner (403)", client.post("/pets/", json={"pet_name": "Pixel", "pet_type": "Dog", "owner_id": omar.user_id}, headers=H(rita)).status_code == 403)
mk = client.post("/pets/", json={"pet_name": "Pixel", "pet_type": "Dog", "color_markings": "black", "status": "Deceased", "is_verified": True,
                                 "registered_by_name": "Someone Official", "last_seen_lat": 14.8}, headers=H(rita))
check("a resident registers a dog", mk.status_code == 200, mk.text[:300])
pixel = db.get(Pet, mk.json()["pet_id"])
db.refresh(pixel)
check("it is theirs, Active and unverified, whatever the request said", pixel.owner_id == rita.user_id and pixel.status == "Active" and not pixel.is_verified
      and pixel.registered_by_user_id == rita.user_id and pixel.registered_by_name == "Rita Santos" and pixel.last_seen_lat is None)
check("only dogs and cats can be registered (400)", client.post("/pets/", json={"pet_name": "Tweety", "pet_type": "Bird"}, headers=H(rita)).status_code == 400)
check("a species is accepted in any capitals", client.post("/pets/", json={"pet_name": "Neko", "pet_type": "cat"}, headers=H(rita)).status_code == 200)
check("a photo address that is not one of our uploads is refused (400)", client.post("/pets/", json={"pet_name": "Lens", "pet_type": "Dog", "photo_url": "http://evil.example/pixel.png"}, headers=H(rita)).status_code == 400)
check("a Cloudinary photo is accepted", client.post("/pets/", json={"pet_name": "Snap", "pet_type": "Dog", "photo_url": "https://res.cloudinary.com/x/image/upload/snap.jpg"}, headers=H(rita)).status_code == 200)
res = client.put(f"/pets/{pixel.pet_id}", json={"owner_id": omar.user_id, "is_verified": True, "status": "Archived", "registered_by_name": "Fake", "breed": "Aspin"}, headers=H(rita))
db.refresh(pixel)
check("an edit changes what the resident declared and nothing else", res.status_code == 200 and pixel.breed == "Aspin" and pixel.owner_id == rita.user_id
      and not pixel.is_verified and pixel.status == "Active" and pixel.registered_by_name == "Rita Santos", res.text[:200])
check("a photo address in an edit is checked too (400)", client.put(f"/pets/{pixel.pet_id}", json={"photo_url": "http://evil.example/x.png"}, headers=H(rita)).status_code == 400)
check("and another resident cannot edit the pet at all", client.put(f"/pets/{pixel.pet_id}", json={"breed": "Hacked"}, headers=H(omar)).status_code == 403)

# ===================================================================== 7. the Leader's pet list stays inside the subdivision
office = client.post("/pets/", json={"pet_name": "Brownie", "pet_type": "Dog", "color_markings": "brown", "emergency_contact_name": "Mang Tony", "emergency_contact_phone": "09170002222"}, headers=H(leader))
check("the Leader registers a pet for an owner who has no account", office.status_code == 200 and office.json()["owner_id"] is None, office.text[:200])
office_id = office.json()["pet_id"]
other_office = client.post("/pets/", json={"pet_name": "Elsewhere", "pet_type": "Dog"}, headers=H(leader2)).json()["pet_id"]
listed = {p["pet_id"] for p in client.get("/pets/subdivision/1", headers=H(leader)).json()}
check("the subdivision list has its residents' pets and its own office-registered records", {mochi.pet_id, pixel.pet_id, office_id} <= listed, str(listed))
check("never another subdivision's pets, nor another subdivision's office records", olga_pet.pet_id not in listed and other_office not in listed, str(listed))

# ============================================================= 8. the Leader links an office-registered pet to a resident account
link = client.post(f"/pets/{office_id}/assign-owner", params={"owner_id": rita.user_id}, headers=H(leader))
check("a Leader needs to say how they checked the account (422)", link.status_code == 422 and "how you checked" in link.text, link.text)
link = client.post(f"/pets/{office_id}/assign-owner", params={"owner_id": rita.user_id}, json={"evidence_note": "The number on the record is Rita's phone; she knows his tag."}, headers=H(leader))
check("with the evidence noted, the link is proposed", link.status_code == 200, link.text[:300])
db.expire_all()
check("ownership has NOT moved yet: the resident must accept", db.get(Pet, office_id).owner_id is None)
history = [h.description for h in db.query(PetHistory).filter(PetHistory.pet_id == office_id).all()]
check("the evidence is kept on the pet's history", any("Checked by the officer: The number on the record" in d for d in history), str(history))
check("another subdivision's Leader cannot link it (403/404)", client.post(f"/pets/{office_id}/assign-owner", params={"owner_id": rita.user_id}, json={"evidence_note": "I think so, probably yes."}, headers=H(leader2)).status_code in (403, 404))
check("a resident cannot link a pet to themselves (403)", client.post(f"/pets/{office_id}/assign-owner", params={"owner_id": omar.user_id}, headers=H(omar)).status_code == 403)
mine = client.get("/pet-ownership/mine", headers=H(rita)).json()
check("the resident sees the request", len(mine) == 1 and mine[0]["pet_name"] == "Brownie", str(mine))
check("another resident does not", client.get("/pet-ownership/mine", headers=H(omar)).json() == [])
check("another resident cannot answer it", client.post(f"/pet-ownership/{mine[0]['confirmation_id']}/accept", headers=H(omar)).status_code == 403)
res = client.post(f"/pet-ownership/{mine[0]['confirmation_id']}/accept", headers=H(rita))
db.expire_all()
check("when the resident accepts, the pet is theirs", res.status_code == 200 and db.get(Pet, office_id).owner_id == rita.user_id, res.text[:200])
check("and can then be reported missing", file(rita, pet_id=office_id).status_code == 200)

# ====================================================================================== 9. the Leader's case detail
detail = client.get(f"/cases/{third}", headers=H(leader)).json()
block = detail["pet"]
check("the case names the registered pet and the owner, nothing to search for", block["available"] and block["registry"]["name"] == "Mochi" and block["owner"]["name"] == "Rita Santos"
      and block["owner"]["phone"] == "09170001111" and block["owner"]["email"] == "rita.santos@lostpet.test", str(block)[:300])
check("it says the reporter is the registered owner, and that the link is the reporter's (no Leader decided the identity)", block["reporter_is_owner"] is True
      and block["linked_by_reporter"] is True and detail["identity"]["decided"] is False, f'{block["reporter_is_owner"]} {block["linked_by_reporter"]} {detail["identity"]}')
check("registration is declared by the owner and not verified", block["registration"]["declared_by_owner"] is True and block["registration"]["verified"] is False
      and block["registration"]["registered_by_name"] == "Rita Santos")
check("the pet as it was filed is there, and nothing has changed yet", block["as_reported"]["name"] == "Mochi" and block["changed_since_report"] == [])
check("the last-seen details are there", block["last_seen"]["as_filed"] is not None and block["last_seen"]["as_filed"]["latitude"] == 14.8008)
res = client.put(f"/pets/{mochi.pet_id}", json={"breed": "Poodle", "color_markings": "apricot", "pet_name": "Mochi II"}, headers=H(rita))
check("the owner edits the pet afterwards", res.status_code == 200, res.text[:200])
block = client.get(f"/cases/{third}", headers=H(leader)).json()["pet"]
check("the case still shows what was reported, beside what the registry says now", block["as_reported"]["breed"] == "Shih Tzu" and block["as_reported"]["name"] == "Mochi"
      and block["registry"]["breed"] == "Poodle" and block["registry"]["name"] == "Mochi II" and set(block["changed_since_report"]) >= {"name", "breed", "colour"}, str(block["changed_since_report"]))
check("history is kept even when the pet record is archived", (setattr(db.get(Pet, mochi.pet_id), "status", "Archived") or db.commit() or True)
      and client.get(f"/cases/{third}", headers=H(leader)).json()["pet"]["registry"]["status"] == "Archived")
check("a Leader of another subdivision cannot read the case at all", client.get(f"/cases/{third}", headers=H(leader2)).status_code in (403, 404))
check("a resident cannot read the staff view", client.get(f"/cases/{third}", headers=H(rita)).status_code == 403)
check("an older report with no pet has no pet block", client.get(f"/cases/{legacy.report_id}", headers=H(leader)).json()["pet"] is None)
# a pet from another subdivision named by a report of this one (created before the rules existed): nothing about it is shown
stray = Report(user_id=rita.user_id, subdivision_id=1, category_id=LOST, current_status_id=1, pet_id=olga_pet.pet_id, animal_type="Dog", latitude=14.8008, longitude=121.0036)
db.add(stray)
db.commit()
block = client.get(f"/cases/{stray.report_id}", headers=H(leader)).json()["pet"]
check("a pet from another subdivision is not shown to this Leader", block["available"] is False and block["reason"] == "restricted" and "registry" not in block and "owner" not in block, str(block))
check("the Administrator can see it", client.get(f"/cases/{stray.report_id}", headers=H(admin)).json()["pet"]["available"] is True)
res = client.put(f"/cases/{first}/assessment", json={"identity": {"status": "identified", "note": "Compared the collar and markings with the registered photos."}}, headers=H(leader))
check("a Leader decides the animal's identity", res.status_code == 200, res.text[:200])
detail = client.get(f"/cases/{first}", headers=H(leader)).json()
check("only then is the identity 'decided', and the link no longer 'by the reporter'", detail["identity"]["decided"] is True and detail["pet"]["linked_by_reporter"] is False,
      str(detail["identity"]))
check("another case with the same kind of link, nobody decided, still reads 'by the reporter'", client.get(f"/cases/{third}", headers=H(leader)).json()["pet"]["linked_by_reporter"] is True)
items = {i["report_id"]: i for i in client.get("/cases/summaries", headers=H(leader)).json()["items"]}
check("the case list says the same", items[first]["identity_decided"] is True and items[third]["identity_decided"] is False and items[third]["pet_id"] == mochi.pet_id,
      f'{items[first]["identity_decided"]} {items[third]["identity_decided"]}')

print(f"\n{PASSED} checks passed.")
