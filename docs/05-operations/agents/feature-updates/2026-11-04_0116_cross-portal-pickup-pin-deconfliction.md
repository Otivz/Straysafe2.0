# Cross-Portal Pickup Pin Deconfliction & Live Seed Parity

- **Date:** 2026-11-04 01:16 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-04_0116_cross-portal-pickup-pin-deconfliction.md`
- **Authorization:** User verification check asking whether Bugs 1–3 are completely eliminated across the system ("is bug 1-3 completely gone?")
- **Type:** Fix

## Intent

Close two remaining cross-portal edge cases identified while verifying complete elimination of Bugs 1–3:
1. When an animal is picked up at `"Same as Sighting Spot"`, `ResiViewReport.tsx` and `SubdViewReport.tsx` passed identical coordinates for the sighting pin (`Initial Sighting` / `report_id`) and `Pickup Location` (`-889`), causing pin stacking at Status 6 or suppression of `-999` (`Initial Sighting`) at Status 7/8 inside `MapComponent.tsx`.
2. In `BrgyRescueRequests.tsx`, opening Status 6 (`openStatusUpdate`) while `activeDispatchLoc` was live for that report did not automatically prefer the live dispatch coordinates like `BrgyReportView.tsx` does.

## Key changes

- **`frontend/src/components/MapComponent.tsx`:**
  - Excluded `m.category === 'Pickup Location'` from suppressing `Initial Sighting` markers in `overlapsOtherMarker`.
  - Added automatic `+0.00014` longitude deconfliction on `Pickup Location` markers whenever another non-pickup marker in `markers` lies within `0.00012` degrees, ensuring Resident, Subdivision, and Barangay maps never stack the pickup pin on top of the sighting pin.
- **`frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`:**
  - Updated `openStatusUpdate` (`statusId === 6`) to prefer `activeDispatchLoc` (plus reverse-geocoded street landmark) when active for `reportId`, falling back to `rep.pickup_latitude ?? rep.latitude`.

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0`.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

