# Owner warnings Phase 5F: owner follow-ups in the pet record's history

- **Date:** 2026-10-29 07:17 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/owner_followups.py`, `backend/tests/test_owner_followups.py`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/src/utils/ownerFollowUp.ts`, `frontend/tests/ownerWarnings.browser.mjs`, `frontend/tests/fixtures/ownerWarnings.tsx`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "5f".
- **Type:** Feature

## Intent

Phase 5F of the owner follow-up plan: staff see a pet's complaint history (warnings, owner follow-ups, linked reports) on its record.

## Key changes

- `GET /owner-followups` takes `pet_id`. The existing scoping is kept: a leader sees their subdivision, Barangay staff see escalated follow-ups of their barangay, the administrator sees all, residents get 403.
- The plan proposed a new "Complaints" section in `PetDetailPanel.tsx`. The record's "Pet History" tab already lists the pet's warnings and linked reports, newest first, so a second section would repeat them. Instead, each owner follow-up is added to that timeline, for staff only. An entry shows the report number, the status, the observation dates, the outcome, the logged repeated incidents and the number of verbal warnings.
- `listFollowUps` and `getReportWarnings` return an empty list when the reply is not a list.

## Validation evidence

- `backend/tests/test_owner_followups.py`: 72 of 72. It now covers the pet filter, another subdivision's leader seeing none, and a resident refused.
- Full isolated backend suite: 81 of 81 files.
- `frontend/tests/ownerWarnings.browser.mjs`: pass. The new pet-record view shows the follow-up in Pet History with its outcome, the repeat and the verbal warning. The pet record browser tests (petBehaviorHistory, petClaimRecords, petPhotoAccess) pass.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 of 46. ESLint: 52 problems before and after on the changed files (none new).
- Not checked on a real case in the browser (5G).
