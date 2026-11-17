"""
Unit tests for animal type filtering in same occurrence candidate detection (utils/complaint_rules.py).

Verifies that:
1. Dog vs. Dog -> Eligible for existing matching evaluation.
2. Cat vs. Cat -> Eligible for existing matching evaluation.
3. Dog vs. Cat -> Never a candidate.
4. Dog vs. Bird -> Never a candidate.
5. Missing animal type vs. Missing animal type -> Not automatically considered a candidate.
6. Same animal type but different locations -> Existing location rules still apply.
7. Same animal type but outside the time threshold -> Existing time rules still apply.
8. Missing/Unknown edge cases (None vs. Dog, Dog vs. None, Unknown vs. Unknown).
"""
import sys
from datetime import datetime, timedelta
from typing import Optional

from app.models.report import Report
from app.utils.complaint_rules import same_occurrence_candidate, valid_animal_type, SAME_OCCURRENCE_HOURS, NEARBY_METERS


def make_report(
    report_id: int,
    animal_type: Optional[str],
    hours_ago: float = 1.0,
    lat: float = 14.8008,
    lng: float = 121.0036,
    landmark: Optional[str] = "Narra St., Block 3",
    animal_breed: Optional[str] = None,
    animal_colors: Optional[list] = None,
) -> Report:
    now = datetime(2026, 11, 17, 12, 0, 0)
    seen = now - timedelta(hours=hours_ago)
    return Report(
        report_id=report_id,
        animal_type=animal_type,
        animal_breed=animal_breed,
        animal_colors=animal_colors,
        latitude=lat,
        longitude=lng,
        landmark=landmark,
        created_at=seen,
        seen_at=seen,
    )


def test_valid_animal_type_normalization():
    assert valid_animal_type("Dog") == "Dog"
    assert valid_animal_type("dog") == "Dog"
    assert valid_animal_type("Cat") == "Cat"
    assert valid_animal_type("cat") == "Cat"
    assert valid_animal_type("Bird") == "Bird"
    assert valid_animal_type(None) is None
    assert valid_animal_type("") is None
    assert valid_animal_type("   ") is None
    assert valid_animal_type("Unknown") is None
    assert valid_animal_type("unknown") is None
    assert valid_animal_type("None") is None
    assert valid_animal_type("n/a") is None
    print("[PASS] test_valid_animal_type_normalization")


def test_dog_vs_dog_eligible():
    # Report 1 (earlier): Dog
    # Report 2 (later): Dog
    r1 = make_report(1, animal_type="Dog", hours_ago=2.0)
    r2 = make_report(2, animal_type="Dog", hours_ago=1.0)
    candidate = same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None)
    assert candidate is not None, "Expected candidate to be found for Dog vs. Dog"
    assert candidate.report_id == 1, f"Expected candidate report_id 1, got {candidate.report_id}"
    print("[PASS] 1. Dog vs. Dog -> Eligible for matching evaluation")


def test_cat_vs_cat_eligible():
    # Report 1 (earlier): Cat
    # Report 2 (later): Cat
    r1 = make_report(1, animal_type="Cat", hours_ago=2.0)
    r2 = make_report(2, animal_type="Cat", hours_ago=1.0)
    candidate = same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None)
    assert candidate is not None, "Expected candidate to be found for Cat vs. Cat"
    assert candidate.report_id == 1, f"Expected candidate report_id 1, got {candidate.report_id}"
    print("[PASS] 2. Cat vs. Cat -> Eligible for matching evaluation")


def test_dog_vs_cat_never_candidate():
    # Report 1 (earlier): Cat
    # Report 2 (later): Dog
    r1 = make_report(1, animal_type="Cat", hours_ago=2.0)
    r2 = make_report(2, animal_type="Dog", hours_ago=1.0)
    candidate = same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None)
    assert candidate is None, "Dog and Cat must never match as same occurrence"
    print("[PASS] 3. Dog vs. Cat -> Never a candidate")


def test_dog_vs_bird_never_candidate():
    # Report 1 (earlier): Bird
    # Report 2 (later): Dog
    r1 = make_report(1, animal_type="Bird", hours_ago=2.0)
    r2 = make_report(2, animal_type="Dog", hours_ago=1.0)
    candidate = same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None)
    assert candidate is None, "Dog and Bird must never match as same occurrence"
    print("[PASS] 4. Dog vs. Bird -> Never a candidate")


def test_missing_animal_types_not_candidate():
    # None vs. None
    r1 = make_report(1, animal_type=None, hours_ago=2.0)
    r2 = make_report(2, animal_type=None, hours_ago=1.0)
    assert same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None) is None, \
        "Missing vs. Missing must not match"

    # Unknown vs. Unknown
    r3 = make_report(3, animal_type="Unknown", hours_ago=2.0)
    r4 = make_report(4, animal_type="Unknown", hours_ago=1.0)
    assert same_occurrence_candidate(r4, [r3], linked_ids=[], separate_from=None) is None, \
        "Unknown vs. Unknown must not match"

    # None vs. Dog
    r5 = make_report(5, animal_type=None, hours_ago=2.0)
    r6 = make_report(6, animal_type="Dog", hours_ago=1.0)
    assert same_occurrence_candidate(r6, [r5], linked_ids=[], separate_from=None) is None, \
        "None vs. Dog must not match"

    # Dog vs. None
    r7 = make_report(7, animal_type="Dog", hours_ago=2.0)
    r8 = make_report(8, animal_type=None, hours_ago=1.0)
    assert same_occurrence_candidate(r8, [r7], linked_ids=[], separate_from=None) is None, \
        "Dog vs. None must not match"

    # Dog vs. Unknown
    r9 = make_report(9, animal_type="Dog", hours_ago=2.0)
    r10 = make_report(10, animal_type="Unknown", hours_ago=1.0)
    assert same_occurrence_candidate(r10, [r9], linked_ids=[], separate_from=None) is None, \
        "Dog vs. Unknown must not match"

    print("[PASS] 5. Missing animal type vs. Missing animal type -> Not automatically considered a candidate")


def test_same_animal_type_different_locations_rules_apply():
    # Both Dog, but location coordinates far apart (> 150m, e.g. ~1km)
    r1 = make_report(1, animal_type="Dog", hours_ago=2.0, lat=14.8008, lng=121.0036, landmark="Narra St.")
    r2 = make_report(2, animal_type="Dog", hours_ago=1.0, lat=14.8150, lng=121.0200, landmark="Molave St.")
    candidate = same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None)
    assert candidate is None, "Reports outside NEARBY_METERS and different street must not match"
    print("[PASS] 6. Same animal type but different locations -> Existing location rules still apply")


def test_same_animal_type_outside_time_threshold_rules_apply():
    # Both Dog, same location, but time gap > 6 hours (e.g. 8 hours)
    r1 = make_report(1, animal_type="Dog", hours_ago=10.0)
    r2 = make_report(2, animal_type="Dog", hours_ago=1.0)
    candidate = same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None)
    assert candidate is None, f"Reports outside SAME_OCCURRENCE_HOURS ({SAME_OCCURRENCE_HOURS}h) must not match"
    print("[PASS] 7. Same animal type but outside the time threshold -> Existing time rules still apply")


def test_conflicting_breeds_not_candidate():
    r1 = make_report(1, animal_type="Dog", animal_breed="German Shepherd", hours_ago=2.0)
    r2 = make_report(2, animal_type="Dog", animal_breed="Aspin", hours_ago=1.0)
    assert same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None) is None, \
        "German Shepherd vs Aspin must not match as same occurrence"

    r3 = make_report(3, animal_type="Dog", animal_breed="German Sheperd", hours_ago=1.0)
    cand = same_occurrence_candidate(r3, [r1], linked_ids=[], separate_from=None)
    assert cand is not None and cand.report_id == 1, "Minor spelling differences in breed should still match"

    r4 = make_report(4, animal_type="Dog", animal_breed=None, hours_ago=1.0)
    cand2 = same_occurrence_candidate(r4, [r1], linked_ids=[], separate_from=None)
    assert cand2 is not None and cand2.report_id == 1, "Unspecified breed should stay eligible"
    print("[PASS] 8. Breed compatibility filtering works (blocks Aspin vs German Shepherd)")


def test_conflicting_colors_not_candidate():
    r1 = make_report(1, animal_type="Dog", animal_colors=["Black", "Brown"], hours_ago=2.0)
    r2 = make_report(2, animal_type="Dog", animal_colors=["White", "Tan"], hours_ago=1.0)
    assert same_occurrence_candidate(r2, [r1], linked_ids=[], separate_from=None) is None, \
        "Non-overlapping coat colours must not match as same occurrence"

    r3 = make_report(3, animal_type="Dog", animal_colors=["Brown"], hours_ago=1.0)
    cand = same_occurrence_candidate(r3, [r1], linked_ids=[], separate_from=None)
    assert cand is not None and cand.report_id == 1, "Overlapping coat colours should remain eligible"
    print("[PASS] 9. Colour compatibility filtering works")


def run_all_tests():
    test_valid_animal_type_normalization()
    test_dog_vs_dog_eligible()
    test_cat_vs_cat_eligible()
    test_dog_vs_cat_never_candidate()
    test_dog_vs_bird_never_candidate()
    test_missing_animal_types_not_candidate()
    test_same_animal_type_different_locations_rules_apply()
    test_same_animal_type_outside_time_threshold_rules_apply()
    test_conflicting_breeds_not_candidate()
    test_conflicting_colors_not_candidate()
    print("\nALL 9+ TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_all_tests()
