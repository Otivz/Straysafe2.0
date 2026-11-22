# Accept Photo or Video for Report Submissions and Harden Android File Reading

- **Date:** 2026-11-20 23:12 (UTC)
- **AI tool:** Antigravity (Gemini 4 Argon)
- **Files changed:** `backend/app/routes/reports.py`, `backend/app/services/case_summaries.py`, `backend/app/services/lost_pet_lifecycle.py`, `frontend/src/resident/components/MediaPicker.tsx`, `frontend/src/resident/lib/media.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/LostPetForm.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `docs/05-operations/agents/feature-updates/2026-11-20_2312_report-photo-or-video-and-android-media-reader.md`
- **Authorization:** User request to allow a video or a photo to satisfy report media requirements and fix Android gallery file reading errors
- **Type:** Fix

## Intent

1. Allow residents to submit any report with **at least one photo OR one video** (rather than forcing an additional photo when a video is already attached), and enable video upload and inline video previewing across all report forms (`DetailsPage`, `LostPetForm`, `ReviewPage`, `MediaPicker`).
2. Harden Android WebView / mobile gallery file reading in `media.ts` so picked files whose `file.type` is empty or whose `file.arrayBuffer()` fails on `content://` URIs fall back to `Response`, `FileReader`, and `fetch(objectUrl)` before failing.
3. Automatically derive `.jpg` poster frame URLs for video-only reports in `case_summaries.py` and `lost_pet_lifecycle.py` so list thumbnails and community notices render cleanly.

## Key changes

- **`frontend/src/resident/lib/media.ts`**:
  - Added `inferMediaKind` and `inferredMimeType` to detect photos and videos by file extension when Android WebView omits `file.type`.
  - Added `readFileBytes` with 4-stage fallback (`file.arrayBuffer()`, `new Response(file).arrayBuffer()`, `FileReader.readAsArrayBuffer()`, `fetch(objectUrl)`) before falling back to `redrawAsJpeg` for images.
- **`frontend/src/resident/components/MediaPicker.tsx`**:
  - Updated `previewItems` to include both photos and videos in the main preview card and multi-item carousel slider, rendering `<video controls playsInline preload="metadata" />` for video items.
- **`frontend/src/resident/pages/report/DetailsPage.tsx`, `LostPetForm.tsx`, `ReviewPage.tsx`, `frontend/src/resident/live/actions.ts`**:
  - Enabled `accept="both"` on `MediaPicker` and updated form/review/action checks to accept `m.kind === 'photo' || m.kind === 'video'`.
- **`backend/app/routes/reports.py`, `backend/app/services/case_summaries.py`, `backend/app/services/lost_pet_lifecycle.py`**:
  - Updated `create_report` (`reports.py`) to accept any valid `"Image"` or `"Video"` attachment (`has_valid_media = True`).
  - Updated `case_summaries.py` and `lost_pet_lifecycle.py` (`pet_card`) to derive a `.jpg` poster thumbnail from Cloudinary video URLs when a report has video-only media.

## Validation evidence

- `python -m py_compile app/routes/reports.py app/services/case_summaries.py app/services/lost_pet_lifecycle.py` (exit code 0)
- `npm run build` in `frontend/` (`tsc -b && vite build`, exit code 0)
- `npx eslint src/resident/lib/media.ts src/resident/components/MediaPicker.tsx src/resident/pages/report/DetailsPage.tsx src/resident/pages/report/LostPetForm.tsx src/resident/pages/report/ReviewPage.tsx src/resident/live/actions.ts` (exit code 0)
