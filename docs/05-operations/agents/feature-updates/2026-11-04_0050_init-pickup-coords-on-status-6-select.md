# Initialize Pickup Coordinates on Dropdown Change to Status 6 (Check 3)

- **Date:** 2026-11-04 00:50 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-04_0050_init-pickup-coords-on-status-6-select.md`
- **Authorization:** User request to execute Check 3 ("In BrgyReportView.tsx: update <select onChange> so changing to nextId === 6 automatically populates pickupLat and pickupLng from activeDispatchLoc (if live) or report.pickup_latitude ?? report.latitude.")
- **Type:** Fix

## Intent

Ensure `pickupLat`, `pickupLng`, and `pickupLandmark` are never left `null` when Barangay staff switch the status modal `<select>` dropdown to `Picked Up (Animal Secured)` (`nextId === 6`) or when `openStatusModal` auto-advances `initialStatusId` to `6`.

## Key changes

- **`frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`:**
  - Added `seedPickupCoordinates()` to populate `pickupLat` and `pickupLng` from `activeDispatchLoc` (plus reverse-geocoded street landmark) when `activeDispatchLoc?.is_active` has valid coordinates, falling back to `report.pickup_latitude ?? report.latitude`, `report.pickup_longitude ?? report.longitude`, and `report.pickup_landmark || report.landmark || ''`.
  - Called `seedPickupCoordinates()` inside `<select onChange>` when `nextId === 6` as well as in `openStatusModal` whenever `initialStatusId === 6 || statusId === 6`.
- **`docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`:**
  - Marked Check 3 complete (`[x]`).

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0`.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

