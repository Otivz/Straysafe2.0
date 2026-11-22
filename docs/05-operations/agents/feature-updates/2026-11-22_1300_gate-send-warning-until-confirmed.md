# Feature Update: Gate Send Warning Behind Confirmed Match and Ownership

- **Date:** 2026-11-22 13:00 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** User request to hide and disallow the **Send Warning** action until both the reported animal match (`identity.status === 'matched'`) and owner verification (`ownership.status === 'confirmed'` and candidate `status === 'verified'`) are confirmed.
- **Type:** Fix

## Summary

- Added `canSendOwnerWarning(c, owner?)` helper requiring `c.status !== 'closed'`, `c.identity.status === 'matched'`, `c.ownership.status === 'confirmed'`, and `owner.status === 'verified'` (when checking a specific candidate).
- Hid **Send Warning** on `OwnerCard`, `OwnerDetailsDialog`, and `CaseWarningsSection` (`Official Warnings`) until both match and ownership are confirmed, and guarded `open.kind === 'warning'` so the warning dialog cannot be opened prematurely.
- Updated the `Official Warnings` empty-state guidance to instruct staff to confirm the animal match and verify ownership before sending a warning.
