import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.database import get_db
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

def run_rbac_tests():
    print("Running TASK ADMIN-001 RBAC Access Verification Suite...")

    # 1. Test Resident (Role 1) attempting GET /users/
    resident = create_mock_user(user_id=10, role_id=1, name="Resident User")
    app.dependency_overrides[get_current_user] = lambda: resident

    res = client.get("/users/")
    assert res.status_code == 403, f"Expected 403 Forbidden for Resident, got {res.status_code}"
    print("[PASS] 1. Resident (Role 1) accessing GET /users/ returns HTTP 403 Forbidden")

    # 2. Test Barangay Staff (Role 3) attempting GET /users/
    brgy_staff = create_mock_user(user_id=30, role_id=3, name="Barangay Staff")
    app.dependency_overrides[get_current_user] = lambda: brgy_staff

    res = client.get("/users/")
    assert res.status_code == 200, f"Expected 200 OK for Barangay Staff, got {res.status_code}"
    print("[PASS] 2. Barangay Staff (Role 3) accessing GET /users/ returns HTTP 200 OK")

    # 3. Test Admin (Role 4) attempting GET /users/
    admin = create_mock_user(user_id=40, role_id=4, name="Admin User")
    app.dependency_overrides[get_current_user] = lambda: admin

    res = client.get("/users/")
    assert res.status_code == 200, f"Expected 200 OK for Admin, got {res.status_code}"
    print("[PASS] 3. System Administrator (Role 4) accessing GET /users/ returns HTTP 200 OK")

    # 4. Test Resident accessing own profile GET /users/{id}
    app.dependency_overrides[get_current_user] = lambda: resident
    res = client.get(f"/users/{resident.user_id}")
    # Might be 200 or 404 if user doesn't exist in DB, but importantly NOT 403 Forbidden
    assert res.status_code != 403, f"Expected non-403 for Resident accessing own profile, got {res.status_code}"
    print(f"[PASS] 4. Resident accessing own profile GET /users/{resident.user_id} does not return HTTP 403 (status: {res.status_code})")

    # 5. Test Resident attempting to access another user's profile GET /users/{other_id}
    res = client.get("/users/999999")
    assert res.status_code == 403, f"Expected 403 Forbidden for Resident accessing other profile, got {res.status_code}"
    print("[PASS] 5. Resident accessing another user's profile GET /users/999999 returns HTTP 403 Forbidden")

    # Clean up overrides
    app.dependency_overrides.clear()

    print("\n=======================================================")
    print("  ALL TASK ADMIN-001 RBAC VERIFICATION TESTS PASSED!   ")
    print("=======================================================")

if __name__ == "__main__":
    run_rbac_tests()
