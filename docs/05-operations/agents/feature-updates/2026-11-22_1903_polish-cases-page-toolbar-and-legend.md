# Polish Cases Page Header, Toolbar, Animations, and Map Legend

- **Date:** 2026-11-22 19:03 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/components/CasesMap.tsx`
- **Authorization:** User request to make the Cases page look more professional, polished, organized, consistent with STRAY-SAFE branding, and animated.
- **Type:** Polish

## Intent

Organize the Cases toolbar into a balanced two-row warm-ivory control bar so the List/Map toggle no longer wraps awkwardly, align the header cleanly, add staggered entrance animations, and include Closed pins in the map legend.

## Key changes

- Aligned the header in `frontend/src/admin/pages/CasesPage.tsx` with a bottom hairline and right-aligned action button.
- Reorganized the Cases toolbar into a warm-ivory panel with status tabs + `List | Map` toggle on the top row and search/category/sort controls below.
- Added `@keyframes saFadeUp` / `.sa-fade-up` staggered entrance animations and KPI hover lift.
- Added the `Closed` gray dot indicator to the legend in `frontend/src/admin/components/CasesMap.tsx`.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/CasesPage.tsx src/admin/components/CasesMap.tsx; npx tsc --noEmit`
