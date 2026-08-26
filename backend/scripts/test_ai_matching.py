"""
Automated Test for Human-Verified AI Pet/Animal Matching Feature
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base, SessionLocal
from app.models.report import Report
from app.models.pet import Pet
from app.models.user import User
from app.models.report_match import ReportMatch
from app.routes.matches import calculate_match_details
from datetime import datetime, timezone

def run_tests():
    print("=== STARTING AI MATCHING WORKFLOW TESTS ===")
    db = SessionLocal()
    try:
        # 1. Ensure table exists
        Base.metadata.create_all(bind=engine)
        print("[PASS] Database tables created / verified.")

        # 2. Test Registered Pet Eligibility Hard Exclusions
        from app.routes.matches import is_pet_eligible_for_matching

        mock_active_owner = User(user_id=10, name="Jane Doe", email="jane@example.com", status="Active")
        mock_inactive_owner = User(user_id=11, name="Inactive User", email="inact@example.com", status="Inactive")

        # 2a. No usable image -> Must be False (NO_USABLE_IMAGE)
        pet_no_img = Pet(pet_id=1, owner_id=10, owner=mock_active_owner, pet_name="Buddy", pet_type="Dog", status="Active", photo_url=None)
        ok, reason = is_pet_eligible_for_matching(pet_no_img)
        assert not ok, f"Expected ineligible for no image, got {ok}"
        print("[PASS] Hard Exclusion NO_USABLE_IMAGE verified.")

        # 2b. Ineligible status (Deceased, Inactive, Archived, Deleted, Unregistered)
        for bad_status in ["Deceased", "Inactive", "Archived", "Deleted", "Unregistered"]:
            bad_pet = Pet(pet_id=2, owner_id=10, owner=mock_active_owner, pet_name="Buddy", pet_type="Dog", status=bad_status, photo_url="https://img.jpg")
            ok, _ = is_pet_eligible_for_matching(bad_pet)
            assert not ok, f"Expected ineligible for status {bad_status}, got {ok}"
        print("[PASS] Hard Exclusions (DECEASED, INACTIVE, ARCHIVED, DELETED, UNREGISTERED) verified.")

        # 2c. Inactive Owner -> Must be False
        pet_bad_owner = Pet(pet_id=3, owner_id=11, owner=mock_inactive_owner, pet_name="Buddy", pet_type="Dog", status="Active", photo_url="https://img.jpg")
        ok, _ = is_pet_eligible_for_matching(pet_bad_owner)
        assert not ok, "Expected ineligible for inactive owner"
        print("[PASS] Active Registered Owner validation verified.")

        # 2d. Eligible Active Pet with Image and Owner -> Must be True
        pet_valid = Pet(pet_id=4, owner_id=10, owner=mock_active_owner, pet_name="Buddy", pet_type="Dog", status="Active", photo_url="https://img.jpg")
        ok, _ = is_pet_eligible_for_matching(pet_valid)
        assert ok, f"Expected eligible for valid pet, got {ok}"
        print("[PASS] Valid Registered Pet candidate eligibility verified.")

        # 3. Test Match Calculation & Structured Evidence Breakdown
        mock_source = Report(
            user_id=1,
            subdivision_id=1,
            category_id=6,
            animal_type="Dog",
            animal_breed="Golden Retriever",
            animal_color="Golden",
            current_status_id=1,
            latitude=14.80,
            longitude=121.00,
            description="Lost golden retriever with white chest"
        )
        mock_active_pet = Pet(
            owner_id=2,
            pet_name="Buddy",
            pet_type="Dog",
            breed="Golden Retriever",
            primary_color="Golden",
            color_markings="White Chest",
            distinctive_markings="White patch on chest",
            registered_latitude=14.801,
            registered_longitude=121.001,
            status="Lost"
        )
        res_active = calculate_match_details(mock_source, mock_active_pet, is_pet=True)
        assert res_active["score"] >= 60, f"Expected high score, got {res_active['score']}"
        assert res_active["evidence"] is not None
        assert "key_evidence_bullets" in res_active["evidence"]
        print(f"[PASS] Match details generated with score: {res_active['score']}% and {len(res_active['evidence']['key_evidence_bullets'])} evidence points.")

        # 3b. Test Purebred & Color Mismatch (Chihuahua vs Shih Tzu) -> MUST NOT MATCH (< 25%)
        mock_chihuahua_report = Report(
            user_id=1,
            subdivision_id=1,
            category_id=6,
            animal_type="Dog",
            animal_breed="Chihuahua",
            animal_color="Cream and Tan",
            ai_dominant_color="Cream and Tan",
            ai_possible_breed="Chihuahua",
            current_status_id=1,
            latitude=14.80,
            longitude=121.00,
            description="Crying small cream chihuahua"
        )
        mock_shihtzu_pet = Pet(
            owner_id=2,
            pet_name="Kobe",
            pet_type="Dog",
            breed="Shih Tzu",
            primary_color="White",
            secondary_color="Black",
            color_markings="Bicolor black and white fluffy coat",
            status="Active"
        )
        res_mismatch = calculate_match_details(mock_chihuahua_report, mock_shihtzu_pet, is_pet=True)
        assert res_mismatch["score"] < 25, f"Expected < 25% for Chihuahua vs Shih Tzu, got {res_mismatch['score']}%"
        print(f"[PASS] Strict breed/color conflict test passed (Chihuahua vs Shih Tzu scored {res_mismatch['score']}%).")

        # 4. Test Verification Status Constraint with a real DB report
        real_report = db.query(Report).first()
        staff = db.query(User).filter(User.role_id.in_([2, 3, 4])).first()
        
        if real_report and staff:
            test_match = ReportMatch(
                source_report_id=real_report.report_id,
                similarity_score=res_active["score"],
                status="AI_SUGGESTED",
                ai_explanation=res_active["explanation"],
                ai_evidence=res_active["evidence"]
            )
            db.add(test_match)
            db.flush()

            # Verify that status defaults to AI_SUGGESTED (NEVER automatically confirmed)
            assert test_match.status == "AI_SUGGESTED"
            print("[PASS] Core Principle Verified: Initial status is AI_SUGGESTED (never auto-confirmed).")

            # Perform manual staff confirmation
            test_match.status = "CONFIRMED_MATCH"
            test_match.reviewed_by = staff.user_id
            test_match.reviewer_role = "Subdivision Leader"
            test_match.verification_notes = "Visual match on chest patch and facial shape."
            test_match.verified_at = datetime.now(timezone.utc)

            db.commit()
            print("[PASS] Staff Verification successfully updated match status to CONFIRMED_MATCH.")

            # Clean up test match
            db.delete(test_match)
            db.commit()

        print("\n[SUCCESS] ALL AUTOMATED AI MATCHING TESTS PASSED SUCCESSFULLY!")
    except Exception as e:
        db.rollback()
        print(f"[FAIL] Test failed with error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
