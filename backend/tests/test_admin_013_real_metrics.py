import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.report import Report
from app.models.report_match import ReportMatch
from app.utils.auth import get_current_user

client = TestClient(app)

def test_admin_013_real_metrics_evaluation():
    print("\n--- Verifying TASK ADMIN-013: Replace Pseudo AI Accuracy with Real Metrics ---")
    db = SessionLocal()
    test_match = None
    try:
        # 1. Fetch or create Admin user (role_id = 4)
        admin = db.query(User).filter(User.role_id == 4).first()
        assert admin is not None, "Admin user must exist"
        app.dependency_overrides[get_current_user] = lambda: admin

        # 2. Query dashboard-stats endpoint
        res = client.get("/admin/dashboard-stats")
        assert res.status_code == 200, f"GET /admin/dashboard-stats failed: {res.text}"
        stats = res.json()

        # 3. Verify real metrics fields are present
        assert "biometric_match_confidence" in stats, "Missing biometric_match_confidence in stats"
        assert "verified_matches_count" in stats, "Missing verified_matches_count in stats"
        assert "dog_percentage" in stats, "Missing dog_percentage in stats"
        assert "cat_percentage" in stats, "Missing cat_percentage in stats"
        assert "high_risk_percentage" in stats, "Missing high_risk_percentage in stats"
        assert "pet_id_percentage" in stats, "Missing pet_id_percentage in stats"

        print(f"[PASS] 1. All real metric fields present in response:")
        print(f"       - Biometric Match Confidence: {stats['biometric_match_confidence']}")
        print(f"       - Verified Matches Count: {stats['verified_matches_count']}")
        print(f"       - Dog Incidents: {stats['dog_percentage']}%")
        print(f"       - Cat Incidents: {stats['cat_percentage']}%")
        print(f"       - High Risk Incidents: {stats['high_risk_percentage']}%")
        print(f"       - Owned Pet Matches: {stats['pet_id_percentage']}%")

        # 4. Verify that verified matches calculation accurately reflects database
        # Find any source report
        sample_report = db.query(Report).first()
        if sample_report:
            # Insert a temporary CONFIRMED_MATCH
            test_match = ReportMatch(
                source_report_id=sample_report.report_id,
                similarity_score=88,
                status="CONFIRMED_MATCH",
                owner_confirmation_status="OWNER_CONFIRMED"
            )
            db.add(test_match)
            db.commit()
            db.refresh(test_match)

            res_after = client.get("/admin/dashboard-stats")
            stats_after = res_after.json()
            assert stats_after["verified_matches_count"] >= 1, "verified_matches_count should be at least 1"
            assert stats_after["biometric_match_confidence"] is not None, "biometric_match_confidence should not be None"
            print(f"[PASS] 2. Verified match detected: confidence={stats_after['biometric_match_confidence']}%, count={stats_after['verified_matches_count']}")

        print("=======================================================")
        print("     ALL TASK ADMIN-013 REAL METRICS TESTS PASSED!     ")
        print("=======================================================\n")

    finally:
        if test_match:
            db.delete(test_match)
            db.commit()
        db.close()

if __name__ == "__main__":
    test_admin_013_real_metrics_evaluation()
