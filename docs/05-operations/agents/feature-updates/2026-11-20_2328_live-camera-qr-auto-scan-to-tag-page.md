# Live Camera Auto-Scanning for QR Pet Tags Navigating Directly to TagScanPage

- **Date:** 2026-11-20 23:28 (UTC)
- **AI tool:** Antigravity (Gemini 4 Argon)
- **Files changed:** `frontend/android/app/src/main/AndroidManifest.xml`, `frontend/src/resident/lib/petTag.ts`, `frontend/src/resident/pages/tag/ScanTagPage.tsx`, `docs/05-operations/agents/feature-updates/2026-11-20_2328_live-camera-qr-auto-scan-to-tag-page.md`
- **Authorization:** User request to make the QR scanner open a live camera viewfinder that automatically navigates to `TagScanPage.tsx` when pointed at a QR code
- **Type:** Feature

## Intent

Allow users on both web and the Android app to simply point the live camera at a StraySafe pet QR tag on `ScanTagPage` (`/resident-app/scan`) and automatically navigate straight to `/t/<token>` (`TagScanPage.tsx`) without having to manually snap a photo or tap "Start scanning" first.

## Key changes

- **`frontend/src/resident/pages/tag/ScanTagPage.tsx`**:
  - Enabled live camera scanning (`navigator.mediaDevices.getUserMedia`) on both browser and Capacitor Android builds (removed the `!native` block).
  - Auto-started the rear camera (`startLive()`) as soon as `BarcodeDetector` is ready on mount, with a live video viewfinder and centered QR targeting frame.
  - Added a `200ms` non-overlapping detection loop (`detectingRef` + `navigatedRef`) that immediately stops the camera stream and calls `navigate('/t/' + encodeURIComponent(token))` (`TagScanPage.tsx`) the instant a StraySafe QR code enters the frame.
  - Removed the redundant "Keep your distance..." warning sentence from `ScanTagPage.tsx`.
- **`frontend/src/resident/lib/petTag.ts`**:
  - Broadened `tokenFromQr` to recognize full `http(s)://.../t/<token>` URLs, relative `/t/<token>` paths, and bare valid tokens.
- **`frontend/android/app/src/main/AndroidManifest.xml`**:
  - Added `<uses-permission android:name="android.permission.CAMERA" />` so Capacitor's WebChromeClient can grant live camera stream access in the Android app.

## Validation evidence

- `npm run build` in `frontend/` (`tsc -b && vite build`, exit code 0)
- `npx eslint src/resident/pages/tag/ScanTagPage.tsx src/resident/lib/petTag.ts` (exit code 0)
- `npx cap copy android` (exit code 0)
