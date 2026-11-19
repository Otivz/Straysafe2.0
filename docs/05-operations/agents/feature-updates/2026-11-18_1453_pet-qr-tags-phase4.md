# Pet QR Tags Phase 4: In-App Scanner and Scheduled Cleanup

- **Date:** 2026-11-18 14:53 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/pet_tags.py`, `backend/app/tasks/unassigned_checker.py`, `backend/tests/test_pet_tags_public.py`, `frontend/src/resident/lib/petTag.ts` (new), `frontend/src/resident/pages/tag/ScanTagPage.tsx` (new), `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/pages/community/CommunityPage.tsx`, `frontend/tests/petTagQr.test.mjs` (new), `docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md`, `docs/06-future-proposals/PENDING_AND_FUTURE_FEATURES.md`, `docs/README.md`
- **Authorization:** Developer: "phase 4", after Phases 1 to 3.
- **Type:** Feature

## Intent

Phase 4 of [PET_QR_TAGS_PLAN_2026-11-17.md](../../../06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md): an in-app "Scan a pet tag" button with no new library, and the scheduled cleanup of old scan data.

## Database changes

None to the schema. The cleanup deletes `pet_tag_scans` page-view rows older than 90 days, and clears a phone number left on a resolved message.

## Android: no CAMERA permission (a decision made while building)

The plan said a live scanner needs the CAMERA permission and an APK rebuild. Declaring CAMERA would change today's working "Take photo" and "Record video" buttons. Android would then demand the permission before handing off to the camera app; `AndroidManifest.xml` explains why CAMERA stays undeclared.

So the scanner works without it:

- **In the Android app:** "Take a photo of the tag" uses the same camera hand-off, and the browser's `BarcodeDetector` reads the QR from the photo.
- **In a phone's browser:** "Start scanning" also reads live from the camera (`getUserMedia`), which the browser asks permission for.
- **Without `BarcodeDetector`** (for example iPhone Safari): the page explains how to use the phone's own camera app.

`AndroidManifest.xml` is unchanged. The new screens reach phones with the next APK build, like any web change.

## Key changes

- **`tokenFromQr`** (`resident/lib/petTag.ts`):
  - Accepts only `http(s)://<any address>/t/<token>` with a 16 to 32 character token. It keeps only the token, so a tag printed for an old tunnel address still opens on the app's own address.
  - Anything else is refused: other sites, payment codes, plain text, extra path parts, other URL schemes.
- **Scan page** `/resident-app/scan` (`ScanTagPage.tsx`), opened from a new **"Scan a pet tag"** button on Community:
  - Start scanning and stop the camera (browser only), or take a photo of the tag.
  - A tag opens `/t/<token>`. Anything else shows "That QR code is not a StraySafe pet tag." A photo with no QR code asks to try closer.
  - The camera stream is stopped when the page closes.
- **Cleanup** (`services/pet_tags.cleanup_scans` / `run_cleanup`): run by the existing operations watcher about a minute after start-up and then once a day.
  - Deletes page views older than 90 days.
  - Never deletes a "tell the owner" message.
  - Clears a phone number left on a resolved message (resolving already clears it; this is a safety net).
  - A failure only logs a warning and never stops the watcher.

## Validation evidence

- `backend/tests/test_pet_tags_public.py`: **69/69**, five of them new cleanup checks:
  - only views older than 90 days are deleted (an 89-day view is kept);
  - every message is kept, however old;
  - a leftover phone on a resolved message is cleared, while an open message keeps its phone;
  - a second run changes nothing.
- `frontend/tests/petTagQr.test.mjs`: **2/2** (tag links from different addresses give the token; 12 non-tag inputs are refused).
- **Browser** (the repository's harness `tests/_liveHarness.mjs`: isolated API and Vite on ports 8781 and 5191, headless Chrome, a resident signed in through the login page):
  - Community shows "Scan a pet tag", and the scan page shows "Start scanning" and "Take a photo of the tag".
  - A photo whose QR holds an old tunnel's tag link opens `/t/<token>` on the app's own address.
  - A payment QR is refused and the page stays put.
  - Without `BarcodeDetector`, the page explains the camera app.
  - No page errors. The stack was stopped and its ports freed.
- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the new and changed files is clean.
- **Not done:**
  - Real QR decoding: desktop Windows Chrome has no `BarcodeDetector`, so a stand-in returned the QR text. Decoding a real photo and the live camera need a real Android phone.
  - Whether Android's WebView offers `BarcodeDetector` was not checked on a device. If it does not, the app shows the camera-app explanation.

## Remaining issues

- Try the scanner on a real Android phone, in Chrome and in the rebuilt APK.
