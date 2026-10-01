import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.report import Report, Rescue, RescueAssignment, StatusHistory
from app.utils.auth import get_current_staff_or_admin, get_current_user

client = TestClient(app)

def test_admin_010_direct_action_workflow():
    db = SessionLocal()
    try:
        # 1. Fetch or create Admin user (role_id = 4)
        admin = db.query(User).filter(User.role_id == 4).first()
        assert admin is not None, "Admin user must exist"

        # 2. Fetch or create Barangay Staff user (role_id = 3)
        staff = db.query(User).filter(User.role_id == 3).first()
        assert staff is not None, "Staff user must exist"

        # 3. Create a test incident report with status 1 (Reported)
        test_report = Report(
            user_id=admin.user_id,
            subdivision_id=1,
            category_id=1,
            animal_type="Dog",
            description="Test Stray for Admin Direct Action",
            landmark="Selera Homes Gate 2",
            latitude=14.8015,
            longitude=121.0035,
            current_status_id=1,
            priority_level="High"
        )
        db.add(test_report)
        db.commit()
        db.refresh(test_report)
        report_id = test_report.report_id

        # Override auth dependency to act as Administrator
        app.dependency_overrides[get_current_staff_or_admin] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

        # --- Test 1: Direct Status Override to "Approved by Barangay" (Status 13) via PUT ---
        res1 = client.put(
            f"/reports/{report_id}/status",
            json={
                "status_id": 13,
                "remarks": "Admin official approval"
            }
        )
        assert res1.status_code == 200, f"PUT failed: {res1.text}"
        data1 = res1.json()
        assert data1["status_id"] == 13

        # Verify history timeline
        db.commit()
        hist1 = db.query(StatusHistory).filter(
            StatusHistory.report_id == report_id,
            StatusHistory.report_status_id == 13
        ).order_by(StatusHistory.history_id.desc()).first()
        assert hist1 is not None, "History entry for status 13 must be recorded"
        assert f"Status updated by Administrator {admin.name}" in hist1.remarks, f"Remarks did not include admin attribution: {hist1.remarks}"
        print(f"Verified Test 1: Status 13 recorded with remarks: '{hist1.remarks}'")

        # --- Test 2: Direct Status Override to "Team Dispatched" (Status 5) with assigned_staff_id via PUT ---
        res2 = client.put(
            f"/reports/{report_id}/status",
            json={
                "status_id": 5,
                "assigned_staff_id": staff.user_id,
                "remarks": "Urgent perimeter rescue"
            }
        )
        assert res2.status_code == 200, f"PUT failed: {res2.text}"
        data2 = res2.json()
        assert data2["status_id"] == 5

        # Verify history timeline records admin name and staff dispatch
        db.commit()
        hist2 = db.query(StatusHistory).filter(
            StatusHistory.report_id == report_id,
            StatusHistory.report_status_id == 5
        ).order_by(StatusHistory.history_id.desc()).first()
        assert hist2 is not None, "History entry for status 5 must be recorded"
        assert f"Status updated by Administrator {admin.name}" in hist2.remarks, f"Remarks did not include admin attribution: {hist2.remarks}"
        assert staff.name in hist2.remarks or f"Staff #{staff.user_id}" in hist2.remarks
        print(f"Verified Test 2: Status 5 recorded with remarks: '{hist2.remarks}'")

        # Verify Rescue and RescueAssignment were created directly without an endorsement letter
        rescue = db.query(Rescue).filter(Rescue.report_id == report_id).first()
        assert rescue is not None, "Rescue record must be created"
        assert rescue.staff_id == staff.user_id, "Rescue staff_id must match assigned staff"

        asgn = db.query(RescueAssignment).filter(
            RescueAssignment.rescue_id == rescue.rescue_id,
            RescueAssignment.staff_id == staff.user_id,
            RescueAssignment.assignment_status == "Assigned"
        ).first()
        assert asgn is not None, "RescueAssignment must be created for assigned staff"
        print(f"Verified Rescue & Assignment created for staff '{staff.name}' without endorsement letter.")

        # Cleanup test report
        db.query(RescueAssignment).filter(RescueAssignment.rescue_id == rescue.rescue_id).delete()
        db.query(Rescue).filter(Rescue.report_id == report_id).delete()
        db.query(StatusHistory).filter(StatusHistory.report_id == report_id).delete()
        db.query(Report).filter(Report.report_id == report_id).delete()
        db.commit()

        print("All TASK ADMIN-010 assertions passed successfully!")
    finally:
        app.dependency_overrides.clear()
        db.close()

if __name__ == "__main__":
    test_admin_010_direct_action_workflow()
