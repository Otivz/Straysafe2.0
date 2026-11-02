# Observation details, pet photo, and the warning-path due date fix (F18)

- **Date:** 2026-11-02 14:04 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/app/routes/reports.py`, `backend/tests/test_observation_summary_details.py`, `backend/tests/test_activity_timeline.py`, `frontend/src/utils/caseSummary.ts`, `frontend/src/components/History/CaseSummaryPanel.tsx`, `frontend/tests/fixtures/caseSummary.tsx`, `frontend/tests/caseSummary.browser.mjs`, `frontend/tests/historyCaseSummary.browser.mjs`, `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`, `docs/05-operations/agents/feature-updates/2026-11-02_1404_observation-details-and-due-date-fix.md`
- **Authorization:** the developer asked whether the observation details (start date, extension reason, who closed it) and the pet photo were needed, then answered "whatever the best option do i need it". Recommended and done: fix F18, add the observation details, add the pet photo.
- **Type:** Fix (F18) and Feature (observation details, pet photo)

## Intent

- **F18:** observations created automatically from a First Warning stored their due date in database local time (+8) while the API labels it UTC, so those due dates showed 8 hours late.
- Show on the history Case Summary when an observation started, how long and why it was extended, and who closed it, and show the matched pet's registered photo.

## Key changes

- `utils/owner_followups.py`:
  - New `db_local_to_utc`, which converts a database-clock time to UTC using the measured offset, rounded to 15 minutes.
  - `observation_summary` now sends `started_at` (converted from the database clock) to every viewer.
  - With `staff_details=True` it also sends `extension_days`, `extension_reason` (only when extended) and `closed_by_name`.
- `routes/reports.py`: `GET /reports/{id}` asks for the staff details only for roles 2–4. Residents never receive the extension reason or the closer's name.
- `routes/owner_followups.py` (warning path in `/owner-followups/under-observation`): the due date is the warning's time converted to UTC plus 3 days; a missing warning time falls back to the database clock. Existing rows are not changed.
- Panel:
  - **Owner observation** adds Started, "Extended: Yes, by N days", the extension reason, and Closed by (hidden while open).
  - **Pet and owner** adds a small thumbnail of the registered photo, resized by Cloudinary.
- `test_activity_timeline.py`: the check that pins the public observation fields now includes `started_at`. Its purpose, no owner details, is unchanged.

## Validation evidence

- New `backend/tests/test_observation_summary_details.py`: 11/11 passed (SQLite, database clock simulated at +8). It checks the conversion, that the warning-path due date equals the warning time in UTC plus 3 days, that the staff-only fields are absent without `staff_details`, and that an extension reason is sent only when the observation was extended.
- Existing backend suites on SQLite, all passing:
  - `test_under_observation_flow` 33/33
  - `test_owner_followups` 40/40
  - `test_owner_observation_updates` 55/55
  - `test_monitoring_logs` 36/36
  - `test_report_status_sync` 33/33
  - `test_owner_warning_rules` 81/81
  - `test_activity_timeline` 24/24, after updating the field list
- Frontend:
  - `npx tsc -b` and `npx eslint` on the changed files passed.
  - `caseSummary.browser.mjs` passed at 1280 and 390 px, including the observation details, "Closed by" hidden while open, and the thumbnail URL with `w_96`.
  - `historyCaseSummary.browser.mjs` passed for both pages at both widths.
  - Cloudinary and API requests are mocked in both tests.
- Read-only check of local report 1 through `get_report`: a leader receives `started_at` and `closed_by_name`; a resident receives `started_at` only.
- Not done: correcting the due date of existing observations created from a warning before this fix (a data change, not requested).
