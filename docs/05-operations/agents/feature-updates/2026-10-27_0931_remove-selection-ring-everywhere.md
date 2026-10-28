# Selection ring removed from every map

- **Date:** 2026-10-27 09:31 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `docs/05-operations/agents/feature-updates/2026-10-27_0931_remove-selection-ring-everywhere.md`
- **Authorization:** the developer's request "Also with the other maps remove the circle appearing in the marker".
- **Type:** Polish

## Intent

Follows `2026-10-27_0926_no-selection-ring-on-report-page.md`, which turned the ring off on the resident report page only. The developer wants it gone on every map.

## Key changes

- `MapComponent`: removed the orange ring (`CircleMarker`) drawn around a tapped report pin, and the `showSelectionRing` prop added in the previous change.
- `ResiViewReport`: the two `showSelectionRing={false}` props are removed again, so the file is back to its earlier state.
- Unchanged: tapping a pin still opens its report card; the blue pulsing "your location" dot and the live route position dot are not selection rings and stay.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- Not checked in a browser.
