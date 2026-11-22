# Refine Pet Registry Filter Bar Alignment and Table Scroll Height

- **Date:** 2026-11-22 18:48 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/PetsPage.tsx`
- **Authorization:** User request to make the Pet Registry page look more professional, polished, and organized.
- **Type:** Polish

## Intent

Prevent the Pet Registry table from being crushed to ~1.5 visible rows on 768p/1080p screens and align the species filter and sort select cleanly on one row.

## Key changes

- Placed the `All | Dog | Cat` segmented control and `Newest first` sort select (`w-auto shrink-0`) side-by-side in `frontend/src/admin/pages/PetsPage.tsx`.
- Replaced the viewport-height flex clamp with a fixed `max-h-[440px] overflow-y-auto` scroll container on `.sa-tablewrap` with sticky column headers so the table always has comfortable vertical breathing room while scrolling independently.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/PetsPage.tsx; npx tsc --noEmit`
