"""
Phase 3 Owner Follow-up Backend Test Suite.
Uses isolated in-memory SQLite with StaticPool and mocked external notices.
Run from repository root: .venv\\Scripts\\python.exe backend/tests/test_owner_followups.py
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-phase3-owner-followup-secret-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.user import Barangay, Subdivision, User
from app.models.report import Report, ReportStatus
from app.models.pet import Pet
from app.models.system_setting import SystemSetting
from app.models.owner_followup import OwnerFollowUp, FollowUpContactLog
from app.routes import owner_followups
from app.utils.auth import create_access_token
from app.utils.owner_followups import (
    get_default_duration_days,
    set_default_duration_days,
    check_and_notify_due_followups,
    enrich_and_redact_followup,
    _now
)

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

# Setup test fixtures: Barangay, Subdivisions, Users
db.add(Barangay(barangay_id=1, barangay_name="San Antonio", city="Pasig"))
db.flush()
db.add_all([
    Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Subdivision Alpha"),
    Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Subdivision Beta"),
])
db.flush()

for s_id in range(1, 19):
    db.add(ReportStatus(status_id=s_id, status_name=f"Status {s_id}"))

resident_owner = User(
    user_id=10, name="Juan Owner", email="juan@example.com", password="hash",
    role_id=1, status="Active", is_verified=True, subdivision_id=1, barangay_id=1
)
other_resident = User(
    user_id=11, name="Maria Citizen", email="maria@example.com", password="hash",
    role_id=1, status="Active", is_verified=True, subdivision_id=1, barangay_id=1
)
leader_subd1 = User(
    user_id=20, name="Leader Alpha", email="leader1@example.com", password="hash",
    role_id=2, status="Active", is_verified=True, subdivision_id=1, barangay_id=1
)
leader_subd2 = User(
    user_id=21, name="Leader Beta", email="leader2@example.com", password="hash",
    role_id=2, status="Active", is_verified=True, subdivision_id=2, barangay_id=1
)
admin_user = User(
    user_id=40, name="Admin User", email="admin@example.com", password="hash",
    role_id=4, status="Active", is_verified=True, barangay_id=1
)

db.add_all([resident_owner, other_resident, leader_subd1, leader_subd2, admin_user])
db.flush()

pet1 = Pet(pet_id=101, owner_id=resident_owner.user_id, pet_name="Bantay", pet_type="Dog")
pet2 = Pet(pet_id=102, owner_id=resident_owner.user_id, pet_name="Browny", pet_type="Dog")
db.add_all([pet1, pet2])
db.commit()

def make_headers(user: User):
    token = create_access_token({"sub": str(user.user_id), "user_id": user.user_id, "role_id": user.role_id})
    return {"Authorization": f"Bearer {token}"}

headers_owner = make_headers(resident_owner)
headers_other = make_headers(other_resident)
headers_leader1 = make_headers(leader_subd1)
headers_leader2 = make_headers(leader_subd2)
headers_admin = make_headers(admin_user)

checks = []

def check(label: str, condition: bool, extra: str = ""):
    checks.append(condition)
    status_str = "[PASS]" if condition else "[FAIL]"
    print(f"{status_str} {label}" + (f" -> {extra}" if not condition and extra else ""))


print("\n--- Running Phase 3 Owner Follow-up Tests ---")

# 1. Start follow-up successfully (Leader 1 on report in Subd 1)
report1 = Report(
    report_id=1001, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, pet_id=pet1.pet_id
)
db.add(report1)
db.commit()

resp = client.post(
    "/owner-followups/",
    json={"report_id": 1001, "notes": "Keep pet leashed inside gate"},
    headers=headers_leader1
)
check("Leader starts follow-up on owned pet case", resp.status_code == 201, f"Status: {resp.status_code}, Body: {resp.text}")
data1 = resp.json()
followup_id1 = data1.get("followup_id")
check("Follow-up status is 'observing'", data1.get("status") == "observing")
check("Follow-up duration defaults to 3 days", data1.get("duration_days") == 3)
check("Owner correctly associated", data1.get("owner_id") == resident_owner.user_id)

# 2. Refuse start by unauthorized role (Resident cannot start)
resp_res = client.post(
    "/owner-followups/",
    json={"report_id": 1001, "notes": "Resident starting"},
    headers=headers_owner
)
check("Resident cannot start owner observation (403)", resp_res.status_code == 403)

# 3. Refuse start by Leader of wrong subdivision
resp_wrong_leader = client.post(
    "/owner-followups/",
    json={"report_id": 1001, "notes": "Leader 2 starting on Subd 1 report"},
    headers=headers_leader2
)
check("Leader outside subdivision cannot start observation (403)", resp_wrong_leader.status_code == 403)

# 4. Refuse duplicate / concurrent active observation for the same pet
report1_other = Report(
    report_id=1002, user_id=other_resident.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, pet_id=pet1.pet_id
)
db.add(report1_other)
db.commit()

resp_dupe_pet = client.post(
    "/owner-followups/",
    json={"report_id": 1002, "notes": "Another report for same pet"},
    headers=headers_leader1
)
check("Reject concurrent observation on same pet (409)", resp_dupe_pet.status_code == 409)

# 5. Refuse start on rabies-risk report
report_rabies = Report(
    report_id=1003, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, pet_id=pet2.pet_id,
    condition="Suspected rabies, foaming at mouth"
)
db.add(report_rabies)
db.commit()

resp_rabies = client.post(
    "/owner-followups/",
    json={"report_id": 1003},
    headers=headers_leader1
)
check("Refuse observation for rabies risk reports (400)", resp_rabies.status_code == 400)

# 6. Show staff caution on high-priority / aggressive cases
report_aggro = Report(
    report_id=1004, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, pet_id=pet2.pet_id,
    priority_level="High", verified_aggressive=True
)
db.add(report_aggro)
db.commit()

resp_aggro = client.post(
    "/owner-followups/",
    json={"report_id": 1004},
    headers=headers_leader1
)
check("High priority/aggressive report start succeeds with caution", resp_aggro.status_code == 201)
data_aggro = resp_aggro.json()
followup_id2 = data_aggro.get("followup_id")
check("Staff caution banner present in response", "Staff Caution" in (data_aggro.get("staff_caution") or ""))

# 7. Refuse start on closed report (status 11 Resolved)
report_closed = Report(
    report_id=1005, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=11, latitude=14.5, longitude=121.0
)
db.add(report_closed)
db.commit()

resp_closed = client.post(
    "/owner-followups/",
    json={"report_id": 1005, "owner_name": "Offline Owner"},
    headers=headers_leader1
)
check("Refuse start on closed report (400)", resp_closed.status_code == 400)

# 8. Refuse start on animal currently held in holding place
report_held = Report(
    report_id=1006, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, facility_id=99
)
db.add(report_held)
db.commit()

resp_held = client.post(
    "/owner-followups/",
    json={"report_id": 1006, "owner_name": "Offline Owner"},
    headers=headers_leader1
)
check("Refuse start on animal held in holding facility (400)", resp_held.status_code == 400)

# 9. Offline owner support (no user_id)
report_offline = Report(
    report_id=1007, user_id=other_resident.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, is_possible_owned=True
)
db.add(report_offline)
db.commit()

resp_offline = client.post(
    "/owner-followups/",
    json={
        "report_id": 1007,
        "owner_name": "Mr. Pedro Santos",
        "owner_phone": "09171234567",
        "owner_address": "Block 2 Lot 5",
        "notes": "Spoke to neighbor, owner lives at Lot 5"
    },
    headers=headers_leader1
)
check("Support offline owner with phone/address", resp_offline.status_code == 201)
data_offline = resp_offline.json()
followup_offline_id = data_offline.get("followup_id")
check("Offline owner name saved", data_offline.get("owner_name") == "Mr. Pedro Santos")

# 10. Contact Logs: Staff adds contact log
resp_log = client.post(
    f"/owner-followups/{followup_offline_id}/contact-logs",
    json={"contact_type": "Phone Call", "notes": "Called owner, reminded about leashing rule"},
    headers=headers_leader1
)
check("Staff adds contact log (201)", resp_log.status_code == 201)

# Contact logs: Staff views contact logs
resp_list_logs = client.get(f"/owner-followups/{followup_offline_id}/contact-logs", headers=headers_leader1)
check("Staff can view contact logs", resp_list_logs.status_code == 200 and len(resp_list_logs.json()) >= 1)

# Contact logs: Resident cannot view staff contact logs (403)
resp_resident_logs = client.get(f"/owner-followups/{followup_offline_id}/contact-logs", headers=headers_other)
check("Regular resident forbidden from viewing contact logs (403)", resp_resident_logs.status_code == 403)

# 11. Privacy / Redaction: Other resident gets redacted view
resp_view_other = client.get(f"/owner-followups/{followup_id1}", headers=headers_other)
check("Unrelated resident forbidden from viewing private follow-up (403)", resp_view_other.status_code == 403)

# 12. Owner Acknowledgement: Registered owner acknowledges via app
resp_ack = client.post(
    f"/owner-followups/{followup_id1}/acknowledge",
    json={"method": "account", "notes": "I have secured Bantay inside the house."},
    headers=headers_owner
)
check("Owner acknowledges follow-up notice", resp_ack.status_code == 200)
check("owner_acknowledged_at recorded", resp_ack.json().get("owner_acknowledged_at") is not None)

# Staff verbal acknowledgement on offline owner
resp_ack_verbal = client.post(
    f"/owner-followups/{followup_offline_id}/acknowledge",
    json={"method": "phone", "notes": "Owner verbally confirmed receipt of notice over phone."},
    headers=headers_leader1
)
check("Staff records verbal acknowledgement for offline owner", resp_ack_verbal.status_code == 200)

# 13. Owner Update: Owner submits status and proof photo
resp_update = client.post(
    f"/owner-followups/{followup_id1}/owner-update",
    json={"owner_notes": "Added gate latch", "owner_photo_url": "https://example.com/gate.jpg"},
    headers=headers_owner
)
check("Owner submits update and photo proof", resp_update.status_code == 200)
check("Photo URL saved", resp_update.json().get("owner_photo_url") == "https://example.com/gate.jpg")

# 14. Single Extension Rule: First extension succeeds
f1_initial_due = resp.json().get("due_at")
resp_extend1 = client.post(
    f"/owner-followups/{followup_id1}/extend",
    json={"extension_reason": "Owner requested 3 more days to repair fencing", "extension_days": 3},
    headers=headers_leader1
)
check("First reasoned extension succeeds (200)", resp_extend1.status_code == 200)
data_ext1 = resp_extend1.json()
check("is_extended is True", data_ext1.get("is_extended") is True)
check("due_at updated forward", data_ext1.get("due_at") > f1_initial_due)

# Single Extension Rule: Second extension is strictly rejected
resp_extend2 = client.post(
    f"/owner-followups/{followup_id1}/extend",
    json={"extension_reason": "Trying second extension"},
    headers=headers_leader1
)
check("Second extension strictly rejected (400)", resp_extend2.status_code == 400)

# 15. Closure / Compliance: Leader closes follow-up
resp_close = client.post(
    f"/owner-followups/{followup_id1}/close",
    json={"outcome": "complied", "reason": "Owner completed gate latch and presented pet", "compliance_notes": "Well secured"},
    headers=headers_leader1
)
check("Leader closes follow-up with 'complied' outcome", resp_close.status_code == 200)
check("Status updated to 'complied'", resp_close.json().get("status") == "complied")

# Cannot extend an already closed observation
resp_extend_closed = client.post(
    f"/owner-followups/{followup_id1}/extend",
    json={"extension_reason": "Extend after close"},
    headers=headers_leader1
)
check("Cannot extend a closed follow-up (400)", resp_extend_closed.status_code == 400)

# 16. Case Closure Hook: Report closure ends active follow-up
report_hook = Report(
    report_id=1008, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0, pet_id=pet1.pet_id
)
db.add(report_hook)
db.commit()

resp_hook_fu = client.post(
    "/owner-followups/",
    json={"report_id": 1008, "notes": "Observation before report resolved"},
    headers=headers_leader1
)
fu_hook_id = resp_hook_fu.json().get("followup_id")

# Close report to status 11 (Resolved)
report_hook.current_status_id = 11
db.commit()

fu_record = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == fu_hook_id).first()
check("Report closure automatically ends open follow-up observation", fu_record.status == "closed")
check("Follow-up closed_at recorded", fu_record.closed_at is not None)

# 17. Administrator Settings: Get & Update Duration
resp_settings = client.get("/owner-followups/settings/duration", headers=headers_leader1)
check("Get duration settings (default 3)", resp_settings.status_code == 200 and resp_settings.json().get("default_duration_days") == 3)

# Non-admin cannot update settings
resp_set_forbidden = client.put("/owner-followups/settings/duration", json={"default_duration_days": 5}, headers=headers_leader1)
check("Non-admin forbidden from updating duration setting (403)", resp_set_forbidden.status_code == 403)

# Admin updates setting to 5 days
resp_set_ok = client.put("/owner-followups/settings/duration", json={"default_duration_days": 5}, headers=headers_admin)
check("Admin updates duration setting to 5 days", resp_set_ok.status_code == 200 and resp_set_ok.json().get("default_duration_days") == 5)

# Existing follow-up due_at is NOT altered by setting update
db.refresh(fu_record)
check("Existing follow-up due times remain preserved", fu_record.duration_days == 3)

# 18. Due Notices & Reminders: Test check_and_notify_due_followups
report_due = Report(
    report_id=1009, user_id=resident_owner.user_id, subdivision_id=1, category_id=4,
    animal_type="Dog", current_status_id=2, latitude=14.5, longitude=121.0
)
db.add(report_due)
db.commit()

fu_due = OwnerFollowUp(
    report_id=1009, subdivision_id=1, leader_id=leader_subd1.user_id,
    owner_id=resident_owner.user_id, status="observing",
    due_at=_now() - timedelta(minutes=5),  # Already passed due date
    duration_days=3
)
db.add(fu_due)
db.commit()

notified = check_and_notify_due_followups(db)
check("Due checker processes overdue follow-up", notified >= 1)
db.refresh(fu_due)
check("Due notice sent timestamp recorded", fu_due.due_notice_sent_at is not None)
check("Expiry does NOT auto-close observation (still observing)", fu_due.status == "observing")

# Second run does not duplicate due notice
notified_second = check_and_notify_due_followups(db)
check("No duplicate due notice sent on subsequent run", fu_due.due_notice_sent_at is not None)


# Display wording uses the actual referral recipient, then the subdivision's Barangay for older cases.
from app.models.barangay_referral import BarangayReferral

referred_report = Report(user_id=resident_owner.user_id, subdivision_id=1, category_id=4, animal_type="Dog",
                         current_status_id=4, latitude=14.5, longitude=121.0, pet_id=pet1.pet_id)
db.add(referred_report)
db.flush()
referred_followup = OwnerFollowUp(report_id=referred_report.report_id, pet_id=pet1.pet_id, subdivision_id=1,
                                 leader_id=leader_subd1.user_id, status="escalated", duration_days=3,
                                 due_at=_now(), owner_name="Synthetic Owner")
db.add(referred_followup)
db.flush()
display = enrich_and_redact_followup(referred_followup, leader_subd1, db)
check("Referral display falls back to subdivision Barangay", display["observation_day_display"] == "Referred to Barangay San Antonio"
      and display["endorsement_status"] == "Referred to Barangay San Antonio")
db.add(Barangay(barangay_id=2, barangay_name="Sample Recipient", city="Test City"))
db.flush()
db.add(BarangayReferral(report_id=referred_report.report_id, barangay_id=2, referred_by=leader_subd1.user_id,
                        reason="Synthetic historical recipient", contact_method="call"))
db.flush()
display = enrich_and_redact_followup(referred_followup, leader_subd1, db)
check("Referral display prefers the recorded recipient", display["observation_day_display"] == "Referred to Barangay Sample Recipient"
      and display["endorsement_status"] == "Referred to Barangay Sample Recipient")
check("Referral display marks Barangay work external", display["remaining_time_display"] == "Handled by Barangay outside StraySafe")
check("Referral display never changes observation/report state", referred_followup.status == "escalated" and referred_report.current_status_id == 4)

print(f"\n==========================================")
print(f"Total Checks: {len(checks)} | Passed: {sum(checks)} | Failed: {len(checks) - sum(checks)}")
print(f"==========================================")

if all(checks):
    sys.exit(0)
else:
    sys.exit(1)
