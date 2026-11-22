# Polish File a Report Page with Branding and Animations

- **Date:** 2026-11-22 17:50 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/NewReportPage.tsx`
- **Authorization:** User request to make the File a report page look more professional, polished, organized, consistent with STRAY-SAFE's branding, and animated.
- **Type:** Polish

## Intent

Bring visual hierarchy, STRAY-SAFE warm-ivory/orange branding, and smooth entrance animations to the File a report screen (`/cases/new`) while preserving all form state, auto-fill hints, and map functionality.

## Key changes

- Added `@keyframes saFadeUp` / `.sa-fade-up` staggered entrance animations across the step strip, form panels, expanded reporter details, and footer action bar.
- Added a compact 3-step summary bar (`1. Reporter -> 2. Incident details -> 3. Location`).
- Styled the `Someone else` details sub-panel, custom dashed warm-ivory file upload control with file count/clear support, bordered map wrapper, and footer action bar.

## Validation evidence

- `cd frontend; npx tsc -p tsconfig.app.json --noEmit` (zero errors in `NewReportPage.tsx`)
- `cd frontend; npx eslint src/admin/pages/NewReportPage.tsx`
