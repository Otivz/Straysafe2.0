"""
Subdivision Leaders review (duplicates, potential matches, animal records); Barangay staff monitor unless the case is
in their hands or the subdivision has no active leader. A report can't be escalated or resolved without an animal record.
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_case_review.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "case_review_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-case-review-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, pets, reports, rescue  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (reports.router, rescue.router, pets.router, matches.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="With Leader"))
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="No Leader"))
for sid, name in [(1, "Reported"), (2, "Verified"), (3, "Rejected"), (4, "Escalated to Barangay"), (5, "Rescue In Progress"),
                  (11, "Incident Resolved"), (13, "Approved"), (14, "False Alarm / Dismissed"), (18, "Merged — Duplicate")]:
    db.add(ReportStatus(status_id=sid, status_name=name))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


resident = mk_user("Resident", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
head = mk_user("Head Officer", 3, barangay_id=1, is_head_officer=True)
admin = mk_user("Admin", 4)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def mk_report(status=2, subd=1, claimed=True, pet=False):
    pet_id = None
    if pet:
        p = Pet(pet_name="Stray", pet_type="Dog", status="Rescued")
        db.add(p)
        db.flush()
        pet_id = p.pet_id
    r = Report(user_id=resident.user_id, subdivision_id=subd, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=status, animal_type="Dog", assigned_leader_id=leader.user_id if claimed else None, pet_id=pet_id)
    db.add(r)
    db.commit()
    return r.report_id


def status(rid, who, sid, remarks="enough remarks"):
    return client.patch(f"/reports/{rid}/status", json={"status_id": sid, "remarks": remarks}, headers=H(who))


def merge(dup, primary, who=None, body_user=None):
    headers = H(who) if who else {}
    return client.post(f"/reports/{dup}/merge", json={"primary_report_id": primary, "notes": "same dog", "user_id": body_user}, headers=headers)


# --- Animal record before escalating / resolving ---------------------------------
R = mk_report()
r = status(R, leader, 4)
check("escalating without an animal record is refused", r.status_code == 400 and "animal record" in r.text.lower(), r.text[:200])
check("...and the report stays Verified", db.get(Report, R).current_status_id == 2)
r = client.post("/rescue-requests/", json={"report_id": R, "status_id": 1, "description": "please rescue"}, headers=H(leader))
db.expire_all()
check("creating a rescue request (which escalates) is refused without a record too",
      r.status_code == 400 and "animal record" in r.text.lower() and db.get(Report, R).current_status_id == 2, r.text[:200])

r = status(R, leader, 11)
check("resolving without an animal record is refused", r.status_code == 400 and "resolved" in r.text.lower(), r.text[:200])
r = status(R, leader, 14)
check("closing as False Alarm doesn't need a record", r.status_code == 200, r.text[:200])

R2 = mk_report()
r = status(R2, leader, 3, "not a real stray at all")
check("rejecting doesn't need a record", r.status_code == 200, r.text[:200])

R3 = mk_report()
db.add(HoldingAnimal(report_id=R3, animal_type="Dog", facility_status=2))
db.commit()
r = status(R3, leader, 4)
check("a holding-facility record also counts as the animal record", r.status_code == 200, r.text[:200])

R4 = mk_report(pet=True)
r = status(R4, leader, 4)
check("with a pet record the leader can escalate", r.status_code == 200, r.text[:200])

# --- Merge: authentication and who may do it ---------------------------------------
A = mk_report()
B = mk_report()
r = merge(A, B)
check("merging without signing in is refused (401)", r.status_code == 401, r.text[:150])
r = merge(A, B, who=resident, body_user=admin.user_id)
check("a resident can't merge by putting an admin's user_id in the request", r.status_code == 403, r.text[:150])
r = merge(A, B, who=head)
check("Barangay staff can't merge reports the Subdivision Leader is still handling", r.status_code == 403 and "subdivision leader" in r.text.lower(), r.text[:200])
r = merge(A, B, who=leader)
check("the Subdivision Leader can merge them", r.status_code == 200, r.text[:200])

N1 = mk_report(subd=2, claimed=False)
N2 = mk_report(subd=2, claimed=False)
r = merge(N1, N2, who=head)
check("Barangay staff can merge in a subdivision with no active leader", r.status_code == 200, r.text[:200])

E1 = mk_report(status=13)
E2 = mk_report(status=13)
r = merge(E1, E2, who=head)
E_MAIN = E1 if db.get(Report, E2).duplicate_of_report_id == E1 else E2  # the first-filed report stays open as the main case
check("Barangay staff can merge reports already in Barangay hands (approved)", r.status_code == 200, r.text[:200])

# --- Animal records -----------------------------------------------------------------
pet_body = {"pet_name": "Brownie", "pet_type": "Dog"}
r = client.post("/pets/", json=pet_body, headers=H(head))
check("Barangay staff can't add a pet record on its own", r.status_code == 403 and "subdivision leader" in r.text.lower(), r.text[:200])
U = mk_report()
r = client.post(f"/pets/?for_report_id={U}", json=pet_body, headers=H(head))
check("...or for a report the Subdivision Leader is still handling", r.status_code == 403, r.text[:200])
r = client.post(f"/pets/?for_report_id={E_MAIN}", json=pet_body, headers=H(head))
check("...but can for a case the Barangay is handling", r.status_code == 200, r.text[:200])
r = client.post("/pets/", json={"pet_name": "Leader Dog", "pet_type": "Dog"}, headers=H(leader))
check("the Subdivision Leader adds pet records as before", r.status_code == 200, r.text[:200])
leader_pet = r.json().get("pet_id")

r = client.post(f"/reports/{U}/link-pet?pet_id={leader_pet}", headers=H(head))
check("Barangay staff can't link a record to a report the leader is handling", r.status_code == 403, r.text[:200])
r = client.post(f"/reports/{U}/link-pet?pet_id={leader_pet}", headers=H(leader))
check("the leader can link it", r.status_code == 200, r.text[:200])

# --- Potential matches --------------------------------------------------------------
M_src = mk_report()
m = ReportMatch(source_report_id=M_src, matched_pet_id=leader_pet, similarity_score=80, status="PENDING")
db.add(m)
db.commit()
r = client.post(f"/matches/{m.match_id}/verify", json={"decision": "NOT_A_MATCH", "notes": "different dog"}, headers=H(head))
check("Barangay staff can't decide a potential match the leader is handling", r.status_code == 403, r.text[:200])
r = client.post(f"/matches/scan/{M_src}", headers=H(head))
check("...or re-scan that report", r.status_code == 403, r.text[:200])
r = client.post("/matches/scan-all", headers=H(leader))
check("only admins can re-scan every report", r.status_code == 403, r.text[:200])

# --- What the screens are told --------------------------------------------------------
rp = client.get(f"/reports/{U}/review-permission", headers=H(head)).json()
check("review-permission tells Barangay staff they can't review a leader's case", rp["can_review"] is False and rp["reason"], str(rp))
rp = client.get(f"/reports/{U}/review-permission", headers=H(leader)).json()
check("...and tells the leader they can, with the record now linked", rp["can_review"] is True and rp["has_animal_record"] is True, str(rp))
rp = client.get(f"/reports/{E_MAIN}/review-permission", headers=H(head)).json()
check("...and that Barangay staff can review a case in their hands", rp["can_review"] is True, str(rp))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
