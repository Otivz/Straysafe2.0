# No selection ring on the resident report page map

- **Date:** 2026-10-27 09:26 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `docs/05-operations/agents/feature-updates/2026-10-27_0926_no-selection-ring-on-report-page.md`
- **Authorization:** the developer's request "then remove the cirle in the marker in the http://localhost:5173/resident/reports/9" (with a screenshot of the orange ring around the report pin).
- **Type:** Polish

## Intent

The orange ring marks which pin a report card belongs to. A report page shows a single report, so the ring marked nothing.

## Key changes

- `MapComponent`: new prop `showSelectionRing` (default `true`) controls the ring drawn around the tapped pin.
- `ResiViewReport` (`/resident/reports/:id`): both maps (inline and expanded) pass `showSelectionRing={false}`.
- The ring stays on the dashboards and other maps with several pins.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- Not checked in a browser.
