# Map integration in the Admin and Resident previews (development preview)

- **Date:** 2026-11-08 17:23 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/preview/geo.ts`, `frontend/src/preview/map/LocationMapPreview.tsx`, `frontend/src/preview/map/MapLegend.tsx`, `frontend/src/preview/map/ReadOnlyMap.tsx`, `frontend/src/preview/map/icons.ts`, `frontend/src/preview/map/map.css`, `frontend/src/preview/map/styles.ts`, `frontend/src/preview/map/types.ts`, `frontend/src/resident/components/Cards.tsx`, `frontend/src/resident/components/LocationMap.tsx`, `frontend/src/resident/components/LocationPicker.tsx`, `frontend/src/resident/config.ts`, `frontend/src/resident/data/reducer.ts`, `frontend/src/resident/data/seed.ts`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/lib/area.ts` (deleted), `frontend/src/resident/lib/location.ts`, `frontend/src/resident/pages/community/NoticePage.tsx`, `frontend/src/resident/pages/community/SightingHistoryPage.tsx`, `frontend/src/resident/pages/community/SightingPage.tsx`, `frontend/src/resident/pages/report/LocationPage.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/src/resident/styles/resident.css`, `frontend/src/admin/config.ts`, `frontend/src/admin/data/constants.ts`, `frontend/src/admin/data/seed.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-08_1723_preview-map-integration.md`
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Targeted Map Integration" (restore and integrate the essential map functionality into the approved Admin and Resident previews, reusing the existing mapping utilities, without redesign). It followed the read-only "Existing Map Functionality Inspection" the developer requested earlier in the same session. FREEZE was OFF.
- **Type:** Feature

## Intent

The approved previews could not show or choose a place on a map. The Resident location step was a stand-in with street and landmark suggestions that exist nowhere in the project's data, and its "inside the subdivision" test was a hand-copied polygon, not the radius rule the legacy server enforces. No other screen showed where anything happened. This change brings the essential map behaviour of the legacy portals into the previews, on sample data, without redesigning them and without showing exact positions in views that other residents can open.

## Key changes

- **Shared, development-only folder `frontend/src/preview/`**, imported only by `admin/` and `resident/`, so `vite build` drops it together with the previews. `geo.ts` holds the one copy of preview geography. `map/` holds the read-only map: `ReadOnlyMap.tsx` (loaded lazily through `LocationMapPreview.tsx`, with a skeleton), `MapLegend.tsx`, `icons.ts`, `styles.ts`, `types.ts` and `map.css`.
- **Reused from the legacy code, not copied:** `utils/coverageArea.ts` supplies the subdivision centre, the outline corners and style, the distance maths and the radius rule `isWithinCoverage`; `utils/geolocationDefaults.ts` supplies the GPS error wording (its geolocation defaults are already installed for every route by `main.tsx`); `components/MapControls/MapAutoResize.tsx` keeps maps correct inside bottom sheets and tabs. Leaflet, React Leaflet and the OpenStreetMap tiles are the existing ones. The legacy `MapComponent.tsx` is not imported. `utils/geocode.ts` was not reused because it sends a resident's coordinates to a third-party service. `LostPetTrackingMap.tsx` was not reused because it is tied to the API-backed `lostPets` types and its own popups; the previews use small icons coloured from the design tokens.
- **Reporting rule is the legacy radius rule.** A spot is accepted when it is within the reporting radius of the subdivision centre. The outline is drawn for orientation only and never accepts or refuses a report: a spot outside the outline but inside the radius is accepted, and a spot about 785 m from the centre is refused. The outline is labelled "Approximate subdivision outline" wherever it appears and is never called official or surveyed.
- **The radius is a labelled preview setting.** `PREVIEW_REPORTING_RADIUS_M = 500` in `preview/geo.ts`, shown on screen as "(a preview setting)". The database dump stores 500 m and the code default is 1,000 m; neither is confirmed as production. To connect the real value, make `previewCoverage()` return `await fetchCoverageArea()` (`GET /reports/coverage-area`). Nothing else changes.
- **Resident location picker (improved, not rebuilt):** the map opens on the whole reporting circle; tap to place the pin; drag the pin; optional "Use my current location" with accuracy feedback (a fix worse than 100 m asks the resident to drag the pin) and plain messages for blocked, unavailable, timed-out and non-secure-page cases; the approximate outline and the reporting circle are drawn; if tiles fail, a note appears and the overlays and typed description still work; the place is a typed description plus chips for the two registered landmarks. The invented streets, quick places and landmark list and the polygon test were removed (`resident/lib/area.ts` deleted). Confirming needs a pin inside the reporting radius. Where neighbours will read the place (lost and found reports, sightings) a few words describing it are required as well and are checked for phone numbers, emails and exact lot addresses; a private incident report does not need them.
- **Read-only maps** (pin or general area, approximate outline, legend, textual location kept): Resident report details (incident, lost pet, found animal), Resident review step, Resident lost and found notice details, Resident sighting history, and Admin case Overview.
- **Sighting history:** the last-seen place and numbered sightings (oldest is 1, most recent marked), a legend that tells last-seen from sightings, a "Not on the map" note for a sighting described only in words (it is never given an invented position), and the existing "not live tracking" wording. No routes, no real-time positions.
- **Privacy by viewer:** an exact position is shown only to the person who made the report (their own report, their own sighting) and, in the Admin preview, to administrators. Community notices and other people's sightings show a general area: the position rounded to 0.001° (about 110 m, the same rounding the legacy server applies for an owner's match card) with a 120 m circle that always contains the true spot. Private reports still never reach Community. The exact coordinates do not appear anywhere in the public notice page (checked in the HTML). The previews redact in their selectors; the real API has to do it.
- **Sample data:** `samplePoint(key)` gives deterministic sample coordinates inside the outline (25–60 m from a registered landmark when the place names one). Admin `Case.location` gains optional `lat`/`lng`; the Resident seed gives Mochi a last-seen spot, two exact sightings and one typed-only sighting, and the neighbours' notices rounded areas. `DATA_VERSION` of both previews is now 2, so sample state stored by an older build is replaced.
- **Admin notice editor:** location suggestions are now the two registered landmarks (rows 1 and 3 of the `landmarks` seed), not invented places.
- **Styling:** `map.css` uses only the existing design tokens, sits in the CSS layer order of the previews, and carries the few Leaflet overrides that must be unlayered (44 px zoom buttons). No colour, font, dependency or `package.json` change.

## How to test by hand

```
cd frontend
npm run dev          # http://localhost:5173
```

- **Resident** (use a phone-width window): `/resident-preview/welcome`, "Use the sample resident".
  - Report → Animal nuisance → fill the form → Continue: on the location step tap the map, drag the pin, use a landmark chip, try "Use my current location" (allow, then deny it in the browser), and tap well outside the circle to see the radius message.
  - My reports → `SS-2026-0161` (pin) and `SS-2026-0165` (lost pet): the compact map, with the text location kept.
  - Community → Mochi (your lost pet) → See sightings: exact spots, numbered, one sighting listed as "Not on the map". Then Luna (a neighbour's pet) → See sightings, and "Found: dog": general areas only.
- **Admin:** `/admin-preview/login`, "Sign in with the sample account", Cases, open any case: the Overview tab shows the map with its sample-coordinates note.
- `npm run dev:https` serves a self-signed HTTPS page at `https://<your LAN IP>:5173`, which a phone needs before its browser gives a GPS position.

## Deliberately not changed

- No backend, database, SQL, migration, `.env*`, dependency or `package.json` change. No commit or push. The untracked `straysafe_subdivision.sql` was not touched.
- No legacy file was edited. Under `frontend/src`, `git status` shows only `main.tsx` modified (by the earlier preview work), and nothing in the legacy portals or their map components changed.
- Out of scope and not built: heatmaps, live animal or responder tracking, routes, dispatch, boundary surveying, any new public location-sharing flow.

## Validation evidence

- `npx tsc -b` and `npx tsc -p tsconfig.app.json --noEmit`: no errors. `npx eslint src/preview src/resident src/admin src/main.tsx`: clean. The whole-project `npm run lint` already fails on legacy code (1,868 errors in 177 files this change does not touch); none of the files listed above has a finding.
- `npx tsc -b && npx vite build --outDir <scratch folder>`: succeeds (the chunk-size warning is the legacy `MapComponent`, unchanged). No `ResidentRoot-*.js` or `AdminRoot-*.js` chunk is emitted, and none of 41 markers (route bases, storage keys, sample credentials, sample data, preview-only copy and styles including the `pv-*` map classes, and the sample landmark names) occurs in any of the 214 files of the build. The same checker run on a development-mode build reports 63 problems, so the check can fail.
- Headless Chrome (DevTools protocol) against the dev server, no backend running, 482 checks, all passing:
  - New map checks (84): the overlays are present and the whole reporting circle is visible when the picker opens; tap, drag, landmark chip and GPS placement; a spot outside the outline but inside the radius is accepted and one about 785 m away is refused with the same rule everywhere; tile blocking leaves a note and the overlays; report details, review and notice maps; sighting history for the owner (exact) and for a neighbour (rounded, own sighting exact); a typed-only sighting is listed but not plotted; a found report with a pin shows exact to its reporter and a rounded area once published; exact coordinates are absent from the public notice HTML; Admin case maps lie inside the outline.
  - The existing Resident suites, re-run after this change: sign-in and sign-up 40, report journeys 68, community and claims 55, pets, profile and settings 57, UI states including GPS blocked, unavailable, timed out, non-secure page, outside the radius and accuracy 33, privacy guard and persistence 21, keyboard 15, hit areas 7.
  - Admin preview flows, unchanged: 102.
- Layout: all 31 Resident screens at 360, 390, 768 and 1280 px wide: no horizontal overflow and no console errors.
- Accessibility (automated, every Resident screen including those with maps, and the sheets): no missing names or labels, duplicate ids, heading or landmark problems, or contrast failures. The only items listed are the drawn size of the preview "Tools" link and the switches, whose hit area is 46 px (checked with real hit testing).
- Legacy routes (`/`, `/login`, `/admin/login`, `/staff/login`, `/brgy`, an unknown path, `/resident-home`, `/resident/*`) still render the legacy app with no page errors.
- Screenshots of the picker, report details, notices, sighting history and Admin Overview were reviewed against the existing screens.

## Known limitations

- The outline is four hand-picked corners (two are registered landmarks). There is no survey, plat or GeoJSON behind it. It is orientation only.
- 500 m is a preview setting. The production radius has to be confirmed (the dump says 500 m, the code default says 1,000 m) and then read from `GET /reports/coverage-area`.
- All coordinates are invented sample points. The two landmarks are copied from the database seed and should come from `GET /landmarks`.
- The general-area redaction happens in the previews' selectors. The real API has to return only rounded positions to community views. No endpoint does that for notices today; the legacy rounding exists only for an owner's match card.
- GPS was tested with a stubbed `navigator.geolocation` in headless Chrome. Real-device accuracy, the permission prompt and tile loading on a mobile network were not tested on hardware.
- There is no address search or reverse geocoding, so the place is typed or chosen from the two landmarks.
- Map tiles come from OpenStreetMap and need internet access. Without it the note appears and the overlays still draw.
- On a phone, one finger scrolls the page rather than panning the read-only maps; the sighting-history map can be zoomed with its buttons or a pinch.
