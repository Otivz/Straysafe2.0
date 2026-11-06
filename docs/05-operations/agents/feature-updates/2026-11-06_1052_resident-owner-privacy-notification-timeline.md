# Resident owner-information privacy and notification timeline

- **Date:** 2026-11-06 10:52 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `backend/app/schemas/report.py`, `backend/app/utils/report_visibility.py`, `backend/app/routes/reports.py`, `backend/tests/test_report_visibility.py`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/utils/caseTimeline.ts`, `frontend/src/components/RescueTimeline.tsx`, `frontend/tests/residentOwnerPrivacy.browser.mjs`, `docs/01-system/ACTIVITY_TIMELINE_RULES.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1052_resident-owner-privacy-notification-timeline.md`
- **Authorization:** Developer approved implementation after reviewing resident report /resident/reports/9: hide the registered-pet/owner/contact block from non-owner residents and show anonymous potential-owner notification activity only when supported by recorded notifications.
- **Type:** Fix

## Intent

Prevent a potential or linked pet from exposing another resident's owner card or implying confirmed ownership, while showing honest case progress.

## Key changes

- API-derived can_view_owner_details grants the owner card only to the actual owner or authorized staff. Other residents, including the reporter, do not see the entire card or its empty contact placeholders. Non-owner stray responses also omit registered pet names and QR fields. Existing owner-published lost-pet contact rules remain intact.
- Report details expose anonymous owner_notification_events from persisted potential_match notifications addressed to the matched pet's owner for that report. Suggestions and staff-only notices do not count; reminders do not duplicate the initial entry. No recipient identity, pet name, match ID or message content is exposed.
- The shared timeline shows Potential owner notified with pending, confirmed, declined or unsure explanatory text. Owner confirmation remains distinct from official verification; the event date is the notification date, not a response timestamp. Recorded in-app notification does not claim delivery/read confirmation.
- No new notifications are sent and no stored status history, database schema, matching rules or owner-confirmation workflow changes. Earlier uncommitted Phase 4 work and intentional tool-pointer deletions are preserved.

## Validation evidence

- node frontend/node_modules/typescript/bin/tsc -b frontend: exit 0. git diff --check: no whitespace errors.
- Isolated backend regressions with BARANGAY_WORKFLOWS_ENABLED=1: test_report_visibility 91/91; test_lost_pet_contact 9/9; test_activity_timeline 24/24; test_report_privacy 8/8; test_owner_verification 17/17; test_match_review_location exit 0. No new Pydantic serialization warnings.
- residentOwnerPrivacy.browser.mjs: pass at 1280 and 390 px for reporter/public privacy, absent notification evidence, actual notification and anonymous response text, owner access and no horizontal overflow. All API requests are mocked.
- Existing browser regressions pass: barangayReferral, historyCaseSummary (including printing), locationIntelligence (including lost-pet sightings). notificationNavigation and caseStagesObservation: 10/10 each.
- No live identity data or report data used; backend tests use isolated SQLite and browser tests use synthetic API fixtures. The existing local Vite server on 5173 was used; it was not stopped or reconfigured.
- Strict documentation audit is run after this record and its index entry. The prior baseline has 12 known failures: 8 broken links and 4 intentionally deleted configured tool pointers.
