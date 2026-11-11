# Hide Bottom Navigation on Resident Report Inner Screens

- **Date:** 2026-11-11 05:38 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/layout/ResidentLayout.tsx`, `frontend/src/resident/pages/report/CategoryPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-11_0538_hide-bottomnav-on-resident-report.md`
- **Authorization:** User request ("on the resident report, the report should be the inner screens so theres no way to show the bottom navbar")
- **Type:** Polish

## Intent

Ensure that the Resident Report process is treated consistently as an inner screen flow across all steps. Previously, the initial category selection route (`/report`) was included in the `PRIMARY` screen set in `ResidentLayout.tsx` and used `PrimaryScreen` without a back button, causing the persistent bottom navigation bar to be displayed on `/report` while disappearing on subsequent flow steps (`/report/details`, `/report/location`, etc.).

## Key changes

1. **`frontend/src/resident/layout/ResidentLayout.tsx`:**
   - Removed `'/report'` from the `PRIMARY` set (`new Set(['/home', '/community', '/reports', '/profile'])`).
   - Consequently, `primary` evaluates to `false` on `/report` and all subsequent report flow sub-routes, ensuring the bottom navigation bar is never rendered on report screens.

2. **`frontend/src/resident/pages/report/CategoryPage.tsx`:**
   - Replaced `PrimaryScreen` with `Screen`, providing a standard TopBar with an arrow Back button defaulting to `/home` (or returning via history), establishing `/report` as the proper entry screen of an inner flow.
   - Updated title and subtitle to `"Report"` and `"What would you like to report?"`.

3. **`docs/README.md`:**
   - Added this change record to the Operations documentation index.

## Validation evidence

- Executed `node frontend/node_modules/typescript/bin/tsc -b frontend` with 0 type-check errors.
- Executed `npm --prefix frontend run build` (tsc + Vite production build) completing successfully in 2.68s with all client modules transformed.

