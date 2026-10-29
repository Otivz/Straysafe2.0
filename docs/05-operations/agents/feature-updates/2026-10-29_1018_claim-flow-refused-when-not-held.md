# Claim decisions refused when nobody holds the animal

- **Date:** 2026-10-29 10:18 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/utils/claim_custody.py`, `backend/app/routes/claims.py`, `backend/tests/test_claim_only_when_held.py`, `backend/tests/test_claim_identity.py`, `frontend/src/utils/claimCustody.ts`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer, on `/subd/pet-claims` showing "Claim Approved — Ready for Pickup / Handover": "the owner already has the pet right and i also click no need but wy is it i can claim it".
- **Type:** Fix

## Intent

In the local data, report #1's claim was closed as not needed at 18:03:19 and approved at 18:03:46. The claims page still showed Approve, Request evidence and Reject on the closed claim, because a claim closed as not needed is stored as `Rejected`. The status route accepted the approval with no custody rule. The approval set the report to Claimed by Owner (9), and the page then offered a handover for a dog the owner already had. The local data was only read (SELECT) to find this; it was not changed.

## Key changes

- `PATCH /claims/{id}/status`: moving a claim to Approved, Evidence Requested, Handover Complete or Pending Review is refused (409) when nobody holds the animal. The exception is a claim that is already Approved or further on. A claim closed as not needed says so in the message.
- `POST /claims/{id}/close-not-needed` also accepts an `Approved` claim on an animal nobody holds. When the approval had set the report to Claimed by Owner (9), the report goes back to its latest earlier status in the history, with a history entry. For report #1 that is Incident Resolved, from "owner complied".
- `animal_held` also counts a report at Claimed by Owner (9) whose status just before was a held status, such as Picked Up, so a real handover is not mistaken for "nobody holds it".
- **Claims pages:**
  - A claim closed as not needed shows "Closed: not needed" and no review buttons.
  - An open or approved claim on an animal nobody holds shows only the "Close: not needed" panel: no Approve, no handover.
- `test_claim_identity.py` approves claims; its test reports now have the custody "In Barangay Facility".

## Validation evidence

- `backend/tests/test_claim_only_when_held.py`: 35 of 35. It covers: the closed claim refused for each flow step and staying closed; an approved claim on an animal nobody holds being closed and the report going back from 9 to 11; a held animal's claim still approved; and that claim not closable after approval.
- `test_claim_identity.py`: 12 tests OK. Full isolated backend suite: 82 of 82 files. One run had `test_app_stay_signed_in.py` fail; it passed 19 of 19 alone and in the next full run.
- `frontend`: `npx tsc --noEmit -p tsconfig.app.json` no errors. ESLint: 50 problems before and after on the claims pages (none new). Browser tests `petClaimRecords` and `ownerWarnings` pass.
- Report #1's claim in the local database is still `Approved` (no data was changed). The developer can now close it with "Close: not needed" on `/subd/pet-claims`.
