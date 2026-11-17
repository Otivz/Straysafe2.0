# Resident Photo Uploads Always Go Phone → Backend → Cloudinary

- **Date:** 2026-11-17 18:35 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/uploads.py`, `backend/app/routes/chat.py`, `frontend/src/resident/lib/media.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/utils/cloudinaryUpload.ts`, `docs/README.md`
- **Authorization:** Developer decision in the Claude Code session: "Yes, build 2 + 3" (always upload through the backend, fix the backend limits) and "Convert in the app" for HEIC photos, after the investigation confirmed the phone's network cannot reach `api.cloudinary.com`.
- **Type:** Fix

## Intent

"Add information" and ownership-claim photos uploaded straight from the phone to `api.cloudinary.com`, which the developer's phone network blocks (confirmed in the phone's Chrome). Report photos worked because they go through the backend. This supersedes the fallback in [2026-11-17_1812](2026-11-17_1812_chat-media-upload-via-backend-fallback.md): there is now one path, the one report photos use.

## Key changes

- **Frontend:** `uploadFile` in `resident/live/actions.ts` always sends the file to `POST /chat/media`; the direct Cloudinary upload is no longer used by the resident app. Being offline or signed out keeps the app's own handling.
- **New `prepareForUpload`** (`resident/lib/media.ts`): a HEIC photo, or a photo over 2.5 MB, is redrawn as a JPEG (longest side at most 2048 px, quality 0.85, turned the right way up). Other files are sent as an in-memory copy named with their extension. Non-MP4 videos are refused with a clear message. If a photo cannot be redrawn (a web view that cannot decode HEIC), it is sent as is when the backend takes it, otherwise the resident is asked to use "Take photo" or a JPG/PNG.
- **Backend `read_and_validate_upload`:** videos may be up to 50 MB (photos and documents stay 10 MB), matching what the resident picker allows. It applies to every route that accepts videos (announcements, report media, `/chat/media`). `max_size` now only lowers a category's limit.
- **`/chat/media` description** updated: the main path, not a fallback.
- **`cloudinaryUpload.ts`:** the fallback helpers from 18:12 (`CloudinaryUnreachableError`, `uploadableCopy`) were removed; the function itself is kept but unused by the resident app.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on `actions.ts`, `media.ts` and `api.ts` reported no problems.
- `read_and_validate_upload` checked in `.venv` with fake files: 20 MB MP4 accepted, 20 MB JPEG refused (413), small JPEG accepted, a name without an extension refused (400), which is why the app now names the file.
- Backend test suite not run (`pytest` is not installed in `.venv`). Not yet tested on a phone: restart the backend and rebuild the APK.
