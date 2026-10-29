# Shortcut from a confirmed pet match to its pet claim

- **Date:** 2026-10-29 02:57 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/matches.py`, `backend/app/schemas/report_match.py`, `backend/tests/test_match_claim_shortcut.py` (new), `frontend/src/utils/petClaimLink.ts` (new), `frontend/src/components/AIPotentialMatchesList.tsx`, `frontend/src/components/Modals/AIMatchReviewModal.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`, this record
- **Authorization:** the developer: "On the http://127.0.0.1:5173/subd/reports/1 and in the Potential Match Review … when it matches then owner says yes and upload evidence it should have shortcut to the pet claims".
- **Type:** Polish

## Intent

When a pet match is confirmed and the owner has filed the claim with proof, staff can jump from the match to that claim instead of searching the claims page.

## Key changes

- Pet matches returned to staff (Subdivision Leader, Barangay, Admin) carry `claim_id` and `claim_status`: the case's pet claim for the matched pet, found across every report of the merged case (merged claims are followed). They are only set once the owner has filed the claim, not while it is still "Potential Owner Match" or "Possible Match Found" (and not for a rejected claim). Residents never get them.
- Report page match cards and the "Potential Match Review" pop-up show an **Open Pet Claim #N · status** button. It goes to `/subd/pet-claims?claim_id=N` or `/brgy/pet-claims?claim_id=N`, depending on the portal. Admin has no claims page, so no button there.
- The Barangay claims page now opens the claim given by `?claim_id=` once, when the claims load (the Subdivision page already did).

## Validation evidence

- `backend/tests/test_match_claim_shortcut.py`: 6 of 6. It covers no claim, an unfiled claim, a filed claim with proof, the resident view, and the claim found from a merged report's match.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the changed files: no file has more problems than at `HEAD`; the new `petClaimLink.ts` is clean. Browser tests `matchReviewLocation` and `petClaimRecords`: pass.
- Not checked in a browser: the button on `/subd/reports/:id` and the jump into each claims page. To be checked by the developer.
