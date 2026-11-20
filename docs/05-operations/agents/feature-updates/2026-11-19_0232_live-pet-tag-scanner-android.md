# Live Pet Tag Scanner in the Android App (CAMERA Declared)

- **Date:** 2026-11-19 02:32 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/android/app/src/main/AndroidManifest.xml`, `frontend/src/resident/pages/tag/ScanTagPage.tsx`, `docs/05-operations/ANDROID_RESIDENT_APP.md`, `docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md`, `docs/README.md`
- **Authorization:** Developer, after trying the rebuilt APK: "it needs to take photo of the qr what i want is scanner".
- **Type:** Polish

## Intent

In the Android app, "Scan a pet tag" only offered "Take a photo of the tag". [Phase 4](2026-11-18_1453_pet-qr-tags-phase4.md) left CAMERA out of the manifest on purpose, and the developer wants a live scanner. The developer's test also showed that the app's WebView has `BarcodeDetector`, because the photo option appeared rather than the "can't read QR codes" message.

## Database changes

None.

## The trade-off (recorded in the manifest comment)

- **Why CAMERA is needed:** the live scanner uses `getUserMedia` in the WebView. Capacitor 8.5.2's `BridgeWebChromeClient.onPermissionRequest` asks Android for CAMERA, and Android refuses a permission the manifest does not declare. So CAMERA is now declared.
- **The side effect:** Capacitor's `isMediaCaptureSupported()` now finds CAMERA declared. So "Take photo" and "Record video" (`capture` inputs), like the scanner, ask the resident for camera permission the first time. They work as before once it is allowed.
- **If the resident refuses:** these need camera access allowed in the phone's settings, while choosing photos and videos from the gallery keeps working.

## Key changes

- **Manifest:** `<uses-permission android:name="android.permission.CAMERA" />`, and the permissions comment updated (it said CAMERA must stay undeclared).
- **Scan page:**
  - The live camera is allowed in the app too; the old check `!Capacitor.isNativePlatform()` is removed.
  - The camera opens by itself as soon as the QR reader is found, so the page is a scanner, not a menu.
  - A framing square shows where to hold the tag, and a matching tag opens its page by itself.
  - If access is refused (`NotAllowedError`), the page says to allow it in the phone's settings and offers "Start scanning" again and "Take a photo of the tag".
  - The video element is always in the page, hidden until scanning, so the camera can attach to it straight away. On the first try it was only drawn after the reader was found, and the automatic start quietly did nothing; that was caught by the browser check below.
- **Docs:** `ANDROID_RESIDENT_APP.md` now lists CAMERA (it said CAMERA was removed and pending a decision); the plan's status line notes this change.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on `ScanTagPage.tsx`: clean. `frontend/tests/petTagQr.test.mjs` 2/2.
- **Live-scanner check** (repository harness `tests/_liveHarness.mjs`, isolated API and Vite, headless Chrome at 390 × 844, resident signed in; a canvas stream stands in for the camera and a stand-in reader "sees" a tag link after a few frames):
  - The camera opens with no button press.
  - The tag opens `/t/<token>`.
  - The video element is gone after leaving (camera released).
  - A refused camera shows the settings message with both buttons.
  - No page errors.
  - Screenshot checked: camera view, framing square, "Stop the camera", "Take a photo of the tag".
- **Photo flow and no-reader fallback** (the Phase 4 script, rerun): 5/5 passed three runs in a row. One earlier run, made right after editing that script, failed at a step the next three runs passed; the cause was not found.
- **Not done:**
  - Android itself was not run: the permission prompt, the real camera stream in the WebView, and decoding a real printed tag need the rebuilt APK on a phone.
  - "Take photo" and "Record video" with CAMERA declared were not tried on a device.

## Remaining issues

- After rebuilding, check on a phone that:
  1. The scanner asks for camera access once, then shows the live camera and opens a printed tag.
  2. "Take photo" and "Record video" in a report and in "Add information" still work after allowing it.
  3. Refusing it still lets residents pick from the gallery.
