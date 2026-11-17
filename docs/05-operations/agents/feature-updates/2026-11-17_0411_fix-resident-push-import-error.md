# Fix Push Notifications Resolution and ResidentLiveRoot 500 Error

- **Date:** 2026-11-17 04:11 (UTC)
- **AI tool:** Antigravity (Google DeepMind)
- **Files changed:** `frontend/src/resident/native/push.ts`
- **Authorization:** User error report: `push.ts:1 Failed to load resource: the server responded with a status of 500 (Internal Server Error)` / `Failed to fetch dynamically imported module: http://localhost:5173/src/resident/ResidentLiveRoot.tsx`
- **Type:** Fix

## Intent

Resolve Vite 500 Internal Server Error when opening `/resident-app` in the browser caused by an unresolved static import of `@capacitor/push-notifications`.

## Key changes

- In `frontend/src/resident/native/push.ts`:
  - Replaced the direct static import from uninstalled `@capacitor/push-notifications` with Capacitor's standard `registerPlugin<PushNotificationsPlugin>('PushNotifications')` from `@capacitor/core`.
  - Added TypeScript interface types for `PushNotificationsPlugin` (`addListener`, `createChannel`, `deleteChannel`, `checkPermissions`, `requestPermissions`, `register`).
  - This allows the browser dev server to load `push.ts` and `ResidentLiveRoot.tsx` cleanly without attempting to bundle the missing mobile-only package, while keeping native Android push capability fully intact when running on device.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`), which compiled in 2.01s with 0 errors.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`, all passed (`# tests 199`, `# pass 199`, `# fail 0`).
