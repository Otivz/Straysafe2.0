# Upload Photos Through the Backend When the App Cannot Reach Cloudinary

- **Date:** 2026-11-17 18:12 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/chat.py`, `frontend/src/utils/cloudinaryUpload.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/live/api.ts`, `docs/README.md`
- **Authorization:** Developer report in the Claude Code session from the rebuilt Android app: "Your photo could not be uploaded: the photo service (api.cloudinary.com) could not be reached [ERR_NETWORK]" in "Add information", while the same upload works in the browser.
- **Type:** Fix

## Intent

In the Android app, the direct browser upload to `api.cloudinary.com` gets no answer (`ERR_NETWORK`), while the app reaches the StraySafe backend normally (report photos, which go through the backend, upload). The cause inside the web view is not confirmed. This change makes the upload work whatever the cause.

## Key changes

- **Backend:** new `POST /chat/media` (signed-in users, 20 per minute): validates the file with `read_and_validate_upload` (images and videos only), uploads it to Cloudinary server-side (`straysafe/chat` folder) and returns `{url, media_type}`. Nothing is stored; the link is then sent with the chat message or claim and passes `validate_cloudinary_url` like a direct upload's.
- **Frontend:** `uploadDirectToCloudinary` throws `CloudinaryUnreachableError` when there is no answer at all. The resident `uploadFile` (Add information and ownership claims) then sends an in-memory copy of the file, named with an extension from its MIME type (`uploadableCopy`), to `/chat/media`.
- **Direct upload:** the upload-progress listener is added only when a caller asks for progress (none does). That listener made the cross-origin request need a CORS preflight, a possible cause of the web view failure.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on `actions.ts` and `api.ts` reported no problems.
- `chat.py` imports in the project's virtual environment and the router lists `/chat/media`.
- Backend tests not run: `pytest` is not installed in `.venv` (installing it is a dependency change).
- Not yet tested on a phone. The backend must be restarted and the APK rebuilt.
