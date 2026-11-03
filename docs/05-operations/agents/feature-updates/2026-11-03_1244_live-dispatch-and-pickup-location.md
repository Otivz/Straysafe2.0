# Live Dispatch Team Location Tracking and Exact Pickup Location Marker

- **Date:** 2026-11-03 12:44 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/live_dispatch_tracker.py`, `backend/app/models/report.py`, `backend/app/schemas/report.py`, `backend/app/routes/reports.py`, `backend/app/routes/rescue.py`, `backend/tests/test_live_dispatch_and_pickup.py`, `frontend/src/utils/liveNavigation.ts`, `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `docs/05-operations/agents/feature-updates/2026-11-03_1244_live-dispatch-and-pickup-location.md`, `docs/README.md`
- **Authorization:** User request to add live location tracking of the dispatch team for Barangay Staff, Subdivision Leaders, and Residents, and to record and display a dedicated map marker at the exact animal pickup location when marked as Picked Up.
- **Type:** Feature

## Intent

Enable Barangay Staff, Subdivision Leaders, and Residents to view the real-time GPS location of the dispatched Barangay field team during active rescue operations (Status 5 `Dispatched`), and record the exact animal pickup coordinates and landmark when the animal is rescued (Status 6 `Picked Up`) so a dedicated `Pickup Location` map marker appears alongside the original sighting marker across all role report views.

## Key changes

- Created `backend/app/utils/live_dispatch_tracker.py` providing a thread-safe in-memory store with a 90-second TTL for active responder GPS pings per report.
- Added `POST /reports/{report_id}/live-location`, `DELETE /reports/{report_id}/live-location`, and `GET /reports/{report_id}/live-location` endpoints in `backend/app/routes/reports.py`.
- Updated Status 6 (`Picked Up`) handling in `backend/app/routes/reports.py` and `backend/app/routes/rescue.py` to persist exact pickup coordinates (`latitude`, `longitude`, `landmark`) into `StatusHistory` and automatically stop live dispatch location broadcasting.
- Extended `Report` model (`backend/app/models/report.py`) and `ReportResponse` schema (`backend/app/schemas/report.py`) to expose `pickup_latitude`, `pickup_longitude`, `pickup_landmark`, and `pickup_at` resolved from the Status 6 `StatusHistory` entry so pickup coordinates remain available even after the animal is transferred to a holding facility.
- Added `useDispatchBroadcaster` (with Screen Wake Lock API and `navigator.geolocation.watchPosition`) and `useWatchDispatchLocation` hooks in `frontend/src/utils/liveNavigation.ts`.
- Added custom map pin icons for `Dispatch Team` and `Pickup Location` categories in `frontend/src/components/MapComponent.tsx`.
- Updated `BrgyRescueRequests.tsx` and `BrgyReportView.tsx` with responder live GPS broadcast controls, live tracking status banners, GPS auto-detection + reverse geocoding in the Status 6 (`Picked Up`) modal, and map markers for both live dispatch and pickup locations.
- Updated `SubdViewReport.tsx` and `ResiViewReport.tsx` with live dispatch tracking banners and dual/multi-marker rendering (`Initial Sighting`, `Pickup Location`, `Dispatch Team`, and `Holding Facility`).
- Added unit and integration tests in `backend/tests/test_live_dispatch_and_pickup.py`.

## Validation evidence

- Executed `.venv\Scripts\python.exe backend/tests/test_live_dispatch_and_pickup.py` (10/10 assertions passed).
- Executed `.venv\Scripts\python.exe backend/tests/test_report_original_location.py` (5/5 passed).
- Executed `.venv\Scripts\python.exe backend/tests/test_report_status_sync.py` (33/33 passed).
- Verified TypeScript compilation (`tsc -b`) and documentation audit (`npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`).

