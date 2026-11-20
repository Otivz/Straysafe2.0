# Buffer Picked Media Files in Memory on Selection

- **Date:** 2026-11-20 08:55 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/lib/media.ts`, `frontend/src/resident/components/MediaPicker.tsx`, `docs/05-operations/agents/feature-updates/2026-11-20_0855_buffer-android-picked-media-in-memory.md`
- **Authorization:** Explicit developer request (`"codefix mo na lang"`) after Android WebView failed to read a picked pet photo at submit time (`"the file could not be read from your phone"`).
- **Type:** Fix

## Intent

In the Android Resident app WebView, temporary `content://` read permissions on a picked `File` can expire between file selection and form submission, causing `file.arrayBuffer()` inside `prepareForUpload()` to fail when the user taps **Register pet** or submits a report. Buffering picked files into memory immediately on selection prevents permission-expiry failures at submit time.

## Key changes

- `frontend/src/resident/lib/media.ts`: Added `takeFilesInMemory()` to validate picked files via `takeFiles()` and immediately copy each file's bytes into an in-memory `File` (falling back to `redrawAsJpeg()` for photos if `arrayBuffer()` fails), reporting unreadable files immediately.
- `frontend/src/resident/components/MediaPicker.tsx`: Updated `pick()` and `replaceFirst()` to await `takeFilesInMemory()` after snapshotting `FileList` and resetting the input element.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
