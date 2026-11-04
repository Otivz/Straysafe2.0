# Live Pinpoint Visibility and Bulacan GPS Accuracy Fix

- **Date:** 2026-11-03 20:26 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/utils/liveNavigation.ts`, `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdReports.tsx`, `docs/README.md`
- **Authorization:** Explicit developer request in session (`"fix it in pr-101"`) after reporting missing pinpoint visibility and incorrect TPLEX/NLEX routing from coarse desktop ISP geolocation on `/resident/reports/6`.
- **Type:** Fix

## Intent

Prevent desktop/wired-Ethernet browsers without hardware GPS from accepting coarse ISP IP gateway coordinates (e.g., Northern Luzon / Pangasinan / Metro Manila) that generate 150+ km TPLEX/NLEX routes to Santa Maria, Bulacan, and ensure the user's starting/live pinpoint and live Barangay Dispatch Team pinpoint are always clearly labeled and framed inside the map viewport.

## Key changes

- **Bulacan GPS plausibility & accuracy guard (`frontend/src/utils/liveNavigation.ts`):**
  - Added `checkLocalGpsFix()` verifying coordinate validity, proximity within StraySafe's Bulacan operating region (`MAX_LOCAL_ROUTE_DISTANCE_METERS = 30000` around Santa Maria, Bulacan), and street-level accuracy (`MAX_RELIABLE_GPS_ACCURACY_METERS = 2500`).
  - Added automatic `enableHighAccuracy: false` fallback when high-accuracy `watchPosition` times out in both `useLiveRoute` and `useDispatchBroadcaster`, ignored coarse ISP jumps during live navigation, and surfaced 403/400/coarse-GPS errors from `useDispatchBroadcaster`.
- **Pinpoint visibility & route/dispatch viewport framing (`frontend/src/components/MapComponent.tsx`):**
  - Upgraded `createUserLocationIcon()` with a prominent pill badge (`YOUR LOCATION` / `YOU ARE HERE` / `MY HOME` / `START PIN`) above the pulsing blue GPS beacon and used a full `<Marker>` for live navigation positions instead of an unlabeled 8px circle.
  - Added fallback start-pin rendering when a page activates routing without passing an explicit `User Location` marker.
  - Disabled `ChangeView` snapping while `routing` is active so route bounds are never overwritten by static midpoint/zoom updates.
  - Added `PinpointViewportControls` to auto-fit `[start, end]` when routes open, auto-fit `[dispatchPos, incidentPos]` once when a live `Dispatch Team` marker appears, and render quick-jump buttons (`My Pin`, `Fit Route`, `Live Team`) beneath the zoom controls.
  - Scoped marker React keys as `${marker.id}-${marker.category || markerIndex}` to prevent duplicate ID collisions.
- **Resident, Subdivision, and Barangay views (`ResiViewReport.tsx`, `SubdViewReport.tsx`, `BrgyReportView.tsx`, `BrgyRescueRequests.tsx`, `BrgyDashboard.tsx`, `SubdDashboard.tsx`, `SubdReports.tsx`):**
  - Applied `checkLocalGpsFix()` across live GPS route requests: Resident report view now opens the Bulacan starting-point selector (`From My Home`, `From Brgy HQ`, `Set Starting Point`) with an explicit explanation when coarse ISP location is detected; Subdivision and Barangay views cleanly fall back to Barangay Hall HQ with user notice instead of routing down TPLEX/NLEX.
  - Removed the broken midpoint `zoom={16}` override in `ResiViewReport.tsx` during active routing.
  - Fixed duplicate `id: -888` marker collision by assigning `id: -889` to `Pickup Location`.
  - Wired `useDispatchBroadcaster` error feedback, immediate local responder marker preview, and `canUpdateStatus` button gating in `BrgyReportView.tsx` and `BrgyRescueRequests.tsx`.

## Validation evidence

- Executed `node frontend/node_modules/typescript/bin/tsc -b frontend` on branch `pr-101` — exited with code `0` (zero TypeScript or unused-symbol errors).
- Verified `git diff --stat` across all modified files on `pr-101` while keeping `main` untouched.

