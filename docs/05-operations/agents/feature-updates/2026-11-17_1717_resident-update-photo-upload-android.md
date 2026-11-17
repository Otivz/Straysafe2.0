# Fix Photo Upload Failing on Android in "Add information" and Ownership Claims

- **Date:** 2026-11-17 17:17 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/utils/uploadValidation.ts`, `frontend/src/utils/cloudinaryUpload.ts`, `frontend/src/resident/live/actions.ts`, `docs/README.md`
- **Authorization:** Developer report in the Claude Code session with a phone screenshot: "On the app in the add information i cant upload any media" ("Something went wrong and your change was not recorded").
- **Type:** Fix

## Intent

In the Android app, adding a photo to "Add information" on a report failed with the generic error. These uploads go from the phone straight to Cloudinary, and `validateFile` decided the file type only from the file name's extension. Android's photo picker and camera often give names with no extension (for example `1000012345`) or HEIC photos, so the file was rejected as an unsupported type before anything was sent. That plain `Error` was then shown as the generic message.

## Key changes

- `uploadValidation.ts`: new `getFileKind(file)` that falls back to the file's MIME type when the name has no known extension; `validateFile` uses it.
- `cloudinaryUpload.ts`: the returned kind uses `getFileKind`. A link to an image that is not jpg/png/webp is turned into `.jpg`, and a video that is not mp4 into `.mp4` (Cloudinary converts on delivery), because the backend's `validate_cloudinary_url` only accepts those extensions.
- `resident/live/actions.ts`: "Add information" and ownership-claim uploads go through `uploadFile`, which shows the actual reason ("Your photo could not be uploaded: ...") instead of the generic message.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed.
- ESLint on the three files: one existing error (`catch (err: any)` in `cloudinaryUpload.ts`), not introduced here.
- Not yet tested on a phone; the APK must be rebuilt (`npm run cap:build`) to include the fix.
