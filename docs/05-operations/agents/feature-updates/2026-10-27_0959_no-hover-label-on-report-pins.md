# No hover label on report pins

- **Date:** 2026-10-27 09:59 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/MapComponent.tsx`, `docs/05-operations/agents/feature-updates/2026-10-27_0959_no-hover-label-on-report-pins.md`
- **Authorization:** the developer's answer "yeah nothing" (option D: no hover label) to the question of what the report pin label should show, after "i do not like the label of the marker" (screenshot of a pin labelled "PATCHED").
- **Type:** Polish

## Intent

Hovering a report pin showed the report's description summary. Without reporter notes that summary is the coat pattern (for example "Patched"), which meant nothing on a map. Tapping the pin already opens a card with the details.

## Key changes

- `MapComponent`: the hover label (marker `title`) is no longer shown for pins that carry a report (`rawData.report_id`), on every map.
- Kept: hover labels on pins that are not reports (Barangay HQ, "Your Location", route start), the holding facility hover card, and landmark labels. Report cards on tap are unchanged.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- Not checked in a browser.
