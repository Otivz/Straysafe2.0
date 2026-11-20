# Remove Agency Category dropdown from Create External Referral dialog

- **Date:** 2026-11-20 06:39 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Direct user request to remove the Agency Category field from the Create External Referral modal.
- **Type:** Polish

## Intent

Eliminate the redundant `Agency Category` selector in `ReferralDialog` since `Receiving Organization (Saved in External Coordination)` already determines the selected organization and maps its category automatically.

## Key changes

- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`:
  - Removed the `Agency Category` field and unused `handleOrgSelect` handler from `ReferralDialog`, keeping `Receiving Organization / Agency Name` as a clean full-width field.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
