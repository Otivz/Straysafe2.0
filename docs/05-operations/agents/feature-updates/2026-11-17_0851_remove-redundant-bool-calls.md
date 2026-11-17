# Remove Redundant `bool()` Calls in `complaints.py`

- **Date:** 2026-11-17 08:51 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/complaints.py`
- **Authorization:** User request to fix `Unnecessary bool() call` warnings at `backend/app/services/complaints.py:L151`, `L305`, and `L823`
- **Type:** Polish

## Intent

Remove redundant `bool()` wrappers where the values are already typed as `bool` (`ComplaintOffense.counted` and narrowed `data.held`).

## Key changes

- `backend/app/services/complaints.py`: Replaced `bool(o.counted)` with `o.counted` at lines 151 and 305, and replaced `bool(data.held)` with `data.held` at line 823.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
