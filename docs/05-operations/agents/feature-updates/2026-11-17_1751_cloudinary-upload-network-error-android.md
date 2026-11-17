# Read Photos into Memory Before Direct Cloudinary Upload (Android "Network Error")

- **Date:** 2026-11-17 17:51 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/utils/cloudinaryUpload.ts`, `docs/README.md`
- **Authorization:** Developer report in the Claude Code session: after the Cloudinary GitHub secrets were added, "Your photo could not be uploaded: Network Error" in "Add information" in the Android app.
- **Type:** Fix

## Intent

The direct browser upload to Cloudinary failed in the Android app with axios's bare "Network Error", which gives no cause. A known Android WebView failure is a picked `content://` file that the web view refuses to stream at send time (`net::ERR_UPLOAD_FILE_CHANGED`). The other likely cause is that the phone cannot reach `api.cloudinary.com`.

## Key changes

- The picked file is read into memory (`file.arrayBuffer()` into a `Blob`) before the upload, and the copy is sent, which avoids the WebView streaming failure. A read failure gets its own message ("the photo could not be read from your phone").
- Upload errors are split: a response from Cloudinary shows its message or status; no response shows "the photo service (api.cloudinary.com) could not be reached [code]".

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed.
- Not tested on a phone: the cause is not yet confirmed. The next test's message (or Chrome remote debugging via `chrome://inspect` on the debug APK) tells which cause it is. The APK must be rebuilt to include this.
