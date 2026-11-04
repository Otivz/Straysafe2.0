# Fix Overlapping Sighting & Pickup Markers in Barangay Views (Check 4)

- **Date:** 2026-11-04 00:58 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-04_0058_fix-overlapping-barangay-pickup-markers.md`
- **Authorization:** User request to execute Check 4 ("Check 4: Fix Overlapping Markers in Barangay Views")
- **Type:** Fix

## Intent

Prevent the original `Animal Sighting Spot` marker from disappearing or stacking directly on top of Marker `-889` (`Picked Up Location`) at Status 6 (`Picked Up`) and Status 7/8 (`Holding Facility` / `Impounded`) in `BrgyReportView.tsx` (both inline and fullscreen modal maps) and `BrgyRescueRequests.tsx`.

## Key changes

- **`frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` (inline & fullscreen modal maps):**
  - Anchored Marker `1` at `initLat ?? sightingLat`, `initLng ?? sightingLng` with title `SIGHTING_TITLE` (`Animal Sighting Spot`) and `report.initial_landmark || report.landmark` whenever `!isRelocated` (including Status 6).
  - Rendered Marker `-889` (`Pickup Location`) at `pickup_latitude, pickup_longitude` with a small longitude separation (`+0.00014`) when pickup coordinates match the sighting origin within `0.00012` degrees, preventing pin stacking or suppression of `Initial Sighting` (`-999`).
- **`frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`:**
  - Restricted `isFac` to Status 7/8 (`rep?.status_id !== 6 && [7, 8].includes(rep?.status_id) && ...`) and anchored `currentLat, currentLng` (Marker `viewingRequest.report_id`) at `repInitLat, repInitLng` (`sightingSpotLat, sightingSpotLng`) whenever `!isFac`.
  - Rendered Marker `-889` (`Pickup Location`) at `pickupLatVal, pickupLngVal` with the same collision-avoidance offset when identical to the sighting spot.
- **`docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`:**
  - Marked Check 4 and both sub-items complete (`[x]`).

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0`.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

