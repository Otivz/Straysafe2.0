# Incident map and hotspot rules

Status: Current. Verified against source, isolated tests and synthetic browser fixtures on 2026-10-30.

## Purpose and map views

Pins show cases needing action at the animal's current location. Heat shows where valid incidents were originally sighted, including incidents whose cases have since ended. These are different views of recorded incidents, not an estimate of the stray population or a validated risk prediction.

The Admin has pins/heat views, date/category/untouched filters, resolved-pin and lost-pet controls, and clickable hotspots. The Subdivision dashboard retains pins/heat/both with its priority filter and a trailing 30-day heat window. Retained legacy Barangay dashboard code uses actionable pins without a heat-layer toggle; the active Barangay portal is retired.

## Shared rules

Implementation: the frontend helper `frontend/src/utils/heatmap.ts` was removed on 2026-11-10 with the legacy Admin heatmap page (recover it from Git history if a 2.0 screen needs these rules); the 2.0 interfaces show no heatmap. Closure authority: [case_closure.py](../../backend/app/utils/case_closure.py).

| Topic | Rule |
| --- | --- |
| Active cases | All report statuses except `3, 9, 10, 11, 12, 14, 17, 18`; merged report links are also inactive. Picked Up (`6`), Disputed (`15`) and Under Investigation (`16`) remain active. |
| Adoption compatibility | Earlier terminal outcomes such as claimed/returned/released cases remain closed. Historical data/models remain readable; retired adoption and holding writes are gated off by default. |
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

## Subdivision report maps after Barangay retirement - 2026-11-06

The inline and expanded subdivision report maps no longer subscribe to responder-location updates or offer directions starting from a response team or the Barangay hall. Directions use the viewer's validated current GPS location. Unreliable, unavailable or denied GPS stops navigation with feedback instead of silently substituting another origin. The hall pin is retained as a geographic reference.

For an earlier status-5 report, the page may read its last recorded dispatch location once and display a Historical Dispatch marker. A saved active flag does not enable polling or a live/en-route claim. This marker is a historical reference, not the animal's current location or a response instruction. Actual sighting and custody coordinates remain independent. A historical holding marker requires recorded facility coordinates; the hall is not substituted when those coordinates are unknown.

Verification combines the targeted Phase 2 map-prop/route regression with the existing 14 real-Leaflet synthetic map scenarios. Real GPS/network routes and external responder systems were not exercised.

## Watch areas on the Leader's dashboard - 2026-11-25

A "Watch areas" card on the Subdivision Admin Dashboard (`frontend/src/admin/components/WatchAreas.tsx`, rules in `frontend/src/admin/lib/watchAreas.ts`) highlights a place where several reports came in within a short time, before it gets worse: for example "Watch area: Near Selera Community Park & Clubhouse · 4 reports in 14 days from 3 residents · up from 1 in the 14 days before". It is a pattern to look at, not a task and not a finding.

| Topic | Rule |
| --- | --- |
| Place | By how close the pins are, not by a street name (a report has no street, only a landmark text and a position): the same 70 m clustering as the hotspot zones on the 2.0 case maps (`lib/hotspots.ts`). The place is also **named from the pins** (`placeLabel` in `preview/geo.ts`), never from the landmark text the reports typed, which is often vague or differs between reports of one spot: "Near <landmark>" when the centre of the pins is within 80 m of a registered landmark, else the distance and direction from the nearest one ("About 150 m north-east of <landmark>"), and the coordinates when no landmark is registered. The hotspot zones on the maps use the same name. |
| What counts | Safety, injured and nuisance reports of the last 14 days, with a pin. Not a missing pet, a found animal or "other"; not a duplicate, a merged report, or one closed as invalid, duplicate or withdrawn (outcome group `invalid`); nothing dated in the future. |
| Watch area | At least 3 such reports, from at least 2 different people, with at least 1 still open. One household filing several complaints is not a pattern. A person is their resident account, else their name and the last 10 digits of their number (a report the Leader took down by phone). Closed cases still count in the number. |
| High | 5 or more reports, or an open urgent case among them. High places are listed first. |
| Trend | The reports within 70 m of the same place in the 14 days before the window ("up from 1", "none in the 14 days before"); nothing is said when it is not higher. |
| Shown | At most 3 places, the rest as "N more". Reports with no pin are not counted and the card says how many. With nothing to watch the card is not shown; there is nothing to dismiss, a place disappears when its cases close or age out. "Show on the map" goes to the dashboard map, whose hotspot zones show the open cases. |
| Privacy | Leader only. A nuisance complaint is private and a place with several can point at one household, so the card gives a place, counts by kind and the case links: never a name, a contact or what a complaint says. |

These are team-defined thresholds (14 days, 3 reports, 2 people, 5 for high, 70 m), not an official standard, to tune after real use. Tests: `frontend/tests/adminWatchAreas.test.mjs`.
