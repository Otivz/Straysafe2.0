"""
Pet Owner observation update suite.
Verifies the First Warning -> observation -> owner update -> subdivision review flow:
owner updates are saved with photo evidence, linked to the observation, report,
animal, and the signed-in owner; only that owner can submit; staff review is
separate from resolution; and nothing an owner submits moves the countdown,
resolves the case, or blocks Second Warning eligibility.
Run from repository root: .venv\\Scripts\\python.exe backend/tests/test_owner_observation_updates.py
"""
import os
import sys
from datetime import timedelta
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-owner-observation-updates-secret-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401  (audit table for log_activity)
from app.database import Base, get_db
from app.models.user import Barangay, Subdivision, User
from app.models.report import Report, ReportStatus, ReportCategory
from app.models.pet import Pet
from app.models.notification import Notification
from app.models.owner_followup import OwnerFollowUp, OwnerObservationUpdate, OwnerObservationUpdatePhoto
from app.routes import owner_followups, warnings
from app.utils.auth import create_access_token
from app.utils.owner_followups import _now, check_and_notify_due_followups

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

db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add_all([
    Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Grand Royale"),
    Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Subd"),
])
db.flush()
db.add_all([
    User(user_id=1, name="Owner Resident", email="owner@test.com", password="x", status="Active", is_verified=True, role_id=1, subdivision_id=1),
    User(user_id=2, name="Subd Leader", email="leader@test.com", password="x", status="Active", is_verified=True, role_id=2, subdivision_id=1),
    User(user_id=3, name="Barangay Staff", email="brgy@test.com", password="x", status="Active", is_verified=True, role_id=3, barangay_id=1),
    User(user_id=5, name="Other Leader", email="other@test.com", password="x", status="Active", is_verified=True, role_id=2, subdivision_id=2),
    User(user_id=6, name="Other Resident", email="neighbor@test.com", password="x", status="Active", is_verified=True, role_id=1, subdivision_id=1),
])
db.add_all([
    ReportCategory(category_id=4, category_name="Roaming Stray"),
    ReportStatus(status_id=2, status_name="Verified"),
    ReportStatus(status_id=7, status_name="Under Observation"),
    ReportStatus(status_id=11, status_name="Incident Resolved"),
])
db.flush()
db.add(Pet(pet_id=1, owner_id=1, pet_name="Bantay", pet_type="Dog", breed="Aspin", color_markings="Brown"))
db.flush()
db.add(Report(
    report_id=1, user_id=6, subdivision_id=1, category_id=4, pet_id=1, animal_type="Dog",
    latitude=14.80, longitude=120.95, landmark="Block 5 Lot 12", current_status_id=2,
    description="Roaming outside house unleashed", priority_level="Medium",
))
db.commit()


def hdr(user_id, role_id, email):
    return {"Authorization": f"Bearer {create_access_token({'sub': email, 'user_id': user_id, 'role_id': role_id})}"}


owner_hdr = hdr(1, 1, "owner@test.com")
leader_hdr = hdr(2, 2, "leader@test.com")
brgy_hdr = hdr(3, 3, "brgy@test.com")
other_leader_hdr = hdr(5, 2, "other@test.com")
neighbor_hdr = hdr(6, 1, "neighbor@test.com")

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
uploaded = []


def fake_upload(content, folder="straysafe", resource_type="auto", filename=None):
    uploaded.append(filename)
    return f"https://res.cloudinary.com/demo/image/upload/{folder}/{filename}"


def notifications_for(user_id, title_part):
    with Session() as s:
        return s.query(Notification).filter(Notification.user_id == user_id, Notification.title.contains(title_part)).count()


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


print("\n--- Running Owner Observation Update Tests ---")

# 1. First Warning starts the observation and tells the owner.
with patch("app.services.email_templates.render_owner_warning_email", return_value=("Subj", "Body", "<b>Body</b>")):
    res_warn = client.post("/warnings/", json={
        "user_id": 1, "pet_id": 1, "report_id": 1, "warning_level": "1st Warning",
        "violation_type": "Free-Roaming Unleashed", "description": "Pet seen unattended outside.", "fine_amount": 0.0,
    }, headers=leader_hdr)
check(res_warn.status_code in (200, 201), f"First Warning issued (got {res_warn.status_code})")
check(notifications_for(1, "Observation Period Started") == 1, "Owner notified that the 3-day observation started")

mine = client.get("/owner-followups/my-observations", headers=owner_hdr)
check(mine.status_code == 200 and len(mine.json()) == 1, f"Owner sees their observation record ({mine.status_code}: {mine.text[:300]})")
obs = mine.json()[0]
fid = obs["followup_id"]
due_before = obs["due_at"]
check(obs["animal_name"] == "Bantay" and obs["report_id"] == 1, "Observation shows animal name and report id")
check(obs["first_warning_date"] is not None, "Observation shows the First Warning date")
check(obs["owner_updates"] == [] and obs["owner_updates_count"] == 0, "No owner updates yet")
check(client.get("/owner-followups/my-observations", headers=neighbor_hdr).json() == [], "Other residents see no observation records")

# 2. Owner submits an update with two photos.
form = {"compliance_status": "improving", "owner_remarks": "  Fixed the gate latch and keep Bantay leashed.  ", "client_request_id": "owner-req-0001"}
files = [("photos", ("gate.png", PNG, "image/png")), ("photos", ("leash.png", PNG, "image/png"))]
with patch("app.routes.owner_followups.upload_to_cloudinary", side_effect=fake_upload):
    res = client.post(f"/owner-followups/{fid}/owner-updates", data=form, files=files, headers=owner_hdr)
check(res.status_code == 201, f"Owner update saved (201) (got {res.status_code}: {res.text[:200]})")
body = res.json()
check(body["owner_name"] == "Owner Resident" and body["owner_user_id"] == 1, "Owner identity taken from the session")
check(body["compliance_status"] == "improving" and body["owner_remarks"] == "Fixed the gate latch and keep Bantay leashed.", "Status and trimmed remarks returned")
check(len(body["photos"]) == 2 and all(p["photo_url"].startswith("https://res.cloudinary.com/") for p in body["photos"]), "Two photo references returned")
check(body["submitted_at"] is not None and body["is_reviewed"] is False, "Server timestamp set, not yet reviewed")

with Session() as s:
    row = s.query(OwnerObservationUpdate).filter(OwnerObservationUpdate.update_id == body["update_id"]).first()
    check(row is not None and row.followup_id == fid and row.report_id == 1 and row.pet_id == 1, "Row linked to observation, report, and animal")
    check(row.owner_user_id == 1, "Row linked to the authenticated owner")
    check(s.query(OwnerObservationUpdatePhoto).filter(OwnerObservationUpdatePhoto.update_id == row.update_id).count() == 2, "Photo rows saved")
check(notifications_for(2, "New Owner Update with Photo Evidence") == 1, "Leader notified of the new update with photo evidence")
check(notifications_for(1, "Observation Update Submitted") == 1, "Owner told the update was received")

# 3. Duplicate submission returns the same update and uploads nothing new.
uploads_before = len(uploaded)
with patch("app.routes.owner_followups.upload_to_cloudinary", side_effect=fake_upload):
    dup = client.post(f"/owner-followups/{fid}/owner-updates", data=form, files=files, headers=owner_hdr)
check(dup.status_code == 200 and dup.json()["update_id"] == body["update_id"], "Repeated click returns the saved update (200)")
check(len(uploaded) == uploads_before, "Duplicate submission does not re-upload photos")
with Session() as s:
    check(s.query(OwnerObservationUpdate).count() == 1, "Duplicate submission creates no second row")

# 4. "Issue Resolved" from the owner does not resolve the case or move the deadline.
res2 = client.post(f"/owner-followups/{fid}/owner-updates", data={
    "compliance_status": "issue_resolved", "owner_remarks": "Dog stays indoors now.", "client_request_id": "owner-req-0002",
}, headers=owner_hdr)
check(res2.status_code == 201 and res2.json()["photos"] == [], "Update without photos saved")
check(notifications_for(2, "Owner Reports Issue Resolved") == 1, "Leader told the owner reports the issue resolved")
dash = client.get("/owner-followups/under-observation", headers=leader_hdr).json()
item = dash["items"][0]
check(item["status"] == "observing" and item["workflow_section"] == "active", "Owner 'Issue Resolved' does not resolve the case")
check(item["due_at"] == due_before, "Owner updates do not change the deadline")
check([u["update_id"] for u in item["owner_updates"]] == [res2.json()["update_id"], body["update_id"]], "Subdivision sees owner updates newest first")
check(item["owner_updates_count"] == 2 and item["unreviewed_owner_updates_count"] == 2, "Update and unreviewed counts")
check(dash["unreviewed_owner_updates_count"] == 2, "Dashboard total of unreviewed owner updates")
check(item["contact_logs"] == [], "Owner updates are kept separate from staff monitoring logs")

# 5. Validation.
bad_status = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "done", "owner_remarks": "ok then"}, headers=owner_hdr)
check(bad_status.status_code == 422, "Unknown compliance status rejected (422)")
bad_remarks = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "  "}, headers=owner_hdr)
check(bad_remarks.status_code == 422, "Blank remarks rejected (422)")
bad_file = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "see file"},
                       files=[("photos", ("fake.png", b"not an image at all", "image/png"))], headers=owner_hdr)
check(bad_file.status_code == 400, "File that is not a real image rejected (400)")
too_many = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "many"},
                       files=[("photos", (f"p{i}.png", PNG, "image/png")) for i in range(6)], headers=owner_hdr)
check(too_many.status_code == 400, "More than 5 photos rejected (400)")

# 6. Authorization.
check(client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "not mine"}, headers=neighbor_hdr).status_code == 404, "Another resident cannot submit for this observation")
check(client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "staff"}, headers=leader_hdr).status_code == 404, "Staff cannot submit as the owner")
check(client.get(f"/owner-followups/{fid}/owner-updates", headers=neighbor_hdr).status_code == 404, "Another resident cannot read the owner updates")
check(len(client.get(f"/owner-followups/{fid}/owner-updates", headers=owner_hdr).json()) == 2, "Owner can read their own update history")
check(client.get(f"/owner-followups/{fid}/owner-updates", headers=brgy_hdr).status_code == 200, "Barangay staff in scope can read updates")
check(client.get(f"/owner-followups/{fid}/owner-updates", headers=other_leader_hdr).status_code == 403, "Leader of another subdivision cannot read updates")

# 7. Upload or database failure never reports success.
with Session() as s:
    rows_before = s.query(OwnerObservationUpdate).count()
with patch("app.routes.owner_followups.upload_to_cloudinary", side_effect=RuntimeError("cloudinary down")):
    up_fail = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "photo fails"},
                          files=[("photos", ("x.png", PNG, "image/png"))], headers=owner_hdr)
check(up_fail.status_code == 502, "Photo storage failure returns 502")
with patch("sqlalchemy.orm.Session.commit", side_effect=OperationalError("INSERT", {}, Exception("db down"))):
    db_fail = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "db fails"}, headers=owner_hdr)
check(db_fail.status_code == 500, "Database failure returns 500")
with Session() as s:
    check(s.query(OwnerObservationUpdate).count() == rows_before, "Failed submissions leave no rows")

# 8. Staff review is separate from resolution and preserves the original.
upd_id = body["update_id"]
check(client.post(f"/owner-followups/{fid}/owner-updates/{upd_id}/review", json={"review_remarks": "x"}, headers=brgy_hdr).status_code == 403, "Barangay staff cannot review subdivision owner updates")
check(client.post(f"/owner-followups/{fid}/owner-updates/{upd_id}/review", json={"review_remarks": "x"}, headers=owner_hdr).status_code == 403, "Owner cannot review their own update")
rev = client.post(f"/owner-followups/{fid}/owner-updates/{upd_id}/review", json={"review_remarks": " Gate latch confirmed in photo. "}, headers=leader_hdr)
check(rev.status_code == 200 and rev.json()["is_reviewed"] and rev.json()["reviewer_name"] == "Subd Leader", "Leader marks the update reviewed")
check(rev.json()["review_remarks"] == "Gate latch confirmed in photo." and rev.json()["reviewed_at"] is not None, "Review remarks and time saved")
check(rev.json()["owner_remarks"] == body["owner_remarks"] and rev.json()["compliance_status"] == "improving", "Original owner submission preserved")
check(client.post(f"/owner-followups/{fid}/owner-updates/{upd_id}/review", json={"review_remarks": "again"}, headers=leader_hdr).status_code == 409, "A review cannot be overwritten (409)")
after_review = client.get("/owner-followups/under-observation", headers=leader_hdr).json()["items"][0]
check(after_review["status"] == "observing" and after_review["unreviewed_owner_updates_count"] == 1, "Review does not resolve the case")

# 9. Expiry without verified resolution: Non-Compliant notice and Second Warning eligibility.
with Session() as s:
    f = s.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == fid).first()
    f.due_at = _now() - timedelta(minutes=5)
    s.commit()
with Session() as s:
    with patch("app.utils.owner_followups.dispatch_notification", wraps=owner_followups.dispatch_notification):
        check_and_notify_due_followups(s)
check(notifications_for(2, "Non-Compliant") == 1, "Leader notified the observation expired without verified resolution")
expired = client.get("/owner-followups/under-observation", headers=leader_hdr).json()["items"][0]
check(expired["is_eligible_for_second_warning"] and expired["workflow_section"] == "for_second_warning", "Owner updates do not block Second Warning eligibility")

# 10. Resolution by staff preserves owner updates; owner can no longer submit.
resolved = client.post(f"/owner-followups/{fid}/resolve", json={"verification_notes": "Verified on site."}, headers=leader_hdr)
check(resolved.status_code == 200, "Leader verifies and resolves the case")
check(notifications_for(1, "Resolved") >= 1, "Owner notified of verified resolution (notification committed)")
check(len(client.get(f"/owner-followups/{fid}/owner-updates", headers=leader_hdr).json()) == 2, "Owner updates preserved after resolution")
closed = client.post(f"/owner-followups/{fid}/owner-updates", data={"compliance_status": "improving", "owner_remarks": "late"}, headers=owner_hdr)
check(closed.status_code == 409, "Owner cannot submit after the case is resolved (409)")

# 11. No route edits or deletes the owner's submission.
routes = [r for r in api.routes if "/owner-updates" in getattr(r, "path", "")]
methods = {(r.path, m) for r in routes for m in r.methods}
check(all(m in ("GET", "POST") for _, m in methods), "Owner updates have no PUT/PATCH/DELETE routes")

print("\n==========================================")
print(f"Total Checks: {passed + failed} | Passed: {passed} | Failed: {failed}")
print("==========================================\n")
sys.exit(1 if failed else 0)
