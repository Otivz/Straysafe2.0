"""
Print / Save as PDF of a case record (history pages): POST /reports/{id}/print-log writes one audit entry and returns
who is printing and when. Officials only, and only for reports they may see; residents are refused.
Run from the backend folder:  python tests/test_report_print_log.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "report_print_log_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-report-print-log-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, subdivision_id=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subdivision_id, barangay_id=1)
    db.add(u)
    db.flush()
    return u


reporter, leader, other_leader, staff, admin = (mk("Reporter One", 1), mk("Leader Santos", 2), mk("Leader Other", 2, 2),
                                               mk("Staff Cruz", 3), mk("Admin User", 4))
rep = Report(user_id=reporter.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0, current_status_id=11,
             animal_type="Dog", landmark="Gate", description="Roaming", priority_level="Medium", visibility="Private")
db.add(rep)
db.commit()
RID = rep.report_id
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def entries():
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == "EXPORT_CASE_RECORD").order_by(AuditLog.log_id).all()


# Officials who may see the report: one audit entry each, and the printout's footer details
for user, role in [(leader, "Subdivision Leader"), (staff, "Barangay Staff"), (admin, "Administrator")]:
    before = len(entries())
    r = client.post(f"/reports/{RID}/print-log", headers=H(user))
    body = r.json() if r.status_code == 200 else {}
    check(f"{role}: allowed (200)", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    check(f"{role}: returns name, role and time", body.get("printed_by") == user.name and body.get("role") == role
          and body.get("printed_at") and body.get("report_id") == RID, body)
    new = entries()[before:]
    check(f"{role}: exactly one audit entry", len(new) == 1, len(new))
    if new:
        e = new[0]
        check(f"{role}: entry names the actor, the report and the action", e.user_id == user.user_id and e.target_table == "reports"
              and e.target_id == RID and e.log_type == "security" and f"#{RID}" in (e.description or "") and user.name in (e.description or ""),
              (e.user_id, e.target_table, e.target_id, e.log_type, e.description))

# Refused: a resident (even the reporter), and nothing is logged
before = len(entries())
r = client.post(f"/reports/{RID}/print-log", headers=H(reporter))
check("resident (the reporter) refused with 403", r.status_code == 403, r.status_code)
check("resident: no audit entry", len(entries()) == before)

# Unknown report: 404, nothing logged
r = client.post("/reports/999999/print-log", headers=H(admin))
check("unknown report: 404", r.status_code == 404, r.status_code)
check("unknown report: no audit entry", len(entries()) == before)

# A leader who may not see the report gets what get_report would give them, and nothing is logged when refused
seen = client.get(f"/reports/{RID}", headers=H(other_leader)).status_code
r = client.post(f"/reports/{RID}/print-log", headers=H(other_leader))
check(f"other subdivision's leader: same answer as viewing the report (view {seen}, print {r.status_code})",
      (seen == 404 and r.status_code == 404) or (seen == 200 and r.status_code == 200), (seen, r.status_code))
if r.status_code == 404:
    check("other subdivision's leader: no audit entry", len(entries()) == before)

# Not signed in
r = client.post(f"/reports/{RID}/print-log")
check("not signed in: refused", r.status_code in (401, 403), r.status_code)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
