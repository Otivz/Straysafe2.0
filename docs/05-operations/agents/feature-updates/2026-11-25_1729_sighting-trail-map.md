# Missing pet: the sighting trail and the area to start looking on the Leader's map

- **Date:** 2026-11-25 17:29 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/lib/sightingTrail.ts`, `frontend/src/preview/geo.ts`, `frontend/src/preview/map/ReadOnlyMap.tsx`, `frontend/src/preview/map/types.ts`, `frontend/src/preview/map/styles.ts`, `frontend/src/preview/map/icons.ts`, `frontend/src/preview/map/map.css`, `frontend/src/preview/map/MapLegend.tsx`, `frontend/src/admin/pages/case/monitored/Hero.tsx`, `frontend/src/admin/styles/case.css`, `frontend/tests/adminSightingTrail.test.mjs`, `docs/01-system/LOST_PET_LIFECYCLE.md`
- **Authorization:** Developer's request in the Claude Code session ("Smart Sighting Trail sa Map"), after a discussion of the design and "gow, kung ano tingin mo mas better".
- **Type:** Feature

## Intent

Let the Leader see at a glance where a missing pet has been reported, in what order and in which direction, and where to start looking, without the map claiming more than the reports say.

## Key changes

- `sightingTrail.ts` (pure): builds the trail from the last-seen place and the sightings, ordered by the time they were seen. Each leg is an arrow (direction means something), unclear (more than 12 hours between the two, or a time is missing: no arrow), a jump (at least 200 m and faster than a loose animal can go: 8 km/h for a cat, 15 for a dog, 10 for others), or the same spot (within 25 m). It also gives the area to start looking, text for each step and the warnings.
- The map (`ReadOnlyMap`, used by the Leader's page) takes optional `trail` and `zone`: dashed legs in the brand colour (grey when unclear, amber for a jump), an arrowhead in the middle of each leg that has a direction, and a sage circle for the area to start looking; the view fits them. The resident apps do not pass them, so they are unchanged.
- The missing-pet page (`Hero.tsx`): a legend for the new symbols, an amber note for each warning, a "How it moved" list, a switch for the search area, and the map opens by itself when there are two or more places to join.
- The area is only for an open missing-pet case, starts at 150 m (cat), 400 m (dog) or 250 m and widens with the hours since the latest sighting up to 400, 1200 or 600 m, and is described as a guide, not a prediction. There is no predicted direction.
- A sighting the Leader dismissed is no longer drawn on this map and no longer takes a number; a possible-recovery lead stays a numbered place but is never joined into the trail.
- `bearingDeg` added to `preview/geo.ts` (turns the arrowheads). No new dependency, no backend or database change.

## Validation evidence

- `node --test tests/adminSightingTrail.test.mjs`: 8 tests pass (the real module and the real distance and bearing functions: a calm trail, the area's size per animal and its cap and closed-case rule, a jump and its warning, per-animal speed limits, unclear legs, the same spot, which sightings count, ordering by time seen, an older-than-last-seen sighting, empty input and bad coordinates).
- `npx tsc -b`: no errors. `npx eslint` on the changed files: 0 problems. `npx vite build` (temporary folder): builds, and the new CSS is in the bundle.
- `adminMonitoredCase.test.mjs` (2 of 15) and `adminLostPet.test.mjs` (1 of 26) have failing tests (the Barangay situation tile reads "None" where the test expects "Not asked"; a UTC time check). The files they test are not changed by this work.
- Not checked: how the trail looks on the real map (line weight, arrowhead size and position, the legend, the size of the area) and real Gemini-free data from a running case; the limits (12 hours, 25 m, 200 m, the speeds and radii) are judgement values to tune after real use.
