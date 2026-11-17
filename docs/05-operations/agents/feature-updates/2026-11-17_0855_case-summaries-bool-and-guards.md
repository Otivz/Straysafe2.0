# Remove Redundant `bool()` and Re-apply `names.get` Guards in `case_summaries.py`

- **Date:** 2026-11-17 08:55 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/case_summaries.py`
- **Authorization:** User request to fix `Unnecessary bool() call` at `L113` and `dict.get` narrowing at `L110` and `L121` in `backend/app/services/case_summaries.py`
- **Type:** Fix

## Intent

Remove the redundant `bool()` wrapper around `r.is_sensitive` (already typed as `bool`), and ensure `names.get(...)` calls for `last.updated_by`, `r.user_id`, and `r.assigned_leader_id` are guarded with `is not None`.

## Key changes

- `backend/app/services/case_summaries.py`:
  - Changed `bool(r.is_sensitive)` to `r.is_sensitive` at line 113.
  - Guarded `names.get(last.updated_by)`, `names.get(r.user_id)`, and `names.get(r.assigned_leader_id)` with `is not None` checks at lines 110, 120, and 121.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
