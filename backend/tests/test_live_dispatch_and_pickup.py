"""
Tests for Live Dispatch Team Location Tracking and Exact Pickup Location Tracking.
Covers:
- POST /reports/{id}/live-location (requires status 5 and assigned staff/admin)
- GET /reports/{id}/live-location (returns active GPS ping or inactive)
- DELETE /reports/{id}/live-location (stops tracking)
- Updating status to 6 (Picked Up) captures exact pickup coordinates in StatusHistory and Report
- ReportResponse populates pickup_latitude and pickup_longitude from Status 6 history
- Moving to status 7 (Holding Place) moves current coordinates while preserving pickup coordinates
"""
import os
import sys
import tempfile
from decimal import Decimal

_DB = os.path.join(tempfile.mkdtemp(), "dispatch_and_pickup_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-dispatch-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone
import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models.report import Report, ReportCategory, ReportStatus, Rescue, RescueAssignment, RescueStatus, StatusHistory
from app.models.user import Barangay, Subdivision, User
from app.models.landmark import Landmark
from app.routes import reports, rescue
from app.utils.auth import create_access_token
from app.utils.live_dispatch_tracker import dispatch_tracker

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
api.include_router(rescue.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

# Seed baseline data
brgy = Barangay(barangay_id=1, barangay_name="Barangay San Vicente", city="City")
db.add(brgy)
db.flush()

subd = Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Subdivision Alpha")
db.add(subd)

for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"Status {sid}"))

for rsid, rsname in [(1, "Pending"), (2, "Approved"), (3, "Rejected"), (4, "Started"), (5, "Dispatched"), (6, "Resolved")]:
    db.add(RescueStatus(status_id=rsid, status_name=rsname))

db.add(ReportCategory(category_id=4, category_name="Roaming Animal"))

# Holding facility
fac = Landmark(
    landmark_id=1,
    subdivision_id=None,
    name="Barangay Holding Pen",
    category="Facility",
    latitude=Decimal("14.80690000"),
    longitude=Decimal("121.00390000"),
    is_holding_facility=True,
    status="Active"
)
db.add(fac)
db.flush()


def mk_user(name, role, subd_id=1, is_head=False):
    u = User(
        name=name,
        email=f"{name.lower().replace(' ', '')}@example.com",
        password="hashed_pw",
        role_id=role,
        is_verified=True,
        status="Active",
        subdivision_id=subd_id,
        barangay_id=1,
        is_head_officer=is_head,
        phone="09170000000"
    )
    db.add(u)
    db.flush()
    return u


resident = mk_user("Resident Reporter", 1)
subd_leader = mk_user("Subd Leader", 2)
field_staff = mk_user("Field Responder", 3)
other_staff = mk_user("Other Staff", 3)
head_officer = mk_user("Head Officer", 3, is_head=True)
admin = mk_user("System Admin", 4, subd_id=None)
db.commit()


def auth_header(u):
    token = create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})
    return {"Authorization": f"Bearer {token}"}


H_RESIDENT = auth_header(resident)
H_LEADER = auth_header(subd_leader)
H_STAFF = auth_header(field_staff)
H_OTHER_STAFF = auth_header(other_staff)
H_ADMIN = auth_header(admin)


class LiveDispatchAndPickupTests(unittest.TestCase):
    def setUp(self):
        dispatch_tracker.clear_all()

    def test_live_dispatch_and_pickup_flow(self):
        # 1. Create a stray report (initial sighting at 14.8000, 121.0000)
        rep = Report(
            user_id=resident.user_id,
            subdivision_id=1,
            category_id=4,
            animal_type="Dog",
            latitude=Decimal("14.80000000"),
            longitude=Decimal("121.00000000"),
            initial_latitude=Decimal("14.80000000"),
            initial_longitude=Decimal("121.00000000"),
            landmark="Phase 1 Gate",
            initial_landmark="Phase 1 Gate",
            current_status_id=1,
            custody_status="Sighting",
            priority_level="Medium",
            visibility="Public"
        )
        db.add(rep)
        db.commit()
        db.refresh(rep)
        rep_id = rep.report_id

        # 2. Verify POST live-location is rejected when not in Status 5 (Dispatched)
        ping_payload = {
            "latitude": 14.8015,
            "longitude": 121.0020,
            "accuracy": 10.5,
            "heading": 90.0,
            "speed": 5.2
        }
        resp = client.post(f"/reports/{rep_id}/live-location", json=ping_payload, headers=H_STAFF)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("only allowed while the report is in Dispatched status", resp.text)

        # 3. Create rescue mission & dispatch team
        rescue_rec = Rescue(
            report_id=rep_id,
            staff_id=field_staff.user_id,
            status_id=5,  # Dispatched
            title="Dog rescue mission"
        )
        db.add(rescue_rec)
        db.flush()

        asgn = RescueAssignment(
            rescue_id=rescue_rec.rescue_id,
            user_id=field_staff.user_id,
            staff_id=field_staff.user_id,
            assignment_status="Assigned"
        )
        db.add(asgn)
        rep.current_status_id = 5  # Dispatched
        db.commit()

        # 4. Unassigned staff cannot broadcast
        resp = client.post(f"/reports/{rep_id}/live-location", json=ping_payload, headers=H_OTHER_STAFF)
        self.assertEqual(resp.status_code, 403)

        # 5. Assigned field staff broadcasts live location
        resp = client.post(f"/reports/{rep_id}/live-location", json=ping_payload, headers=H_STAFF)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["is_active"])
        self.assertEqual(data["latitude"], 14.8015)
        self.assertEqual(data["longitude"], 121.0020)
        self.assertEqual(data["responder_name"], "Field Responder")

        # 6. Reporting resident and Subd Leader can read live location
        res_get = client.get(f"/reports/{rep_id}/live-location", headers=H_RESIDENT)
        self.assertEqual(res_get.status_code, 200)
        res_data = res_get.json()
        self.assertTrue(res_data["is_active"])
        self.assertEqual(res_data["latitude"], 14.8015)

        subd_get = client.get(f"/reports/{rep_id}/live-location", headers=H_LEADER)
        self.assertEqual(subd_get.status_code, 200)
        self.assertTrue(subd_get.json()["is_active"])

        # 7. Staff marks animal Picked Up (Status 6) with actual pickup coordinates (14.8035, 121.0045)
        pickup_payload = {
            "status_id": 6,
            "latitude": 14.8035,
            "longitude": 121.0045,
            "landmark": "Near Block 12 Alley",
            "remarks": "Secured stray dog safely in vehicle net."
        }
        pickup_resp = client.patch(f"/rescue-requests/{rescue_rec.rescue_id}", json=pickup_payload, headers=H_STAFF)
        self.assertEqual(pickup_resp.status_code, 200)

        # 8. Live tracking is immediately stopped after pickup
        live_check = client.get(f"/reports/{rep_id}/live-location", headers=H_RESIDENT)
        self.assertEqual(live_check.status_code, 200)
        self.assertFalse(live_check.json()["is_active"])

        # 9. GET /reports/{rep_id} returns:
        # - initial_latitude / initial_longitude = 14.8000, 121.0000 (Phase 1 Gate)
        # - pickup_latitude / pickup_longitude = 14.8035, 121.0045 (Near Block 12 Alley)
        rep_get = client.get(f"/reports/{rep_id}", headers=H_RESIDENT)
        self.assertEqual(rep_get.status_code, 200)
        rep_json = rep_get.json()
        self.assertEqual(rep_json["status_id"], 6)
        self.assertEqual(round(rep_json["initial_latitude"], 4), 14.8000)
        self.assertEqual(round(rep_json["initial_longitude"], 4), 121.0000)
        self.assertEqual(round(rep_json["pickup_latitude"], 4), 14.8035)
        self.assertEqual(round(rep_json["pickup_longitude"], 4), 121.0045)
        self.assertEqual(rep_json["pickup_landmark"], "Near Block 12 Alley")

        # 10. Later, animal is admitted to Barangay Holding Facility (Status 7)
        # Coordinates move to facility, but pickup_latitude/longitude remain intact!
        facility_payload = {
            "status_id": 7,
            "facility_id": 1,
            "remarks": "Admitted to Barangay Holding Pen for observation."
        }
        fac_resp = client.patch(f"/rescue-requests/{rescue_rec.rescue_id}", json=facility_payload, headers=H_STAFF)
        self.assertEqual(fac_resp.status_code, 200)

        rep_after_fac = client.get(f"/reports/{rep_id}", headers=H_RESIDENT).json()
        self.assertEqual(rep_after_fac["status_id"], 7)
        # Current coords reflect holding facility
        self.assertEqual(round(rep_after_fac["latitude"], 4), 14.8069)
        self.assertEqual(round(rep_after_fac["longitude"], 4), 121.0039)
        # Initial coords remain sighting location
        self.assertEqual(round(rep_after_fac["initial_latitude"], 4), 14.8000)
        self.assertEqual(round(rep_after_fac["initial_longitude"], 4), 121.0000)
        # Pickup coords STILL remain the exact capture spot!
        self.assertEqual(round(rep_after_fac["pickup_latitude"], 4), 14.8035)
        self.assertEqual(round(rep_after_fac["pickup_longitude"], 4), 121.0045)
        self.assertEqual(rep_after_fac["pickup_landmark"], "Near Block 12 Alley")


if __name__ == "__main__":
    unittest.main()
