# StraySafe 2.0: map audit and improvements

**Date:** October 22, 2026
**Scope:** every map in the frontend (resident, subdivision leader, barangay staff, admin, public pages), plus the backend coverage-area (geofence) rules.
**Mapping stack (unchanged):** Leaflet 1.9, React-Leaflet 5, OpenStreetMap tiles, the public OSRM router, and the browser's location service. No new services and no new dependencies.

**Status:** 9 issues fixed and verified. They include a geofence bypass, cut-off maps on phones, page scroll trapped by maps, and location requests that could wait forever. Several further items are documented under section 6.

---

## 1. Inventory

**One shared component, [MapComponent.tsx](frontend/src/components/MapComponent.tsx), draws most maps.** It handles:
- report pins (each status colour) and holding-facility pins;
- the barangay hall, landmarks, the heatmap and the Selera Homes boundary;
- directions (OSRM) and live navigation (`utils/liveNavigation.ts`);
- the selected-report card.

**Supporting components:**
- [RoutingControl.tsx](frontend/src/components/RoutingControl.tsx): turn-by-turn directions.
- [HeatmapLayer.tsx](frontend/src/components/HeatmapLayer.tsx): the heatmap.
- `MapControls/ReturnToSeleraButton.tsx` and `MapControls/MapAutoResize.tsx`.

| Role | Page / component | Map type | What it shows |
|---|---|---|---|
| Subdivision leader | `SubdDashboard` (inline + expanded) | MapComponent | Incident map, heatmap, directions |
| | `SubdReports`, `SubdViewReport` (×2) | MapComponent | Report location, directions |
| | `SubdViewHistory` (×2), `SubdPetClaims` | MapComponent | Historical location, claim proximity |
| | `SubdProfile`, `SubdSettings` (×2) | Own Leaflet map | Home / station location picker |
| | `SubdReportModal` (×2) | Own Leaflet map | Report location picker (leader files a report) |
| Barangay staff | `BrgyDashboard` (phone, desktop, expanded) | MapComponent | Incident map, responders, hall |
| | `BrgyRescueRequests`, `BrgyReportView` (×2) | MapComponent | Dispatch, directions from me / from the hall, live navigation |
| | `BrgyViewHistory` (×2), `BrgyPetClaims` | MapComponent | History, claim proximity |
| | `BrgyProfile`, `BrgySettings` (×2) | Own Leaflet map | Station location picker |
| Admin | `AdminDashboard` (inline + expanded), `AdminHeatMap` | MapComponent | System-wide pins and heatmap |
| | `AdminReport` | MapComponent | Report location |
| | `AdminReportView` | Own Leaflet map | Report location |
| | `AdminAccountSettings` (×3) | Own Leaflet map | Coverage-area and landmark settings |
| Resident | `ReportStrayPage` (inline + expanded) | Own Leaflet map | **Report location picker with coverage circle** |
| | `ResiHomePage` (×2) | Own Leaflet map | Feed map |
| | `ResiViewReport` (×2) | MapComponent | Report location, directions |
| | `ResiProfile` (×3), `ResidentSettings` | Own Leaflet map | Home location picker |
| | `ResidentPet`, `PetMatchReview`, `PetClaimsDashboard` | Both | Pet sightings, match proximity |
| | `AnimalJourneyMap` | Own Leaflet map | Adoption journey |
| Public (no account) | `PetScanPage` | MapComponent | Finder pins where the pet was found |
| | `PetScanHistoryPage` | MapComponent | Scan history |
| Modals | `QRScannerModal`, `ResolveLostPetModal` | Own Leaflet map | Found location |

**Totals:** 53 maps in 33 files. 28 maps (18 files) use `MapComponent`; 25 maps (15 files) build their own Leaflet map, mostly location pickers.

**Duplication:** the location pickers repeat the same pattern in roughly 10 places: their own map, a tap-to-place pin and "use my location". They are not merged here; see section 7.

---

## 2. Findings

| # | Priority | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | **Geofence bypass.** `PATCH /reports/{id}` let a resident change `latitude`/`longitude` on their own unverified report without any coverage check. A report filed inside the area could be moved anywhere. | ✅ Fixed and tested |
| 2 | **High** | **Maps cut off in small boxes.** `MapComponent` forced a 360px minimum height, even inside boxes of 192–300px (dashboards on phones, `PetScanPage`, `PetMatchReview`, `SubdReports`, the claim maps…). The map was taller than its box: the centre and the pin sat low or out of view, and the map credit line was hidden. | ✅ Fixed and verified |
| 3 | **High** | **Maps trapped page scrolling on phones.** Inline maps took every one-finger swipe, so scrolling past a map on a dashboard dragged the map instead. | ✅ Fixed and verified |
| 4 | **High** | **Location requests could wait forever.** 21 of 26 `getCurrentPosition` calls set no time limit (the browser default is infinite). With GPS off or no signal, typical on Android, the page could stay on "locating" indefinitely. | ✅ Fixed |
| 5 | **High** | **The report picker was awkward on phones.** The pin couldn't be dragged. GPS errors appeared as browser `alert()` pop-ups with raw text. Nothing explained that location needs https. There was no confirmation when the pin was inside the area, and two "Expand Map" buttons. | ✅ Fixed (not run in a browser, see §5) |
| 6 | **Medium** | **The area shown didn't match the area enforced.** The server accepts reports within a **radius** of the configured centre (default 1,000m, admin-adjustable). The shared map drew only the fixed Selera Homes **outline** (about 300m across), so the real limit was invisible and admin radius changes never appeared on maps. | ✅ Fixed in MapComponent |
| 7 | **Medium** | **The selected-report card covered most of a phone map,** with stacked full-width buttons and tiny capital-letter text. The tapped pin wasn't highlighted. | ✅ Fixed and verified |
| 8 | **Medium** | **Invented phone number.** When the barangay hall record couldn't load, the map showed `(044) 123-4567`. | ✅ Removed |
| 9 | **Low** | **Misleading address fallback.** The picker's street address showed "Selera Homes" when the address lookup failed. | ✅ Fixed |
| 10 | Low | The hall is always loaded as barangay #1 (`/landmarks/barangay/1/hq`). Correct for the single-barangay pilot. | Documented |
| 11 | Low | Several pages (`ResiHomePage`, `SubdReportModal`, `AdminReportView`, `PetClaimsDashboard`) build their own maps and still draw only the fixed outline, not the coverage circle. | Documented |
| 12 | **High** | **Admin map: tapping a pin never showed the report.** The tap handler switched straight to "navigating", which drew a route from the hall and hides the card, so admins could never see a report's details or press View from the map. | ✅ Fixed and verified (found by the pin tests) |
| 13 | **High** | **Admin map: invented activity clusters.** With no reports, the map showed five made-up "clusters" (Selera Homes, "Subdivision B", "Subdivision C", "Riverside Villas", "Greenwoods") marked High / Low Activity. | ✅ Removed (an empty map now stays empty) |
| 14 | **Medium** | **Admin map on phones: the legend covered the View button.** The floating "Status Legend" box sat on top of the report card. | ✅ Fixed and verified (legend under the map on phones; under the card on larger screens) |
| 15 | **Medium** | **Directions covered small maps.** The turn-by-turn panel opened fully expanded, covering about two-thirds of a 300px phone map, with the "Selera Homes" button on top of it. | ✅ Fixed and verified |
| 16 | Low | A broken report photo fell back to a *person* placeholder instead of the pet placeholder. | ✅ Fixed |
| 17 | **Medium** | **A radius change took up to 30 minutes to show.** Maps kept the coverage area in a 30-minute cache that saving in Account Settings never updated, so the admin's own dashboard kept the old circle until a sign-out. | ✅ Fixed and verified |
| 18 | **Medium** | **Reports filed before a radius reduction couldn't be edited.** The resident edit form always sends the pin, even unchanged. Both the form and the server check from fix #1 rejected a report whose pin was now outside a smaller radius, so a resident couldn't even fix a typo. | ✅ Fixed and tested (only a *moved* pin is checked) |
| 19 | **Medium** | **A session that ended while someone was on a page left them stranded.** When the sign-in could no longer be renewed, the app cleared it but stayed on the page. On the barangay dashboard, every refresh then failed (37 failing requests in 36 seconds) until the person opened another page. | ✅ Fixed and verified (sent to sign in within seconds, with "Your session has ended") |
| 20 | **Medium** | **Three "use my location" buttons failed silently.** With location off or blocked, Admin → Barangay HQ "Use Current GPS" and both landmark "Snap to Current GPS" buttons did nothing at all. | ✅ Fixed and verified (one plain message on all six location buttons) |
| 21 | Low | **The admin map gave no sign that there were no reports.** The leader ("All clear") and barangay ("No recent incidents") dashboards did. | ✅ Fixed ("No active reports right now" under the map title) |
| 22 | **High** | **Things on the expanded maps sat on top of each other** (reported with a screenshot of the leader's expanded map): the legend covered the report card, a tapped pin's hover label (the whole report description) stuck open across the map, and the card's heading showed that description cut off. Also: the barangay "Pinned Location" box covered the zoom buttons, the barangay map had a legend twice plus a route banner over its controls, the directions panel opened top-right over the page controls, and the heat-map drawer and the card shared the bottom-right corner. | ✅ Fixed and verified at 360, 390, 768, 1024 and 1366px |
| 23 | **Medium** | **The report card took most of a phone map.** | ✅ Replaced on phones by a compact preview (about 125px) and a details sheet on request |

**Checked and found correct (no change needed):**

| Area | What was checked |
|---|---|
| Distance maths | The browser (`calculateDistanceMeters`) and the server (`calculate_distance_meters`) both use the haversine great-circle formula with R = 6,371km. |
| Coverage on create | Filing a report requires coordinates and enforces the configured radius (`is_inside_reporting_coverage`). |
| Radius settings | The admin radius is stored in `coverage_settings` and read on every check, and changes are audit-logged. Existing reports outside a newly reduced radius are not touched or deleted; the radius only applies to new and edited locations. |
| Private reports | Map data comes from `/reports/`, which the server already limits by role (`resident_scope`). The existing visibility tests pass 76/76. |
| Live navigation | `utils/liveNavigation.ts` stops GPS tracking when you leave the page (`clearWatch`) and limits route recalculation to every 25m or 15 seconds. Permission and lost-signal errors show in the bar. |
| Directions | The route is a road route from OSRM; the drawn line tries walking first, then driving, then a straight line, and every request is cancelled when the page changes. |
| Heatmap | Its map listeners are removed when the map closes. |
| Pin handlers | Created once per pin, so pins are not rebound on every render. |
| Landmarks and hall | Cached for 30 minutes. |
| Polling | Only the barangay dashboard polls (every 30 seconds, and only while the tab is visible). No map polls the location. |

---

## 3. Changes and root causes

### 3.1 Geofence bypass (Critical)
- **Root cause:** the edit endpoint filtered fields to `RESIDENT_EDITABLE_REPORT_FIELDS`, which includes `latitude` and `longitude`, but never re-checked coverage.
- **Fix** ([backend/app/routes/reports.py](backend/app/routes/reports.py)): when a resident's edit changes either coordinate, the new pair goes through the same `is_inside_reporting_coverage` check as filing. Outside the area, the server returns 400 with the same message, and nothing is saved.
- **Unchanged pin:** the pin is checked only when it actually moves (more than about 0.1m). The edit form always sends it, and a report filed before the admin reduced the radius must stay editable (finding 18). The resident's edit form follows the same rule.
- **Unchanged:** staff edits and the rescue status flow, which records where an animal was picked up.

### 3.2 Map fills its box ([MapComponent.tsx](frontend/src/components/MapComponent.tsx))
- **Root cause:** a fixed `minHeight: 360px`.
- **Fix:** a small hook (`useFitToParent`) measures the parent box. If the box is shorter than the map, the map fits it exactly; otherwise the 360px minimum stays, for boxes that size themselves to the map.
- **Second cause:** React-Leaflet's map container only reads its style once, when it's created. The map now always fills its wrapper, and the wrapper carries the size.

### 3.3 Two-finger map movement on phones
- **New:** a `CooperativeGestures` helper inside `MapComponent`. On touch devices, for maps shorter than 70% of the screen:
  - one finger scrolls the page;
  - two fingers pan and zoom the map;
  - a short hint appears: "Use two fingers to move the map".
- **Unchanged:** full-screen and expanded maps keep normal one-finger dragging, because the rule measures the map's height. This is the same convention embedded Google Maps uses.

### 3.4 Location request defaults ([utils/geolocationDefaults.ts](frontend/src/utils/geolocationDefaults.ts), imported in `main.tsx`)
- Every `getCurrentPosition` call now defaults to a **15-second time limit**, reuses a fix up to **30 seconds** old, and asks for **high accuracy**.
- Options a page passes itself still win, so the five calls that already set them behave as before.

### 3.5 Report location picker ([ReportStrayPage.tsx](frontend/src/pages/citizen/ReportStrayPage.tsx))
1. **The pin can be dragged** as well as tapped.
2. **"Use my location"** shows "Locating…" while it works. The result appears in the page with its accuracy, for example "accurate to about 12 m", plus a hint to drag the pin when accuracy is worse than 100m.
3. **Plain-language errors** replace the `alert()` pop-ups, one for each case: permission off, timed out, unavailable, not a secure https page, and no location support.
4. **A green confirmation** appears when the pin is inside: "Inside the reporting area · 140 m from the Selera Homes centre (limit 1000 m)". The existing red banner still explains the outside case.
5. **One Expand button** instead of two. The header now reads "Where was the animal? Tap the map or drag the pin to the exact spot."
6. **Address fallback:** "Street address not found (the pin location is still saved)" instead of "Selera Homes".
7. **Unchanged:** the coverage rule, the submit-time check and the server check.

### 3.6 The real reporting area on shared maps
- **Fix:** `MapComponent` reads `/reports/coverage-area` and draws:
  - the subdivision outline from the server;
  - a thin dashed green circle at the configured radius.
- **Tooltip:** "Selera Homes · reports accepted within 1,000 m of the centre".
- **Result:** an admin's radius change now appears on every shared map.
- **Keeping it current (finding 17):**
  - Saving in Account Settings writes the new area into the maps' cache, so that browser shows it at once.
  - Maps draw the cached area instantly and re-check the server at most every 5 minutes, with one request shared by all maps on the page. Other signed-in staff see a change within 5 minutes, with no sign-out.
  - If the server can't be reached, the last known circle stays (no reset to the 1,000m default).

### 3.7 Selected-report card and pin highlight
- **Pin:** an orange ring marks the tapped pin.
- **Card on phones:**
  - a smaller photo and normal-case text;
  - the address kept to one line;
  - the generic title and the landmark line hidden (the header already names the report);
  - the buttons in one row: "View" plus "Directions from me", or "From me" / "From hall" for barangay staff;
  - a height limit, scrolling if needed;
  - a 36px close button.
- **Measured on the subdivision dashboard:** the card dropped from 226px to 186px on a 298px map, and the pin stays visible above it.

### 3.8 Honest data
- The made-up hall phone number is removed from both fallbacks.

### 3.9 Admin map ([AdminDashboard.tsx](frontend/src/pages/Admin/AdminDashboard.tsx))
- **Tapping a pin** now opens the report card (details and View), like the other dashboards.
- **A route from the hall** is drawn only from the card's "From hall" button.
- **No invented clusters:** the fallback markers are removed.
- **Legend:** on phones it's a one-row legend under the map. On tablets and desktops it stays on the map but under the report card, so it can't cover View.

### 3.10 Directions on small maps ([RoutingControl.tsx](frontend/src/components/RoutingControl.tsx))
- **Maps under 420px tall (phones):** the step list starts folded (the routing button opens it).
- **A small pill** at the bottom of the map shows "781 m · about 2 min" with an **End** button.
- **Larger maps:** keep the full panel and its Cancel Route button.
- **If the route service fails,** the pill says "Route unavailable (check the connection)".
- **The "Selera Homes" button** is hidden while a route is shown (the map fits the route) and comes back after End.

---

### 3.11 Report card on phones, and nothing overlapping ([ReportMarkerSheet.tsx](frontend/src/components/MapControls/ReportMarkerSheet.tsx), [MapComponent.tsx](frontend/src/components/MapComponent.tsx))
- **One component for every map:** all report pins in the app go through the shared map's card, so the new card covers all 18 pages that use it. Landmark, hall and own-address pins keep their small labels.
- **Phones (under 640px), step 1:** a compact preview at the bottom of the map (about 125px): photo, report number, priority, status, short place, a close button, and "Tap or swipe up for details". It sits just above the map credit line. The map moves only if the selected pin would be hidden under it.
- **Phones, step 2:** tapping the preview or swiping up opens a bottom sheet (at most 88% of the screen; the content scrolls): the photo with a photo count, animal, category, location with coordinates, landmark, date, custody, reporter, observed conditions, then **View full report** and the directions the page allows. Swiping down, the handle, the backdrop or Escape go back to the preview; ✕ closes it; swiping the preview down closes it; tapping another pin switches it.
- **Privacy:** the sheet shows only what the old card showed, plus custody. It never shows the free-text description: on the pet-match page the pin is another person's report.
- **Larger screens:** the existing side card, unchanged in look. It now also moves the map if it would cover the selected pin.
- **Overlaps, fixed at the source:**
  - Pages tag their own map overlays (legends, picked-spot boxes) with `data-map-overlay="bottom"`. One CSS rule hides them while the card or the directions are showing on a map narrower than 640px.
  - The "Selera Homes" button hides while a card is open.
  - Long hover labels show only on devices with a mouse (on touch screens they stuck open after a tap), and every label is capped in width.
  - The leader's pins use the short description summary, as on the barangay and admin maps.
  - The directions panel moved to the bottom right, at most 55% of the map's height; maps under 640px wide use the compact pill.
  - Barangay: the second legend and the route banner are removed (the chips above the map and the directions panel already show them); the "Pinned Location" box moved off the zoom buttons.
  - Heat map: tapping a report or starting directions closes the analytics drawer.

## 4. Files changed

| File | Change |
|---|---|
| `backend/app/routes/reports.py` | Coverage check on resident coordinate edits (only when the pin moves) |
| `backend/tests/test_report_edit_auth.py` | 8 new coverage checks (4 for edits, 4 for a reduced radius) |
| `frontend/src/pages/Admin/AdminAccountSettings.tsx` | Saving the radius updates the maps' cache |
| `frontend/src/utils/coverageArea.ts` | Shared cache key for the coverage area |
| `frontend/src/pages/citizen/ResiHomePage.tsx` | Editing a report with an unchanged pin skips the coverage warning |
| `frontend/src/utils/api.ts`, `components/Auth/InactivityManager.tsx` | A session that ends while on a signed-in page goes to sign in, with a message (public pages are left alone) |
| `frontend/src/components/MapControls/ReportMarkerSheet.tsx` (new) | Phone preview + details sheet; shared report description for both cards |
| `frontend/src/index.css` | Page map overlays step aside for the card and directions on narrow maps |
| Subd/Brgy/Admin dashboards, Admin heat map | Overlays tagged; leader pin titles shortened; barangay duplicate legend and route banner removed; pinned-spot box moved; heat-map drawer closes for the card |
| `frontend/src/utils/geolocationDefaults.ts` + Admin Account Settings, Brgy/Subd Settings, Brgy/Subd Profile | One plain message when location fails (blocked / too slow / unavailable, "or tap the map") |
| `frontend/src/components/MapComponent.tsx` | Fit to box, two-finger gestures, coverage circle and server outline (re-checked every 5 minutes), pin highlight, compact card, no fake phone number |
| `frontend/src/pages/citizen/ReportStrayPage.tsx` | Draggable pin, GPS status and errors, inside-area confirmation, one Expand button, address fallback |
| `frontend/src/utils/geolocationDefaults.ts` (new) | Safe defaults for every location request |
| `frontend/src/main.tsx` | Loads the defaults |
| `frontend/src/pages/Admin/AdminDashboard.tsx` | Pin tap shows the card; route only on "From hall"; fake clusters removed; legend moved |
| `frontend/src/components/RoutingControl.tsx` | Compact distance/time pill with End on small maps |

The dashboard map layouts were reworked earlier the same day (subdivision map controls, barangay and admin phone layouts). This audit builds on them.

---

## 5. Tests performed

**Automated (backend, throwaway SQLite database)**

| Test | Result |
|---|---|
| `test_report_edit_auth.py`, including the new checks: moving a pin within the area is accepted; moving it about 5.5km away is refused (400) and the stored location is unchanged; changing only the latitude is also checked. **After the radius is reduced to 50m:** the reporter can still edit details with the pin unchanged; staff can still open and list the report; moving the pin is checked against the new radius | **36/36 passed** |
| `test_report_visibility.py` (private reports never reach other residents' lists or maps) | **76/76 passed** |
| `test_session_security.py` | **16/16 passed** |

**Type check and build:** `tsc` and `vite build` pass.

**Browser checks:** headless Chrome at phone size (390 × 844, touch enabled). The real dev server ran the subdivision, barangay and admin dashboards, with sample reports placed inside Selera Homes.

| Check | Before | After |
|---|---|---|
| Map height in a 300px box (subdivision, barangay) | 360px, bottom cut off, credit line hidden | **298px**, credit line visible |
| Admin dashboard map (480px box) | — | Fills the box (478px), 360px minimum kept |
| One-finger swipe on an inline map | Moved the map | **Map didn't move, page scrolled 83px, hint shown** (all 3 dashboards) |
| Tap a report pin (subdivision) | 226px card over a 298px map, no highlight | **186px card, orange ring on the pin** |
| Sideways page overflow at 320px and 360px (3 dashboards) | — | **None** (page width = screen width) |
| Location defaults installed | — | Yes on every page; a normal fix returns with its accuracy; "position unavailable" returns an error |
| **Small maps** (4 report-detail pages + public pet scan page, at 375 / 390 / 430px) | Pet scan map: 360px in a 192px box (pin low, cut off) | **21/21 checks at each width**: every map fits its box, credit line visible, pin centred, no sideways scrolling |
| **Pins and report card** (touch taps, 390px, sample reports with photos) | Admin: no card on tap; legend over View; directions covering the map | **Leader 15/15, barangay 23/23, admin 16/16 checks passed** |
| **Coverage radius** (sample server; Account Settings → 500m; another admin's change to 700m; server down; fresh barangay sign-in) | The saved radius showed only after up to 30 minutes or a sign-out | **16/16 checks passed:** circle measured at 1,000 → 500m right after saving (no extra request); 700m from elsewhere picked up after 5 minutes with one request; the last circle kept while the server is down; the report ~800m out still on the map |
| **Report card and overlaps** (7 maps: leader, barangay and admin dashboards, their expanded maps, admin heat map; sample reports incl. a "Picked Up" one with the long description from the screenshot) | Legend over the card, stuck description label, card covering most of a phone map | **Phones 154/154 at 390 and at 360px** (preview 125px inside the map, nothing overlapping it, selected pin visible, no stuck label, tap/swipe up opens the sheet, sheet on top and fits the screen, swipe down back, ✕ closes, another pin switches, View full report works). **Desktop and tablet 63/63 at 1366, 1024 and 768px** (side card, nothing overlapping, pin visible). Small-map pages 21/21; offline directions 4/4 |
| **Error cases** (sample server; leader, barangay and admin) | Session end: stayed on a failing page. Three GPS buttons: no reaction. Admin map: no empty-state note | **All checks passed** (empty data 15/15; slow connection 12/12; signed out 7/7; GPS off 18/18; directions offline 4/4). Details: <br>• No reports: maps and circle shown, no NaN/undefined, an empty message on every dashboard <br>• Slow 3G + server answering after 4s: something on screen within 1s, then pins and tiles arrive <br>• Session ended on the dashboard: sent to sign in after 4s with "Your session has ended"; a public pet scan page with an old sign-in stays put <br>• Location blocked: all 6 location buttons show a message, none stuck on "Locating…" <br>• Routing server unreachable: "Route unavailable (check the connection)", End still closes it |

**Not tested here:**
- **A real Android phone or the Capacitor APK:** two-finger panning and GPS on real hardware.
- **The report wizard's step 6 picker in a browser:** reaching it needs a photo upload and the AI check, so it was only type-checked and reviewed.
- **The 15-second time limit:** the browser emulator reports "unavailable" immediately and can't simulate a GPS that never answers.
- **Rotation, slow networks, tile-server outages, and the individual pages outside the three dashboards** (report views, history, claims, scan pages, profile/settings pickers). They use the same `MapComponent` fixes, but each page wasn't opened.

---

## 5a. Test checklist

Ticked ✅ = verified in this audit (automated test or headless browser). Unticked = still to check, mainly on a real phone, in the APK, or on pages not opened here. Test at **320, 360, 375, 390 and 430px**, plus desktop.

### Geofence (Selera Homes coverage)
- [x] Filing a report outside the radius is refused by the server
- [x] Editing your own report to move the pin outside the radius is refused (400), and the location is unchanged
- [x] Moving the pin within the radius is accepted
- [x] Changing only the latitude (or only the longitude) is also checked
- [x] Admin changes the radius in Account Settings → the green dashed circle on the dashboard maps changes size (right away in the same browser; within 5 minutes for others already signed in)
- [x] Report picker: the pin inside shows "Inside the reporting area · N m…"; outside shows the red banner, and Next is blocked
- [x] The "Reset pin to Selera Homes centre" button moves the pin back inside
- [x] Reports filed before a radius reduction still open normally (nothing is deleted or hidden), and the reporter can still edit details without moving the pin
- [ ] On a phone: the resident edits an old report outside a reduced radius (unchanged pin) → saves without the "Outside Coverage Area" warning (server side tested; the edit form was type-checked, not clicked through)

### Map size and layout (phones)
- [x] Dashboard maps fit their box (no cut-off bottom, map credit line visible): subdivision, barangay, admin
- [x] No sideways page scrolling at 320px and 360px on the three dashboards
- [x] No sideways scrolling at 375, 390 and 430px (the 4 report-detail pages and the pet scan page)
- [x] Small maps fit their box, with the credit line visible: pet scan page (192px map, after "Continue as guest" → "Share GPS"), at 375 / 390 / 430px
- [ ] Small maps fit their box: Pet Match Review (260px), Subdivision Reports details panel (256px), the claim maps, Resident Pet (220px)
- [x] Report detail pages (resident, leader, barangay, admin): each map fits its box, shows the credit line and is centred on the sighting pin, at 375 / 390 / 430px (21/21 checks at each width)
- [ ] Rotating the phone: the map resizes, with no grey area
- [ ] Opening the expanded / full-screen map: it fills the screen, with no grey area
- [ ] Map controls don't sit under the top bar or the bottom navigation

### Touch gestures (phones / APK)
- [x] A one-finger swipe on a dashboard map scrolls the page; the map doesn't move (headless touch emulation)
- [x] The "Use two fingers to move the map" hint appears on a one-finger swipe
- [ ] Real phone: two fingers pan and pinch-zoom the map
- [ ] Real phone: the hint disappears after about 1.5 s
- [ ] Expanded / full-screen maps: one finger drags the map normally
- [x] Tapping a pin, a landmark or the + / − buttons still works with one finger (emulated touch, all three dashboards)

### Pins and the report card
Verified on the leader, barangay and admin dashboards, their expanded maps and the heat map, at 360/390px (touch) and 768/1024/1366px (mouse).
- [x] Tapping a report pin opens the card and puts an orange ring on the pin
- [x] Phones: a compact preview (about 125px) opens, with the tapped pin kept visible above it
- [x] Phones: tap or swipe up → details sheet; swipe down / handle → back to the preview; ✕ closes; swipe the preview down to close it
- [x] Tapping another pin switches the card
- [x] Nothing else on the map overlaps the card (legends, chips, zoom, directions, map credit), at every width tested
- [x] No hover label stays stuck open after a tap on a phone
- [x] The card shows the photo, the category, the status, the address and the time
- [x] View → leader: opens `/subd/reports/<id>`; barangay and admin: open the dashboard's case-details pop-up
- [x] Barangay: "From me" and "From hall" both draw a route
- [x] On a phone map the route shows a small distance/time pill (steps folded), and End removes the route
- [x] The "Selera Homes" button is hidden during a route and back after End; it re-centres the map
- [x] The ✕ closes the card and removes the ring
- [x] Tapping an empty part of the map closes the card
- [x] The hall pin (barangay, admin) and the holding-facility pin (leader, admin) don't open the report card
- [ ] View from the resident report page map (`ResiViewReport`) and other report-detail maps
- [ ] Real phone: the same taps and swipes with a finger (and the Android back button while the sheet is open)

### Report location picker (resident → Report a Stray → step 6)
Verified with an automated walk through the wizard (photo → steps 1–5 → step 6 → submit) in headless Chrome at **360px and 390px** (22/22 checks at 390px; 21/21 at 360px before the last check was added). GPS was emulated, and API calls, photo upload and address lookup got sample answers.
- [x] Tapping the map moves the pin
- [x] Dragging the pin moves it, and the coordinates update
- [x] "Use my location" moves the pin to the GPS position and shows "Location found (accurate to about N m)"
- [x] Accuracy worse than 100 m shows the "drag the pin to the exact spot" hint
- [x] Location permission denied → a plain message, no pop-up, and the pin can still be placed by tapping
- [x] GPS unavailable → a plain "not available right now" message
- [x] Plain-http page → "only on a secure (https) page" (simulated in the browser; the dev server is https)
- [x] No browser pop-ups from the location button
- [x] After moving the pin by hand (tap / drag / reset), the old GPS message disappears
- [x] Only one Expand button; Expand opens the full-screen picker, and closing it keeps the pin
- [x] When the address lookup fails, the street-address field shows the pin's coordinates (no invented "Selera Homes")
- [x] No sideways scrolling at 360px and 390px
- [x] The report is submitted with exactly the chosen coordinates
- [ ] Real phone: "Use my location" on actual GPS; the permission prompt; accuracy outdoors
- [ ] Real phone with GPS turned off: the message appears within 15 s (the emulator can't simulate a GPS that never answers)
- [ ] After submitting, the report page shows the pin in the same place (checked only up to what is sent to the server)
- [ ] Inside the APK

### GPS and directions
- [x] Location requests have a time limit (defaults installed on every page)
- [x] A normal location fix comes back with its accuracy
- [x] Profile / settings "use my location" buttons explain the problem when location is blocked (all 6)
- [ ] On a phone: with GPS switched off (not blocked), the same buttons give up within 15 s (the emulator can't fake a GPS that never answers)
- [ ] Barangay live navigation: the blue dot follows you, the remaining distance and time update, and "arrived" shows at the spot
- [ ] Leaving the page during navigation stops GPS (the phone's location icon goes away)
- [x] With no internet: the directions pill says "Route unavailable (check the connection)", End still closes it, and the page doesn't crash

### Privacy and roles
- [x] Other residents' private reports never reach a resident's list or map (visibility tests 76/76)
- [ ] Resident home map: only your own reports and public ones appear
- [ ] A Subdivision Leader's map shows only their subdivision's reports

### Error cases
- [x] No reports at all: the dashboard maps show the area without errors, and each dashboard says so ("All clear…", "No recent incidents", "No active reports right now")
- [x] Slow connection (Slow 3G, server answering after 4s): the maps load gradually, with no blank page
- [x] Signed out while on a map page: you're sent to sign in (with a message), with no crash, even without tapping anything

### Capacitor app (APK)
- [ ] The location permission prompt appears the first time, and "Use my location" works after allowing it
- [ ] The map tiles load inside the app
- [ ] One-finger page scroll and two-finger map movement both work inside the app

## 6. Remaining limitations
1. **The 25 custom-built maps** (profile and settings pickers, the resident feed map, report modals, scan modals) don't get the two-finger gestures, the fit-to-box sizing or the coverage circle, because they don't use `MapComponent`.
2. **One barangay:** the hall lookup assumes barangay #1. This needs changing before a second barangay is added.
3. **Public map services:** directions use the free public OSRM server and tiles come from `tile.openstreetmap.org`. Both have fair-use limits and no guaranteed uptime. If routing fails, the dashboard directions say "Route unavailable (check the connection)" instead of drawing a route; the report-view route line falls back to a straight line. There's no message for a tile outage beyond grey tiles.
4. **No clustering:** at pilot volume (dozens of pins) pins stay readable. Hundreds of reports in one area would overlap.
5. **Leaflet pop-ups:** the hall and landmark pop-ups are still Leaflet pop-ups (small, auto-panned). Only report pins use the bottom card.
6. **Resident home page radius:** the resident feed's edit form loads the radius once when the app opens, so a change made while a resident has the app open applies to their form after reopening it. The server always checks the current radius, so nothing outside the area gets through.
7. **Secure page needed:** browsers allow location only on secure pages (https or localhost). On a phone opening the plain-http dev address, "Use my location" now explains this instead of failing silently.

## 7. Recommended next steps
1. **A shared `LocationPickerMap` component** with the draggable pin, GPS status, coverage circle and inside/outside message, used by the report wizard, the report modals and the profile/settings pickers. That removes about 10 near-copies and brings the phone fixes to all of them.
2. **The same coverage circle on `ResiHomePage`** so residents see the real reporting area.
3. **A tile-error notice** ("Map tiles unavailable, check your connection") when several tiles fail to load.
4. **Marker clustering** (`leaflet.markercluster`) if report volume grows. This needs a new dependency.
5. **Real Android testing** of two-finger panning, GPS permission prompts and accuracy in the Capacitor APK.
