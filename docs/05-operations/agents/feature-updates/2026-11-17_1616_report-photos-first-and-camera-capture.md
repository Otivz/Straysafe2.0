# Report Photos on Step 1 and Device Camera Capture

- **Date:** 2026-11-17 16:16 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/resident/components/MediaPicker.tsx`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/EvidencePage.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/resident/pages/report/FlowScreen.tsx`, `frontend/src/resident/lib/flow.ts`, `frontend/src/resident/data/selectors.ts`, `frontend/src/resident/pages/pets/PetFormPage.tsx`, `frontend/android/app/src/main/AndroidManifest.xml`, `docs/README.md`
- **Authorization:** Developer request in the Claude Code session: move "Add photos or video" (step 3 of 4 of the animal complaint) to step 1 by merging it into the Details step (3 steps total), and add a camera option with "Record video" as its own button. Approved with "You can proceed with both changes together."
- **Type:** Polish

## Intent

The animal in a complaint often leaves within seconds, so asking for the photo at step 3 was too late. Lost and found reports already took their photo on the first step. Residents can now also capture a photo or video with the device camera instead of only picking an existing file.

## Key changes

- **Report flow:** every kind of report now has three steps (`details → location → review`). `flowSteps(kind)` is replaced by the constant `FLOW_STEPS`, and `useFlowNav` no longer takes a kind.
- **Details step (complaints):** the "Photos or video (optional)" section now sits at the top of the form (up to 5 files, photos and videos), with the "Keep a safe distance" warning.
- **`/report/evidence`:** kept as a redirect to `/report/details` (with its query string, so `?from=review` still returns to the review) for saved links and open tabs.
- **Review screen:** the "Photos" row and the "Add a photo or video" prompt now link to the Details step.
- **MediaPicker (every resident photo upload):** "Take photo" (`<input accept="image/*" capture="environment">`), "Record video" when videos are allowed (`accept="video/*" capture`), and "Choose from gallery" (the previous picker). Desktop browsers ignore `capture` and show the file chooser. The unused `addLabel` prop is removed.
- **Android:** added `<queries>` for `IMAGE_CAPTURE` and `VIDEO_CAPTURE` so Capacitor's file chooser can find the camera app on Android 11+, plus an optional `android.hardware.camera` feature. CAMERA is deliberately left undeclared, so the camera-app handoff needs no runtime permission. The APK must be rebuilt (`npx cap sync android`, then build) for this to take effect.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed.
- `npx eslint src/resident` reported 5 errors, all in files this change does not touch (`native/push.ts`, `WarningLetterPage.tsx`, `WarningsPage.tsx`, `pets/PetDetailsPage.tsx`).
- Checked Capacitor 8 `BridgeWebChromeClient.onShowFileChooser`: it opens `ACTION_IMAGE_CAPTURE` / `ACTION_VIDEO_CAPTURE` for `capture` inputs, requests CAMERA only when the manifest declares it, and falls back to the file picker when no camera app resolves.
- Not yet tested on a phone or in the browser.
