import os
import sys
from dotenv import load_dotenv

os.chdir(os.path.dirname(os.path.abspath(__file__)))
load_dotenv('../../.env')

sys.path.insert(0, os.path.abspath('..'))
from app.utils.ai_suggestions import generate_ai_suggestions

test_cases = [
    {
        "name": "Case 1: Chasing + Near-miss Attempted Bite (No actual bite, No injury)",
        "desc": "Yung aso po ay lagi nanghahabol sa mga bata. Kahapon muntikan na akong makagat pero hindi naman ako natamaan. Usually nasa may gate lang siya.",
        "expected": {
            "ai_behavior_chasing": True,
            "ai_behavior_attempted_bite": True,
            "ai_behavior_actual_bite": False,
            "ai_behavior_injury": False,
            "ai_behavior_aggressive": True
        }
    },
    {
        "name": "Case 2: Actual Bite (No Injury)",
        "desc": "Nangagat yung aso sa kapitbahay kahapon. Wala naman siyang sugat pero talagang nakagat siya.",
        "expected": {
            "ai_behavior_actual_bite": True,
            "ai_behavior_attempted_bite": False,
            "ai_behavior_injury": False,
            "ai_behavior_aggressive": True
        }
    },
    {
        "name": "Case 3: Negation (Never Bit)",
        "desc": "Madalas siyang lumalapit pero hindi naman nangagat kahit kailan.",
        "expected": {
            "ai_behavior_actual_bite": False,
            "ai_behavior_attempted_bite": False,
            "ai_behavior_aggressive": False
        }
    }
]

print("=" * 60)
print("RUNNING AI BEHAVIORAL CONTEXT UNDERSTANDING TEST SUITE")
print("=" * 60)

all_passed = True

for tc in test_cases:
    print(f"\n--- {tc['name']} ---")
    print(f"Description: \"{tc['desc']}\"")
    result = generate_ai_suggestions(description=tc["desc"], category_name="Stray Animal Sighting")
    
    print("\nResult:")
    print(f"  Chasing:        {result.get('ai_behavior_chasing')}")
    print(f"  Attempted Bite: {result.get('ai_behavior_attempted_bite')}")
    print(f"  Actual Bite:    {result.get('ai_behavior_actual_bite')}")
    print(f"  Injury:         {result.get('ai_behavior_injury')}")
    print(f"  Aggressive:     {result.get('ai_behavior_aggressive')}")
    print(f"  Explanation:    {result.get('ai_behavior_explanation')}")
    
    passed = True
    for k, v in tc["expected"].items():
        actual = result.get(k)
        if actual != v:
            print(f"  [MISMATCH] {k}: expected {v}, got {actual}")
            passed = False
            all_passed = False
        else:
            print(f"  [OK] {k}: {v}")
            
    if passed:
        print("  ==> TEST PASSED")
    else:
        print("  ==> TEST FAILED")

print("\n" + "=" * 60)
if all_passed:
    print("ALL TESTS PASSED SUCCESSFULLY!")
else:
    print("SOME TESTS FAILED.")
print("=" * 60)
