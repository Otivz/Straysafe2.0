# Refine RoadRouteOverlay Endpoint in MapComponent.tsx (Check 5)

- **Date:** 2026-11-04 01:03 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/components/MapComponent.tsx`, `docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-04_0103_refine-dispatch-trajectory-endpoint.md`
- **Authorization:** User request to proceed to Check 5 ("proceed to check 5")
- **Type:** Fix

## Intent

Ensure the live blue dispatch trajectory (`RoadRouteOverlay`) and `PinpointViewportControls` connect the `🚓 Dispatch Team` pin to the actual target incident marker in `markers` rather than pointing to a generic town/subdivision `center` on overview dashboards or panned maps.

## Key changes

- **`frontend/src/components/MapComponent.tsx`:**
  - Added memoized `incidentTargetPos` that filters non-auxiliary incident pins from `markers`, prioritizing: (1) a marker matching `dispatchMarkerEntry`'s `report_id`, (2) an active Status 5 (`Dispatched`) incident marker, (3) the sole incident marker on single-report views, (4) the first incident candidate when `dispatchMarkerEntry` is present, and finally `center` as fallback.
  - Updated `<RoadRouteOverlay>` and `<PinpointViewportControls>` to use `incidentTargetPos` instead of `center`.
- **`docs/03-development/audits/DISPATCH_AND_PICKUP_AUDIT_2026-11-04.md`:**
  - Marked Check 5 complete (`[x]`).

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0`.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

