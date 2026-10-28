# No marker or coordinate card when clicking the dashboard maps

- **Date:** 2026-10-27 09:01 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `docs/05-operations/agents/feature-updates/2026-10-27_0901_no-marker-on-map-click.md`
- **Authorization:** the developer's request "Also on the map when i click somehere i dont want to have a marker cause its nonsense".
- **Type:** Polish

## Intent

Clicking an empty spot on a dashboard map placed a pin or a coordinate card that had no use.

## Key changes

- Subdivision Leader dashboard (small map and expanded map): removed the orange "Selected Spot" marker and the floating coordinate pill with its Copy button.
- Barangay dashboard (three maps): removed the "Selected Location" / "Pinned Location" coordinate cards.
- Clicking empty map still closes an open report card (handled in `MapComponent`).
- Not changed: maps where clicking is how a place is chosen: the pet scan "found here" picker (`PetScanPage`), the lost-pet spot (`ResidentPet`), and moving a report pin or a route start (`ResiViewReport`). The Admin heat map had no click marker.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors (an icon import left unused, `MapPin`, was removed).
- Not checked in a browser.
