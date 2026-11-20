# Owner confirmation page, admin final decision, and warning letter links

- **Date:** 2026-11-20 04:30 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5 / Sonnet 5.5)
- **Files changed:** `backend/app/utils/pet_match_confirmation.py`, `backend/app/services/owner_verification.py`, `backend/app/routes/pet_match_confirmations.py`, `backend/app/routes/manual_matching.py`, `backend/app/routes/warnings.py`, `backend/app/routes/notifications.py`, `backend/app/utils/push_categories.py`, `backend/tests/test_owner_verification.py`, `frontend/src/resident/pages/reports/OwnershipVerificationCard.tsx`, `frontend/src/resident/pages/reports/OwnershipVerificationPage.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/admin/components/MessageThread.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `docs/01-system/POSSIBLE_OWNER_VERIFICATION.md`, `docs/01-system/OWNER_WARNING_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in the Claude Code session of 2026-11-20: "Update the Owner Confirmation and Warning Workflows" (direct link, side-by-side photos, Confirm/Decline, administrator final say, warning letter link).
- **Type:** Feature

## Intent

The owner received the ownership question and the official warning only as plain chat text. The owner now gets a direct link to a verification page and a direct link to the warning letter itself. The owner's answer is supporting evidence only; the Subdivision Administrator always makes the final ownership decision.

## Key changes

- **Verification page:** new resident route `/resident-app/ownership/:requestId` and endpoint `GET /pet-match-confirmations/{id}/verification` (only the pet's registered owner; 404 for anyone else). It shows the reported animal's photos beside the registered pet's photo, the species, breed, colour, size, sex and markings, the Leader's message, Confirm / Decline Ownership, the answer with date and time, and the history. The same card is now shown at the top of the verification conversation.
- **Link and notification:** the Leader's request and follow-up messages end with the page link (added once). The owner's notification is `ownership_verification` (related id = request) and replaces the plain conversation notification, so there is no duplicate. Push links were updated to match.
- **Administrator has the final say:** a Decline is "Owner Declined – Pending Admin Review". It no longer closes the match as Not a Match or marks the case's ownership unconfirmed (either answer sets `under_review`). The Leader may record any final decision after either answer (`FINALIZABLE` now includes `OWNER_REJECTED`). Labels: Awaiting Owner Response, Owner Confirmed / Owner Declined – Pending Admin Review, Ownership Verified, Ownership Not Verified.
- **Warning letter link:** the issued warning's conversation message and notification include `/resident-app/warnings/{letter_id}`, where the existing page shows the complete letter with view, download and acknowledge. The message is deduplicated per letter (`client_request_id` `warning-letter-{id}`). A failed inbox post is now audited as `WARNING_INBOX_DELIVERY_FAILED` instead of being silently ignored. `warning_letter` push notifications open the letter itself.
- **Chat links:** in the resident app, `MessageThread` turns `/resident-app/...` paths into links ("Open the warning letter", "Review and respond").

## Validation evidence

- `python tests/test_owner_verification.py` (run with non-stopping checks): 67 passed. The 2 failures (template wording, the lost-pet section) were already failing before this change. Checks were updated for the link, the new notification, the verification page (owner only), and a decline that stays pending admin review.
- `tests/test_warning_draft_issue.py` (32 checks), `test_admin_011_warnings.py`, `test_push_notifications.py` (35/35) and `test_admin_002_notifications_rbac.py` pass. `test_warning_letters_and_notifications.py` cannot run (`pypdf` is not installed). `test_case_messaging.py`, `test_pet_owner_confirmation.py` and `test_manual_matching.py` fail at setup steps this change does not touch: report creation and the retired Barangay accounts.
- `npx tsc --noEmit -p tsconfig.app.json`: clean. `eslint` is clean on the new and changed resident files.
- Not done: a manual browser test of the new page and links.
