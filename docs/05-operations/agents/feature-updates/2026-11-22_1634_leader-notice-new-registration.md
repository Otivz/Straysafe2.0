# Leader notice and badge for new self-registrations

- **Date:** 2026-11-22 16:34 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/resident_applications.py`, `backend/app/utils/push_categories.py`, `backend/tests/test_resident_applications.py`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/residentApplications.ts`, `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/admin/pages/ResidentApplicationsPage.tsx`
- **Authorization:** Developer request in session: notify the Leader when a self-registered applicant verifies the email (in-app notification, push, sidebar badge).
- **Type:** Feature

## Intent

A Subdivision Leader learns about a registration waiting for a residency decision without opening the Applications tab.

## Key changes

- New notification type `resident_application` (related id = application). Created for every Active Subdivision Leader of the applicant's subdivision when the e-mail code moves the application to `PENDING_RESIDENCY_VERIFICATION` (once) and when a rejected applicant resubmits. Text has name, block and lot only.
- Push: the type is in the Reports category, so the existing after-commit hook queues it; a tap opens `/residents/applications`.
- When one reviewer approves or rejects, every reviewer's unread notice about that application is marked read.
- `GET /resident-applications/pending-count` (Leader own subdivision / Admin): one COUNT for the badge.
- Admin UI: the notification opens Residents > Applications; the Residents item in the sidebar shows the pending count (polled every 60 s while visible, refreshed right after a decision).
- No schema change, no migration.

## Validation evidence

- `python tests/test_resident_applications.py`: 67 checks passed (new: Leader notified, other subdivision not, no e-mail/phone in the text, count 1 / 0 / 403 for a resident, push category and link, notice read after a decision, resubmission notifies). One existing check now expects the account to turn Active at first sign-in, following a separate change to `approve()` and `/auth/login`.
- `python tests/test_resident_registry.py`: 105 passed.
- `npx tsc --noEmit -p .` and `eslint` on the changed admin files: no errors.
- Not viewed in a browser; real push delivery not tested.
