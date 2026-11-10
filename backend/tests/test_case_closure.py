"""
Closing a report (any route) ends its open owner observation and closes its lost-pet alert — utils/case_closure.py.
Throwaway SQLite DB.  Run from the backend folder:  python tests/test_case_closure.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_DB = os.path.join(tempfile.mkdtemp(), "case_closure_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-case-closure-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
u = User(name="Leader", email="s@t.com", password="x", role_id=2, subdivision_id=1, status="Active")
o = User(name="Owner", email="o@t.com", password="x", role_id=1, subdivision_id=1, status="Active")
db.add_all([u, o])
db.commit()

results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def case(report_status=7):
    r = Report(user_id=o.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1, current_status_id=report_status, animal_type="Dog")
    db.add(r)
    db.flush()
    fu = OwnerFollowUp(report_id=r.report_id, subdivision_id=1, leader_id=u.user_id, owner_id=o.user_id, status="observing",
                       due_at=datetime.now() + timedelta(days=3), duration_days=3)
    db.add(fu)
    db.commit()
    return r, fu


for new_status, label in [(9, "Claimed by Owner"), (10, "Released"), (11, "Resolved"), (12, "Deceased"), (14, "False Alarm"), (17, "Cannot Be Found")]:
    r, fu = case()
    r.current_status_id = new_status
    db.commit()
    db.refresh(fu)
    check(f"report -> {label}: the open owner observation is closed with a reason", fu.status == "closed" and fu.closed_at is not None and bool(fu.close_reason), (fu.status, fu.close_reason))

r, fu = case(report_status=4)
r.current_status_id = 13
db.commit()
db.refresh(fu)
check("report -> Approved by Barangay: the observation ends as escalated", fu.status == "escalated", fu.status)

r, fu = case()
r.current_status_id = 16
db.commit()
db.refresh(fu)
check("report -> Under Investigation (still open): the observation is untouched", fu.status == "observing")

r, fu = case()
fu.status = "closed"
done_at = datetime(2026, 1, 2)
fu.closed_at = done_at
db.commit()
r.current_status_id = 11
db.commit()
db.refresh(fu)
check("an already-closed observation is left as it was", fu.status == "closed" and fu.closed_at == done_at)

print(f"\n{sum(results)}/{len(results)} case closure checks passed")
sys.exit(0 if all(results) else 1)
