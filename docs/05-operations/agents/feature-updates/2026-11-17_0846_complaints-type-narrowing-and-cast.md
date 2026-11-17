# Fix `dict.get` Narrowing and `Column[int]` Return Type in `complaints.py`

- **Date:** 2026-11-17 08:46 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/complaints.py`
- **Authorization:** User request to fix static type errors at `backend/app/services/complaints.py:L246` and `L46`
- **Type:** Fix

## Intent

Resolve static type-checker errors in `complaints.py`:
1. `names.get(...)` received `int | None` values (`f.respondent_by`, `f.check_by`, `f.separate_by`) where `dict[int, str].get` requires `int`.
2. `_nuisance_category_ids` returned `[c.category_id ...]` typed as `list[Column[int]]` instead of `list[int]` due to SQLAlchemy 1.x `Column(Integer)` annotations on `ReportCategory`.

## Key changes

- `backend/app/services/complaints.py`:
  - Imported `cast` from `typing` and wrapped `c.category_id` with `cast(int, c.category_id)` in `_nuisance_category_ids`.
  - Guarded `names.get(f.respondent_by)`, `names.get(f.check_by)`, and `names.get(f.separate_by)` with `if ... is not None else None`.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
