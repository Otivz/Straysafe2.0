"""
Observation times and details for the history Case Summary panel:
- db_local_to_utc converts a database-clock time (local, +8) to UTC using the measured offset;
- an observation created from a First Warning gets its due date in UTC (F18), like one started normally;
- observation_summary sends the start time to everyone, and the extension reason and who closed it to officials only.
Runs on a throwaway SQLite database; the database clock is simulated as UTC+8.
"""
import os
import sys
from datetime import timedelta
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-observation-details-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.user import Barangay, Subdivision, User
from app.models.report import Report, ReportStatus, ReportCategory
from app.models.pet import Pet
from app.models.warning import OwnerWarning
from app.models.owner_followup import OwnerFollowUp
from app.routes import owner_followups
from app.utils.auth import create_access_token
from app.utils.owner_followups import _now, db_local_to_utc, observation_summary

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)
Base.metadata.create_all(engine)

api = FastAPI()
api.include_router(owner_followups.router)


def test_db():
    with Session() as session:
        yield session


api.dependency_overrides[get_db] = test_db
client = TestClient(api, raise_server_exceptions=True)
db = Session()

LOCAL_OFFSET = timedelta(hours=8)  # the database clock in the Philippines


def local_db_now(_session=None):
    return _now() + LOCAL_OFFSET


db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Grand Royale"))
db.flush()
db.add_all([
    User(user_id=1, name="Owner Resident", email="owner@test.com", password="x", role_id=1, subdivision_id=1),
    User(user_id=2, name="Subd Leader", email="leader@test.com", password="x", role_id=2, subdivision_id=1),
    ReportCategory(category_id=4, category_name="Roaming Stray"),
    ReportStatus(status_id=2, status_name="Verified"),
    ReportStatus(status_id=7, status_name="Under Observation"),
    ReportStatus(status_id=11, status_name="Incident Resolved"),
])
db.flush()
db.add(Pet(pet_id=1, owner_id=1, pet_name="Bantay", pet_type="Dog", breed="Aspin", color_markings="Brown"))
db.flush()
for rid in (1, 2):
    db.add(Report(report_id=rid, user_id=1, subdivision_id=1, category_id=4, pet_id=1, animal_type="Dog",
                  latitude=14.80, longitude=120.95, landmark="Block 5", current_status_id=2,
                  description="Roaming unleashed", priority_level="Medium"))
db.commit()

leader_hdr = {"Authorization": f"Bearer {create_access_token({'sub': 'leader@test.com', 'user_id': 2, 'role_id': 2})}"}

passed = failed = 0


def check(condition: bool, desc: str):
    global passed, failed
    if condition:
        passed += 1
        print(f"[PASS] {desc}")
    else:
        failed += 1
        print(f"[FAIL] {desc}")


print("\n--- Observation summary details ---")

# 1. Converting the database clock to UTC
with patch("app.utils.holding_stay.db_now", side_effect=local_db_now):
    local = _now().replace(microsecond=0) + LOCAL_OFFSET
    check(db_local_to_utc(db, local) == local - LOCAL_OFFSET, "a database-clock time is converted to UTC (8 hours earlier)")
    check(db_local_to_utc(db, None) is None, "no time stays empty")

# 2. F18: an observation created from a First Warning gets its due date in UTC
warned_at_local = (_now() + LOCAL_OFFSET).replace(microsecond=0)
db.add(OwnerWarning(warning_id=1, user_id=1, pet_id=1, report_id=1, issued_by=2, warning_level="1st Warning",
                    violation_type="Free-Roaming Unleashed", description="Unattended outside.", created_at=warned_at_local))
db.commit()
with patch("app.utils.holding_stay.db_now", side_effect=local_db_now), \
        patch("app.routes.owner_followups.db_now", side_effect=local_db_now), \
        patch("app.utils.notification_dispatcher.dispatch_notification"):
    res = client.get("/owner-followups/under-observation", headers=leader_hdr)
check(res.status_code == 200, f"under-observation page loads (status {res.status_code})")
db.expire_all()
fu = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == 1).first()
check(fu is not None, "a First Warning creates the observation record")
expected_due = warned_at_local - LOCAL_OFFSET + timedelta(days=3)
check(fu is not None and abs((fu.due_at - expected_due).total_seconds()) < 1,
      f"due date is the warning time in UTC plus 3 days (got {fu.due_at if fu else None}, expected {expected_due})")

# 3. observation_summary: start time for everyone; extension reason and closer for officials only
fu.is_extended, fu.extension_days, fu.extension_reason = True, 2, "Owner was out of town; neighbour feeds the dog."
fu.status, fu.closed_by, fu.closed_at = "complied", 2, _now()
db.commit()
report = db.get(Report, 1)
with patch("app.utils.holding_stay.db_now", side_effect=local_db_now):
    public = observation_summary(db, report)
    staff = observation_summary(db, report, staff_details=True)
check(public["started_at"] is not None and public["started_at"].endswith("+00:00"), "start time is sent, marked as UTC")
check(not any(k in public for k in ("extension_reason", "extension_days", "closed_by_name")),
      "without staff_details: no extension reason, days or closer")
check(staff["extension_reason"] == "Owner was out of town; neighbour feeds the dog." and staff["extension_days"] == 2,
      "officials get the extension reason and days")
check(staff["closed_by_name"] == "Subd Leader", "officials get who closed the observation")
check(staff["status"] == "complied" and staff["extended"] is True, "status and extended flag unchanged")

# 4. No extension: reason and days stay empty even for officials
fu.is_extended, fu.extension_reason, fu.extension_days = False, "stale text", 1
db.commit()
staff = observation_summary(db, report, staff_details=True)
check(staff["extension_reason"] is None and staff["extension_days"] is None, "a reason is only sent when the observation was extended")

print(f"\nResult: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
