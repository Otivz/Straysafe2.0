# Under Observation Monitoring Log Persistence

- **Date:** 2026-10-31 12:23 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/models/owner_followup.py`, `backend/app/main.py`, `backend/app/schemas/owner_followup.py`, `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/tests/test_monitoring_logs.py`, `frontend/src/utils/monitoringLogs.ts`, `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `frontend/tests/monitoringLogs.test.mjs`, `docs/01-system/OWNER_FOLLOWUP_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE — FIX DATABASE PERSISTENCE FOR SUBDIVISION OBSERVATION LOGS" (save every Add Monitoring Log submission to the database, show database history, block duplicates, never show success on failure).
- **Type:** Fix

## Intent

The Add Monitoring Log form on `/subd/under-observation` did not save anything:

1. The page posted to `POST /owner-followups/{id}/logs`, which did not exist (the backend only had `/contact-logs`, with different field names and values), so every submission failed.
2. The history list read `log_id`, `contact_method`, `outcome`, and `actor_name`, but the backend returns `contact_log_id`, `contact_type`, and `logger_name`. Any existing contact log would crash the history (`undefined.replace`).
3. The dashboard auto-sync that creates an observation record for First Warnings issued before automatic creation existed only flushed and never committed. `get_db` does not commit, so those observation ids were rolled back after each request, and logs, resolve, Second Warning, and endorsement against them could not find the record.

## Key changes

- **Model / schema upkeep:** `followup_contact_logs` (existing table, reused) gained `report_id`, `pet_id`, `inspection_method`, `inspection_outcome`, and a unique `client_request_id`. `ensure_followup_monitoring_log_columns()` adds them at startup, plus indexes and foreign keys to `owner_followups`, `users`, `reports`, and `pets`. Each foreign key is added separately, so an orphaned legacy row only skips its own constraint and logs a warning. The function also backfills `report_id` and `pet_id` for older rows. No data is deleted.
- **API:** New `POST /owner-followups/{id}/logs` validates method and outcome against fixed values and requires trimmed notes (max 2000). It links the row to the observation, report, animal, and staff user, relies on the database server timestamp, and returns the saved row (201). A repeated `client_request_id` returns the existing row (200). Database errors roll back and return 500 or 409 with a clear message. Logs are refused (409) on resolved, closed, or cancelled cases. New `GET /owner-followups/{id}/logs` lists logs newest first. Barangay staff are limited to their own barangay. The dashboard sync now commits newly created observation records.
- **Serialization:** `serialize_contact_log` and `sort_contact_logs` in `backend/app/utils/owner_followups.py` are now the single log shape, used by the dashboard, both list endpoints, and the create endpoints. Existing `/contact-logs` callers (`OwnerFollowUpCard`) only receive extra fields.
- **Frontend:** The form uses a synchronous in-flight guard plus a per-draft request key, and disables its inputs while saving. A success message appears only after the backend returns a saved row. On success the returned row goes into the history, the form clears, and the dashboard refetches. On failure the entries are kept and a readable error is shown. The history renders the database fields: method, outcome, notes, staff name and role, and absolute plus relative time, with the record count taken from the saved rows. The open case now refreshes on the 30-second auto-refresh (stale closure fixed). Opening another case starts a fresh draft.

## Validation evidence

- `.venv\Scripts\python.exe backend/tests/test_monitoring_logs.py`: 36 checks passed, 0 failed. Covers DB row linkage (observation, report, animal, staff), server timestamps, duplicate key, newest-first history, persistence across sessions, countdown and status unchanged, 422 validation, 403/404 authorization, simulated DB failure (500, no row), logs preserved after resolve, 409 on resolved case, and no edit or delete routes.
- `.venv\Scripts\python.exe backend/tests/test_owner_followups.py`: 40 passed. `backend/tests/test_under_observation_flow.py`: 33 passed.
- `node --test tests/monitoringLogs.test.mjs tests/phase4FollowUpRules.test.mjs` (frontend): 11 passed.
- `npx tsc -p tsconfig.app.json --noEmit` (frontend): 0 errors. `npx eslint` on the changed files: no new findings; the remaining `no-explicit-any` and mount-effect findings in `SubdUnderObservation.tsx` were already there.
- Not run: the MySQL startup migration against the developer's local database, and the browser flow (refresh, log out and back in). The developer needs to restart the backend and check both.
