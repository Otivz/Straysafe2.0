import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.routes import users as users_routes
from app.main import app
from app.models.user import User
from app.models.otp import OtpVerification
from app.models.audit_log import AuditLog
from app.database import SessionLocal
from app.utils.auth import get_current_user, verify_password

# These tests use fake addresses: never send real email.
INVITES_SENT = []
users_routes.send_account_invite_email = lambda to, name, role_label, code, hours, login_url=None: INVITES_SENT.append((to, code)) or True

client = TestClient(app)

def create_mock_user(user_id: int, role_id: int, name: str = "Admin Tester"):
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
    print("Running TASK ADMIN-003 Admin Explicit User Creation Suite...")

    db = SessionLocal()
    created_user_ids = []

    try:
        # 1. Non-admin access check (Resident / Role 1) -> 403 Forbidden
        resident = create_mock_user(user_id=88, role_id=1, name="Resident Hacker")
        app.dependency_overrides[get_current_user] = lambda: resident

        payload = {
            "name": "Subd Leader Test",
            "email": f"subd_{uuid.uuid4().hex[:6]}@example.com",
            "password": "Password123!",
            "role_id": 2,
            "subdivision_id": 1,
            "status": "Active"
        }
        res = client.post("/users/admin-create", json=payload)
        assert res.status_code == 403, f"Expected 403 for non-admin on admin-create, got {res.status_code}"
        print("[PASS] 1. Non-admin calling POST /users/admin-create rejected with HTTP 403")

        # 2. Admin creates Subdivision Leader account -> role_id must be 2
        admin = create_mock_user(user_id=1, role_id=4, name="Super Admin")
        app.dependency_overrides[get_current_user] = lambda: admin

        raw_subd_password = "SecureSubdPass!2026"
        subd_email = f"leader_{uuid.uuid4().hex[:6]}@example.com"
        subd_payload = {
            "name": "Capt. Subdivision Leader",
            "email": subd_email,
            "password": raw_subd_password,
            "phone": "09171112233",
            "role_id": 2,
            "subdivision_id": 1,
            "status": "Active",
            "position": "Subdivision President / Leader"
        }
        res2 = client.post("/users/admin-create", json=subd_payload)
        assert res2.status_code == 200, f"Expected 200 creating Subdivision Leader, got {res2.status_code}: {res2.text}"
        subd_user_data = res2.json()
        subd_id = subd_user_data["user_id"]
        created_user_ids.append(subd_id)

        assert subd_user_data["role_id"] == 2, f"Expected role_id 2, got {subd_user_data['role_id']}"
        print(f"[PASS] 2. Admin created Subdivision Leader #{subd_id} with retained role_id = 2")

        # 3. Admin creates Barangay Staff account -> role_id must be 3
        raw_staff_password = "SecureStaffPass!2026"
        staff_email = f"staff_{uuid.uuid4().hex[:6]}@example.com"
        staff_payload = {
            "name": "Officer Barangay Staff",
            "email": staff_email,
            "password": raw_staff_password,
            "phone": "09182223344",
            "role_id": 3,
            "barangay_id": 1,
            "is_head_officer": True,
            "status": "Active",
            "position": "Barangay Head Officer"
        }
        res3 = client.post("/users/admin-create", json=staff_payload)
        assert res3.status_code == 200, f"Expected 200 creating Barangay Staff, got {res3.status_code}: {res3.text}"
        staff_user_data = res3.json()
        staff_id = staff_user_data["user_id"]
        created_user_ids.append(staff_id)

        assert staff_user_data["role_id"] == 3, f"Expected role_id 3, got {staff_user_data['role_id']}"
        assert staff_user_data["is_head_officer"] is True, f"Expected is_head_officer True"
        print(f"[PASS] 3. Admin created Barangay Staff #{staff_id} with retained role_id = 3 & is_head_officer = True")

        # 4. Admin never sets the password: a typed-in one is ignored, the stored one is an unknown bcrypt hash,
        #    and the new person is emailed a setup code instead
        subd_db_user = db.query(User).filter(User.user_id == subd_id).first()
        assert subd_db_user is not None
        assert subd_db_user.password.startswith("$2"), "Password is not a bcrypt hash!"
        assert not verify_password(raw_subd_password, subd_db_user.password), "A password typed by the admin must be ignored!"

        staff_db_user = db.query(User).filter(User.user_id == staff_id).first()
        assert staff_db_user is not None
        assert not verify_password(raw_staff_password, staff_db_user.password), "A password typed by the admin must be ignored!"
        assert {e for e, _ in INVITES_SENT} >= {subd_email, staff_email}, "Setup emails were not sent to both new accounts"
        assert subd_user_data["invite_sent"] is True and subd_user_data["invite_pending"] is True
        invite_rows = db.query(OtpVerification).filter(OtpVerification.user_id.in_([subd_id, staff_id]), OtpVerification.purpose == "account_invite").count()
        assert invite_rows == 2, f"Expected 2 invite codes, found {invite_rows}"
        print("[PASS] 4. Admin-typed password ignored; accounts locked behind an emailed setup code")

        # 5. Verify audit log entry was created
        audit_log = db.query(AuditLog).filter(
            AuditLog.action == "ADMIN_CREATE_USER",
            AuditLog.target_id == staff_id
        ).first()
        assert audit_log is not None, "Audit log for ADMIN_CREATE_USER was not found!"
        assert audit_log.target_table == "users"
        assert audit_log.log_type == "security"
        print(f"[PASS] 5. Audit log verified: action={audit_log.action}, target_id={audit_log.target_id}, description='{audit_log.description}'")

    finally:
        # Clean up test accounts and audit logs
        for uid in created_user_ids:
            db.query(OtpVerification).filter(OtpVerification.user_id == uid).delete()
            db.query(AuditLog).filter(AuditLog.target_id == uid, AuditLog.target_table == "users").delete()
            db.query(User).filter(User.user_id == uid).delete()
        db.commit()
        db.close()
        app.dependency_overrides.clear()

    print("\n=======================================================")
    print("  ALL TASK ADMIN-003 USER PROVISIONING TESTS PASSED!   ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
