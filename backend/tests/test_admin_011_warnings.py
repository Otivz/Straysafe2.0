import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.warning import OwnerWarning
from app.utils.auth import get_current_user

client = TestClient(app)

def test_admin_011_warnings_view():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role_id == 4).first()
        assert admin is not None, "Admin user must exist"

        # Mock current_user as Admin
        app.dependency_overrides[get_current_user] = lambda: admin

        # 1. Test GET /admin/badge-counts contains pending_warnings
        badge_resp = client.get("/admin/badge-counts")
        assert badge_resp.status_code == 200, f"Expected 200, got {badge_resp.status_code}"
        badge_data = badge_resp.json()
        assert "pending_warnings" in badge_data, "pending_warnings must be present in badge counts"
        assert isinstance(badge_data["pending_warnings"], int)

        # 2. Test GET /warnings/ returns citations list
        warnings_resp = client.get("/warnings/")
        assert warnings_resp.status_code == 200, f"Expected 200, got {warnings_resp.status_code}"
        warnings_data = warnings_resp.json()
        assert isinstance(warnings_data, list), "Warnings response must be a list"

        print(f"Verified {len(warnings_data)} citations returned for Admin. Pending warnings: {badge_data['pending_warnings']}")
        print("TASK ADMIN-011 backend tests passed successfully!")
    finally:
        app.dependency_overrides.clear()
        db.close()

if __name__ == "__main__":
    test_admin_011_warnings_view()
