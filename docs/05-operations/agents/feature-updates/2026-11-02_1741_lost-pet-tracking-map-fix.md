# Fix Lost Pet Tracking Map Display and Route Resilience

- **Date:** 2026-11-02 17:41 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/ErrorBoundary.tsx`, `frontend/src/pages/Subd_Leaders/SubdLostPetAlerts.tsx`, `frontend/src/pages/citizen/ResiLostPets.tsx`, `frontend/src/components/LostPets/LostPetAlertView.tsx`, `frontend/src/components/LostPets/LostPetTrackingMap.tsx`, `frontend/src/utils/lostPets.ts`
- **Authorization:** User request: "when i click the open tracking map it should open the tracking map and sigthing"
- **Type:** Fix

## Intent

Resolve the blank white screen issue when opening the lost pet tracking map and sightings detail page from report views (`/subd/lost-pet-alerts/:alertId` and `/resident/lost-pets/:alertId`). Ensure the interactive map, pet information card, and sightings timeline render properly and reliably.

## Key changes

- **Static Route Imports (`AppRoutes.tsx`):** Switched `SubdLostPetAlerts` and `ResiLostPets` from dynamic `lazy()` imports to direct static imports to prevent Vite dev server dynamic chunk resolution errors, and wrapped route Suspense with an `ErrorBoundary`.
- **Error Boundary (`ErrorBoundary.tsx`):** Created a reusable React error boundary component to capture any runtime rendering exceptions and provide graceful fallback and retry actions without unmounting the root tree.
- **Null Safety in Alert View & Map (`LostPetAlertView.tsx`, `LostPetTrackingMap.tsx`, `lostPets.ts`):**
  - Added defensive defaults for `alert.pet` and `alert.last_seen` in `LostPetAlertView.tsx` to handle alerts without populated pet profile cards.
  - Added null safety checks in `buildTimeline` for missing `last_seen` coordinates and timestamps.
  - In `LostPetTrackingMap.tsx`, filtered sightings with `isValidLatLng` so invalid/missing coordinates never trigger Leaflet rendering exceptions, and safeguarded map center calculation.
- **Component Error Isolation (`SubdLostPetAlerts.tsx`, `ResiLostPets.tsx`):** Wrapped `<LostPetAlertView>` in `<ErrorBoundary>` to isolate alert detail failures while maintaining navigation context and the "Back to Report" button.

## Validation evidence

- `npx tsc --noEmit` in `frontend` completed with exit code 0.
- `node --test tests/lostPets.test.mjs` completed with all 3 test suites passing.
- Headless Chrome browser verification navigating to `/subd/lost-pet-alerts/1` as Subdivision Leader confirmed `hasMap: true`, `hasTimeline: true`, `hasBackBtn: true`, `petName: 'mochi'`, and `sightingsCount: 3`.
