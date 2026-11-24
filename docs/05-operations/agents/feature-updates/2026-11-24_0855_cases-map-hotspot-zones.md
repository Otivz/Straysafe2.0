# Cases map: Hotspot Zones overlay

- **Date:** 2026-11-24 08:55 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/lib/hotspots.ts`, `frontend/src/admin/components/CasesMap.tsx`
- **Authorization:** Developer's request in the Claude Code session to add a dynamic Hotspot Zones overlay to `CasesMap` so Subdivision Leaders can see high-density incident clusters on the Dashboard, Cases and Analytics maps.
- **Type:** Feature

## Intent

Show at a glance where cases pile up, without cluttering the individual pins and without any fixed hotspot places.

## Key changes

- `hotspots.ts` (new, pure): `computeHotspots(pinned)` groups the pinned cases it is given. Each case joins the nearest existing cluster whose centre is within 70 m (`distanceM` from `preview/geo.ts`), else starts a new one, and the centre moves to the average of its pins. Cases are taken in id order, so the result does not depend on the order they are passed in. A cluster of 2 or more cases is a zone. Radius grows from 45 m (2 cases) by 7 m per extra case up to 80 m. Amber for 2-3 cases; red for 4 or more, or when an open urgent case is inside (a closed urgent case does not turn it red). The area name is the most common `location.area` in the cluster.
- `CasesMap.tsx`: a "Hotspots (N)" toggle pill in the header bar, on by default while there are hotspots and disabled (with an explanation) when there are none. Translucent dashed `Circle` overlays are drawn after the coverage area and before the pins, so pins stay on top and clickable. Each zone has a tooltip and a popup with the area name, the case total and "urgent / open / closed". A "Hotspot" swatch appears in the legend while zones are visible.
- No page changes: the Dashboard, Cases and Analytics maps all render `CasesMap`, so they get it from the `cases` they already pass (the zones follow the filtered or period cases).

## Validation evidence

- `npx tsc -b`: no errors. `npx eslint` on `CasesMap.tsx` and `hotspots.ts`: 0 problems.
- The clustering was run on sample pins with Node: 3 cases within 40 m make one amber zone (52 m, "Clubhouse", 2 open and 1 closed); 2 cases with an open urgent one make a red zone; 4 cases make red at 59 m; 7 cases cap at 80 m; pins 75 m apart do not join while pins 60 m apart do; far-apart pins make no zone; reversing the input order gives the same zones.
- Not checked: the overlay in a running app (circle layering, tooltip and popup behaviour on the real map).
