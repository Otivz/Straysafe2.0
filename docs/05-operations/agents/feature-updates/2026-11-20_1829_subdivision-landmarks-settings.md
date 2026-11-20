# Subdivision Landmarks Management in Admin Settings

- **Date:** 2026-11-20 18:29 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/routes/landmarks.py`, `frontend/src/admin/components/LandmarkMapPicker.tsx`, `frontend/src/admin/dialogs/LandmarkDialog.tsx`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/SettingsPage.tsx`
- **Authorization:** User request in chat ("on the land marks others arre fixed could you add it to the settings of the subdivision Like the main gate, park it is in the wrong positiion in the map")
- **Type:** Feature

## Intent

Registered subdivision landmarks (such as Main Entrance Gate and Community Park & Clubhouse) had fixed coordinates in the database without an Admin Settings screen to add, rename, remove, or reposition pins on the map. Adding a **Subdivision landmarks** section under Settings lets Subdivision Leaders and administrators view all landmarks on the map and drag/click or enter exact coordinates to place each pin accurately.

## Key changes

- **`backend/app/routes/landmarks.py`:** Derived `barangay_id` from the Leader's assigned `Subdivision` record in `create_landmark` (falling back to payload/1) so non-barangay-1 subdivisions stay consistent.
- **`frontend/src/admin/live/api.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`:** Added `ApiLandmark` and landmark CRUD methods (`landmarks`, `createLandmark`, `updateLandmark`, `deleteLandmark`), and populated `setLiveGeography` with active non-holding subdivision landmarks in Admin live load.
- **`frontend/src/admin/components/LandmarkMapPicker.tsx`, `frontend/src/admin/dialogs/LandmarkDialog.tsx`:** Added a lazy-loaded Leaflet map pin picker (with click-to-place, draggable marker, reference pins for other landmarks, fullscreen mode portaling cleanly inside modal `<dialog>` top layer, two-way lat/lng inputs, and reporting-area distance notice).
- **`frontend/src/admin/pages/SettingsPage.tsx`:** Added the **Subdivision landmarks** section (`?section=landmarks`) showing a numbered overview map of all subdivision landmarks, coordinates, and Add / Move & Edit / Remove actions.

## Validation evidence

- `python tests\test_retired_landmark_designations.py` in `backend/`
- `npm run build` (`tsc -b && vite build`) in `frontend/`
- `npx eslint src/admin/components/LandmarkMapPicker.tsx src/admin/dialogs/LandmarkDialog.tsx src/admin/pages/SettingsPage.tsx src/admin/live/api.ts src/admin/live/LiveDataProvider.tsx` in `frontend/`
