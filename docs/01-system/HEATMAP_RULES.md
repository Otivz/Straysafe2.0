# Heat map and hotspot rules

These are the rules the incident maps follow (Admin heat map, Subdivision Leader dashboard map, and the pins of the Barangay dashboard map, which has no heat layer since 2026-10-27). They were agreed on 2026-10-27 in Phase 0 of the [heat map audit](../03-development/audits/HEATMAP_AUDIT_2026-10-27.md). The code is in `frontend/src/utils/heatmap.ts`, and the tests are in `frontend/tests/heatmapRules.test.mjs`.

## Two layers, two questions

| Layer | Question it answers | What it shows |
|---|---|---|
| Pins | What needs action now? | Active reports, at the animal's current place (an animal in custody shows at the facility, in purple) |
| Heat and hotspots | Where do incidents happen? | Valid incidents, resolved included, at the original sighting |

## Rules

| Rule | Value |
|---|---|
| Active | Status not in 3, 9, 10, 11, 12, 14, 17, 18, the same list as `CLOSED_REPORT_STATUS_IDS` in `backend/app/utils/case_closure.py` (a test fails if they differ) |
| Picked Up (6) | Active: the case is still open |
| Valid incident (heat) | Every status except 3 Rejected, 14 False Alarm, 18 Merged duplicate |
| Plotted place (heat) | The original sighting (`initial_latitude`, `initial_longitude`). A report moved to a facility without a saved origin is left off the heat layer, never placed at the facility |
| One incident | Animal records of a group report are not counted separately |
| Lost Pet (category 6) | Left out of heat, pins and hotspots by default. Admin can include them; choosing the Lost Pets category shows them |
| Weight | High priority 1.0, other priorities 0.6 |
| Hotspot | 3 or more valid incidents within 50 m of a centre incident in the last 30 days |
| High Incident Density | 5 or more in the same group |
| Hotspot window | Always the last 30 days, whatever date range the map shows |
| Hotspot name | The most common recorded original landmark in the group, otherwise its coordinates |
| Trend | Not shown (no period comparison is computed) |
| Admin date range | Past 7 days, Past 30 days (default), Past 90 days, All Time, Custom Range |
| Leader map | Heat covers the last 30 days; no date selector yet |
| Barangay map | Pins only (active escalated reports); no heat layer, by the developer's decision |

The 50 m, 3 and 5 values are team-defined operational thresholds, not an official standard. The service area is a 200 m radius, about 400 m across: at 100 m almost every report fell into one group.

## Who sees what

Each map draws only the reports its dashboard loads: Admin all reports, Barangay staff reports of their barangay that were escalated to it, Subdivision Leaders their subdivision. Residents only receive reports they may see (the server enforces this). For staff, the subdivision and barangay limits are request parameters the dashboard sends; the server does not yet enforce them (finding 11 of the audit).

## Known limits

- The report list returns at most the newest 500 reports (`REPORTS_DEFAULT_PAGE_SIZE`), so very long ranges can miss older reports.
- Grouping is greedy: the incident with the most neighbours becomes a centre first. Two hotspots can lie next to each other, and members of one group can be up to 100 m apart.
