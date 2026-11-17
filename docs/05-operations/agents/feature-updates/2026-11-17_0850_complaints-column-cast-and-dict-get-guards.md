# Fix `Column[str]` Cast and Remaining `dict.get` Narrowing in `complaints.py`

- **Date:** 2026-11-17 08:50 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/complaints.py`
- **Authorization:** User request to fix static type errors at `backend/app/services/complaints.py:L46`, `L80`, and `L152`
- **Type:** Fix

## Intent

Resolve static type-checker errors in `complaints.py`:
1. `V.category_family(c.category_name)` received `Column[str]` instead of `str | None` due to SQLAlchemy 1.x `Column(String)` annotations on `ReportCategory`.
2. `users.get(r.user_id)` and `names.get(o.confirmed_by)` received `int | None` where `dict[int, ...].get` requires `int`.

## Key changes

- `backend/app/services/complaints.py`:
  - Wrapped `c.category_name` with `cast(Optional[str], c.category_name)` in `_nuisance_category_ids`.
  - Guarded `users.get(r.user_id)` in `_respondents` and `names.get(o.confirmed_by)` in `_offense_view` with `is not None` checks.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
