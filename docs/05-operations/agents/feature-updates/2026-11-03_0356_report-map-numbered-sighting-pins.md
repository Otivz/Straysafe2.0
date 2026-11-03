# Report maps use the tracking map's numbered sighting pins

- **Date:** 2026-11-03 03:56 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/LostPets/sightingMarkers.ts`, `frontend/src/components/LostPets/LostPetTrackingMap.tsx`, `frontend/src/components/LostPets/LatestSightingBlock.tsx`, `frontend/src/components/MapComponent.tsx`, `frontend/src/utils/lostPets.ts`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/tests/locationIntelligence.browser.mjs`, `docs/01-system/LOST_PET_SIGHTING_PING.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0356_report-map-numbered-sighting-pins.md`
- **Authorization:** the developer's request "mAKE it the same if its number on the `/resident/lost-pets/1` then same with `/resident/reports/3`".
- **Type:** Polish

## Intent

The report maps showed neighbor sightings as colored standard pins (change record `2026-11-03_0348`), while the Lost Pet Tracking Map shows numbered circles. Show the same pins on both, so sighting 2 is "2" everywhere.

## Key changes

- `sightingMarkers.ts` (new) holds the tracking map's icons (`lastSeenIcon`, `sightingIcon`), moved without visual change, and `reportSightingMarkers` for the report maps.
- `LostPetTrackingMap` imports those icons and numbers sightings with `orderedSightings`.
- `utils/lostPets.ts`:
  - `orderedSightings` gives the one numbering both maps use (by reported time, then id; only valid positions, the same rule as `isValidLatLng`);
  - `sightingNumber` gives a sighting's map number;
  - the colored-pin helper `sightingPins` from the previous change is removed.
- `MapComponent` markers can pass a ready-made `icon` (optional; other pins unchanged).
- Report maps, resident and leader:
  - the same numbers and colors as the tracking map: amber not verified, green verified, gray dismissed;
  - the same blue ring on the latest submitted sighting (`alert.latest_sighting`).
  - Dismissed sightings now show as gray pins, as on the tracking map; the previous change had hidden them.
- `LatestSightingBlock`:
  - shows the sighting's number badge ("Sighting 2 · most recent neighbor sighting");
  - the count is the total reported ("3 sightings reported"), as on the tracking page.
  - It still picks the latest *reported* time, leaving out dismissed sightings.

## Validation evidence

- `npx tsc -b` passed. `npx eslint` on `src/components/LostPets` and `utils/lostPets.ts` passed. `MapComponent.tsx` lint count is unchanged (60), and `LostPetTrackingMap.tsx` stays at 0.
- `node frontend/tests/locationIntelligence.browser.mjs` passed at 1280 and 390 px. On the report map:
  - pins are numbered 1–3 by time seen;
  - pin 1 is green (verified), 2 amber (not verified), 3 gray (dismissed), with the blue ring on 3 (latest submitted);
  - the block reads "Sighting 2" with "3 sightings reported";
  - `/resident/lost-pets/7` shows **identical** pins: same numbers, colors and ring.
  - No browser errors; all API calls mocked.
- Teammate tests still pass: `lostPets.browser.mjs` (10 scenarios, run against port 5173), `lostPets.test.mjs`, `placeName.test.mjs`.
- Screenshots at both widths were reviewed.
- Not checked: the leader report page in a browser (same helper), and live data.
