# Incident map and hotspot rules

Status: Current. Verified against source, isolated tests and synthetic browser fixtures on 2026-10-30.

## Purpose and map views

Pins show cases needing action at the animal's current location. Heat shows where valid incidents were originally sighted, including incidents whose cases have since ended. These are different views of recorded incidents, not an estimate of the stray population or a validated risk prediction.

The Admin has pins/heat views, date/category/untouched filters, resolved-pin and lost-pet controls, and clickable hotspots. The Subdivision dashboard retains pins/heat/both with its priority filter and a trailing 30-day heat window. The Barangay dashboard uses actionable pins, including its expanded views, without a heat-layer toggle.

## Shared rules

Implementation: [heatmap.ts](../../frontend/src/utils/heatmap.ts). Closure authority: [case_closure.py](../../backend/app/utils/case_closure.py).

| Topic | Rule |
| --- | --- |
| Active cases | All report statuses except `3, 9, 10, 11, 12, 14, 17, 18`; merged report links are also inactive. Picked Up (`6`), Disputed (`15`) and Under Investigation (`16`) remain active. |
| Adoption compatibility | Existing terminal outcomes such as claimed/returned/released cases remain closed. No adoption routes, models, stage transitions or holding actions were removed. |
| Valid heat incidents | Exclude rejected, false-alarm and merged statuses (`3, 14, 18`), reports linked as duplicates, split child records and repeated rows with the same report ID. A group incident contributes through its root record. |
| Heat location | Use saved original coordinates. A legacy current pin may be used only while still at the sighting; a relocated animal without a saved origin contributes no heat point. Missing/invalid coordinates are not fabricated. |
| Pin location | Use the report's current coordinates; moving an animal does not move the historical heat location. |
| Resolved cases | Valid resolved incidents remain in heat. Admin's Resolved Pins control affects pin display only. |
| Lost pets | Category `6` is excluded from the incident maps by default. Admin may explicitly include it or select that category. |
| Priority weight | High priority weighs `1.0`; other priorities weigh `0.6`. |
| Dates | Admin defaults to a rolling 30 days, with 7/30/90 days, All Time and Custom Range. Custom dates include both Manila calendar days. Reversed/invalid ranges match nothing; future timestamps are excluded. Undated legacy records appear only under All Time. |
| Hotspots | At least 3 valid incidents within 50 m of a center incident during the trailing 30 days. At least 5 is labelled High Incident Density. These are team-defined thresholds, not an official standard. |
| Hotspot grouping | Choose a center with the most neighbors, form its group, then remove those incidents before selecting another group. Each incident belongs to at most one hotspot. The displayed point is the group's mean coordinates. |
| Hotspot filters | Apply the Admin category, untouched and lost-pet scope. The hotspot window stays at 30 days even when the map date filter differs. Clicking a hotspot centers the map and zooms to 18. |

The hotspot label uses the most common saved original landmark, falling back to coordinates. Density labels replace unsupported High/Medium Risk and invented trend labels.

## Interaction and access

Empty clicks on dashboard maps dismiss report cards without adding selection markers or coordinate cards. Report pins open their cards and have no selection ring or ordinary hover label. Location pickers, routes, live/user location, landmark labels and holding-location hover cards retain their functions.

The resident report page hides directions from a viewer whose server-provided access is `public`. Case participants, including an authorized adopter, retain directions. If access metadata is absent, only the reporter or matched pet owner receives the controls. This is UI behavior; it does not replace server authorization or conceal coordinates already returned by the API.

## Verification and limits

- 16 heatmap unit tests cover backend closure alignment, original sightings, invalid/duplicate/split records, weighting, date boundaries and hotspot thresholds.
- The existing 9 original-sighting tests pass.
- 14 synthetic browser scenarios at 390 and 1280 px cover Admin heat/pin filters and hotspots, Subdivision/Barangay maps and expanded views, pin cards, empty-click behavior and resident public/owner/adopter directions.
- The browser fixture answers API requests in memory and blocks backend/external network requests. It does not validate tile-provider availability, real GPS, native Android gestures or live data correctness.

See [Testing](../04-testing/README.md) for commands and the [restoration checklist](../06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md) for remaining phases.
