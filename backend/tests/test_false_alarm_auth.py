"""
F01: dismissing a report as a false alarm needs a signed-in officer handling the case.
- anonymous calls are refused; residents are refused
- a user_id in the body is ignored: a forged "eligible officer" id gives no authority
- only the leader handling the report (or Barangay staff once the case is theirs, or an Admin) can dismiss it
- only from an open, pre-rescue state; never a merged or closed report
- the audit log records the real actor and the real previous status
Run from the backend folder:  python tests/test_false_alarm_auth.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "false_alarm_auth_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-false-alarm-auth-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subd if role in (1, 2) else None, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, leader, other_leader, far_leader, brgy, admin = mk("Res", 1), mk("Leader", 2), mk("Other", 2), mk("Far", 2, subd=2), mk("Brgy", 3), mk("Admin", 4)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []
CLOCK = [datetime(2026, 10, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(status=2, handler=None, **kw):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=status,
               animal_type="Dog", assigned_leader_id=(leader.user_id if handler is None else handler), created_at=CLOCK[0],
               ai_suggested_risk_level="Low", **kw)
    db.add(r)
    db.commit()
    return r.report_id


def status(rid):
    db.expire_all()
    return db.get(Report, rid).current_status_id


def dismiss(rid, headers=None, body_user=None):
    body = {"reason": "No Animal Found", "notes": "checked the area twice"}
    if body_user is not None:
        body["user_id"] = body_user
    return client.post(f"/reports/{rid}/mark-false-alarm", json=body, headers=headers or {})


R = report()
r = dismiss(R, body_user=leader.user_id)
check("an anonymous call can't dismiss a report, even naming the handling leader", r.status_code == 401 and status(R) == 2, r.status_code)
r = dismiss(R, H(res), body_user=leader.user_id)
check("a resident can't dismiss it by forging the handling leader's id", r.status_code == 403 and status(R) == 2, r.status_code)
r = dismiss(R, H(other_leader), body_user=leader.user_id)
check("another leader (not handling it) can't, even forging the handler's id", r.status_code == 403 and status(R) == 2, r.text[:200])
r = dismiss(R, H(far_leader), body_user=leader.user_id)
check("a leader of another subdivision can't", r.status_code == 403 and status(R) == 2, r.text[:200])
r = dismiss(R, H(brgy), body_user=leader.user_id)
check("Barangay staff can't while the subdivision leader handles the case", r.status_code == 403 and status(R) == 2, r.text[:200])

r = dismiss(R, H(leader), body_user=admin.user_id)
db.expire_all()
rep = db.get(Report, R)
check("the handling leader dismisses it", r.status_code == 200 and rep.current_status_id == 14, r.text[:200])
check("...recorded as the signed-in leader, not the id sent in the body", rep.verified_by_user_id == leader.user_id)
log = db.query(AuditLog).filter(AuditLog.action == "DISMISS_FALSE_ALARM", AuditLog.target_id == R).first()
check("...and the audit log has the real actor and the real previous status",
      log is not None and log.user_id == leader.user_id and (log.old_values or {}).get("status_id") == 2, log and (log.user_id, log.old_values))
check("an already dismissed report can't be dismissed again", dismiss(R, H(leader)).status_code == 409)

R_RESCUE = report(status=6)
check("not once the animal has been picked up", dismiss(R_RESCUE, H(leader)).status_code == 409 and status(R_RESCUE) == 6)
R_DONE = report(status=11)
check("not once the case is resolved", dismiss(R_DONE, H(leader)).status_code == 409 and status(R_DONE) == 11)
R_MAIN = report()
R_DUP = report(status=18, duplicate_of_report_id=R_MAIN)
r = dismiss(R_DUP, H(leader))
check("not a report merged into another case", r.status_code == 409 and "merged" in r.text and status(R_DUP) == 18, r.text[:200])
R_NOREASON = report()
r = client.post(f"/reports/{R_NOREASON}/mark-false-alarm", json={"reason": "  "}, headers=H(leader))
check("a reason is required", r.status_code == 400 and status(R_NOREASON) == 2)

R_ESC = report(status=4)
check("a leader can't dismiss a case escalated to the Barangay", dismiss(R_ESC, H(leader)).status_code == 403 and status(R_ESC) == 4)
r = dismiss(R_ESC, H(brgy))
check("Barangay staff must approve an escalated case before dismissing it (existing rule)", r.status_code == 403 and status(R_ESC) == 4, r.text[:200])
R_APPR = report(status=13)
r = dismiss(R_APPR, H(brgy))
check("...once approved, Barangay staff can dismiss it", r.status_code == 200 and status(R_APPR) == 14, r.text[:200])
R_ADMIN = report()
check("an Admin can dismiss", dismiss(R_ADMIN, H(admin)).status_code == 200 and status(R_ADMIN) == 14)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
