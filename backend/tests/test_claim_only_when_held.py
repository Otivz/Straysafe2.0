"""
A pet claim only for an animal someone holds, Phase 6A of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md.
Filing is refused for an animal nobody holds (any route); each held signal allows it; the owner answers "home" or
"missing" instead; staff close an open claim on an animal nobody holds as not needed; a decided claim goes on.
Run from the backend folder:  python tests/test_claim_only_when_held.py
"""
import os
import sys
import tempfile
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "claim_only_when_held_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-claim-only-when-held-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.claim_custody import NOT_HELD_MESSAGE, NOT_NEEDED_REASON  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(claims.router)
client = TestClient(api, raise_server_exceptions=False)

db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Olga Owner", 1, subdivision_id=1, barangay_id=1)
neighbour = mk_user("Nina Neighbour", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leo Leader", 2, subdivision_id=1, barangay_id=1)
fac = Landmark(name="Barangay pound", latitude=14.8, longitude=121.0, is_holding_facility=True, barangay_id=1)
pets = [Pet(pet_name=f"Dog {i}", pet_type="Dog", owner_id=owner.user_id, status="Active") for i in range(9)]
db.add(fac)
db.add_all(pets)
db.flush()


def mk_case(pet, status=2, **kw):
    r = Report(user_id=neighbour.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0,
               current_status_id=status, animal_type="Dog", assigned_leader_id=leader.user_id, **kw)
    db.add(r)
    db.flush()
    db.add(ReportMatch(source_report_id=r.report_id, matched_pet_id=pet.pet_id, status="CONFIRMED_MATCH",
                       owner_confirmation_status="OWNER_CONFIRMED", similarity_score=85))
    db.flush()
    return r


R_ROAM = mk_case(pets[0])
R_RESCUE = mk_case(pets[1], status=5)
R_PICKED = mk_case(pets[2], status=6)
db.add(StatusHistory(report_id=R_PICKED.report_id, report_status_id=6, updated_by=leader.user_id, remarks="Picked up"))  # as the status route writes it
R_IMPOUND = mk_case(pets[3], status=8)
R_FACILITY = mk_case(pets[4], facility_id=fac.landmark_id)
R_CUSTODY = mk_case(pets[5], custody_status="In Subdivision Holding (Awaiting Barangay Pickup)")
R_HOLDING = mk_case(pets[6])
db.add(HoldingAnimal(report_id=R_HOLDING.report_id, facility_id=fac.landmark_id, intake_date=datetime.now()))
R_OLD_CLAIM = mk_case(pets[7])
OLD = PetClaim(report_id=R_OLD_CLAIM.report_id, pet_id=pets[7].pet_id, status="Pending Review", remarks="my dog")
R_APPROVED = mk_case(pets[8])
APPROVED = PetClaim(report_id=R_APPROVED.report_id, pet_id=pets[8].pet_id, status="Approved")
db.add_all([OLD, APPROVED])
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def file_claim(report, pet):
    return client.post("/claims/", headers=H(owner), json={"report_id": report.report_id, "pet_id": pet.pet_id,
                                                         "remarks": "This is my dog", "evidence_url": None})


# ---- filing ----
r = file_claim(R_ROAM, pets[0])
check("a claim on a roaming dog nobody holds is refused", r.status_code == 409 and NOT_HELD_MESSAGE in r.text, r.text[:200])
check("...no claim was created", db.query(PetClaim).filter(PetClaim.report_id == R_ROAM.report_id).count() == 0)
for label, rep, pet in [("rescue in progress", R_RESCUE, pets[1]), ("picked up", R_PICKED, pets[2]), ("impounded", R_IMPOUND, pets[3]),
                        ("held in a facility", R_FACILITY, pets[4]), ("awaiting Barangay pickup", R_CUSTODY, pets[5]),
                        ("a holding record", R_HOLDING, pets[6])]:
    r = file_claim(rep, pet)
    check(f"a claim is allowed when the animal is {label}", r.status_code == 200 and r.json().get("animal_held") is True, r.text[:200])

r = client.post(f"/claims/{OLD.claim_id}/evidence", headers=H(owner), json={"file_url": "https://res.cloudinary.com/demo/image/upload/v1/x.jpg", "document_type": "evidence"})
check("adding evidence to an open claim on an animal nobody holds is refused", r.status_code == 409, r.text[:200])
r = client.patch(f"/claims/{OLD.claim_id}", headers=H(owner), json={"remarks": "again"})
check("...and so is resubmitting it", r.status_code == 409, r.text[:200])
r = client.patch(f"/claims/{APPROVED.claim_id}", headers=H(owner), json={"remarks": "pickup at 5pm"})
check("an approved claim goes on even though nobody holds the animal now", r.status_code == 200, r.text[:200])

# ---- the claims list says whether the animal is held ----
lst = {c["claim_id"]: c for c in client.get("/claims/", headers=H(leader)).json()}
check("the leader's list marks the old claim as not held", lst.get(OLD.claim_id, {}).get("animal_held") is False, lst.get(OLD.claim_id))

# ---- the owner's answer instead of a claim ----
url = "/claims/custody-answer"
check("someone else can't answer for the owner", client.post(url, headers=H(neighbour), json={"report_id": R_ROAM.report_id, "pet_id": pets[0].pet_id, "answer": "home"}).status_code == 403)
check("an unknown answer is refused", client.post(url, headers=H(owner), json={"report_id": R_ROAM.report_id, "pet_id": pets[0].pet_id, "answer": "maybe"}).status_code == 422)
check("a held animal needs a claim, not an answer", client.post(url, headers=H(owner), json={"report_id": R_PICKED.report_id, "pet_id": pets[2].pet_id, "answer": "home"}).status_code == 409)
r = client.post(url, headers=H(owner), json={"report_id": R_ROAM.report_id, "pet_id": pets[0].pet_id, "answer": "home", "note": "Back in the yard"})
check("the owner says the pet is home", r.status_code == 200, r.text[:200])
db.expire_all()
check("...it is in the report history", db.query(StatusHistory).filter(StatusHistory.report_id == R_ROAM.report_id,
      StatusHistory.remarks == "Owner answer: the pet is home.").count() == 1)
check("...the handling leader is told", db.query(Notification).filter(Notification.user_id == leader.user_id,
      Notification.title == f"Owner answered: Report #{R_ROAM.report_id}").count() == 1)
r = client.post(url, headers=H(owner), json={"report_id": R_ROAM.report_id, "pet_id": pets[0].pet_id, "answer": "missing"})
check("the owner can say it is still missing", r.status_code == 200)
check("...the pet is not marked Lost", db.get(Pet, pets[0].pet_id).status == "Active")
from app.utils.claim_custody import owner_custody_answer  # noqa: E402
check("the latest answer is read back (missing after home)", owner_custody_answer(db, db.get(Report, R_ROAM.report_id)) == "missing")
lst = {c["claim_id"]: c for c in client.get("/claims/", headers=H(leader)).json()}
check("claims carry the owner's answer (none on a case without one)", lst.get(OLD.claim_id, {}).get("owner_custody_answer") is None, lst.get(OLD.claim_id))

# ---- closing an unneeded claim ----
check("a resident can't close a claim as not needed", client.post(f"/claims/{OLD.claim_id}/close-not-needed", headers=H(owner)).status_code == 403)
r = client.post(f"/claims/{OLD.claim_id}/close-not-needed", headers=H(leader))
body = r.json() if r.status_code == 200 else {}
check("the leader closes the old claim as not needed", r.status_code == 200 and body.get("status") == "Rejected"
      and body.get("remarks") == NOT_NEEDED_REASON and body.get("closed_not_needed") is True, r.text[:200])
check("...the owner is told", db.query(Notification).filter(Notification.user_id == owner.user_id,
      Notification.title.like("Pet claim closed: not needed%")).count() == 1)
check("...closing it twice is refused", client.post(f"/claims/{OLD.claim_id}/close-not-needed", headers=H(leader)).status_code == 409)
for target in ("Approved", "Evidence Requested", "Handover Complete", "Pending Review"):
    r = client.patch(f"/claims/{OLD.claim_id}/status", headers=H(leader), json={"status": target, "remarks": ""})
    check(f"a claim closed as not needed can't be moved to {target} (nobody holds the animal)", r.status_code == 409, r.text[:200])
db.expire_all()
check("...it stays closed as not needed", db.get(PetClaim, OLD.claim_id).status == "Rejected")

# An approval made before this rule (or by mistake) on an animal nobody holds: closable, and the report gets its status back
R_MISTAKE = mk_case(pets[0])
db.add(StatusHistory(report_id=R_MISTAKE.report_id, report_status_id=11, updated_by=leader.user_id, remarks="Owner complied"))
db.add(StatusHistory(report_id=R_MISTAKE.report_id, report_status_id=9, updated_by=leader.user_id, remarks="Claim approved"))
db.get(Report, R_MISTAKE.report_id).current_status_id = 9
MISTAKE = PetClaim(report_id=R_MISTAKE.report_id, pet_id=pets[0].pet_id, status="Approved")
db.add(MISTAKE)
db.commit()
r = client.post(f"/claims/{MISTAKE.claim_id}/close-not-needed", headers=H(leader))
check("an approved claim on an animal nobody holds can be closed as not needed", r.status_code == 200 and r.json().get("closed_not_needed") is True, r.text[:200])
db.expire_all()
check("...the report goes back from Claimed by Owner to its earlier status", db.get(Report, R_MISTAKE.report_id).current_status_id == 11)

held_claim = db.query(PetClaim).filter(PetClaim.report_id == R_PICKED.report_id).first()
r = client.patch(f"/claims/{held_claim.claim_id}/status", headers=H(leader), json={"status": "Approved", "remarks": ""})
check("a claim on a held animal is still approved as before", r.status_code == 200 and r.json().get("status") == "Approved", r.text[:200])
check("a claim on a held animal can't be closed as not needed",
      client.post(f"/claims/{held_claim.claim_id}/close-not-needed", headers=H(leader)).status_code == 409)

print(f"\n{sum(results)}/{len(results)} claim custody checks passed")
db.close()
sys.exit(0 if all(results) else 1)
