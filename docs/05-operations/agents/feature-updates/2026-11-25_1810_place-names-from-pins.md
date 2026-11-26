# Watch areas and hotspot zones: the place is named from the pins

- **Date:** 2026-11-25 18:10 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/preview/geo.ts`, `frontend/src/admin/lib/hotspots.ts`, `frontend/src/admin/lib/watchAreas.ts`, `frontend/src/admin/components/WatchAreas.tsx`, `frontend/src/admin/components/CasesMap.tsx`, `frontend/tests/adminWatchAreas.test.mjs`, `docs/01-system/HEATMAP_RULES.md`
- **Authorization:** Developer's request in the Claude Code session: "ibase mo sa pin hindi sa description ng place para mas accurate" (about the Watch areas card), then "continue".
- **Type:** Fix

## Intent

A watch area (and a hotspot zone on the maps) was named after the most common landmark text the reports typed, which is often vague ("Location not named", "near the corner") or differs between reports of the same spot. The places were already found from the pins; now they are also named from them.

## Key changes

- New `placeLabel(point)` in `preview/geo.ts`: the registered landmark nearest the point ("Near Selera Community Park & Clubhouse" within 80 m), else the distance and direction from the nearest one ("About 290 m north of ..."), else the coordinates when no landmark is registered. The landmarks are the server's (`GET /landmarks`, already loaded by the connected app), or the built-in ones before that.
- `hotspots.ts` names each zone with `placeLabel` of the zone's centre (the old most-common-text rule is removed); `watchAreas.ts`, the Watch areas card and the hotspot tooltip and popup on `CasesMap` use that name, so the dashboard card and the maps call one place the same thing. The name is never empty, so the "not named" fallbacks are gone.
- No backend, database or dependency change.

## Validation evidence

- `node --test tests/adminWatchAreas.test.mjs`: 14 tests pass (new: reports that typed "Near Gate 2" or "Location not named" with pins next to the Clubhouse are named "Near Clubhouse"; 300 m north gives "About 290 m north of Clubhouse"; 1.5 km east gives "About 1.5 km east of Clubhouse"; no landmark gives the coordinates). `tests/adminSightingTrail.test.mjs` still passes (8).
- `npx tsc -b`: no errors. `npx eslint` on the changed files: 0 problems.
- Not checked: the names with the subdivision's real landmarks in a running app. With few registered landmarks many places will read "About ... of <landmark>"; adding landmarks in Settings makes the names closer.
