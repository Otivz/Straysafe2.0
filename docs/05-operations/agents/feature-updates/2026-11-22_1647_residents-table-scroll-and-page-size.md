# Residents Table Scroll and Page Size 10

- **Date:** 2026-11-22 16:47 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/ResidentsPage.tsx`
- **Authorization:** User request to restrict vertical scrolling to the residents table (not the whole page) and show 10 residents per page.
- **Type:** Polish

## Intent

Keep the Residents page header, tabs, summary cards, search/filter bar, and pagination controls fixed in view on desktop while scrolling only inside the residents table, and limit pagination to 10 residents per page.

## Key changes

- Updated `PAGE_SIZE` from `15` to `10` in `frontend/src/admin/pages/ResidentsPage.tsx`.
- Constrained the desktop container height (`lg:flex lg:h-[calc(100dvh-112px)] lg:flex-col lg:overflow-hidden`) and table panel (`lg:flex lg:min-h-0 lg:flex-1 lg:flex-col`).
- Added vertical table scrolling with sticky table headers (`lg:min-h-0 lg:flex-1 lg:overflow-y-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10`) inside `.sa-tablewrap`.

## Validation evidence

- `cd frontend; npx tsc --noEmit; npx eslint src/admin/pages/ResidentsPage.tsx`
