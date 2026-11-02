"""
Test Under Observation Integration Suite:
Verifies automatic observation creation upon First Warning,
countdown behavior, summary statistics, search/filtering,
and Barangay endorsement.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-under-obs-secret-0123456789")
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
from app.routes import owner_followups, warnings
from app.utils.auth import create_access_token

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)
Base.metadata.create_all(engine)

api = FastAPI()
api.include_router(owner_followups.router)
api.include_router(warnings.router)

def test_db():
    with Session() as session:
        yield session

api.dependency_overrides[get_db] = test_db
client = TestClient(api, raise_server_exceptions=True)
db = Session()

# Setup fixtures
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Grand Royale"))
db.flush()

db.add_all([
    User(user_id=1, name="Owner Resident", email="owner@test.com", password="x", role_id=1, subdivision_id=1, phone="09171112222"),
    User(user_id=2, name="Subd Leader", email="leader@test.com", password="x", role_id=2, subdivision_id=1),
    User(user_id=3, name="Barangay Staff", email="brgy@test.com", password="x", role_id=3, barangay_id=1),
    User(user_id=4, name="Admin User", email="admin@test.com", password="x", role_id=4),
])
db.flush()

db.add_all([
    ReportCategory(category_id=1, category_name="Injured Stray"),
    ReportCategory(category_id=4, category_name="Roaming Stray"),
    ReportStatus(status_id=1, status_name="Reported"),
    ReportStatus(status_id=2, status_name="Verified"),
    ReportStatus(status_id=4, status_name="Escalated to Barangay"),
    ReportStatus(status_id=7, status_name="Under Observation"),
    ReportStatus(status_id=11, status_name="Incident Resolved"),
])
db.flush()

pet1 = Pet(pet_id=1, owner_id=1, pet_name="Bantay", pet_type="Dog", breed="Aspin", color_markings="Brown")
db.add(pet1)
db.flush()

rep1 = Report(
    report_id=1,
    user_id=1,
    subdivision_id=1,
    category_id=4,
    pet_id=1,
    animal_type="Dog",
    latitude=14.80,
    longitude=120.95,
    landmark="Block 5 Lot 12",
    current_status_id=2,
    description="Roaming outside house unleashed",
    priority_level="Medium"
)
db.add(rep1)
db.flush()

# Report without warning
rep2 = Report(
    report_id=2,
    user_id=1,
    subdivision_id=1,
    category_id=4,
    animal_type="Cat",
    latitude=14.81,
    longitude=120.96,
    landmark="Clubhouse Gate",
    current_status_id=2,
    description="Roaming cat near clubhouse",
    priority_level="Low"
)
db.add(rep2)
db.flush()
db.commit()

leader_token = create_access_token({"sub": "leader@test.com", "user_id": 2, "role_id": 2})
leader_hdr = {"Authorization": f"Bearer {leader_token}"}

tests_passed = 0
tests_failed = 0

def check(condition: bool, desc: str):
    global tests_passed, tests_failed
    if condition:
        tests_passed += 1
        print(f"[PASS] {desc}")
    else:
        tests_failed += 1
        print(f"[FAIL] {desc}")

print("\n--- Running Under Observation Integration Tests ---")

# 1. Issue First Warning for Report #1
with patch("app.utils.notification_dispatcher.dispatch_notification"):
    with patch("app.services.email_templates.render_owner_warning_email", return_value=("Subj", "Body", "<b>Body</b>")):
        res_warn = client.post("/warnings/", json={
            "user_id": 1,
            "pet_id": 1,
            "report_id": 1,
            "warning_level": "1st Warning",
            "violation_type": "Free-Roaming Unleashed",
            "description": "Pet seen unattended outside property line.",
            "fine_amount": 0.0
        }, headers=leader_hdr)

check(res_warn.status_code == 200, "First Warning successfully issued (200)")

# Check auto-creation of OwnerFollowUp and report status update
db.expire_all()
rep1_check = db.query(Report).filter(Report.report_id == 1).first()
check(rep1_check.current_status_id == 7, "Report status updated to 7 ('Under Observation')")

fu1 = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == 1).first()
check(fu1 is not None, "OwnerFollowUp record automatically created")
check(fu1.status == "observing", "Observation status is 'observing'")
check(fu1.duration_days == 3, "Duration is 3 calendar days")
check(fu1.due_at > fu1.created_at, "due_at is calculated forward from warning created_at")

# 2. Check Active Count endpoint
res_cnt = client.get("/owner-followups/active-count", headers=leader_hdr)
check(res_cnt.status_code == 200, "Active count endpoint returns 200")
check(res_cnt.json().get("active_count") == 1, "Active observation count is 1")

# 3. Check Under Observation dashboard endpoint
res_dash = client.get("/owner-followups/under-observation", headers=leader_hdr)
check(res_dash.status_code == 200, "Under observation dashboard returns 200")
data = res_dash.json()

check(data["total_under_observation"] == 1, "Total under observation is 1")
check(data["day_1_count"] == 1, "Day 1 count is 1")
check(len(data["items"]) == 1, "Items list contains 1 item")

item = data["items"][0]
check(item["report_id"] == 1, "Report #1 is listed")
check(item["pet_name"] == "Bantay", "Animal name is populated")
check(item["owner_name"] == "Owner Resident", "Owner name is populated")
check(item["first_warning_level"] == "1st Warning", "First Warning level populated")
check("Day 1 of 3" in item["observation_day_display"], f"Observation day is Day 1 of 3: {item['observation_day_display']}")
check(item["progress_percent"] is not None and item["progress_percent"] >= 0, "Progress percent calculated")

# 4. Strict Rule: Report #2 (no warning issued) must NOT appear
check(all(it["report_id"] != 2 for it in data["items"]), "Report #2 without warning does NOT appear on observation page")

# 5. Rule 7: Endorsement rejected before Second Warning
res_endorse_early = client.post(f"/owner-followups/{fu1.followup_id}/endorse-barangay", json={
    "endorsement_reason": "Premature escalation attempt."
}, headers=leader_hdr)
check(res_endorse_early.status_code == 400, "Premature endorsement before Second Warning is rejected (400)")

# 6. Resolve Case Flow (Test on a separate case, e.g. Report #3)
rep3 = Report(
    report_id=3,
    user_id=1,
    subdivision_id=1,
    category_id=4,
    animal_type="Dog",
    latitude=14.80,
    longitude=120.95,
    landmark="Block 8 Lot 4",
    current_status_id=2,
    description="Roaming dog outside gate"
)
db.add(rep3)
db.commit()

with patch("app.utils.notification_dispatcher.dispatch_notification"):
    with patch("app.services.email_templates.render_owner_warning_email", return_value=("Subj", "Body", "<b>Body</b>")):
        res_w3 = client.post("/warnings/", json={
            "user_id": 1,
            "report_id": 3,
            "warning_level": "1st Warning",
            "violation_type": "Free-Roaming Unleashed",
            "description": "Keep dog leashed inside compound.",
            "fine_amount": 0.0
        }, headers=leader_hdr)
        print("W3 response:", res_w3.status_code, res_w3.text)

db.expire_all()
fu3 = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == 3).first()
check(fu3 is not None, "Report #3 follow-up started on 1st Warning")

# Resolve Report #3
res_resolve = client.post(f"/owner-followups/{fu3.followup_id}/resolve", json={
    "verification_notes": "Leader inspected compound: Owner installed self-closing gate latch and keeps dog inside."
}, headers=leader_hdr)
check(res_resolve.status_code == 200, "Leader resolves observation case with verification remarks (200)")

db.expire_all()
fu3_res = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == fu3.followup_id).first()
check(fu3_res.status_code == "complied" if hasattr(fu3_res, 'status_code') else fu3_res.status == "complied", "Followup #3 status updated to 'complied'")
check(fu3_res.closed_at is not None, "closed_at timestamp recorded")
rep3_res = db.query(Report).filter(Report.report_id == 3).first()
check(rep3_res.current_status_id == 11, "Report #3 status updated to 11 ('Incident Resolved')")

# 7. Non-compliance after 3 days -> Issue Second Warning on Report #1
# Simulate expiry on Report #1
fu1.due_at = datetime.now(timezone.utc) - timedelta(hours=2)
db.commit()

res_warn2 = client.post(f"/owner-followups/{fu1.followup_id}/issue-second-warning", json={
    "violation_type": "Free-Roaming Unleashed",
    "description": "Owner failed to comply after 3-day observation. Animal still roaming outside compound.",
    "fine_amount": 500.0
}, headers=leader_hdr)
check(res_warn2.status_code == 200, "Second Warning successfully issued for expired case (200)")

db.expire_all()
warn2_data = res_warn2.json()
check(warn2_data.get("workflow_section") == "second_warning_issued", "Response workflow section updated to 'second_warning_issued'")
check(warn2_data.get("has_second_warning") is True, "Response has_second_warning is True")
check(db.query(OwnerWarning).filter(OwnerWarning.report_id == 1, OwnerWarning.warning_level == "2nd Warning").count() == 1, "Second Warning record persisted in DB")

# 8. Case now eligible for Endorsement to Barangay San Vicente
res_endorse = client.post(f"/owner-followups/{fu1.followup_id}/endorse-barangay", json={
    "endorsement_reason": "Owner refused to leash pet after 3-day observation and Second Warning.",
    "notes": "Escalating for barangay-level custody or enforcement."
}, headers=leader_hdr)

check(res_endorse.status_code == 200, "Endorse to Barangay action returns 200 after Second Warning")
db.expire_all()
fu1_escalated = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == fu1.followup_id).first()
check(fu1_escalated.status == "escalated", "Followup status updated to 'escalated'")
rep1_escalated = db.query(Report).filter(Report.report_id == 1).first()
check(rep1_escalated.current_status_id == 4, "Report status updated to 4 ('Escalated to Barangay')")

# Rule 7: Duplicate endorsement rejected
res_dup_endorse = client.post(f"/owner-followups/{fu1.followup_id}/endorse-barangay", json={
    "endorsement_reason": "Duplicate endorsement attempt."
}, headers=leader_hdr)
check(res_dup_endorse.status_code == 400, "Duplicate Barangay endorsement strictly blocked (400)")

print(f"\n==========================================")
print(f"Total Checks: {tests_passed + tests_failed} | Passed: {tests_passed} | Failed: {tests_failed}")
print(f"==========================================\n")

if tests_failed > 0:
    sys.exit(1)
sys.exit(0)
