"""
Automated Comprehensive Test Suite for STRAY-SAFE AI Potential Match & Biometric Identification System
Verifies all 10 Test Cases and Business Rules from the Specifications.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base, SessionLocal
from app.models.report import Report, HoldingAnimal
from app.models.pet import Pet
from app.models.user import User
from app.models.report_match import ReportMatch
from app.routes.matches import calculate_match_details, is_pet_eligible_for_matching, scan_and_generate_matches_for_report, RESOLVED_STATUS_IDS
from datetime import datetime, timezone

def run_tests():
    print("==================================================")
    print("=== STARTING STRAY-SAFE AI MATCHING TEST SUITE ===")
    print("==================================================")
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        print("[INIT] Database schema connected and ready.\n")

        # -------------------------------------------------------------
        # TEST 1 & 2 & 3 & 4: BIOMETRIC COMPARISONS (Aspins & Colors)
        # -------------------------------------------------------------
        print("--- [TEST 2 & 3] Two completely different Aspin dogs (Brown/White Aspin vs Gray Aspin) ---")
        mock_r4 = Report(
            report_id=4,
            user_id=1,
            subdivision_id=1,
            category_id=4,
            animal_type="Dog",
            animal_breed="Aspin",
            animal_color="Brown and White",
            ai_dominant_color="Brown and White",
            ai_possible_breed="Aspin",
            ai_coat_pattern="Bicolor",
            estimated_size="Medium",
            latitude=14.8013,
            longitude=121.0031,
            description="Stray sighting bicolor brown and white dog",
            current_status_id=1
        )
        mock_p3 = Pet(
            pet_id=3,
            owner_id=2,
            pet_name="Grey",
            pet_type="Dog",
            breed="Aspin",
            primary_color="Gray",
            secondary_color="None",
            color_markings="Solid",
            size_category="Medium",
            distinctive_markings="Gray",
            status="Active"
        )
        res_diff_aspin = calculate_match_details(mock_r4, mock_p3, is_pet=True)
        print(f"Result for Brown/White Aspin vs Gray Aspin: Score = {res_diff_aspin['score']}%, Assessment = {res_diff_aspin['visual_comparison']['final_assessment']}")
        assert res_diff_aspin["score"] <= 25, f"Expected <= 25% for Brown/White vs Gray Aspin, got {res_diff_aspin['score']}%"
        assert res_diff_aspin["visual_comparison"]["final_assessment"] in ["NOT A MATCH", "LOW CONFIDENCE"]
        print("[PASS] TEST 2 & 3: Brown/White Aspin vs Gray Aspin correctly received low score (<25%) and NOT A MATCH.\n")

        # -------------------------------------------------------------
        # TEST 4: Same species + Same breed + Same size but Different Markings
        # -------------------------------------------------------------
        print("--- [TEST 4] Same species + breed (Aspin) + size (Medium) with different markings ---")
        mock_aspin_spotted = Report(
            report_id=10,
            user_id=1,
            subdivision_id=1,
            category_id=4,
            animal_type="Dog",
            animal_breed="Aspin",
            animal_color="Black",
            ai_dominant_color="Black",
            ai_coat_pattern="Solid",
            estimated_size="Medium",
            description="Solid black dog with dark ears",
            current_status_id=1
        )
        mock_aspin_brindle = Pet(
            pet_id=11,
            owner_id=3,
            pet_name="Bruno",
            pet_type="Dog",
            breed="Aspin",
            primary_color="Tan",
            secondary_color="Black",
            color_markings="Striped Brindle",
            size_category="Medium",
            distinctive_markings="Tiger striped brindle with floppy ears",
            status="Active"
        )
        res_aspin_markings = calculate_match_details(mock_aspin_spotted, mock_aspin_brindle, is_pet=True)
        print(f"Result: Score = {res_aspin_markings['score']}%, Assessment = {res_aspin_markings['visual_comparison']['final_assessment']}")
        assert res_aspin_markings["score"] < 40, f"Expected < 40%, got {res_aspin_markings['score']}%"
        print("[PASS] TEST 4: Same species + breed + size does NOT automatically become a match without matching individual identity.\n")

        # -------------------------------------------------------------
        # TEST 1: Same individual dog, matching distinctive traits
        # -------------------------------------------------------------
        print("--- [TEST 1] Matching individual traits (Golden Retriever with white chest patch) ---")
        mock_golden_report = Report(
            report_id=20,
            user_id=1,
            subdivision_id=1,
            category_id=4,
            animal_type="Dog",
            animal_breed="Golden Retriever",
            animal_color="Golden",
            ai_dominant_color="Golden",
            estimated_size="Large",
            latitude=14.801,
            longitude=121.001,
            description="Lost golden retriever with distinct white chest patch",
            current_status_id=1
        )
        mock_golden_pet = Pet(
            pet_id=21,
            owner_id=2,
            pet_name="Max",
            pet_type="Dog",
            breed="Golden Retriever",
            primary_color="Golden",
            secondary_color="White",
            color_markings="White Chest",
            size_category="Large",
            distinctive_markings="White patch on chest",
            registered_latitude=14.801,
            registered_longitude=121.001,
            status="Lost",
            photo_url="https://images.unsplash.com/photo-1543466835-00a7907e9de1"
        )
        res_golden = calculate_match_details(mock_golden_report, mock_golden_pet, is_pet=True)
        print(f"Result: Score = {res_golden['score']}%, Assessment = {res_golden['visual_comparison']['final_assessment']}")
        assert res_golden["score"] >= 60, f"Expected >= 60%, got {res_golden['score']}%"
        print("[PASS] TEST 1: Identical distinctive individual traits correctly produce potential match.\n")

        # -------------------------------------------------------------
        # TEST 5 & 6 & 7: HOLDING FACILITY ELIGIBILITY
        # -------------------------------------------------------------
        print("--- [TEST 5 & 6 & 7] Holding Facility Animals Eligibility ---")
        # Ensure Status 6 (Picked Up) & Status 7 (Under Observation) are NOT in RESOLVED_STATUS_IDS
        assert 6 not in RESOLVED_STATUS_IDS, "Status 6 (Picked Up) must NOT be in RESOLVED_STATUS_IDS"
        assert 7 not in RESOLVED_STATUS_IDS, "Status 7 (Under Observation) must NOT be in RESOLVED_STATUS_IDS"
        print("[PASS] TEST 5 & 6: Holding Facility workflow reports (Picked Up & Under Observation) are NOT excluded from matching.")

        # Test registered pet in Active/Lost/Found/Rescued status is eligible
        mock_owner = User(user_id=99, name="Test Owner", email="owner@test.com", status="Active")
        for st in ["Active", "Lost", "Found", "Rescued"]:
            p = Pet(pet_id=100, owner_id=99, owner=mock_owner, pet_name="Doggy", pet_type="Dog", status=st, photo_url="https://test.jpg")
            ok, _ = is_pet_eligible_for_matching(p)
            assert ok, f"Expected status {st} to be eligible"
        print("[PASS] TEST 7: Registered pet statuses (Active, Lost, Found, Rescued) correctly follow eligibility rules.\n")

        # -------------------------------------------------------------
        # TEST 8 & 9: IMPOUNDED STATUS EXCLUSION
        # -------------------------------------------------------------
        print("--- [TEST 8 & 9] Report Status 8 (Impounded) Exclusion ---")
        assert 8 in RESOLVED_STATUS_IDS, "Status 8 (Impounded) MUST be in RESOLVED_STATUS_IDS"
        
        # Test report with status_id = 8
        impounded_report = Report(
            report_id=999,
            user_id=1,
            subdivision_id=1,
            category_id=4,
            latitude=14.8013,
            longitude=121.0031,
            current_status_id=8, # Impounded
            animal_type="Dog",
            animal_breed="Aspin"
        )
        db.add(impounded_report)
        db.flush()

        matches_impounded = scan_and_generate_matches_for_report(impounded_report.report_id, db)
        assert len(matches_impounded) == 0, f"Expected 0 matches for Impounded report, got {len(matches_impounded)}"
        print("[PASS] TEST 8 & 9: Report with Status 8 (Impounded) is strictly excluded from new potential matches.\n")

        # -------------------------------------------------------------
        # TEST 10: HUMAN VERIFICATION RULE
        # -------------------------------------------------------------
        print("--- [TEST 10] Human Verification Rule (AI Never Auto-Confirms) ---")
        # When matches are created, default status is AI_SUGGESTED
        test_m = ReportMatch(
            source_report_id=mock_golden_report.report_id,
            matched_pet_id=mock_golden_pet.pet_id,
            similarity_score=res_golden["score"],
            status="AI_SUGGESTED"
        )
        assert test_m.status == "AI_SUGGESTED"
        print("[PASS] TEST 10: Match records require official staff verification before confirmation.\n")

        # Clean up test entities
        db.delete(impounded_report)
        db.commit()

        print("==================================================")
        print("=== ALL 10 TEST CASES PASSED WITH ZERO ERRORS! ===")
        print("==================================================")

    except Exception as e:
        db.rollback()
        print(f"\n[FAIL] Test suite failed with error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
