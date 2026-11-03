# Global Facility and Map Synchronization Across All User Roles

- **Date:** 2026-11-03 14:47 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `backend/app/routes/landmarks.py`
  - `backend/app/utils/landmark_cache.py`
  - `backend/app/routes/reports.py`
  - `backend/app/routes/rescue.py`
  - `backend/tests/test_facility_and_map_sync.py`
  - `frontend/src/utils/cache.ts`
  - `frontend/src/utils/coverageArea.ts`
  - `frontend/src/components/MapComponent.tsx`
  - `frontend/src/pages/Admin/AdminAccountSettings.tsx`
  - `frontend/src/pages/Admin/AdminReportView.tsx`
  - `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`
  - `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`
  - `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`
  - `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`
  - `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`
  - `frontend/src/pages/Subd_Leaders/SubdSettings.tsx`
  - `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`
  - `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`
  - `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`
  - `frontend/src/pages/citizen/ResiViewReport.tsx`
  - `frontend/src/pages/citizen/ResidentPet.tsx`
  - `docs/README.md`
  - `docs/05-operations/agents/feature-updates/2026-11-03_1447_global-facility-and-map-sync.md`
- **Authorization:** Explicit developer request in session (`STRAYSAFE — Fix Global Facility and Map Synchronization Across All User Roles`)
- **Type:** Fix

## Summary of Changes

1. **Root Cause Resolution — Authoritative Database Source of Truth:**
   - Updated `backend/app/utils/landmark_cache.py` so `get_landmarks_map(db)` queries active (`Landmark.status == 'Active'`) landmarks directly from the current database session and `invalidate_landmarks_cache()` clears in-memory state immediately.
   - Updated `backend/app/routes/landmarks.py` to:
     - Validate latitude (`-90 <= lat <= 90`) and longitude (`-180 <= lng <= 180`) on landmark creation, landmark updates, and Barangay HQ updates.
     - Automatically synchronize active reports (`_sync_facility_reports`) referencing an updated holding facility AND re-link active Barangay-custody reports whose `facility_id` was `NULL` after an earlier facility record was replaced (fixing Report #8 in the live database to point to `landmark_id = 6` at `14.80742652, 121.00941537`).
     - Cleanly detach reports and `StatusHistory` foreign keys when a holding facility or landmark is deleted (`DELETE /landmarks/{landmark_id}`), restoring original incident sighting coordinates on detached subdivision reports while preserving all historical report, rescue, and holding records.
   - Updated `populate_location_and_facility_info` in `backend/app/routes/reports.py` and `_populate_rescue_fields` in `backend/app/routes/rescue.py` so in-custody reports always return the current active facility's `latitude`, `longitude`, and `name` rather than only updating when `rep.latitude == rep.initial_latitude`.

2. **Cross-Role & Cross-Tab Frontend Cache Invalidation and Live Revalidation:**
   - Added `invalidateCacheAcrossScopes`, `broadcastFacilitySync`, and `onFacilitySync` in `frontend/src/utils/cache.ts` using `localStorage` storage events, `BroadcastChannel('straysafe_facility_sync')`, and window custom events to purge `straysafe_landmarks` and `straysafe_brgy_hq` across all user scopes and tabs whenever Admin, Barangay, or Subdivision settings add, edit, or delete a landmark/facility or update Barangay HQ.
   - Added `syncSanVicenteHQ`, `fetchBarangayHQCoords`, and `useBarangayHQCoords` in `frontend/src/utils/coverageArea.ts`.
   - Updated `frontend/src/components/MapComponent.tsx` to always revalidate `/landmarks` and `/landmarks/barangay/1/hq` on mount, on `onFacilitySync`, and on window `focus`, and to include coordinates in Leaflet `<Marker>` keys and render facility popups with current details.
   - Removed hardcoded facility ID coordinate fallbacks (`report.facility_id === 2 ? 14.8018 : (report.facility_id === 5 ? 14.8069 : ...)`) and static `14.8069, 121.0039` coordinates across `SubdViewReport.tsx`, `BrgyReportView.tsx`, `BrgyRescueRequests.tsx`, `ResiViewReport.tsx`, `SubdViewHistory.tsx`, `BrgyViewHistory.tsx`, `BrgySettings.tsx`, and `AdminReportView.tsx`.

3. **Verification:**
   - `backend/tests/test_facility_and_map_sync.py`: 20/20 checks passed (Tests A, B, C, D).
   - `backend/tests/test_phase2_custody.py`: 18/18 checks passed.
   - `backend/tests/test_location_custody.py`: 33/33 checks passed.
   - `frontend\node_modules\.bin\tsc.cmd -b frontend/tsconfig.json`: 0 errors.

