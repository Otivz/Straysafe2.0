# Pet Owner Observation Updates

- **Date:** 2026-10-31 13:48 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/models/owner_followup.py`, `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/schemas/owner_followup.py`, `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/app/routes/warnings.py`, `backend/tests/test_owner_observation_updates.py`, `frontend/src/utils/ownerObservationUpdates.ts`, `frontend/src/utils/ownerObservationUpdatesApi.ts`, `frontend/src/utils/ownerFollowUp.ts`, `frontend/src/components/OwnerObservationUpdateModal.tsx`, `frontend/src/components/OwnerObservationCard.tsx`, `frontend/src/components/SubdOwnerUpdatesSection.tsx`, `frontend/src/components/OwnerFollowUpOwnerPanel.tsx`, `frontend/src/components/Navbars/ResiNavbar.tsx`, `frontend/src/components/Navbars/SubdNavbar.tsx`, `frontend/src/pages/citizen/ResiObservations.tsx`, `frontend/src/pages/citizen/ResiHomePage.tsx`, `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `frontend/src/routes/AppRoutes.tsx`, `frontend/tests/ownerObservationUpdates.test.mjs`, `frontend/tests/monitoringLogs.test.mjs`, `docs/01-system/OWNER_FOLLOWUP_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "Implement a Pet Owner Observation Update feature that allows identified pet owners to submit compliance updates during the 3-day observation period", with full Pet Owner → backend → database → Subdivision integration.
- **Type:** Feature

## Intent

Let the identified pet owner send compliance updates with photo evidence during the 3-day observation that follows a First Warning. Every update is stored in the database and shown on the subdivision's Under Observation case page, separate from staff monitoring logs. Staff can review updates without that counting as verification, and the existing workflow (countdown, Second Warning, endorsement, verified resolution) is unchanged.

Before this change, the owner could only set one `owner_notes` text and one pasted photo URL on the follow-up, and each new update overwrote the last. There was no history and no file upload.

## Key changes

- **Database (non-destructive):** New tables `owner_observation_updates` and `owner_observation_update_photos`, with foreign keys to the observation, report, pet, and owner/reviewer users. New column `owner_followups.update_reminder_sent_at`. Created by `ensure_owner_observation_update_tables()` in `main.py` and by `create_all`.
- **API (`routes/owner_followups.py`):**
  - `GET /my-observations` lists the signed-in owner's records.
  - Multipart `POST /{id}/owner-updates`: the owner comes from the session and must match the follow-up's `owner_id`. It validates the status, remarks, and photos (signature, type, size, count) before uploading any photo; photos go to Cloudinary from the server. Records are saved with server timestamps and an audit entry. A duplicate `client_request_id` returns the saved row. Upload failures return 502 and database failures 500, with nothing saved.
  - `GET /{id}/owner-updates` serves the owner or in-scope staff.
  - `POST /{id}/owner-updates/{update_id}/review` lets subdivision staff review once, with optional remarks, and writes an audit entry.
  - The dashboard returns `unreviewed_owner_updates_count`.
- **Notifications:**
  - Owner: "3-Day Observation Period Started" (in `warnings.py`, same transaction as the First Warning), an update reminder after 24 hours if none was sent, and "update received".
  - Leader: new update or photo evidence, "Owner Reports Issue Resolved", and the deadline notice renamed to "Observation Expired: Non-Compliant".
  - Fixed: every follow-up notification in this router (resolve, Second Warning, extend, close, acknowledge, start, endorse) was added after the final commit and never saved. They now go through `_notify()`, which commits them.
- **Pet Owner UI:**
  - New `/resident/observations` page, linked from the resident menu (desktop and mobile) and from `followup_*` notifications. Its cards show the animal name and photo, report ID, status, First Warning date and time, deadline, a live countdown, and the submission history with review state.
  - A "Submit Observation Update" modal with the four compliance options, remarks, multi-photo picker with previews, a server-timestamp note, Cancel / Submit, a loading state, a double-click guard, and entries kept on failure.
  - The report-view owner panel uses the same modal and history in place of the old URL field.
- **Subdivision UI:** The case page has an **Owner Observation Updates** section above Monitoring History. Its cards expand to show the owner's name, animal, report ID, date and time, status, remarks, and evidence photos (opening full size), plus "Mark as Reviewed" with optional remarks and a note that review is not verification. The list shows a "New Owner Update" card badge and a banner. Notification links open the case by report ID (`?by=report`), so a follow-up ID and a report ID can no longer be confused. New updates appear through the page's 30-second refresh.
- **Tests:** `monitoringLogs.test.mjs` now compares option values as sets, because another session reordered and expanded the options in `2026-10-31_1313_subd-monitoring-log-popup.md`.

## Validation evidence

- `.venv\Scripts\python.exe backend/tests/test_owner_observation_updates.py`: 55 checks passed, 0 failed. Covers:
  - the First Warning starting the observation and notifying the owner
  - owner-only access and session-derived identity
  - the saved row with links and photos
  - duplicates that neither re-upload nor insert again
  - "Issue Resolved" not resolving the case or moving the deadline
  - newest-first ordering, counts, and separation from staff logs
  - validation: status, remarks, a fake image, more than 5 photos
  - authorization: other residents, staff submitting, other subdivisions, barangay read-only
  - upload and database failure handling
  - one-time review that preserves the original
  - the Non-Compliant expiry notice and Second Warning eligibility
  - the resolution notification now committed
  - updates kept and refused after resolution
  - no edit or delete routes
- Existing suites: `test_owner_followups.py` 40/40, `test_under_observation_flow.py` 33/33, `test_monitoring_logs.py` 36/36.
- `node --test frontend/tests/*.test.mjs`: 72 passed, 0 failed.
- `npx tsc -p tsconfig.app.json --noEmit`: 0 errors.
- ESLint finds nothing new in the new files. The remaining findings in the touched pages (`no-explicit-any`, mount effects in `SubdUnderObservation.tsx`, `OwnerFollowUpOwnerPanel.tsx`, `ResiNavbar.tsx`, `ResiHomePage.tsx`) were already there.
- Not run: the MySQL startup migration on the developer's database, real Cloudinary uploads, `vite build`, and the browser walkthrough (owner submits with photos → leader sees it and reviews it).
