# Remove redundant Receiving External Agency Contact Details block from ReferralDialog

- **Date:** 2026-11-20 06:33 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Direct user request to remove the optional Receiving External Agency Contact Details block from the Create External Referral dialog.
- **Type:** Polish

## Intent

Simplify `ReferralDialog` by removing the duplicate optional receiving contact fields now that `SubdivisionContactFields` handles organization-specific contact selection and manual input directly.

## Key changes

- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`:
  - Removed the `Additional Receiving Contact Details (Optional)` / `Receiving External Agency Contact Details (Optional)` card, `agencyContactPerson` and `agencyContactDetail` state, and corresponding review rows in `ReferralDialog`.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
