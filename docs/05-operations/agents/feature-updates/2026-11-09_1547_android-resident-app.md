# Android Resident app and cloud APK build

- **Date:** 2026-11-09 15:47 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `.github/workflows/build-apk.yml`, `.gitignore`, `frontend/capacitor.config.ts`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/scripts/androidApiUrl.ts`, `frontend/tests/androidApiUrl.test.mjs`, `frontend/src/main.tsx`, `frontend/src/utils/api.ts`, `frontend/android/app/build.gradle`, `frontend/android/app/src/main/AndroidManifest.xml`, `frontend/android/app/src/main/java/com/straysafe/app/MainActivity.java`, `docs/05-operations/ANDROID_RESIDENT_APP.md`, `docs/01-system/NEW_INTERFACES_INTEGRATION.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-09_1547_android-resident-app.md`
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Capacitor Android Integration + GitHub APK Build" (package the live Resident interface as an Android app and build a debug APK through GitHub Actions, with minimal local disk use). FREEZE was OFF. Nothing was committed or pushed, and no workflow was triggered.
- **Type:** Feature

## Intent

Prepare Android mobile testing of the connected Resident interface before the staging pilot: reuse the existing Capacitor project, make the app open directly on the live Resident interface, keep the backend address configurable and HTTPS by default, and build the APK only on GitHub. No Android SDK, Gradle or Android Studio on the laptop, no local APK build, no backend or database change.

## What already existed (reused, nothing duplicated)

One Capacitor 8.5.2 project: `frontend/capacitor.config.ts` (`com.straysafe.app`, "StraySafe", `webDir: dist`), `frontend/android/` (Gradle project, StraySafe launcher icons and splash), the Capacitor packages already in `package.json`, and `.github/workflows/build-apk.yml`. That workflow built the whole legacy web app, loaded it over cleartext HTTP and also ran on every push touching `frontend/`. The shared API client already had the installed-app refresh-token header flow (`Capacitor.isNativePlatform()`). No package was added and none was installed.

## Key changes

- **Android build mode** (`vite build --mode android`, scripts `build:android` and `cap:build`): `frontend/src/main.tsx` mounts only the live Resident interface in that mode (the previews, the live Admin interface and the legacy app routes are not mounted) and makes the catch-all route redirect to `/resident-app`, so the shell's `/` opens the Resident app. The mode is read inline, so web builds fold the conditions away and are unchanged.
- **Backend address:** `frontend/scripts/androidApiUrl.ts` (new, pure, with 6 unit tests) refuses, before anything is bundled, a missing `VITE_API_BASE_URL`, a non-address, `http://` unless cleartext was requested, loopback hosts, credentials, a query or fragment, and a trailing slash; `vite.config.ts` calls it in Android mode. `frontend/src/utils/api.ts` in Android mode ignores the legacy "Server settings" saved address, has no `localhost:8000` fallback and never uses the dev-only `/api` path.
- **Secure by default:** `capacitor.config.ts` serves the app as `https://localhost` with no cleartext; `STRAYSAFE_ALLOW_CLEARTEXT=true` (workflow input `allow_http`) switches to `http://localhost` and, through `-PallowCleartext=true` and a manifest placeholder in `android/app/build.gradle`, allows cleartext traffic, for a backend on the tester's own network only. Capacitor 8's built-in `SystemBars` is set to `insetsHandling: 'native'` (status bar, navigation bar, cutout and keyboard insets).
- **Manifest:** permissions reduced to `INTERNET`, `ACCESS_NETWORK_STATE`, coarse and fine location (foreground; no background location); `CAMERA` and the three storage/media permissions removed (the media picker is `<input type="file">` without `capture`); `allowBackup="false"`; `windowSoftInputMode="adjustResize"`; cleartext follows the build flag.
- **Back button:** `MainActivity` adds an AndroidX `OnBackPressedCallback` (Capacitor 8's runtime has no back handling of its own): Back goes one screen back in the web history and leaves the app only from the first screen. No plugin.
- **Workflow** (`build-apk.yml`, same file): manual only (`workflow_dispatch`, input `allow_http`), `contents: read`, one run at a time; checks the settings; Node 22 and `npm ci` from the lockfile; `npm run build:android`; `npx cap sync android`; Java 21 with the Gradle cache on the runner; `./gradlew assembleDebug`; uploads `StraySafe-Resident-debug-apk` (14 days). It never publishes or deploys. Its `VITE_API_BASE_URL` repository variable convention is kept; the Google, dog and cat API keys it used to embed are no longer passed (the Resident app does not read them).
- **Git:** the Android project's own ignore rules already cover every generated output (verified path by path); the root `.gitignore` now also ignores `*.apk` and `*.aab` anywhere.
- **Docs:** `docs/05-operations/ANDROID_RESIDENT_APP.md` (identity, permissions, address configuration for GitHub Actions and staging, how to build and download, what is and is not verified, blockers, phone test checklist); a pointer in `NEW_INTERFACES_INTEGRATION.md`.

## Validation evidence

Offline only: no Android SDK, Gradle, emulator or device; nothing was installed, started on GitHub or built into an APK. Nothing touched the configured database or the backend.

- **Capacitor and manifest:** read against the installed Capacitor 8.5.2 sources (system-bar and keyboard insets, geolocation prompt, file chooser permission logic, absence of back handling, `BridgeActivity`/`Bridge` signatures that `MainActivity` uses).
- **Address handling:** `node --test tests/*.test.mjs` 164 of 164 (6 new). A real `vite build --mode android` was refused with the guard's own message for a missing address, `https://localhost:8000`, `http://192.168.1.5:8000` without the flag, and a trailing slash; with `https://api.staging.example` it built (the web bundle only, 14 MB, written to a scratch folder and deleted).
- **Android entry routing, from the built bundle:** only the Resident live chunk (`ResidentLiveRoot`); no Admin live, Admin preview or Resident preview chunk; the router has the Resident route at `/resident-app/*` and a catch-all `*` that is a `Navigate` with `replace` to it; the address is baked in; `http://localhost:8000` is absent; none of the sample credentials or simulation tools is present. The legacy pages remain packaged as chunks but unreachable.
- **Separation of web builds:** the default web build has no preview or live chunk and passes the existing isolation check (none of 46 markers); the `VITE_NEW_UI=true` build has both live chunks and passes the pilot check (none of 20 markers); their live chunks have the same content hashes as before this work.
- **Types and lint:** `npx tsc -b` clean; lint of the changed files shows only older findings in unchanged lines of `api.ts` (already in the project's legacy baseline).
- **Workflow:** the YAML parses; its only trigger is `workflow_dispatch`; no push, schedule, release, deploy or publish step; all 7 shell blocks pass `bash -n`; the settings check, run in a throwaway shell against seven sample values, accepts and refuses as intended.
- **Git ignore rules:** `git check-ignore` confirms the APK output, Gradle caches, build folders, copied web assets, generated Capacitor config, `local.properties`, `*.aab` and `*.apk` anywhere are ignored.

## Not verified, blockers and decisions

1. **No APK has been built.** The `MainActivity.java` and `build.gradle` changes have not been compiled, and the runner image's Android SDK must include platform 36 (what `compileSdk` needs). Nothing is claimed until the workflow has actually completed.
2. **Everything that needs a phone is untested:** the back button, keyboard and safe areas, the location prompt, the system photo picker, map tiles, sign-in against a backend, session persistence.
3. **Before the first run:** set the repository variable `VITE_API_BASE_URL` to the staging backend's HTTPS address (a valid certificate, reachable from the phones) and the secrets `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`.
4. **Decision: the Android shell now opens the Resident app, not the legacy site,** and its workflow no longer runs on push. The legacy website, the live Admin interface and the web build are unchanged. A legacy-shell APK would need its own build mode.
5. **Decision: camera.** A "take a photo now" button would need `CAMERA` and a `capture` input; today the system picker is used.
6. Debug signing only (a fresh debug key per cloud build, so an earlier build must be uninstalled first); a release build needs a keystore in GitHub secrets.

## Not done

No commit, push, GitHub Actions run, package install or update, local Android build, backend or database change, and no browser test suite. The earlier regression suites were not re-run (the web builds are unchanged, shown by identical live-chunk hashes and the isolation checks above).
