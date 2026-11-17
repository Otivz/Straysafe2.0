# Replace Template/Action Inputs with Document & Media Import in Complaint Warning Step

- **Date:** 2026-11-17 13:24 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `backend/app/utils/uploads.py`, `backend/app/routes/reports.py`, `backend/app/schemas/complaint.py`, `backend/app/services/warning_letters.py`, `backend/app/services/complaints.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/resident/pages/account/WarningLetterPage.tsx`
- **Authorization:** User request to remove the template dropdown and required corrective action input from the complaint warning preparation dialog and allow uploading PDF, DOCX, DOC, and image files instead
- **Type:** Feature

## Intent

Simplify the `Prepare` warning letter dialog (`StepDialog`) in the Subdivision Leader complaints workflow by removing the template selector and required corrective action fields, while letting Subdivision Leaders import/upload a warning letter or supporting document (`.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg`, `.png`, `.webp`) that is saved with the case and accessible to both staff and the notified resident.

## Key changes

- Removed the `Warning letter template` `<Select>` and `Required corrective action` `<Input>` fields from `StepDialog` (`p.action === 'prepare'`) in `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx` (retaining automatic default template resolution in the background).
- Added a file import control (`Import warning letter or supporting file (optional)`) in `ComplaintDialogs.tsx` that accepts PDF, DOC, DOCX, and image files, uploads via `adminApi.uploadComplaintAttachment` (`POST /reports/{report_id}/media`), and stores `attachment_url` and `attachment_name` on the prepared step and generated warning letter.
- Updated `backend/app/routes/reports.py` (`upload_report_media`) to forward `resource_type` from `read_and_validate_upload` to `upload_to_cloudinary` so `.pdf`, `.doc`, and `.docx` files upload as `raw` assets with extensions intact; updated the allowed-types error message in `backend/app/utils/uploads.py`.
- Added `attachment_url` and `attachment_name` to `StepActionIn` (`backend/app/schemas/complaint.py`), persisted them in `complaints.py` and `warning_letters.py` (`placeholders_json` + `serialize_letter`), and displayed the attached file download/open link in both `PrintDialog` (`ComplaintDialogs.tsx`) and the resident's `WarningLetterPage.tsx`.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 2.08s`).
- Ran `node --test frontend/tests/*.test.mjs`: `201` tests passed, `0` failed.
- Ran `.venv\Scripts\python.exe backend/tests/test_warning_letters_and_notifications.py`: all `29` checks passed.
- Ran `.venv\Scripts\python.exe -m py_compile` on all 5 modified backend files: exited with code `0`.
