# Pet Tag Scanner: "Scan" and "Upload" Options

- **Date:** 2026-11-19 03:03 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/resident/pages/tag/ScanTagPage.tsx`, `docs/README.md`
- **Authorization:** Developer: the scanner should have an option to upload and an option to scan, where pointing the camera at the QR opens the tag's page by itself.
- **Type:** Polish

## Intent

The scan page ([live scanner record](2026-11-19_0232_live-pet-tag-scanner-android.md)) had a live camera and a "Take a photo of the tag" button, which opened the phone's camera app. The developer wants two clear options instead: scan with the camera, or upload an image of the QR.

## Database changes

None.

## Key changes

- **"Scan with the camera"** (the live scanner, unchanged): it starts by itself when the page opens. Pointing it at a StraySafe tag opens that tag's page with no further tap. The button restarts it after "Stop the camera" or a refusal.
- **"Upload a QR image"** (was "Take a photo of the tag"): it picks an existing picture from the phone and reads the QR in it. It no longer uses `capture`, so it opens the gallery or file picker, not the camera app. That also means it works when camera access was refused.
- **Messages and wording:** the refused-camera and unreadable-picture messages now say "upload a picture of the QR code".
- **Unchanged:** only StraySafe tag links open (other QR codes are refused); the reader needs `BarcodeDetector`; phones without it get the camera-app explanation.

## Where the tag opens

The scanner reads only the tag's code and opens `/t/<code>` on the address the app or site is already using, not on the address printed in the QR. That is deliberate: a card printed for an old tunnel address still works, and the resident stays signed in. A tag for `https://<tunnel>/t/vB4Vpz87WNx5idd3-LR3XA` therefore opens the same pet page, shown inside the app or site. A phone's own camera app opens the printed address in the browser instead.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on `ScanTagPage.tsx`: clean.
- Browser (repository harness, isolated API and Vite, headless Chrome, resident signed in):
  - A stand-in camera and QR reader: the camera starts by itself and a tag opens `/t/<code>`; the camera is released after leaving; a refused camera shows the settings message with both options.
  - A picture chosen through the upload button, whose QR holds an old tunnel's link, opens `/t/<code>` on the app's address.
  - A non-tag QR is refused; without `BarcodeDetector` the explanation shows; no page errors.
- **Not done:** a real phone. Decoding a real QR picture and the live camera in the APK still need testing on a device.

## Remaining issues

- None new. The checks listed in the [live scanner record](2026-11-19_0232_live-pet-tag-scanner-android.md) still apply after the next APK build.
