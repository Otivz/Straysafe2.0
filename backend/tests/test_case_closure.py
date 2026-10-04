"""
Closing a report (any route) closes its open rescue request(s) — utils/case_closure.py.
Throwaway SQLite DB.  Run from the backend folder:  python tests/test_case_closure.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "case_closure_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-case-closure-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.report import Report, ReportStatus, Rescue, RescueAssignment, RescueStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for sid in range(1, 7):
    db.add(RescueStatus(status_id=sid, status_name=f"R{sid}"))
u = User(name="Staff", email="s@t.com", password="x", role_id=3, barangay_id=1, status="Active")
db.add(u)
db.commit()

results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def case(report_status=6, rescue_status=5):
    r = Report(user_id=u.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1, current_status_id=report_status, animal_type="Dog")
    db.add(r)
    db.flush()
    rs = Rescue(report_id=r.report_id, staff_id=u.user_id, status_id=rescue_status, title="t")
    db.add(rs)
    db.flush()
    a = RescueAssignment(rescue_id=rs.rescue_id, user_id=u.user_id, staff_id=u.user_id, assignment_status="Assigned")
    db.add(a)
    db.commit()
    return r, rs, a


for new_status, label in [(9, "Claimed by Owner"), (10, "Released"), (11, "Resolved"), (12, "Deceased"), (14, "False Alarm"), (17, "Cannot Be Found")]:
    r, rs, a = case()
    r.current_status_id = new_status
    db.commit()
    db.refresh(rs)
    db.refresh(a)
    check(f"report -> {label}: open rescue becomes Resolved and the team assignment Completed",
          rs.status_id == 6 and rs.completed_at is not None and a.assignment_status == "Completed", (rs.status_id, a.assignment_status))

r, rs, a = case(report_status=4, rescue_status=1)
r.current_status_id = 3
db.commit()
db.refresh(rs)
db.refresh(a)
check("report -> Rejected: rescue becomes Rejected and the assignment Cancelled", rs.status_id == 3 and a.assignment_status == "Cancelled")

r, rs, a = case()
r.current_status_id = 7
db.commit()
db.refresh(rs)
check("report -> Under Observation (still open): rescue untouched", rs.status_id == 5)

r, rs, a = case(rescue_status=6)
done_at = rs.completed_at
r.current_status_id = 11
db.commit()
db.refresh(rs)
check("an already-resolved rescue is left as it was", rs.status_id == 6)

print(f"\n{sum(results)}/{len(results)} case closure checks passed")
sys.exit(0 if all(results) else 1)
