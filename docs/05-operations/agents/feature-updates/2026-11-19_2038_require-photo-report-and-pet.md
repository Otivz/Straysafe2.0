# Require Photo Upload for Animal Reporting and Pet Registration

- **Date:** 2026-11-19 20:38 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/schemas/report.py`, `backend/app/routes/reports.py`, `backend/app/routes/pets.py`, `frontend/src/resident/components/MediaPicker.tsx`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/LostPetForm.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/resident/pages/pets/PetFormPage.tsx`, `frontend/src/resident/live/actions.ts`, `docs/README.md`
- **Authorization:** User request ("STRAY-SAFE 2.0 – Require Photo Upload for Animal Reporting and Pet Registration")
- **Type:** Feature

## Intent

Enforce mandatory animal photo upload validation across both frontend forms and backend creation endpoints for Animal Report Submission and Pet Registration, ensuring uploaded photos are validated and saved before completing record creation.

## Key changes

- **Frontend Report & Pet Forms (`DetailsPage.tsx`, `LostPetForm.tsx`, `ReviewPage.tsx`, `PetFormPage.tsx`, `MediaPicker.tsx`)**:
  - Marked animal photo upload required (`*`) on `DetailsPage.tsx` (`"Please upload at least one photo of the animal before submitting your report."`) and `PetFormPage.tsx` (`"Please upload a photo of your pet to complete the registration."`) with the helper text `"For accurate animal identification and verification, please upload a clear photo of the animal."`.
  - Updated `MediaPicker.tsx` with single-image preview, **Replace** and **Remove** buttons, drag-and-drop support, and error border highlighting (`invalid`).
  - Updated `ReviewPage.tsx` so `Submit report` is disabled whenever a photo is missing.
- **Upload-Before-Save Flow (`frontend/src/resident/live/actions.ts`)**:
  - Updated `submitReport` and `pet/save` to upload selected photos via `uploadFile` (`/chat/media` -> `read_and_validate_upload` -> Cloudinary) **before** calling `createReport` or `createPet`, preventing incomplete database records if an upload fails.
- **Backend Server-Side Validation (`backend/app/schemas/report.py`, `backend/app/routes/reports.py`, `backend/app/routes/pets.py`)**:
  - Added `media_urls` to `ReportCreate` and enforced in `create_report` (`POST /reports/`) that at least one valid Cloudinary image URL (or linked pet `photo_url` on a Lost Pet report) is present (`HTTP 422`), creating `ReportMedia` rows atomically in the same transaction.
  - Enforced in `create_pet` (`POST /pets/`) that at least one valid photo URL in `PHOTO_FIELDS` is present and validated via `_check_resident_photo_urls` (`HTTP 422`).

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
- `.venv\Scripts\python -m py_compile backend/app/schemas/report.py backend/app/routes/reports.py backend/app/routes/pets.py`: verified.
