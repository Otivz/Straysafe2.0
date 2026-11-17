# Guard `db.get(CaseLink, ...)` Against `None` in `case_work.py`

- **Date:** 2026-11-17 08:52 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/case_work.py`
- **Authorization:** User request to fix `Argument CaseLink | None is not assignable to parameter object with type CaseLink` at `backend/app/services/case_work.py:L276`
- **Type:** Fix

## Intent

`db.get(CaseLink, match.link_id)` returns `CaseLink | None`, which cannot be appended directly to `out: List[CaseLink]` without narrowing against `None`.

## Key changes

- `backend/app/services/case_work.py`: Assigned `link = db.get(CaseLink, match.link_id)` and checked `if link is not None:` before appending to `out`.

## Validation evidence

- Ran `$env:PYTHONPATH="backend"; python backend/tests/test_same_occurrence_animal_type.py` — 7/7 tests passed.
