# Heat map audit

- **Date:** 2026-10-27
- **Scope:** the incident heat map and hotspot list: Admin (`AdminHeatMap.tsx`), Barangay dashboard (`BrgyDashboard.tsx`), Subdivision Leader dashboard (`SubdDashboard.tsx`), and the shared layer (`HeatmapLayer.tsx`, `MapComponent.tsx`).
- **Method:** code reading, a read-only look at the status table and the backend closed-status list. The map was not opened in a browser.
- **Status:** Phase 0 decided and Phase 1 done on 2026-10-27 (rules in [HEATMAP_RULES.md](../../01-system/HEATMAP_RULES.md), change record [2026-10-27_0553_heatmap-rules-phase-1](../../05-operations/agents/feature-updates/2026-10-27_0553_heatmap-rules-phase-1.md)). Open: the Barangay and Leader map controls (Phase 2), browser and phone checks (Phase 3), document wording (Phase 4), and finding 11. No written heat map ruling existed before this audit, so the code was compared with what the documents promise (`docs/02-project/SYSTEM_PRESENTATION_FLOW.md` sections 4.2 and 5.4), the visibility rules in `docs/01-system/overview.md`, and the backend.

## What is implemented correctly

- Role scoping: Admin sees every report, Barangay staff only reports escalated to them, Subdivision Leaders their own. The server enforces report visibility for residents (`backend/app/routes/reports.py`, `resident_scope`), so private reports do not reach a resident's map. For staff the limits are only request parameters (finding 11).
- One point per incident on the admin map (`onePerIncident`): a group report is not counted once per animal.
- Reports without coordinates are skipped, and the layer drops non-numeric points.
- Points are weighted by priority (High 1.0, otherwise 0.6).
- Admin filters: date range, category, "untouched by staff", include resolved (hidden by default).

## Findings

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | The hotspot list counts all reports, ignoring the map's date, category and resolved filters. The map and the panel can disagree. | `AdminHeatMap.tsx` (`hotspots`, from `reports`) | High |
| 2 | The hotspot "trend" is not a trend: `count > 3 ? 'up' : 'stable'`, no comparison with an earlier period, "down" is never produced. Risk labels use fixed counts (5 or more is High) that were never approved. | `AdminHeatMap.tsx` (`hotspots`) | High |
| 3 | Hotspots are grouped by the free-text landmark, so spelling variants split one place into several; reports with no landmark are labelled "San Vicente". | `AdminHeatMap.tsx` (`countsByLandmark`) | Medium |
| 4 | The admin and leader maps treat status 6 (Picked Up) as closed; the backend closed list (`CLOSED_REPORT_STATUS_IDS` = 3, 9, 10, 11, 12, 14, 17, 18) does not. The map and the analytics disagree on active cases. | `AdminHeatMap.tsx`, `SubdDashboard.tsx` | Medium |
| 5 | The admin status-name fallback is off by one against the `report_status` table (for example 6 "Resolved", 9 "Impounded", 10 "Released"; the table says Picked Up, Claimed by Owner, Released). Used only when the server sends no name. | `AdminHeatMap.tsx` (`getStatusName`) | Low |
| 6 | Lost Pet reports (category 6) are included in "All Activity", so lost pets count toward stray density. | `AdminHeatMap.tsx` | Medium |
| 7 | The default view is the past 7 days with resolved cases hidden, which hides recurring spots. | `AdminHeatMap.tsx` (`datePreset`, `includeResolved`) | Low |
| 8 | The Barangay and Leader maps have no date or category filter and no hotspot panel; their rules for "active" differ from each other (Barangay: statuses 4, 5, 7, 8, 13 and escalated; Leader: not closed). | `BrgyDashboard.tsx`, `SubdDashboard.tsx` | Low |
| 9 | No test covers the heat map data rules. | `backend/tests`, `frontend/tests` | Medium |
| 10 | Documents claim "kernel density spatial clustering", "repeat aggressive animal encounters" and "rabies quarantine zones". The code uses the `leaflet.heat` radius layer, has no repeat-encounter calculation and no quarantine zones. | `SYSTEM_PRESENTATION_FLOW.md` 4.2, 5.4 | High for the defense |
| 11 | Found in Phase 0. `GET /reports/` returns every report to any staff account; a Leader's subdivision and a Barangay officer's barangay are only request parameters (`subdivision_id`, `barangay_id`) the dashboard sends. Logged, not fixed, by the developer's choice (fix after the defense). | `backend/app/routes/reports.py` (`get_reports`), `backend/app/utils/report_visibility.py` (`resident_scope`) | High (access control) |
| 12 | Found in Phase 0. When an animal moves to a facility, the report's coordinates become the facility's; the heat layer plotted the facility (reports #4 and #6 in the local data) instead of the original sighting. Fixed in Phase 1. | `backend/app/routes/holding.py`, the three maps | High |

## Checklist

### Phase 0: Decide the rules (before any code)

- [x] Active statuses: everything not in the backend's `CLOSED_REPORT_STATUS_IDS`, the same on all three maps. Pins show active reports; the heat layer counts valid incidents (all except Rejected 3, False Alarm 14, Merged 18), resolved included.
- [x] Picked Up (6) is active (finding 4).
- [x] Lost Pet reports are left out of the stray density by default; Admin can include them (finding 6).
- [x] Hotspot: 3 or more valid incidents within 50 m in the last 30 days; High Incident Density at 5 or more. Team-defined thresholds, not an approved standard; 50 m was chosen over 100 m because the service area is only about 400 m across (finding 2).
- [x] Default view: past 30 days; options 7, 30, 90 days, All Time and Custom Range (24 hours dropped). Resolved incidents always on the heat layer, resolved pins on request (finding 7).
- [x] Staff scoping gap (finding 11): logged, to be fixed after the defense.

Decided by the developer on 2026-10-27. Full rule table: [HEATMAP_RULES.md](../../01-system/HEATMAP_RULES.md).

### Phase 1: Make the numbers honest (smallest fixes)

- [x] Compute the hotspot list from the same category, untouched and lost-pet filters as the map, over the fixed 30-day window (finding 1).
- [x] Remove the fake trend (finding 2).
- [x] Replace invented risk labels with the agreed thresholds: Hotspot and High Incident Density.
- [x] Align the closed-status list with `CLOSED_REPORT_STATUS_IDS` for the pins and heat of all three dashboards (finding 4). The Barangay dashboard's "Picked Up" and "Resolved" counter cards still use their own lists.
- [x] Correct the status-name fallback to the `report_status` table names (finding 5).
- [x] Exclude Lost Pet from the stray density by default (finding 6).
- [x] Plot heat at the original sighting, never at a facility (finding 12).

### Phase 2: Better hotspots

- [x] Group hotspots by distance (50 m), not by landmark text (finding 3). Done in Phase 1 because the agreed threshold needs it.
- [x] Show the hotspot name as the most common recorded landmark within the group, or its coordinates.
- [ ] Apply the same filters and hotspot panel to the Leader map (finding 8). The Barangay map no longer has a heat layer (developer's decision, 2026-10-27), so it needs none.
- [ ] Add a legend that says what the colors mean (number of reports, High priority counts more). Admin done; Leader map not yet.

### Phase 3: Tests

- [x] Add tests for the active/closed rule, the Lost Pet exclusion and the hotspot grouping (finding 9): `frontend/tests/heatmapRules.test.mjs`, 12 tests, including one that compares the closed list with the backend file.
- [ ] Check at 360 px and desktop width in a browser: filter changes update both the map and the hotspot panel.
- [ ] Check on a real phone (GPS, two-finger gestures); not yet checked anywhere in the project.

### Phase 4: Documents and defense

- [ ] Reword the claims in `SYSTEM_PRESENTATION_FLOW.md` 4.2 and 5.4 to match the code, or build what they promise (finding 10).
- [x] Add the agreed heat map rules to `docs/01-system/` (statuses, weighting, hotspot definition): [HEATMAP_RULES.md](../../01-system/HEATMAP_RULES.md).
- [ ] Add heat map questions to `docs/02-project/DEFENSE_PLAN.md`: what the colors mean, what counts as a hotspot, who sees what.
- [ ] Write a change record for each fix and run `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.

## Suggested order

Phase 0, then Phase 1 (one afternoon), then Phase 4 wording (so the defense does not rely on unbuilt claims), then Phases 2 and 3 if time allows.
