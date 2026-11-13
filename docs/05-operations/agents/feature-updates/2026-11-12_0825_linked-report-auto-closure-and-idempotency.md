# Change record: Automatic linked report closure and universal submission idempotency

- **Date:** 2026-11-12 08:25 (UTC)
- **AI tool:** Antigravity
- **Authorization:** Developer request ("now it should that once the report of a linked report is closed, it should automatically closed all of the linked report. also i noticed that there are redundant report for every status, like i think there no idempotency, so there should be no redundant reports")
- **Type:** Feature

## Files changed

- `backend/app/utils/case_closure.py`
- `backend/app/routes/reports.py`
- `backend/app/services/case_lifecycle.py`
- `frontend/src/resident/live/actions.ts`
- `backend/tests/test_case_closure.py`
- `backend/tests/test_case_messaging.py`
- `docs/05-operations/agents/feature-updates/2026-11-12_0825_linked-report-auto-closure-and-idempotency.md`
- `docs/README.md`

## Summary of changes

1. **Automatic closure of linked reports on case close (`backend/app/utils/case_closure.py`):**
   - Implemented `close_linked_reports(session, report_id, closing_report, visited=None) -> int` in the central SQLAlchemy `before_flush` lifecycle hook (`_sync_side_records_with_closed_reports`).
   - When any report transitions to a closed status (`CLOSED_REPORT_STATUS_IDS` or `case_status == "closed"`), all actively linked reports (via active `CaseLink` where `unlinked_at IS NULL` or confirmed `LostFoundMatch`) automatically transition to `case_status = "closed"`.
   - Each linked report receives the matching disposition/legacy status, a clear closure reason referencing the partner report (`"Linked report #<id> was closed: ..."`), has its open alerts, follow-up observations, and message threads closed, its pending follow-ups cancelled, and has `StatusHistory`, `AuditLog`, and reporter notification records added.
   - Preserves unlinked reports: former partners that were explicitly unlinked (`unlinked_at IS NOT NULL`) remain untouched.

2. **Universal report submission idempotency across all categories (`backend/app/routes/reports.py`, `frontend/src/resident/live/actions.ts`):**
   - Generalized `client_request_id` idempotency in `POST /reports/` across all categories (not just Lost Pet). A duplicate request with the same `(user_id, client_request_id)` returns the previously created report instead of creating a second redundant report.
   - Saved `client_request_id` to `reports.client_request_id` across all categories.
   - Added short-window duplicate protection (15-second window) as fallback when no `client_request_id` is supplied: identical submissions (same user, category, animal type, description, pet ID, and approximate GPS coordinates) return the existing open report.
   - In `frontend/src/resident/live/actions.ts`, always passed `client_request_id: retryKeyOf(draft)` for all report drafts.

3. **Status history and transition idempotency (`backend/app/services/case_lifecycle.py`, `backend/app/routes/reports.py`):**
   - Deduplicated `StatusHistory` in `case_lifecycle.history`: no redundant consecutive entry is added if the latest history row for the report already shares the same `report_status_id` and `remarks`.
   - Prevented redundant resident notifications in `PUT/PATCH /reports/{report_id}/status` if `prev_status_id == status_update.status_id`.

## Verification

- `backend/tests/test_case_closure.py`: 12/12 checks passed (including linked report closure and unlinked report safety).
- `backend/tests/test_case_messaging.py`: 105/105 checks passed (including auto-closure of linked reports and message threads).
- `backend/tests/test_lost_pet_lifecycle.py`: 146/146 checks passed (including idempotency keys and retry handling).
- `backend/tests/test_lost_found_matching.py`: 64/64 checks passed.
- Frontend test suites (`tests/adminMonitoredCase.test.mjs`, `tests/adminLostFound.test.mjs`, `tests/residentCaseMessages.test.mjs`): 32/32 tests passed.
- Frontend TypeScript type-check (`tsc -b`): Clean (exit code 0, 0 errors).

