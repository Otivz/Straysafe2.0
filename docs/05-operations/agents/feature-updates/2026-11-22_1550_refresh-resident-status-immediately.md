# Feature Update: Refresh Resident List Immediately After Status Change

- **Date:** 2026-11-22 15:50 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/live/actions.ts`
  - `frontend/src/admin/live/LiveDataProvider.tsx`
- **Authorization:** User request to automatically update the resident's displayed status from Active to Suspended (and vice versa) immediately after `resident/setStatus` succeeds.
- **Type:** Fix

## Summary

- Added `residents?: boolean` to `ActionResult` in `actions.ts` and returned `{ residents: true }` from `resident/setStatus`.
- Added `refreshResidents` in `LiveDataProvider.tsx` and invoked it in `dispatch` when `result.residents` is true so the UI immediately reflects the new status (`Suspended`, `Inactive`, `Active`) without requiring a manual page refresh.
