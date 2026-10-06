"""
Case gating: Subdivision Leaders cannot touch an unclaimed report; Barangay staff cannot operate on an
escalated report (status 4) until it is approved (status 13).
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_case_gating.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "case_gating_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-case-gating-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import rescue, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(reports.router)
api.include_router(rescue.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in (1, 2, 3, 4, 5, 6, 7, 8, 13, 14):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


resident = mk_user("Resident", 1, subdivision_id=1, barangay_id=1)
leader_a = mk_user("Leader A", 2, subdivision_id=1, barangay_id=1)
leader_b = mk_user("Leader B", 2, subdivision_id=1, barangay_id=1)
head = mk_user("Head", 3, barangay_id=1, is_head_officer=True)
tanod = mk_user("Tanod", 3, barangay_id=1)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731


def mk_report(status=1, leader=None):
    r = Report(user_id=resident.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1, current_status_id=status,
               animal_type="Cat", assigned_leader_id=leader.user_id if leader else None)
    db.add(r)
    db.commit()
    return r.report_id


results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def status(rid, who, sid, remarks="ok remarks"):
    return client.patch(f"/reports/{rid}/status", json={"status_id": sid, "remarks": remarks}, headers=H(who))


# ── Subdivision Leader: claim first ─────────────────────────────────────────
U = mk_report()
for label, call in [
    ("verify (status 2)", lambda: status(U, leader_a, 2)),
    ("escalate (status 4)", lambda: status(U, leader_a, 4)),
    ("reject (status 3)", lambda: status(U, leader_a, 3, "not a real stray animal")),
    ("verify-incident", lambda: client.post(f"/reports/{U}/verify-incident", json={"user_id": leader_a.user_id}, headers=H(leader_a))),
    ("mark-false-alarm", lambda: client.post(f"/reports/{U}/mark-false-alarm", json={"user_id": leader_a.user_id, "reason": "Other"}, headers=H(leader_a))),
]:
    r = call()
    check(f"unclaimed report: leader cannot {label} (403)", r.status_code == 403 and "claim" in r.text.lower(), f"{r.status_code} {r.text[:120]}")
db.expire_all()
check("unclaimed report unchanged", db.get(Report, U).current_status_id == 1)

C = mk_report(leader=leader_a)
r = status(C, leader_b, 2)
check("report claimed by Leader A: Leader B cannot update (403)", r.status_code == 403, f"{r.status_code} {r.text[:120]}")
r = status(C, leader_a, 2)
check("the claiming leader can verify", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
r = status(C, leader_a, 4)
check("escalating without an animal record is refused", r.status_code == 400 and "animal record" in r.text.lower(), f"{r.status_code} {r.text[:160]}")
stray = Pet(pet_name="Unnamed stray", pet_type="Cat", status="Rescued")
db.add(stray)
db.flush()
db.query(Report).filter_by(report_id=C).update({"pet_id": stray.pet_id})
db.commit()
r = status(C, leader_a, 4)
check("the claiming leader can escalate once the animal has a record", r.status_code == 200, f"{r.status_code} {r.text[:160]}")

# ── Barangay: approve first ────────────────────────────────────────────────
E = mk_report(status=4)
for sid, label in [(5, "dispatch (5)"), (6, "picked up (6)"), (7, "holding facility (7)"), (11, "resolve (11)")]:
    r = status(E, tanod, sid)
    check(f"escalated (4): Barangay staff cannot {label} before approval (403)", r.status_code == 403 and "approve" in r.text.lower(), f"{r.status_code} {r.text[:120]}")
r = status(E, head, 7)
check("...not even the Head Officer can skip approval", r.status_code == 403, f"{r.status_code} {r.text[:120]}")
r = client.post("/rescue-requests/assign-team", json={"report_id": E, "assigned_personnel_ids": [tanod.user_id]}, headers=H(head))
check("assigning a response team before approval is refused (403)", r.status_code == 403 and "approve" in r.text.lower(), f"{r.status_code} {r.text[:140]}")
db.expire_all()
check("escalated report unchanged by refused attempts", db.get(Report, E).current_status_id == 4)
r = status(E, head, 13)
check("Approve (13) is allowed", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
r = status(E, head, 5)
check("after approval, Barangay operations proceed (dispatch)", r.status_code == 200, f"{r.status_code} {r.text[:160]}")

E2 = mk_report(status=4)
r = status(E2, head, 3, "Outside barangay jurisdiction")
check("Reject (3) with a reason is allowed on an escalated report", r.status_code == 200, f"{r.status_code} {r.text[:160]}")

passed = sum(results)
print(f"\n{passed}/{len(results)} case gating checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
