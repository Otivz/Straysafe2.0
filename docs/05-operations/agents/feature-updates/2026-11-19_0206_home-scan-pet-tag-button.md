# "Scan a Pet Tag" Button in the Home Header

- **Date:** 2026-11-19 02:06 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/resident/pages/HomePage.tsx`, `frontend/src/resident/styles/resident.css`, `docs/README.md`
- **Authorization:** Developer chose option B ("Let's go for B"): a scan icon in the Home header, next to the notifications bell.
- **Type:** Polish

## Intent

Make the in-app pet tag scanner (`/resident-app/scan`, added in [Pet QR Tags Phase 4](2026-11-18_1453_pet-qr-tags-phase4.md)) reachable in one tap from Home. Until now it was only at the bottom of Community, and that button stays.

## Database changes

None.

## Key changes

- **Scan icon:** the Home header shows a scan icon (`ScanLine`) to the left of the bell. Its accessible name and tooltip are "Scan a pet tag", and it links to `/resident-app/scan`.
- **Layout:** the two icons sit in one group with an 8 px gap, so the greeting keeps the rest of the row.
- **Style:** the scan icon uses the bell's bordered box. The bell's rule in `resident.css` now also applies to the new `rs-headbtn` class, so the bell itself is unchanged.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on `HomePage.tsx`: clean.
- **Browser** (the repository harness `tests/_liveHarness.mjs`: isolated API and Vite on ports 8782 and 5192, headless Chrome at 390 × 844, a resident signed in through the login page):
  - The scan icon sits on the same row as the bell, to its left, at 44 × 44 px, inside the screen.
  - Tapping it opens `/resident-app/scan`.
  - No page errors.
  - Screenshot checked: both buttons have the same bordered box.

## Remaining issues

- The Android app shows it only after the next APK build.
