# Fix TypeScript Narrowing and Unused Variable Errors in PossibleOwnersBlock

- **Date:** 2026-11-22 19:13 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** User request to fix the 3 TypeScript Problems in `PossibleOwnersBlock.tsx`.
- **Type:** Fix

## Intent

Resolve all 3 TypeScript diagnostics (`ts(2367)`, `ts(2322)`, `ts(6133)`) reported in `PossibleOwnersBlock.tsx`.

## Key changes

- Updated `canSendOwnerWarning` in `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx` to check `c.identity.status !== 'identified'` instead of `'matched'`.
- Separated `open.kind === 'warning'` narrowing from `canSendOwnerWarning(c, open.owner)` so `OwnerDialog` receives `Exclude<Open, { kind: 'warning' | 'details' }>`.
- Removed unused `closed` variable in `OwnerWarningsSection`.

## Validation evidence

- `cd frontend; npx tsc -p tsconfig.app.json --noEmit | Select-String "PossibleOwnersBlock"` (zero matches / errors)
