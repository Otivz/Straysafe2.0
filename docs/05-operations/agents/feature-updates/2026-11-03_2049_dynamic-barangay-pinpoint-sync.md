# Dynamic Barangay Pinpoint and Route Synchronization

- **Date:** 2026-11-03 20:49 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/utils/liveNavigation.ts`, `frontend/src/utils/coverageArea.ts`, `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-03_2049_dynamic-barangay-pinpoint-sync.md`
- **Authorization:** User request on local `pr-101` branch ("This should also be moving if im moving the pinpoint location of the brgy")
- **Type:** Fix

## Intent

Ensure that whenever a Barangay pinpoint moves — whether the Barangay HQ pinpoint is repositioned in Admin Settings, a Barangay Holding Facility pinpoint is moved in Barangay/Admin Settings, or the Barangay Dispatch Team live pinpoint moves during Status 5 (`Dispatched`, via mobile GPS or by dragging the `🚓 Dispatch Team` pin) — both the Barangay pinpoint marker and any active route (`From Brgy HQ` / `From hall` / destination to facility / live dispatch trajectory) dynamically move and recalculate across Resident, Subdivision, and Barangay views in the same browser and across separate browsers/devices.

## Key changes

- **`frontend/src/utils/liveNavigation.ts`:**
  - Updated `useLiveRoute` so non-GPS routes (`!live`, such as `From Brgy HQ`, `From My Home`, or custom dragged pins) update `routeStart` immediately whenever `routing.start` changes instead of waiting behind the 25 m / 15 s GPS throttle.
  - Enhanced `useDispatchBroadcaster` with faster 3 m / 3 s broadcast responsiveness, initial HQ fallback seeding when enabled on desktop without local Bulacan GPS, and `sendManualPosition(lat, lng)` so responders can drag the `🚓 Dispatch Team` pin on the map to broadcast live movement.
  - Reduced `useWatchDispatchLocation` polling interval from `5000ms` to `2500ms` for smoother cross-device pinpoint movement.
- **`frontend/src/utils/coverageArea.ts` & `frontend/src/components/MapComponent.tsx`:**
  - Added window-focus and `8000ms` visible-tab revalidation (with coordinate/signature change guards to avoid unnecessary re-renders) alongside `onFacilitySync` so Barangay HQ and Holding Facility pinpoint updates propagate across separate browsers and mobile devices (`localhost` ↔ LAN phone).
  - Rendered a dynamic road-following trajectory (`RoadRouteOverlay`) from the moving `🚓 Dispatch Team` pinpoint to the incident pinpoint when no manual turn-by-turn panel is open, and prevented clicking/dragging `Dispatch Team` from opening a report card sheet.
- **`frontend/src/pages/citizen/ResiViewReport.tsx` & `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`:**
  - Tracked `source: 'hq'` on Resident routes so active `From Brgy HQ` routes automatically follow live Barangay Dispatch coordinates (during Status 5) or updated `BRGY_OFFICE` coordinates without covering the `🏛️` HQ / `🚓` Dispatch pin with a duplicate blue user marker.
  - Dynamically updated route destinations whenever a report's Holding Facility pinpoint or incident coordinates move, and upgraded silent `onFacilitySync` + `8000ms` signature checks to cover status, incident, pickup, and facility coordinate changes.
- **`frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, & `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`:**
  - Replaced static module-level `BRGY_OFFICE_COORDS` in `BrgyReportView.tsx` and stale profile coordinates in `BrgySettings.tsx` with live `useBarangayHQCoords` tuples.
  - Enabled dragging the `🚓 Dispatch Team` marker while broadcasting on `BrgyReportView.tsx` and `BrgyRescueRequests.tsx` to push live responder coordinates to Resident, Subdivision, and Barangay maps, and linked `From hall` / `From Brgy HQ` routing to follow the live dispatch pinpoint when active.

## Validation evidence

- Ran `node frontend/node_modules/typescript/bin/tsc -b frontend` — passed with exit code `0` and zero TypeScript errors.
- Ran `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict` — passed strict documentation audit.

