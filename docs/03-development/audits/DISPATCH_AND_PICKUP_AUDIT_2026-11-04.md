# Dispatched & Picked Up Module Audit & Action Checklist

**Audit Date:** 2026-11-04  
**Scope:** Live Dispatch Tracking (Status 5), Exact Animal Pickup Location (Status 6), Database Persistence, Cross-Portal Consistency (Resident, Subdivision, Barangay, Admin)  
**Branch:** `pr-101`  
**Status:** Completed — All 7 Checks Implemented & Verified

---

## 1. Executive Summary & Database Architecture

| Operational State | Database Table / Storage | Persistence Lifetime | Description |
|---|---|---|---|
| **Dispatched (Status 5)** | In-memory `dispatch_tracker` (`live_dispatch_tracker.py`) | Ephemeral (90-second heartbeat expiry) | Thread-safe in-memory store for active responder GPS pings (`POST /reports/{id}/live-location`). Prevents disk I/O inflation and database bloat from high-frequency (every 3s) GPS broadcasts. Automatically cleaned up on status transition to Picked Up (Status 6). |
| **Picked Up (Status 6)** | `status_history` table (`latitude`, `longitude`, `landmark`, `created_at`) + `reports` table | **Permanent Database Record** | Exact coordinates where the animal was physically secured into the vehicle. Even when the animal is subsequently transferred into a Barangay Holding Facility (Status 7/8), where `reports.latitude` changes to the facility compound, the capture spot is permanently preserved and returned via `pickup_latitude`, `pickup_longitude`, and `pickup_landmark`. |

---

## 2. Identified Bugs & Vulnerabilities

### 🔴 Bug 1: Coarse / Desktop ISP Geolocation Corrupting Pickup Coordinates
- **Severity:** High (Data Corruption)
- **Affected Files:**
  - `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` (lines 2876–2893)
  - `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx` (lines 2025–2042)
- **Problem:**
  The `"📍 Use My Current Phone Location"` button calls `navigator.geolocation.getCurrentPosition` without running `checkLocalGpsFix`. When clicked from a desktop/laptop or a mobile browser on a cellular connection resolving to an ISP gateway (e.g. TPLEX/NLEX 50 km away in Tarlac/Pangasinan), it silently sets `pickupLat` and `pickupLng` to the corrupted location without warning.
- **Root Cause:**
  Missing validation against `checkLocalGpsFix(pos.coords, BULACAN_REFERENCE_CENTER)`.

---

### 🔴 Bug 2: Dropdown Status Change in `BrgyReportView.tsx` Leaves Pickup Coordinates Null
- **Severity:** Medium (Workflow / Data Loss)
- **Affected File:**
  - `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` (lines 2601–2625)
- **Problem:**
  `pickupLat` and `pickupLng` are only initialized when the modal is opened specifically via `handleOpenStatusModal(6)`. If staff opens the status modal on an in-progress report (e.g. Status 5 or 13) and switches the `<select>` dropdown to `"Picked Up (Animal Secured)"` (value `6`), `pickupLat` and `pickupLng` remain `null`. If submitted without manually clicking one of the buttons, the backend payload contains no pickup coordinates.
- **Root Cause:**
  `<select onChange>` does not initialize `pickupLat` and `pickupLng` when `nextId === 6`.

---

### 🟡 Bug 3: Overlapping Duplicate Markers & Hidden Sighting Spot at Status 6 in Barangay Views
- **Severity:** Medium (UI / Map Accuracy)
- **Affected Files:**
  - `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` (lines 1743–1825, 3718–3799)
  - `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx` (lines 1627–1665)
- **Problem:**
  When a report transitions to Status 6, the backend updates `report.latitude` to `pickupLat`.
  `BrgyReportView.tsx` and `BrgyRescueRequests.tsx` define `isRelocated = [7, 8].includes(report.status_id)`. Because Status 6 is not 7 or 8:
  1. `isRelocated` evaluates to `false`.
  2. `hasDifferentInitialSpot` evaluates to `false`, causing the **initial sighting pin (`initial_latitude, initial_longitude`) to disappear completely from the map**.
  3. Marker `1` (`Animal Picked Up · Sighting`) is rendered at `[pickup_latitude, pickup_longitude]`.
  4. Marker `-889` (`Animal Picked Up Location`) is **ALSO** rendered at `[pickup_latitude, pickup_longitude]`.
  Result: Two markers are stacked on top of each other at the pickup location, while the origin spot is missing.  
  *(Note: `ResiViewReport.tsx` and `SubdViewReport.tsx` already handle this properly by keeping Marker 1 at `initLat, initLng` and Marker `-889` at `pickup_latitude, pickup_longitude`).*
- **Root Cause:**
  `isRelocated` logic does not distinguish between sighting origin and transit pickup spot on Status 6.

---

### 💡 Need of Action 4: Missing "Use Live Dispatch Pin Location" Quick Button
- **Severity:** Enhancement / Efficiency
- **Affected Files:**
  - `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`
  - `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`
- **Problem:**
  When field personnel are en route (Status 5) broadcasting their GPS (or have moved the `🚓 Dispatch Team` pin on the map to the animal's exact spot), `activeDispatchLoc` already holds their real-time coordinates. Currently, responders must re-acquire phone GPS or type street landmarks manually.
- **Solution:**
  Add a 1-click button: `"📍 Use Live Dispatch Team Location"` in the pickup coordinates section to immediately populate `pickupLat`, `pickupLng`, and reverse-geocode the street landmark.

---

### 💡 Need of Action 5: `RoadRouteOverlay` Endpoint Accuracy on Dashboards
- **Severity:** Minor / Visual Polish
- **Affected File:**
  - `frontend/src/components/MapComponent.tsx` (line 2096)
- **Problem:**
  The live blue road trajectory connects `start = [dispatchMarkerEntry.lat, dispatchMarkerEntry.lng]` to `end = center`. On overview dashboards where `center` is the town/subdivision center rather than the specific incident pin, the route line points toward the town center instead of the animal's location.
- **Solution:**
  If a target report marker exists in `markers`, route the trajectory to that report pin; fall back to `center` only when no report pin exists.

---

### 💡 Need of Action 6: Pickup Pin Visibility on Admin Report View
- **Severity:** Minor / Completeness
- **Affected File:**
  - `frontend/src/pages/Admin/AdminReportView.tsx` (lines 1395–1410)
- **Problem:**
  When an animal has been admitted into a holding facility, `AdminReportView.tsx` renders the holding facility compound pin but does not show the verified `pickup_latitude, pickup_longitude` marker where the animal was captured.
- **Solution:**
  Render the dedicated `Pickup Location` marker when `report.pickup_latitude != null && report.pickup_longitude != null`.

---

## 3. Implementation Checklist

- [x] **Check 1: Add GPS Sanity Checks to Pickup Location Capture**
  - [x] Update `BrgyReportView.tsx`: wrap `navigator.geolocation.getCurrentPosition` in `checkLocalGpsFix(pos.coords, BULACAN_REFERENCE_CENTER)` before setting `pickupLat` and `pickupLng`.
  - [x] Update `BrgyRescueRequests.tsx`: wrap `navigator.geolocation.getCurrentPosition` in `checkLocalGpsFix(pos.coords, BULACAN_REFERENCE_CENTER)` before setting `pickupLat` and `pickupLng`.

- [x] **Check 2: Add 1-Click "Use Live Dispatch Pin Location" Button**
  - [x] In `BrgyReportView.tsx`: add button to use `activeDispatchLoc.latitude` and `activeDispatchLoc.longitude` when `activeDispatchLoc?.is_active`.
  - [x] In `BrgyRescueRequests.tsx`: add button to use `activeDispatchLoc.latitude` and `activeDispatchLoc.longitude` when `activeDispatchLoc?.is_active`.

- [x] **Check 3: Initialize Coordinates on Dropdown Change to Status 6**
  - [x] In `BrgyReportView.tsx`: update `<select onChange>` so changing to `nextId === 6` automatically populates `pickupLat` and `pickupLng` from `activeDispatchLoc` (if live) or `report.pickup_latitude ?? report.latitude`.

- [x] **Check 4: Fix Overlapping Markers in Barangay Views**
  - [x] In `BrgyReportView.tsx` (both inline and fullscreen modal maps): keep Marker 1 at `initLat, initLng` (`Animal Sighting Spot`), and render Marker `-889` at `pickup_latitude, pickup_longitude` (`Picked Up Location`) without coordinate collisions.
  - [x] In `BrgyRescueRequests.tsx`: ensure Marker `viewingRequest.report_id` stays at `repInitLat, repInitLng` and Marker `-889` renders at `pickupLatVal, pickupLngVal`.

- [x] **Check 5: Refine `RoadRouteOverlay` Endpoint in `MapComponent.tsx`**
  - [x] Target the active incident marker in `markers` when drawing the dispatch trajectory; fall back to `center` if not present.

- [x] **Check 6: Render Pickup Location Pin in `AdminReportView.tsx`**
  - [x] Add the verified pickup location marker (`report.pickup_latitude`, `report.pickup_longitude`) on the Admin report map.

- [x] **Check 7: Full System Verification**
  - [x] Run `node frontend/node_modules/typescript/bin/tsc -b frontend` to verify zero type errors.
  - [x] Run `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` to verify documentation audit passes.

