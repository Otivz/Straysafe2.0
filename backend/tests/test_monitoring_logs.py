"""
Under Observation monitoring log persistence suite.
Verifies that the Add Monitoring Log form creates a real database row linked to the
observation, report, animal, and staff account; that history is read back from the
database newest first; that duplicates and failures never report success; and that
logging does not move the First Warning countdown or resolve the case.
Run from repository root: .venv\\Scripts\\python.exe backend/tests/test_monitoring_logs.py
"""
import os
import sys
from datetime import timedelta
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-monitoring-logs-secret-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.user import Barangay, Subdivision, User
from app.models.report import Report, ReportStatus, ReportCategory
from app.models.pet import Pet
from app.models.warning import OwnerWarning
from app.models.owner_followup import OwnerFollowUp, FollowUpContactLog
from app.routes import owner_followups
from app.utils.auth import create_access_token
from app.utils.owner_followups import _now

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

db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add_all([
    Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Grand Royale"),
    Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Subd"),
])
db.flush()
db.add_all([
    User(user_id=1, name="Owner Resident", email="owner@test.com", password="x", role_id=1, subdivision_id=1),
    User(user_id=2, name="Subd Leader", email="leader@test.com", password="x", role_id=2, subdivision_id=1),
    User(user_id=3, name="Barangay Staff", email="brgy@test.com", password="x", role_id=3, barangay_id=1),
    User(user_id=5, name="Other Leader", email="other@test.com", password="x", role_id=2, subdivision_id=2),
])
db.add_all([
    ReportCategory(category_id=4, category_name="Roaming Stray"),
    ReportStatus(status_id=2, status_name="Verified"),
    ReportStatus(status_id=11, status_name="Incident Resolved"),
])
db.flush()
db.add(Pet(pet_id=1, owner_id=1, pet_name="Bantay", pet_type="Dog", breed="Aspin", color_markings="Brown"))
db.flush()
db.add(Report(
    report_id=1, user_id=1, subdivision_id=1, category_id=4, pet_id=1, animal_type="Dog",
    latitude=14.80, longitude=120.95, landmark="Block 5 Lot 12", current_status_id=2,
    description="Roaming outside house unleashed", priority_level="Medium",
))
db.flush()
warning_time = _now() - timedelta(hours=5)
db.add(OwnerWarning(
    warning_id=1, user_id=1, pet_id=1, report_id=1, issued_by=2, warning_level="1st Warning",
    violation_type="Free-Roaming Unleashed", description="Unleashed outside property.", created_at=warning_time,
))
db.commit()


def hdr(user_id, role_id, email):
    return {"Authorization": f"Bearer {create_access_token({'sub': email, 'user_id': user_id, 'role_id': role_id})}"}


leader_hdr = hdr(2, 2, "leader@test.com")
brgy_hdr = hdr(3, 3, "brgy@test.com")
owner_hdr = hdr(1, 1, "owner@test.com")
other_leader_hdr = hdr(5, 2, "other@test.com")

passed = 0
failed = 0


def check(condition, desc):
    global passed, failed
    if condition:
        passed += 1
        print(f"[PASS] {desc}")
    else:
        failed += 1
        print(f"[FAIL] {desc}")


print("\n--- Running Monitoring Log Persistence Tests ---")

# Dashboard sync creates the observation record from the First Warning.
dash = client.get("/owner-followups/under-observation", headers=leader_hdr)
check(dash.status_code == 200 and len(dash.json()["items"]) == 1, "Observation record is created from the First Warning")
item = dash.json()["items"][0]
fid = item["followup_id"]
original_due_at = item["due_at"]
check(item["contact_logs"] == [], "A new observation starts with no monitoring logs")

# 1. Add Monitoring Log persists a linked database row.
payload = {
    "contact_method": "observation",
    "outcome": "pet_secured",
    "notes": "  Gate closed, dog kept inside the yard.  ",
    "client_request_id": "req-0001-aaaaaaaa",
}
res = client.post(f"/owner-followups/{fid}/logs", json=payload, headers=leader_hdr)
check(res.status_code == 201, f"Add Monitoring Log returns 201 Created (got {res.status_code}: {res.text[:200]})")
body = res.json()
check(body["contact_log_id"] > 0, "Response carries the saved database id")
check(body["inspection_method"] == "observation" and body["inspection_outcome"] == "pet_secured", "Method and outcome returned")
check(body["notes"] == "Gate closed, dog kept inside the yard.", "Notes are trimmed and returned")
check(body["logger_name"] == "Subd Leader" and body["logged_by"] == 2, "Submitting staff id and name returned")
check(body["created_at"] is not None, "Server-side timestamp returned")

with Session() as s:
    row = s.query(FollowUpContactLog).filter(FollowUpContactLog.contact_log_id == body["contact_log_id"]).first()
    check(row is not None, "Row exists in followup_contact_logs")
    check(row.followup_id == fid and row.report_id == 1 and row.pet_id == 1, "Row linked to observation, report, and animal")
    check(row.logged_by == 2, "Row linked to the submitting staff account")
    check(row.inspection_method == "observation" and row.inspection_outcome == "pet_secured", "Method and outcome persisted")
    check(row.contact_type == "Other", "Legacy contact_type filled from the method")
    check(row.created_at is not None and row.contact_date is not None, "Server timestamps persisted")

# 2. Duplicate submission with the same key returns the same row and inserts nothing.
dup = client.post(f"/owner-followups/{fid}/logs", json=payload, headers=leader_hdr)
check(dup.status_code == 200 and dup.json()["contact_log_id"] == body["contact_log_id"], "Repeated click returns the saved row (200)")
with Session() as s:
    count = s.query(FollowUpContactLog).filter(FollowUpContactLog.followup_id == fid).count()
check(count == 1, "Duplicate submission does not create a second row")

# 3. Second log; history is newest first and survives a fresh session (refresh / re-login).
res2 = client.post(f"/owner-followups/{fid}/logs", json={
    "contact_method": "phone", "outcome": "spoke_with_owner",
    "notes": "Owner confirmed leash use.", "client_request_id": "req-0002-bbbbbbbb",
}, headers=leader_hdr)
check(res2.status_code == 201, "Second monitoring log saved")
hist = client.get(f"/owner-followups/{fid}/logs", headers=leader_hdr)
ids = [l["contact_log_id"] for l in hist.json()]
check(hist.status_code == 200 and ids == [res2.json()["contact_log_id"], body["contact_log_id"]], "History lists newest first")
dash2 = client.get("/owner-followups/under-observation", headers=leader_hdr).json()["items"][0]
check([l["contact_log_id"] for l in dash2["contact_logs"]] == ids, "Dashboard returns the same database history")

# 4. Logging does not move the countdown or resolve the case.
check(dash2["due_at"] == original_due_at, "Countdown due time unchanged after logging")
check(dash2["status"] == "observing" and dash2["workflow_section"] == "active", "Logging does not resolve the case")

# 5. Validation.
bad_notes = client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "phone", "outcome": "no_answer", "notes": "   "}, headers=leader_hdr)
check(bad_notes.status_code == 422, "Blank notes rejected (422)")
bad_method = client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "telepathy", "outcome": "no_answer", "notes": "x"}, headers=leader_hdr)
check(bad_method.status_code == 422, "Unknown inspection method rejected (422)")
bad_outcome = client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "phone", "outcome": "maybe", "notes": "x"}, headers=leader_hdr)
check(bad_outcome.status_code == 422, "Unknown inspection outcome rejected (422)")

# 6. Authorization.
check(client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "phone", "outcome": "no_answer", "notes": "x"}, headers=owner_hdr).status_code == 403, "Resident cannot add monitoring logs")
check(client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "phone", "outcome": "no_answer", "notes": "x"}, headers=other_leader_hdr).status_code == 403, "Leader of another subdivision cannot add logs")
check(client.get(f"/owner-followups/{fid}/logs", headers=owner_hdr).status_code == 403, "Resident cannot read monitoring logs")
check(client.get(f"/owner-followups/{fid}/logs", headers=brgy_hdr).status_code == 200, "Barangay staff can read monitoring logs")
check(client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "phone", "outcome": "no_answer", "notes": "x"}, headers=brgy_hdr).status_code == 403, "Barangay staff cannot add subdivision monitoring logs")
check(client.post("/owner-followups/9999/logs", json={"contact_method": "phone", "outcome": "no_answer", "notes": "x"}, headers=leader_hdr).status_code == 404, "Unknown observation returns 404")

# 7. Database failure never reports success and leaves no row.
with Session() as s:
    before = s.query(FollowUpContactLog).count()
with patch("sqlalchemy.orm.Session.commit", side_effect=OperationalError("INSERT", {}, Exception("db down"))):
    fail = client.post(f"/owner-followups/{fid}/logs", json={
        "contact_method": "phone", "outcome": "no_answer", "notes": "Should not save.", "client_request_id": "req-0003-cccccccc",
    }, headers=leader_hdr)
check(fail.status_code == 500 and "could not be saved" in fail.json()["detail"], "Database failure returns 500 with a clear message")
with Session() as s:
    check(s.query(FollowUpContactLog).count() == before, "Failed save leaves no row behind")

# 8. Logs are preserved on resolve, and new logs are refused afterwards.
with patch("app.routes.owner_followups.dispatch_notification"):
    resolved = client.post(f"/owner-followups/{fid}/resolve", json={"verification_notes": "Owner complied fully."}, headers=leader_hdr)
check(resolved.status_code == 200, "Leader verifies and resolves the case")
after = client.get(f"/owner-followups/{fid}/logs", headers=leader_hdr).json()
check([l["contact_log_id"] for l in after] == ids, "All monitoring logs preserved after resolution")
closed = client.post(f"/owner-followups/{fid}/logs", json={"contact_method": "phone", "outcome": "no_answer", "notes": "late"}, headers=leader_hdr)
check(closed.status_code == 409, "Adding a log to a resolved case is refused (409)")

# 9. No edit or delete route exists for monitoring logs.
log_routes = [r for r in api.routes if getattr(r, "path", "").endswith("/logs")]
methods = set().union(*(r.methods for r in log_routes))
check(methods == {"GET", "POST"}, "Monitoring logs are append-only (GET and POST only)")

print("\n==========================================")
print(f"Total Checks: {passed + failed} | Passed: {passed} | Failed: {failed}")
print("==========================================\n")
sys.exit(1 if failed else 0)
