# Sighting Pin Location Name, Latitude and Longitude

- **Date:** 2026-11-02 18:26 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/utils/placeName.ts`, `frontend/src/components/LostPets/PinLocationInfo.tsx`, `frontend/src/components/LostPets/usePlaceNames.ts`, `frontend/src/components/LostPets/SpottedHereForm.tsx`, `frontend/src/components/LostPets/LostPetTrackingMap.tsx`, `frontend/src/components/LostPets/LostPetAlertView.tsx`, `frontend/src/components/ErrorBoundary.tsx`, `frontend/src/pages/citizen/ResiLostPets.tsx`, `frontend/tests/placeName.test.mjs`, `frontend/tests/lostPets.browser.mjs`, `frontend/tests/fixtures/lostPets.tsx`, `docs/01-system/LOST_PET_SIGHTING_PING.md`
- **Authorization:** Developer request "Improve the Lost Pet Tracking Map – Sighting Pin Information" (location name, latitude and longitude for every sighting pin, in Sighting Details and the marker popup).
- **Type:** Polish

## Intent

A pinned sighting showed only "Pinned location". Each pin now shows its own place name, latitude and longitude.

## Key changes

- **Spotted Here form:** placing a pin (a map tap or the device location) looks up that point's place name (Nominatim reverse geocoding, existing `utils/geocode.ts`). The form shows Location, Latitude and Longitude (6 decimals) with **Copy coordinates**, and fills the editable **Location name** field, which is saved as `location_label` with the exact coordinates. A name the resident typed is kept; a late answer for an earlier pin is ignored. When no name is found, a note says so and the coordinates are still saved.
- **Marker popup and Sighting details:** both show Location, Latitude, Longitude and Copy coordinates (`PinLocationInfo`) from the stored sighting, so they are the same after a refresh.
- **Older sightings without a name:** a name is looked up from their own stored coordinates (`usePlaceNames`, one request at a time). It is used in the popup, the details and the timeline label; it is display only and not saved.
- **`utils/placeName.ts`:** builds the name from the look-up answer only ("Near {street}, {area}, {town}, {province}", or the nearest named place when there is no street), and formats coordinates.
- No backend or database change: `latitude`, `longitude` and `location_label` were already stored.
- **Build fix (not part of the feature):** `ErrorBoundary.tsx` (type-only imports, no unused `React`) and `ResiLostPets.tsx` (unused import and setters removed) failed `tsc -b`, so `npm run build` failed. Behavior is unchanged.
- **Browser test:** the resident-list scenario now checks the redirect, because the standalone resident list was removed earlier (`2026-11-02_1649`). The fixture answers reverse geocoding locally with synthetic names.

## Validation evidence

- `npx tsc -b` exit 0; `npm run build` built; ESLint on the changed files exit 0.
- `node --test tests/*.test.mjs`: 103 pass, 0 fail (includes 6 new `placeName` tests).
- `node tests/lostPets.browser.mjs` (Vite on port 5175): PASS, 10 scenarios at widths 390 and 1280, run twice. It checks:
  - the auto-filled name and the 6-decimal coordinates for the pin;
  - that the name and latitude are submitted;
  - the Sighting details for "Lot 15" (14.801442, 121.003648);
  - the marker popup coordinates.
