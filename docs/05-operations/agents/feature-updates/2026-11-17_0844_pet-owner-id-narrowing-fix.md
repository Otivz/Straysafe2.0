# Narrow `pet.owner_id` Before `dict.get` in Complaint Leads

- **Date:** 2026-11-17 08:44 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/complaints.py`
- **Authorization:** User request to fix `Argument int | None is not assignable to parameter key with type int in function dict.get` at `backend/app/services/complaints.py:L401`
- **Type:** Fix

## Intent

Static type checkers flagged `owners.get(pet.owner_id)` because `owners` is typed as `dict[int, User]` while `Pet.owner_id` is typed as `Optional[int]` (`int | None`).

## Key changes

- `backend/app/services/complaints.py`: Guarded `owners.get(pet.owner_id)` with `if pet.owner_id is not None else None` so `pet.owner_id` is narrowed to `int` before dictionary lookup.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
