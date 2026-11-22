# Merge Residents and Resident Records into one sidebar entry

- **Date:** 2026-11-22 05:57 (UTC)
- **AI tool:** Claude Code (Sonnet 5.5)
- **Files changed:** `frontend/src/admin/pages/ResidentsTabs.tsx`, `frontend/src/admin/pages/ResidentsPage.tsx`, `frontend/src/admin/pages/ResidentRecordsPage.tsx`, `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/admin/AdminApp.tsx`, `frontend/src/admin/styles/ui.css`
- **Authorization:** Developer request in session ("yes paki gawa na") to merge the redundant "Residents" and "Resident Records" sidebar items.
- **Type:** Polish

## Intent

Residents (accounts) and Resident Records (the official registration list) were two sidebar items about the same people. They now share one "Residents" entry with two tabs.

## Key changes

- Sidebar: removed the "Resident Records" item; "Residents" stays active on `/residents` and `/residents/records`.
- New `ResidentsTabs` (Registered / Official list), shown on both pages. Each page keeps its own route, so filters in the URL are unaffected.
- Route `residents/records` now renders the records page; the old `resident-records` path redirects to it.
- `ui.css`: `.sa-tab` also styles the active state for `aria-current='page'` (link tabs).
- No backend, database or API change.

## Validation evidence

- `npx tsc --noEmit -p .` in `frontend/`: no errors.
- Not checked in a browser.
