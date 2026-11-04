# Pickup Location GPS Sanity Checks (Check 1)

- **Date:** 2026-11-04 00:40 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-04_0040_pickup-location-gps-sanity-check.md`
- **Authorization:** User request to execute Check 1 from the Dispatched & Picked Up audit checklist ("Check 1: Add GPS Sanity Checks to Pickup Location Capture")
- **Type:** Fix

## Intent

Prevent coarse desktop/ISP IP-based browser geolocation estimates (such as gateway coordinates outside Bulacan or multi-kilometre accuracy circles) from overwriting `pickupLat` and `pickupLng` when Barangay staff click `"Use My Current Phone Location"` in the Status 6 (`Picked Up`) modal.

## Key changes

- **`frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` & `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`:**
  - Imported `BULACAN_REFERENCE_CENTER` alongside `checkLocalGpsFix` from `../../utils/liveNavigation`.
  - Wrapped the `navigator.geolocation.getCurrentPosition` callback in the Status 6 pickup location capture block with `checkLocalGpsFix(pos.coords, BULACAN_REFERENCE_CENTER)` and added `maximumAge: 0` to prevent stale cached geolocation fixes.
  - When `!check.reliable`, kept existing `pickupLat` / `pickupLng` untouched, cleared `isDetectingPickupGps`, and surfaced an explicit alert instructing staff to capture from an on-site mobile phone or select `"Same as Sighting Spot"`.
- **`docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`:**
  - Marked Check 1 and both of its sub-tasks complete (`[x]`).

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0`.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

