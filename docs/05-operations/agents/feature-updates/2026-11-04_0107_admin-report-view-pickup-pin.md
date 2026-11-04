# Render Pickup Location Pin in AdminReportView.tsx (Check 6)

- **Date:** 2026-11-04 01:07 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/pages/Admin/AdminReportView.tsx`, `docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-04_0107_admin-report-view-pickup-pin.md`
- **Authorization:** User request to execute Check 6 ("Check 6: Render Pickup Location Pin in AdminReportView.tsx")
- **Type:** Feature

## Intent

Surface the verified animal pickup location (`report.pickup_latitude`, `report.pickup_longitude`, `report.pickup_landmark`) on the Admin report map and Geographic Location card so administrators have full visibility into where an animal was captured even after admission into a Holding Facility.

## Key changes

- **`frontend/src/pages/Admin/AdminReportView.tsx`:**
  - Extended `ReportDetails` with `initial_latitude`, `initial_longitude`, `initial_landmark`, `pickup_latitude`, `pickup_longitude`, `pickup_landmark`, and `pickup_at`.
  - Imported `createPickupLocationIcon` from `MapComponent.tsx` and rendered the verified `Picked Up Location` marker (plus popup with landmark and exact coordinates) whenever `report.pickup_latitude` and `report.pickup_longitude` are valid, keeping the sighting origin distinct and applying a slight longitude separation (`+0.00014`) when pickup coordinates match the incident/sighting pin.
  - Added a summary badge above the map displaying the verified pickup landmark and coordinates when recorded.
- **`docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`:**
  - Marked Check 6 complete (`[x]`).

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0`.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

