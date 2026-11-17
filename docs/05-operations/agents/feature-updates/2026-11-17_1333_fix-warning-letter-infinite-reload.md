# Fix Infinite Loading Loop on Resident `WarningLetterPage`

- **Date:** 2026-11-17 13:33 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `frontend/src/resident/pages/account/WarningLetterPage.tsx`
- **Authorization:** User bug report that `/resident-app/warnings/1` got stuck on loading
- **Type:** Fix

## Intent

Eliminate an infinite mount-reload-unmount loop when a resident opens `/resident-app/warnings/:letterId`. Calling `reload()` inside `WarningLetterPage`'s `load` effect set global `status = 'loading'` in `LiveDataProvider`, causing `ResidentLayout` to unmount `<Outlet />`, reload all resident data, remount `WarningLetterPage`, and repeat indefinitely.

## Key changes

- Replaced `reload()` in `frontend/src/resident/pages/account/WarningLetterPage.tsx` with `local({ type: 'notification/read', id: String(data.notification_id) })` so the linked notification is marked read in client state immediately without unmounting the route.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 1.29s`).
- Ran `node --test frontend/tests/*.test.mjs`: `201` tests passed, `0` failed.
