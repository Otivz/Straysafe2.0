# Add Type Overloads to `finding_of` in Complaint Rules

- **Date:** 2026-11-17 08:41 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/complaint_rules.py`
- **Authorization:** User request to fix `Object of class NoneType has no attribute policy_title` at `backend/app/services/complaints.py:L462`
- **Type:** Fix

## Intent

Static type checkers reported `Object of class NoneType has no attribute policy_title` on `f.policy_title` in `backend/app/services/complaints.py` because `finding_of(..., create=True)` had a single return type annotation of `Optional[ComplaintFinding]`.

## Key changes

- `backend/app/utils/complaint_rules.py`: Added `@overload` signatures for `finding_of` so `create: Literal[True]` narrows the return type to `ComplaintFinding` (non-optional), while `create: bool = False` retains `Optional[ComplaintFinding]`.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — all 7 tests passed.
