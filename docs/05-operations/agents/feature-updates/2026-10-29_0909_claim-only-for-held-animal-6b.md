# Phase 6B: screens for "a pet claim only for an animal someone holds"

- **Date:** 2026-10-29 09:09 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/schemas/report.py`, `backend/app/routes/reports.py`, `backend/app/schemas/pet_claim.py`, `backend/app/routes/claims.py`, `backend/tests/test_claim_only_when_held.py`, `frontend/src/utils/claimCustody.ts` (new), `frontend/src/components/CustodyQuestion.tsx` (new), `frontend/src/components/ClaimNotNeededPanel.tsx` (new), `frontend/src/pages/citizen/PetMatchReview.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`, `frontend/tests/ownerWarnings.browser.mjs`, `frontend/tests/fixtures/ownerWarnings.tsx`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "6b".
- **Type:** Fix

## Intent

Show Phase 6A on screen: no claim form for an animal nobody holds, the owner's "home" or "missing" answer, and closing an unneeded claim.

## Key changes

- **Server:**
  - The report detail carries `animal_held` and `owner_custody_answer`.
  - Claims carry `owner_custody_answer`.
- **Resident match review** (`/resident/reports/:id/match-review`):
  - After the owner confirms, an animal nobody holds gets "Is Your Pet Home?" (`CustodyQuestion`) instead of the proof form. It offers "Yes, it's home" and "No, still missing", with an optional note, and the answer can be changed.
  - An already-filed open claim on such an animal shows that the leader will close it, plus the same question.
  - A leader-verified match counts as confirmed on this page.
- **Leader report page:** a note with the owner's answer. "Home" suggests closing the report or starting the owner follow-up; "missing" says the sighting stays on the record.
- **Claims pages** (`/subd/pet-claims`, `/brgy/pet-claims`):
  - An open claim on an animal nobody holds shows "Nobody is holding this animal, so no handover is needed", the owner's answer, and **Close: not needed**.
  - A claim closed this way is labelled "Closed: not needed" in the list, the table and the details, and on the resident's claim card.

## Validation evidence

- `backend/tests/test_claim_only_when_held.py`: 27 of 27, with the answer read back and the claim's answer field. Full isolated backend suite: 82 of 82 files.
- `frontend/tests/ownerWarnings.browser.mjs`: pass. The new custody view checks the answer sent with its note, the staff panel showing the owner's answer, and the close request.
- The `matchReviewLocation`, `petClaimRecords` and `claimEvidence` browser tests pass.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 of 46. ESLint: 229 problems before and after on the changed pages (none new); the new files are clean.
- Not covered by a new test: the components inside the full match review and claims pages. They are covered by the type check and the existing page tests. Not checked by the developer in a browser (6C).
