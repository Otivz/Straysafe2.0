# Owner warnings Phase 5E: banners and the leader's identity check on screen

- **Date:** 2026-10-29 06:33 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/OwnerFollowUpCard.tsx`, `frontend/src/components/RepeatedReportBanner.tsx` (new), `frontend/src/components/LeaderIdentityConfirm.tsx` (new), `frontend/src/utils/ownerFollowUp.ts`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/components/Modals/AIMatchReviewModal.tsx`, `frontend/src/components/AIPotentialMatchesList.tsx`, `frontend/src/components/DisputeMatchHistory.tsx`, `frontend/src/components/MergedSightingsReview.tsx`, `frontend/tests/ownerWarnings.browser.mjs` (new), `frontend/tests/fixtures/ownerWarnings.tsx` (new), `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "5e".
- **Type:** Feature

## Intent

Phase 5E of the owner follow-up plan: show on screen what Phases 5A to 5C added on the server.

## Key changes

- **Follow-up card** (`OwnerFollowUpCard.tsx`, on the leader's report page):
  - A caution for an Injured or Aggressive report, or one with High priority. It shows before the start (from the category and priority) and while observing (from the server).
  - A Rabies Risk report shows "A Rabies Risk report cannot be observed: escalate it to the Barangay." and an escalation button instead of the start button.
  - A red banner lists the other reports about the pet that are not logged yet. Each has a link and a one-click "Log as repeated incident" button (method "Repeated incident" with the report number and a prefilled note).
- **New report** (`RepeatedReportBanner.tsx`, on `/subd/reports/:id` when the report detail has `observing_followup_report_id`): "{pet} is under an owner follow-up on Report #N", with a "Log on Report #N" button. Once logged it says so.
- **Match review pop-up** (`LeaderIdentityConfirm.tsx` in `AIMatchReviewModal.tsx`), only for the leader handling the report, on a staff-confirmed match of an owned pet the owner has not confirmed:
  - Before 24 hours it says when the leader can confirm.
  - After 24 hours, or once the owner said no, "Confirm identity" asks for a reason, using the method "Photos and markings match", then calls the server.
- **The value `LEADER_VERIFIED`** counts as the owner's half in the pop-up and on the match cards.
  - Badge and labels: "Leader Verified (photos and markings)".
  - The owner sees "The Subdivision Leader confirmed this sighting from the photos and markings. If it is not your pet, file a dispute on the report." instead of the Yes / Not my pet buttons.
- Not changed: the resident page `PetMatchReview.tsx`. There the owner's answer to a leader-verified match is refused by the server, with the dispute message.

## Validation evidence

- `frontend/tests/ownerWarnings.browser.mjs` at 390 and 1280 px, all API calls mocked: pass. It covers the caution, the Rabies Risk message, both repeat banners and their one-click logs (the request sent is checked), the identity check's wait and confirm (method and reason sent), and no sideways scroll.
- Every other browser test passes (chatCache, claimEvidence, matchReviewLocation, notifications, petBehaviorHistory, petClaimRecords, petPhotoAccess). The `frontend/scratch/` screenshot folder made by the notifications test was removed.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 of 46. ESLint: no changed file has more problems than at `HEAD`; the new components are clean.
- Not checked on a real case in the browser by the developer (5G).
