# Possible Pet Owner Verification

- **Date:** 2026-11-19 19:55 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/owner_verification.py`, `backend/app/routes/owner_verification.py`, `backend/app/main.py`, `backend/app/models/pet_match_confirmation.py`, `backend/app/models/case_messaging.py`, `backend/app/utils/pet_match_confirmation.py`, `backend/app/routes/manual_matching.py`, `backend/app/routes/pet_match_confirmations.py`, `backend/app/services/case_messaging.py`, `backend/app/db_migrations/case_alignment.py`, `backend/app/utils/push_categories.py`, `backend/migrations/2026-11-20_possible_owner_verification.sql`, `backend/tests/test_owner_verification.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `frontend/src/admin/styles/pages.css`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/reports/OwnershipVerificationCard.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/tests/adminLiveAdapters.test.mjs`, `docs/01-system/POSSIBLE_OWNER_VERIFICATION.md`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/01-system/RESIDENT_MESSAGING.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** The developer's request in this session, "STRAY-SAFE 2.0 – Possible Pet Owner Verification and Messaging Feature" (contact possible owners found through the Pet Registry matching via the existing messaging, owner confirmation, final verification by authorized staff only, notifications, audit history). FREEZE was OFF.
- **Type:** Feature

## Intent

Let Subdivision Leaders contact the owner of a registered pet that may be a reported animal, ask them to confirm, follow up, and record the verification end to end, without ever assuming ownership from a match or a silence. The feature reuses the existing owner-first request, case conversations, final staff decision and notifications.

## Key changes

- **Backend service** `services/owner_verification.py`:
  - **Possible owners:** candidates come from the report's registered-pet matches and requests, inside the Leader's data scope, with what matched and their status.
  - **Contact:** the existing owner-first request, plus a `direct` case conversation with the owner (role `pet_owner`), a system line describing the reported animal, the Leader's edited message and the owner's notification.
  - **No answer:** follow-ups are counted and dated; Unable to Contact needs a reason.
  - **Hooks** into the owner's answer and the final decision.
  - **The owner's card** is added to `GET /case-messages/{id}`.
- **Routes:** `/owner-verification/reports/{id}` (GET), `/reports/{id}/contact`, `/requests/{id}/follow-up`, `/requests/{id}/unable-to-contact`.
- **Owner-first rules:**
  - new status `UNABLE_TO_CONTACT`, treated like a cancellation (no answer);
  - append-only `events` history on each request;
  - the final decision also tells the owner in the conversation.
- **Send Confirmation:** its checks and rows moved into `create_confirmation_request`, shared with the new contact. Behaviour is unchanged.
- **The owner's YES/NO** (`/pet-match-confirmations/{id}/respond`) is written into the conversation. The Leader gets an `owner_verification` notification that opens the case, instead of the Manual Matching one.
- **Leader app:** the Possible Pet Owners section, on the Overview tab and on found-animal pages:
  - Contact Possible Owner, with the editable template;
  - Open conversation, Send follow-up, Unable to contact;
  - Verify ownership / Not the owner / Needs more information after a YES;
  - the verification history.
- **Resident app:** the ownership question card in the conversation, showing the reported animal next to their own pet, with Yes / No and a note.
- **Schema:** four columns on `pet_match_confirmation_requests`, added by the start-up case alignment step and by the SQL file.

## Validation evidence

- `python tests/test_owner_verification.py`: 65 checks passed. They cover:
  - access and scope;
  - the section's contents;
  - contact, idempotency, the conversation and its privacy;
  - notifications, follow-up and no-answer;
  - YES, the final verification and that registry ownership is unchanged;
  - NO and other owners, Unable to Contact and re-contact;
  - a closed case;
  - the start-up columns.
- **Other backend suites, all passing:** `test_case_messaging` 105, `test_resident_messaging` 50, `test_case_alignment_migrations` 61, `test_case_alignment_failure_handling` 42, `test_pet_identity` 64/64, `test_ai_audit_fixes` 28/28, `test_lost_found_matching` 69, `test_multi_attribute_matching` 58, `test_case_closure` 12/12, `test_closed_case_suggestions` 14/14, `test_active_case_requests` 17/17.
- **`test_manual_matching` 145/145,** run with `BARANGAY_WORKFLOWS_ENABLED=1` for that test process only. Without it, the suite stops at its Barangay-scope checks, because role-3 accounts are retired by default; that is unrelated to this change.
- **`test_match_cases` 27/28.** The failing check expects the history text "Linked duplicate Report #…", which the earlier uncommitted related-report change (record 2026-11-19_1630) renamed in `routes/reports.py`. It is not caused by this change.
- **Frontend:** `npx tsc --noEmit -p tsconfig.app.json` reports no errors, and ESLint on the changed files is clean.
- **`node --test`:** adminLiveAdapters, adminLostFound, adminLostPet, adminMonitoredCase and residentCaseMessages pass, 68/68 (including one new notification check).
- Not run against the application database, and no browser test was run.
