# Update Landmark Pins 1-3 to Numbered Sage Map Pins

- **Date:** 2026-11-22 18:29 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/preview/map/map.css`, `frontend/src/preview/map/icons.ts`, `frontend/src/admin/components/LandmarkMapPicker.tsx`
- **Authorization:** User request to change the landmark pins 1-3 on the map.
- **Type:** Polish

## Intent

Replace the plain black sighting dot markers (`dotIcon`) used for subdivision landmarks 1-3 with dedicated sage teardrop landmark pins (`landmarkPinIcon`) so they are visually distinct from the orange report pin and clearly point to each landmark's coordinates.

## Key changes

- Added `.pv-landmark` CSS-drawn teardrop pin style in `frontend/src/preview/map/map.css`.
- Added `landmarkPinIcon(n)` in `frontend/src/preview/map/icons.ts`.
- Switched `otherLandmarks` in `frontend/src/admin/components/LandmarkMapPicker.tsx` from `dotIcon(idx + 1, false)` to `landmarkPinIcon(idx + 1)` with adjusted tooltip offset.

## Validation evidence

- `cd frontend; npx eslint src/admin/components/LandmarkMapPicker.tsx src/preview/map/icons.ts; npx tsc --noEmit`
