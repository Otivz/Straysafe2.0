# Narrow `street` Before Calling `.title()` in Complaint Leads

- **Date:** 2026-11-17 08:42 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/complaints.py`
- **Authorization:** User request to fix `Object of class NoneType has no attribute title` at `backend/app/services/complaints.py:L415`
- **Type:** Fix

## Intent

Static type checkers reported `Object of class NoneType has no attribute title` at `complaints.py:L415` because `street` (`Optional[str]`) was only checked inside `same_street = bool(street and ...)` rather than directly in the `if` condition, preventing type narrowing.

## Key changes

- `backend/app/services/complaints.py`: Updated `if same_street:` to `if street and same_street:` so the type checker narrows `street` to `str` before `street.title()`.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
