# Lost pet sightings shown in the report's Location Intelligence and maps

- **Date:** 2026-11-03 03:48 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/utils/lostPets.ts`, `frontend/src/components/LostPets/useReportSightings.ts`, `frontend/src/components/LostPets/LatestSightingBlock.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/tests/locationIntelligence.browser.mjs`, `docs/01-system/LOST_PET_SIGHTING_PING.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0348_lost-pet-sightings-in-location-intelligence.md`
- **Authorization:** the developer's request: "`/resident/reports/3` it should update the Location Intelligence … like `/resident/lost-pets/1`. When someone reported that he seen this pet it should reflect to the original report avoiding the confusion."
- **Type:** Feature

## Intent

A neighbor's "Spotted Here" sighting showed on the Neighborhood Alert page, but the original Lost Pet Report's Location Intelligence and map still showed only where the pet was first reported. Show the newest sighting on the report itself, without changing or hiding the original location.

## Key changes

- `utils/lostPets.ts`:
  - `mostRecentSighting` returns the latest reported time, leaving out dismissed sightings;
  - `sightingPlace` gives the place name, else the coordinates;
  - `sightingPins` gives the map pins, numbered by reported time: blue for the most recent, green for verified, yellow for not verified. Dismissed sightings are left out, and pins are never joined.
- `useReportSightings` (new hook) loads the report's alert from `GET /lost-pet-alerts/reports/{id}`, then its sightings from `GET /lost-pet-alerts/{alert_id}` (only when there are any). It refreshes every 30 seconds and follows the alert's access rules; anyone without access gets nothing.
- `LatestSightingBlock` (new), on the resident report page's Location Intelligence, beside "Last reported sighting", while the case is open and the animal isn't held. It shows:
  - place, time seen, reported by (a neighbor's name only for the owner and the leader, as the alert decides);
  - verified or not, and the sighting count;
  - the note "A neighbor's report, not a confirmed location";
  - **Show on map** (centers the map) and **Open tracking map**.
- Resident and leader report pages: sighting pins added to both the inline and the fullscreen maps, unless the animal is in a holding place.
- No backend change. The report's coordinates and landmark are not changed by sightings.

## Validation evidence

- `npx tsc -b` passed. `npx eslint` on the new files passed; the resident and leader pages have the same lint counts as before (31 and 133).
- `node frontend/tests/locationIntelligence.browser.mjs` passed at 1280 and 390 px. It adds a Lost Pet Report with three sightings (verified older, unverified newer, dismissed newest) and checks that:
  - the original location is kept;
  - the block shows the unverified newer sighting, not the dismissed one;
  - the reporter shows as "A neighbor", with "Not verified" and "2 sightings so far";
  - the tracking map link is `/resident/lost-pets/7`;
  - the map gains exactly two pins;
  - "Show on map" works, with no sideways scrolling and no browser errors.
- The earlier checks in the same test still pass. All API calls are mocked.
- Screenshots at both widths were reviewed.
- Not checked: the leader page in a browser (same pins, from the same helper), and live data with a real alert.
