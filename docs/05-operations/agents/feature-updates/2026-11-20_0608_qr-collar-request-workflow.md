# Implement QR Collar Request workflow for Residents and Subdivision Admins

- **Date:** 2026-11-20 06:08 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `backend/app/models/qr_collar_request.py`, `backend/app/models/__init__.py`, `backend/app/db_migrations/case_alignment.py`, `backend/app/services/qr_collar_requests.py`, `backend/app/routes/qr_collar_requests.py`, `backend/app/main.py`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/components/SubdivisionContactFields.tsx`
- **Authorization:** Direct user request to add a full database-backed QR Collar Request feature across the Resident Pet Details page and Subdivision Admin Pet Registry page, integrated with the existing messaging and notification systems.
- **Type:** Feature

## Intent

Enable residents to request physical QR collars for their registered pets, track status and request history, and enable Subdivision Administrators to review, accept, mark ready for pickup, and automatically message/notify residents through existing messaging and notification channels.

## Key changes

- **Backend model & startup schema**:
  - Added `QrCollarRequest` (`qr_collar_requests`) in `backend/app/models/qr_collar_request.py`, registered it in `backend/app/models/__init__.py`, and added `"qr_collar_requests"` to `CASE_TABLES` in `backend/app/db_migrations/case_alignment.py`.
- **Backend service & API**:
  - Created `backend/app/services/qr_collar_requests.py` and `backend/app/routes/qr_collar_requests.py`, registered in `backend/app/main.py`:
    - `GET /qr-collar-requests/mine` and `POST /qr-collar-requests` (resident-scoped, prevents duplicate active requests per pet, notifies Subdivision Leaders, logs audit trail).
    - `GET /qr-collar-requests/admin`, `POST /qr-collar-requests/{id}/accept`, `POST /qr-collar-requests/{id}/ready`, `POST /qr-collar-requests/{id}/complete` (subdivision-scoped for Subdivision Admin/Staff; accepting notifies resident; marking ready sends a `CaseMessage` in a resident conversation via `case_messaging.send` which creates the in-app notification).
- **Resident UI**:
  - Updated `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, and `frontend/src/resident/pages/pets/PetTagSection.tsx` with a **Request QR Collar** flow, active status card (`Pending`, `Accepted`, `Ready for Pickup`), direct pickup message link, and request history.
- **Subdivision Admin UI**:
  - Updated `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, and `frontend/src/admin/pages/PetsPage.tsx` with a **QR Collar Requests** tab inside Pet Registry (summary counts, search/status filters, **Accept Request**, **Ready for Pickup & Notify** message modal, **Open Conversation**, and **Mark Picked Up**).
  - Removed an unused `Settings` type import in `frontend/src/admin/components/SubdivisionContactFields.tsx` flagged by `tsc -b`.

## Validation evidence

- `python -m py_compile backend/app/models/qr_collar_request.py backend/app/services/qr_collar_requests.py backend/app/routes/qr_collar_requests.py backend/app/db_migrations/case_alignment.py backend/app/main.py` — exited with code 0.
- `cd frontend; npm run build` (`tsc -b && vite build`) — exited with code 0.
