# Preserve Non-Optional Report Typing After Locking in Case Messaging

- **Date:** 2026-11-20 20:13 (UTC)
- **AI tool:** Antigravity (Gemini 4 Argon)
- **Files changed:** `backend/app/services/case_messaging.py`, `docs/05-operations/agents/feature-updates/2026-11-20_2013_case-messaging-locked-report-typing.md`
- **Authorization:** User request to explain and fix `Object of class NoneType has no attribute report_id` at `backend/app/services/case_messaging.py:L309`
- **Type:** Fix

## Intent

Resolve the static type checker warning in `open_direct` and `open_for_resident` where re-fetching `report` via `db.get(Report, ...)` widened `report`'s inferred type from `Report` to `Report | None`.

## Key changes

- **`backend/app/services/case_messaging.py`**: Stored the non-optional `Report` instances returned by `LP.lock_case(db, rid)` in `locked = {rid: LP.lock_case(db, rid) ...}` and assigned `report = locked[target_id]` in both `open_direct` and `open_for_resident`, preserving `report: Report` typing without `Optional` widening.

## Validation evidence

- `python -m py_compile app/services/case_messaging.py` (exit code 0)
- `python tests/test_merged_concerns_case_management.py` (`[PASS] test_merged_concerns_case_management`, exit code 0)
