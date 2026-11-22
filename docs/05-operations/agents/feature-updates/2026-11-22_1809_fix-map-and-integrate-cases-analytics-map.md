# Fix Map Centering/Geolocation and Integrate Subdivision Case Map Across Features

- **Date:** 2026-11-22 18:09 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/components/CasesMap.tsx`, `frontend/src/admin/components/LandmarkMapPicker.tsx`, `frontend/src/admin/pages/NewReportPage.tsx`, `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/pages/ReportsPage.tsx`
- **Authorization:** User request to fix the map on File a report and use the map in other admin features.
- **Type:** Feature

## Intent

Prevent desktop IP/GPS readings outside the subdivision from pulling the File a report map away from Selera Homes, add quick subdivision recentering and landmark selection, and integrate an interactive case map into Cases and Analytics.

## Key changes

- Updated `frontend/src/admin/pages/NewReportPage.tsx` to check `checkReportingArea(lat, lng).inside` before auto-placing or using GPS coordinates, added an outside-area warning callout (`geo === 'outside'`), and added quick landmark buttons below the map.
- Updated `frontend/src/admin/components/LandmarkMapPicker.tsx` with a **Center on subdivision** button and automatic recentering to `areaCenter()` when the pin is cleared.
- Created `frontend/src/admin/components/CasesMap.tsx` to render color-coded priority markers for cases inside the subdivision reporting area with hover tooltips, clickable popups to open each case, and a recenter button.
- Added a **List | Map** view toggle in `frontend/src/admin/pages/CasesPage.tsx`.
- Added a **Case locations in this period** map card in `frontend/src/admin/pages/ReportsPage.tsx`.

## Validation evidence

- `cd frontend; npx eslint src/admin/components/CasesMap.tsx src/admin/components/LandmarkMapPicker.tsx src/admin/pages/NewReportPage.tsx src/admin/pages/CasesPage.tsx src/admin/pages/ReportsPage.tsx; npx tsc --noEmit`
