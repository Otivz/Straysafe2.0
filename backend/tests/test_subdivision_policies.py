"""
Unit test for subdivision animal policies in case settings.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.schemas.case import CaseSettings, PolicyIn
from app.utils import case_policy
from seed_subdivision_policies import REALISTIC_POLICIES


def test_realistic_policies_validation():
    assert len(REALISTIC_POLICIES) == 5
    for p in REALISTIC_POLICIES:
        assert isinstance(p, PolicyIn)
        assert p.status == "confirmed"
        assert len(p.applies_to) > 0
        assert p.reference.startswith("House Rules & By-Laws")


def test_applicable_policies():
    settings = CaseSettings(policies=REALISTIC_POLICIES)

    nuisance_policies = case_policy.applicable_policies(settings, "nuisance")
    assert len(nuisance_policies) >= 3

    safety_policies = case_policy.applicable_policies(settings, "safety")
    assert len(safety_policies) >= 2

    lost_policies = case_policy.applicable_policies(settings, "lost_pet")
    assert len(lost_policies) >= 2


def run_tests():
    test_realistic_policies_validation()
    test_applicable_policies()
    print("All subdivision policy tests passed successfully.")


if __name__ == "__main__":
    run_tests()
