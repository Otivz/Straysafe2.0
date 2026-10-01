import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.models.notification import Notification
from app.database import get_db, SessionLocal
from app.utils.auth import get_current_user

client = TestClient(app)

def create_mock_user(user_id: int, role_id: int, name: str = "Test User"):
    user = User()
    user.user_id = user_id
    user.role_id = role_id
    user.name = name
    user.email = f"user{user_id}@test.com"
    user.status = "Active"
    user.is_verified = True
    user.subdivision_id = 1
    user.barangay_id = 1
    user.is_head_officer = False
    return user

def run_tests():
    print("Running TASK ADMIN-002 Notifications Security Suite...")

    db_session = SessionLocal()
    existing_user = db_session.query(User).first()
    target_user_id = existing_user.user_id if existing_user else 1
    db_session.close()

    sample_payload = {
        "user_id": target_user_id,
        "title": "System Security Notice",
        "message": "Testing notification dispatch authorization",
        "type": "General"
    }

    # 1. Non-admin: Resident (Role 1)
    resident = create_mock_user(user_id=11, role_id=1, name="Resident User")
    app.dependency_overrides[get_current_user] = lambda: resident

    res = client.post("/notifications/", json=sample_payload)
    assert res.status_code == 403, f"Expected 403 for Resident (Role 1), got {res.status_code}"
    print("[PASS] 1. Resident (Role 1) calling POST /notifications/ returns HTTP 403 Forbidden")

    # 2. Non-admin: Subdivision Leader (Role 2)
    subd_leader = create_mock_user(user_id=22, role_id=2, name="Subd Leader")
    app.dependency_overrides[get_current_user] = lambda: subd_leader

    res = client.post("/notifications/", json=sample_payload)
    assert res.status_code == 403, f"Expected 403 for Subd Leader (Role 2), got {res.status_code}"
    print("[PASS] 2. Subd Leader (Role 2) calling POST /notifications/ returns HTTP 403 Forbidden")

    # 3. Non-admin: Barangay Staff (Role 3)
    brgy_staff = create_mock_user(user_id=33, role_id=3, name="Brgy Staff")
    app.dependency_overrides[get_current_user] = lambda: brgy_staff

    res = client.post("/notifications/", json=sample_payload)
    assert res.status_code == 403, f"Expected 403 for Brgy Staff (Role 3), got {res.status_code}"
    print("[PASS] 3. Barangay Staff (Role 3) calling POST /notifications/ returns HTTP 403 Forbidden")

    # 4. Admin (Role 4): Authorized
    admin = create_mock_user(user_id=44, role_id=4, name="System Admin")
    app.dependency_overrides[get_current_user] = lambda: admin

    res = client.post("/notifications/", json=sample_payload)
    assert res.status_code == 200, f"Expected 200 for Admin (Role 4), got {res.status_code}: {res.text}"
    created = res.json()
    assert created.get("title") == sample_payload["title"]
    created_id = created.get("notification_id")
    print(f"[PASS] 4. Admin (Role 4) successfully dispatches notification #{created_id} (HTTP 200)")

    # 5. Internal direct DB session operations (system level)
    db = SessionLocal()
    try:
        internal_notif = Notification(
            user_id=target_user_id,
            title="Internal Route Test",
            message="Internal route DB session generation",
            type="System"
        )
        db.add(internal_notif)
        db.commit()
        db.refresh(internal_notif)
        assert internal_notif.notification_id is not None
        print(f"[PASS] 5. Internal route direct DB session notification creation verified (#{internal_notif.notification_id})")

        # Cleanup test records
        if created_id:
            db.query(Notification).filter(Notification.notification_id == created_id).delete()
        db.delete(internal_notif)
        db.commit()
    finally:
        db.close()

    app.dependency_overrides.clear()

    print("\n=======================================================")
    print("  ALL TASK ADMIN-002 NOTIFICATION SECURITY TESTS PASSED! ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
