# Report status synchronization after an observation is resolved

- **Date:** 2026-11-01 21:06 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/observation_resolution.py`, `backend/app/routes/owner_followups.py`, `backend/app/utils/case_closure.py`, `backend/tests/test_report_status_sync.py`, `frontend/src/utils/dataRefresh.ts`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx`, `frontend/tests/dataRefresh.test.mjs`, `docs/01-system/REPORT_STATUS_SYNC_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE – Global Report Status Synchronization Fix". FREEZE was OFF.
- **Type:** Fix

## Problems found

- **`POST /owner-followups/{id}/close` with outcome `complied`** (the observation card's Confirm Owner Compliance) never changed the report. The report stayed Under Observation everywhere, with:
  - no status history entry;
  - no notification to the resident who filed it;
  - repeated closes accepted, each producing new events and notifications.
- **`POST /owner-followups/{id}/resolve`** set the report to Incident Resolved, but:
  - notified only the pet owner;
  - wrote no audit-log entry;
  - left the case's warnings Pending, so they kept counting on dashboards;
  - did not check whether another workflow had already closed the report.
- **The case-closure hook** re-closed the observation that had just been resolved, in the same transaction. It changed `complied` to `closed` and added a second "Observation ended" entry, so resolved cases dropped out of the Resolved tab and its count.
- **Refresh gaps:**
  - the data-changed signal ignored `/owner-followups`, so other open pages didn't refresh after a resolution;
  - the resident and Subdivision report views and the Subdivision dashboard and history pages never refreshed, staying stale until a manual reload.

## Key changes

- **New `resolve_observation_case()` in `app/utils/observation_resolution.py`, used by both endpoints.** It runs in one transaction:
  - validates before any change: the observation must still be open, and the report must not be closed elsewhere or handled by the Barangay (409 otherwise);
  - marks the observation complied;
  - sets the case report, and any still-open report linked into the case, to status 11;
  - writes a history row with the previous status, observation, staff member and remarks;
  - writes a `RESOLVE_OBSERVATION_CASE` audit entry with old and new values, observation ID, remarks and time;
  - resolves Pending and Acknowledged warnings; Appealed ones are kept.

  After the commit it sends one notification per filer. Repeat reports, other reports about the same animal and merged duplicates are not changed.
- **`/close`:**
  - a concluded observation can't be closed again (409);
  - `closed` and `escalated` outcomes leave the report to its own workflow.
- **Case-closure hook:** skips observations already concluded in the same transaction.
- **Frontend:**
  - the data-changed signal now covers `/owner-followups`, `/manual-matching` and `/claim-assessments`;
  - `useAutoRefresh` was added to the Subdivision dashboard and history pages;
  - the resident and Subdivision report views run a light status check every 30 s and do a full reload only when the status changed;
  - no visual changes.

## Validation evidence

- **Backend:**
  - `tests/test_report_status_sync.py`: 33/33 checks passed on its own temporary SQLite file. They cover:
    - both endpoints;
    - the views of the filing resident, the Subdivision leader, an Admin and the pet owner;
    - the leader's report list;
    - repeated reads;
    - the active-observation count and the observation summary;
    - an unrelated report about the same dog left unchanged;
    - history, audit and warning changes;
    - single notifications;
    - repeated clicks refused with no extra rows or notifications;
    - merged and linked case reports;
    - `closed` outcome, Barangay-handled and rejected reports left unchanged;
    - permissions.
  - Observation and timeline suites pass: `test_owner_followups`, `test_under_observation_flow`, `test_owner_observation_updates`, `test_activity_timeline` (24/24) and `test_official_reporter_timeline` (5/5). Before the hook fix, `test_activity_timeline` failed its "the owner complied" check.
  - Every backend test script that sets its own SQLite database ran: **98 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run, so the local MySQL database was never touched.
- **Frontend:**
  - `node --test tests/*.test.mjs`: 79/79, including the new refresh signal paths.
  - `npx vite build` passed.
  - ESLint: no findings on inserted lines. Existing findings elsewhere in those pages remain.
  - `npx tsc -b` reports only the two errors already present in `MediaLightbox.tsx` and `AIMatchReviewModal.tsx`.
- **Not verified:**
  - a browser run of the pages;
  - a Barangay staff account reading the report detail (it uses the same reports API);
  - Admin dashboard figures against real data.
