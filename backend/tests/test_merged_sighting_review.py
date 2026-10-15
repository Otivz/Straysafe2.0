"""
Leader review of merged sightings before a case is closed (closing a case closes the reports merged into it):
  - Returning the pet needs the leader's confirmation that the merged sightings were reviewed.
  - A sighting the owner disputed (not their pet / unsure) must be decided first: kept as the same animal (with a
    reason) or separated back into an active report (the existing unmerge).
  - After closing, an owner's "not my pet" puts the sighting in the leader's "needs review" list until decided.
  - A case without merged sightings is not affected.
Run from the backend folder:  python tests/test_merged_sighting_review.py
"""
import os
import sys
import tempfile
from datetime import datetime

_DB = os.path.join(tempfile.mkdtemp(), "merged_sighting_review_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-merged-review-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.case_groups import require_merged_sightings_review  # noqa: E402
from app.utils.owner_returns import OwnerReturnInfo, validate_owner_return  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(matches.router)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1, phone="09170000000")
    db.add(u)
    db.flush()
    return u


owner = mk("Emma Owner", 1)
leader = mk("Leo Leader", 2)
pet = Pet(pet_name="Rocky", pet_type="Dog", owner_id=owner.user_id, status="Lost")
db.add(pet)
db.flush()


def rep(day, **kw):
    r = Report(user_id=owner.user_id, subdivision_id=1, category_id=6, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", assigned_leader_id=leader.user_id, created_at=datetime(2026, 10, day), **kw)
    db.add(r)
    db.flush()
    return r


root = rep(1, pet_id=pet.pet_id)
a, b = rep(2), rep(3)
for s in (a, b):
    s.duplicate_of_report_id, s.current_status_id = root.report_id, 18
db.add(ReportMatch(source_report_id=root.report_id, matched_pet_id=pet.pet_id, similarity_score=95, status="CONFIRMED_MATCH",
                   owner_confirmation_status="OWNER_CONFIRMED", verified_at=datetime(2026, 10, 4), reviewed_by=leader.user_id))
qa = ReportMatch(source_report_id=a.report_id, matched_pet_id=pet.pet_id, status="COVERED_BY_CASE", owner_confirmation_status="PENDING")
qb = ReportMatch(source_report_id=b.report_id, matched_pet_id=pet.pet_id, status="COVERED_BY_CASE", owner_confirmation_status="UNSURE",
                 owner_verification_answered_at=datetime(2026, 10, 5), owner_notes="The collar looks different")
db.add_all([qa, qb])
db.add(PetClaim(pet_id=pet.pet_id, report_id=root.report_id, status="Approved", evidence_url="https://cdn.example/p.jpg"))
plain = rep(6, pet_id=None)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def blocked(report, reviewed):
    try:
        db.expire_all()
        require_merged_sightings_review(db, db.get(Report, report.report_id), reviewed)
        return None
    except HTTPException as e:
        return e.detail


def listing():
    return {x["report_id"]: x for x in client.get(f"/matches/case/{root.report_id}/merged-sightings", headers=H(leader)).json()["sightings"]}


# a case without merges is not affected
check("a case without merged sightings needs no review", blocked(plain, None) is None)

# the owner's "unsure" sighting must be decided, even with the acknowledgement
s = listing()
check("the listing marks the owner's 'unsure' sighting as disputed", s[b.report_id]["disputed"] and not s[a.report_id]["disputed"], s)
why = blocked(root, True)
check("return blocked: the disputed sighting is not decided yet", why and f"#{b.report_id}" in why, why)

# keeping a disputed sighting needs a reason
r = client.post(f"/matches/case/{root.report_id}/merged-sightings/keep", headers=H(leader), json={"report_ids": [b.report_id]})
check("keeping a disputed sighting without a reason is refused (422)", r.status_code == 422, r.status_code)
r = client.post(f"/matches/case/{root.report_id}/merged-sightings/keep", headers=H(leader),
                json={"report_ids": [b.report_id], "reason": "Same scar on the left ear in both photos"})
check("...with a reason it is kept as the same animal", r.status_code == 200 and {x["report_id"]: x for x in r.json()["sightings"]}[b.report_id]["decided"], r.text[:200])
check("...and the decision is on the sighting's timeline", any("[Merged sighting reviewed]" in (h.remarks or "") and "Same scar" in (h.remarks or "")
                                                               for h in db.get(Report, b.report_id).history))
check("residents can't record a review (403)", client.post(f"/matches/case/{root.report_id}/merged-sightings/keep", headers=H(owner),
                                                           json={"report_ids": [a.report_id]}).status_code == 403)

# now only the acknowledgement is missing
why = blocked(root, None)
check("return still needs the leader's 'I reviewed them'", why and "Review the reports merged" in why, why)
check("with it, the return can go ahead", blocked(root, True) is None)

# the shared owner-return validation enforces it for staff (report / holding / rescue returns)
info = OwnerReturnInfo(has_account=True, owner_user_id=owner.user_id, relationship_to_animal="Owner", handover_photo_url="x.jpg")
try:
    validate_owner_return(info, leader, db, db.get(Report, root.report_id))
    via = None
except HTTPException as e:
    via = e.detail
check("owner-return validation refuses a staff return without the review", via and "Review the reports merged" in str(via), via)

# separating a sighting removes it from the review (the existing unmerge)
r = client.post(f"/reports/{a.report_id}/unmerge", headers=H(leader), json={"reason": "Different dog: white paws"})
db.expire_all()
check("a different animal is separated back into an active report", r.status_code == 200 and db.get(Report, a.report_id).duplicate_of_report_id is None, r.text[:200])
check("...and is no longer part of the review", a.report_id not in listing())

# after closing: the owner says the kept sighting was not theirs -> it waits for the leader again
db.expire_all()
rt = db.get(Report, root.report_id)
rt.current_status_id = 9
db.commit()
r = client.post(f"/matches/{qb.match_id}/owner-feedback", headers=H(owner),
                json={"owner_confirmation": "OWNER_REJECTED", "remarks": "Not Rocky after all", "report_id": b.report_id})
check("closed case: the owner's 'not my pet' is accepted", r.status_code == 200, r.text[:200])
q = client.get("/matches/merged-sightings/needs-review", headers=H(leader)).json()["sightings"]
check("...the sighting is now in the leader's 'needs review' list", [x["report_id"] for x in q] == [b.report_id], q)
r = client.post(f"/matches/case/{root.report_id}/merged-sightings/keep", headers=H(leader),
                json={"report_ids": [b.report_id], "reason": "Checked again with the owner: same scar"})
check("keeping it again (with a reason) clears it from the list", r.status_code == 200
      and client.get("/matches/merged-sightings/needs-review", headers=H(leader)).json()["sightings"] == [])
check("residents can't see the list (403)", client.get("/matches/merged-sightings/needs-review", headers=H(owner)).status_code == 403)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
