# Heat map rules (Phase 0 decisions, Phase 1 fixes)

- **Date:** 2026-10-27 05:53 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/utils/heatmap.ts`, `frontend/tests/heatmapRules.test.mjs`, `frontend/src/pages/Admin/AdminHeatMap.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `docs/01-system/HEATMAP_RULES.md`, `docs/03-development/audits/HEATMAP_AUDIT_2026-10-27.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-27_0553_heatmap-rules-phase-1.md`
- **Authorization:** the developer's Phase 0 rule list for the heat map audit, then the answers "1. 50m" and "2. 7 days, 30 days (the default), 90 days, All Time and Custom Range". The staff scoping question was not answered; it was logged rather than fixed, as recommended.
- **Type:** Fix

## Intent

Make the heat map and hotspots follow one agreed set of rules on all three maps: active reports match the backend's closed list, the heat layer shows where incidents were first sighted, and hotspots use a stated distance and count instead of landmark text and invented labels.

## Key changes

- New `utils/heatmap.ts`: the closed and invalid status lists, the original-sighting point (via `getReportSighting`), lost-pet exclusion, priority weight, date presets, and hotspot grouping (3 or more valid incidents within 50 m in the last 30 days; 5 or more is High Incident Density).
- Admin heat map: hotspot panel follows the category, untouched and lost-pet filters; fake trend and "High/Medium Risk" labels removed; clicking a hotspot centres the map on it; date options 7, 30 (default), 90 days, All Time, Custom (24 hours removed); "Active Only / Inc. Resolved" became "Resolved Pins: On/Off" because the heat layer always counts resolved incidents; new "Lost Pets: Excluded/Included" switch; status-name fallback corrected to the `report_status` names; Picked Up (6) is active and purple; legend explains the heat layer.
- Barangay dashboard: active pins use the backend closed list (Picked Up, Disputed and Under Investigation now show); heat covers escalated incidents of the last 30 days, resolved included, one per incident, at the original sighting.
- Subdivision Leader dashboard: closed list aligned (Picked Up is active, which also changes the active counts on that dashboard); heat covers the last 30 days, resolved included, at the original sighting, with the priority filter.
- Heat used to plot animals in custody at the facility (reports #4 and #6 locally); it now uses the saved original sighting and leaves out a moved report that has none.
- Docs: rules page `docs/01-system/HEATMAP_RULES.md`; audit updated with the decisions, findings 11 (staff scoping, logged) and 12 (facility location, fixed), and ticked checklist items.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- `node --test tests/heatmapRules.test.mjs tests/originalSighting.test.mjs`: 21 passed, 0 failed (12 new tests, one compares the closed list with `backend/app/utils/case_closure.py`).
- The rules run against the local database (10 reports): active pins #4, 6, 8, 9, 10; 9 valid heat incidents; one High Incident Density hotspot of 5 (#2, 3, 6, 8, 9).
- Not checked: the three maps in a browser or on a phone. Not changed: the Barangay "Picked Up" and "Resolved" counter cards, and the backend staff scoping (finding 11).
