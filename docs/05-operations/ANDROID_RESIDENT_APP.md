# StraySafe Android app (the live Resident interface) and its cloud build

Status: **Current** (2026-11-09). Prepared and checked offline only: **no APK has been built yet.** The build runs on GitHub; nothing about it runs on a developer's computer. Related: [NEW_INTERFACES_INTEGRATION.md](../01-system/NEW_INTERFACES_INTEGRATION.md) (the Resident interface and its API calls), [CUTOVER_READINESS.md](CUTOVER_READINESS.md) (the staging pilot).

## What it is

The existing React/Vite app inside the existing Capacitor project (`frontend/capacitor.config.ts`, `frontend/android/`; there is only one). An Android build mounts **only** the live Resident interface (`/resident-app`). The shell opens `/`, and every address that is not the Resident app is redirected to it. There are two Android build modes:

| Where it runs | Entry | What is mounted | Backend address |
|---|---|---|---|
| Web (any non-Android build) | `/` and every unknown address redirect to `/resident-app`; `/subd-admin` | the Resident and Subdivision Leader interfaces; the legacy portals no longer exist (removed 2026-11-10) | `VITE_API_BASE_URL` as before |
| **Android debug app** (`--mode android-debug`; what the GitHub workflow builds) | `/` redirects to `/resident-app` | **only** the live Resident interface, **plus Connection Settings** | typed on the phone (see below); an optional HTTPS address can be built in as the first-launch default |
| **Android release-style** (`--mode android`; not built by any workflow yet) | `/` redirects to `/resident-app` | **only** the live Resident interface; no Connection Settings | one fixed HTTPS address, required at build time |

Neither Android mode contains the Admin interface, the mock previews, the legacy app routes, sample data, or a silent fallback to any of them: a request that fails shows the app's own "can't reach the server" state.

## Identity

| | |
|---|---|
| Application ID | `com.straysafe.app` (unchanged: the existing project's) |
| Display name | StraySafe |
| Icon / splash | the StraySafe dog-and-cat logo already in `frontend/android/app/src/main/res/` (unchanged) |
| Version | 1.0 (code 1), debug build |
| Permissions | `INTERNET`, `ACCESS_NETWORK_STATE` (the app's offline notice), `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` (the report map's "use my current location", asked for when tapped, foreground only) |

No background location, no continuous tracking, no foreground service, no push, no extra native plugin and **no new npm package**. Removed from the manifest because the Resident app does not use them: `CAMERA`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`. Photos and videos are chosen through the system picker (an `<input type="file">` without `capture`), which needs none of them. A "take a photo now" button would need `CAMERA` added back (a decision, see below). Backup of the app's data to the cloud is switched off (it holds the sign-in).

## On the phone

- **Sign-in and session:** the existing Resident sign-in and its stored session; the installed app keeps its refresh token in the `X-Refresh-Token` header flow `utils/api.ts` already has for Capacitor (`Capacitor.isNativePlatform()`). Sessions survive closing the app.
- **Back button / gesture:** `MainActivity` goes back one screen in the Resident app's history and leaves the app only from its first screen (Capacitor 8's Android runtime does not do this by itself; it is a short AndroidX handler, not a plugin).
- **System bars, safe areas, keyboard:** Capacitor 8's built-in `SystemBars` (`insetsHandling: 'native'`) insets the web view for the status bar, navigation bar, display cutout and keyboard; `windowSoftInputMode="adjustResize"` is the standard setting for that keyboard handling on older Android versions (not yet tried on a device). The Resident CSS already uses `env(safe-area-inset-*)`.
- **Map and location:** the same Leaflet map; the web view's location prompt is answered by Capacitor, which asks Android for foreground location when the resident taps "Use my current location".

## The backend address

### Debug app: Connection Settings (change the backend without rebuilding)

The debug app has a **Connection Settings** screen, so the developer can point an installed APK at another backend (a computer on the same Wi-Fi today, a tunnel tomorrow) without a new GitHub build. It exists **only** in `--mode android-debug`: the screen, its bar and its labels are removed by the bundler from every other build (checked below), and the saved address is not even read by a release-style or web build.

**Where to open it**

1. **The "Debug build · <address> · Connection" bar** at the top of every Resident screen: before sign-in (Welcome, Sign in, Create an account…), after sign-in and on error screens.
2. **Settings → Developer → Developer connection** (signed in).
3. **First launch with no address** (none saved, none built in): the app opens straight on the screen and makes no request until an address is saved.

**What it does**

- **Backend API address** field, **Test connection**, **Save & connect**, and the **current connection** (address, whether it is "Saved on this phone" or "Built into this app", and a live status checked when the screen opens).
- Explains that `localhost` / `127.0.0.1` on a phone mean the phone itself.
- Validation messages are plain sentences under the field; test outcomes are shown in a coloured box.

**Supported address formats** (normalized, no trailing slash)

| Typed | Becomes | Notes |
|---|---|---|
| `http://192.168.1.10:8000` | same | a computer on the same network: `192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`, `169.254.x.x`, `100.64–127.x.x` (VPN such as Tailscale), `name.local`, or a one-word name |
| `https://example-tunnel.example.com` | same | a tunnel or server; port and path prefix allowed (`https://example.org:8443/api`) |
| `192.168.1.10` | `http://192.168.1.10:8000` | shorthand: a bare IPv4 address gets `http://` and the usual port 8000 |
| `example-tunnel.example.com` | `https://example-tunnel.example.com` | shorthand: a bare name gets `https://` |

Refused, with the reason shown: `localhost`, `127.x`, `0.0.0.0`, `::1`, `*.localhost` (the phone itself); plain `http://` to anything that is not on the local network (a public host must use `https://`, so tokens never travel in clear text over the internet); any scheme other than http/https; a user name or password in the address; `?` or `#` parts; an address that is empty, malformed or longer than 200 characters. An `http://` address is also refused with an explanation if the app's page happens to be served over HTTPS (mixed content), which cannot happen in the workflow's debug build.

**Test connection** is one read-only request, `GET <address>/` (the backend's existing root route, which returns the fixed greeting `{"message": "Welcome to StraySafe API"}`: it touches no database, needs no account, sends no cookies or credentials, changes nothing and returns nothing private). No backend change was needed. Time limit 8 seconds. Outcomes:

| Outcome | Meaning |
|---|---|
| Reachable | the answer is the StraySafe API |
| Not reachable | no answer within the time limit |
| Connection failed | the connection failed outright: wrong address, server or tunnel off, phone offline, blocked by a firewall, or an HTTPS certificate Android does not trust. The web view cannot tell these apart, so the message lists the likely causes for the kind of address (LAN or HTTPS) |
| Not the StraySafe API | something answered but not with the greeting (an error status such as 404/502 from a tunnel whose backend is down, a web page, a tunnel warning page, another service) |

**Save & connect** tests the address first. If the test fails, the message is shown and a **Save anyway** button appears (for a server that is not running yet). If the app already has a connection, a confirmation sheet ("Switch backend?") shows the old and the new address and says what will happen; nothing is done until it is confirmed.

**What switching does** (`utils/devBackend.ts`, `switchBackend`):

1. `clearAuthStorage()` runs first (signs out locally and lets push notifications stop with the old server).
2. **Everything the app stored in the web view is removed**, in both `localStorage` and `sessionStorage`: the access token and resident session, the refresh token, cached chats, a sign-up in progress, the activity clock, push opt-ins and every other flag. Only the new address is kept. No token or private data from one environment can be sent to another.
3. The app reloads at `/resident-app/welcome`; the person signs in again. (`utils/api.ts` reads the address once, when the page loads, so a reload is what makes every screen use it.)
4. Nothing is deleted on either server, and the old server is not contacted.

**One address everywhere.** The saved address (else the optional built-in one, else none) becomes `API_BASE_URL` in `utils/api.ts`, which the shared `api` client (reports, uploads through the backend, pets, notices, cases, claims, notifications), the sign-up/OTP/sign-in calls, the token refresh, the sign-out, push and avatar URLs all read. There is no second client and no fallback: if a request fails the app shows an error, it never retries against another server. Photos in a report's case chat and in ownership claims still go straight to Cloudinary (see the secrets below).

**Backend requirements for a LAN address** (nothing in the backend changes): start it so other devices can connect (`uvicorn app.main:app --host 0.0.0.0 --port 8000`); the phone and the computer on the same Wi-Fi; the computer's firewall allows the port; CORS must allow the app's origin `http://localhost` (the backend's built-in list already contains it and always merges with `CORS_ALLOWED_ORIGINS`; it also exposes `X-Refresh-Token`). **For a tunnel, the preferred development tunnel is Cloudflare Quick Tunnel:** with the backend running on port 8000, run `cloudflared tunnel --url http://localhost:8000` and enter the `https://….trycloudflare.com` address it prints in Connection Settings (daily start-up and phone steps: [tunnel.md](../../tunnel.md)). **Each restart of the tunnel generates a new HTTPS URL**, so enter the new one again (switching backend signs you out). The backend needs nothing for the tunnel's host: the app's own origin is `http://localhost`, which its CORS already allows. Any other tunnel must also give a valid `https://` certificate and must not put a warning page in front of browser requests (some free ngrok plans do; that is reported as "Not the StraySafe API").

### Release-style build: one fixed HTTPS address

`--mode android` requires `VITE_API_BASE_URL` and stops before bundling anything if it is missing or unusable. It reads no saved address and has no Connection Settings.

### What the build checks (both modes)

`frontend/scripts/androidApiUrl.ts`, called from `vite.config.ts`: a built-in address must be an `https://` address with no `localhost`/`127.x`/`0.0.0.0`/`::1`, no user name or password, no `?`/`#` and no trailing slash. In the debug mode it may be left out; if given it is checked the same way. A plain-http (LAN) address is never built into an APK: it is typed into the debug app on the phone.

### Photos and the Cloudinary secrets

Photos in a report's case chat and in ownership claims go straight from the app to Cloudinary: add the repository **secrets** `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` (same values as the root `.env`). Without them the app builds but those uploads fail (the workflow warns). Photos on reports go through the backend.

## Debug versus release, in one table

| | Debug app (`android-debug` + `assembleDebug`) | Release-style (`android` + `assembleRelease`) |
|---|---|---|
| Connection Settings screen, bar, Settings row | present | **not in the bundle** |
| Saved address read | yes (validated again on every read) | **no** |
| Built-in address | optional, HTTPS | required, HTTPS |
| The app's page is served as | `http://localhost` (`STRAYSAFE_ANDROID_DEBUG=true` at `cap sync`) | `https://localhost` |
| Cleartext (`http://`) traffic allowed by Android | yes, only in the debug build type: `android/app/src/debug/AndroidManifest.xml` sets `usesCleartextTraffic="true"` | **no**: the main manifest sets nothing, so Android's default for apps targeting API 28+ applies (HTTPS only) |
| Certificate checking | Android's own; never bypassed | Android's own; never bypassed |

There is no network security configuration, no custom trust anchor and no wildcard exception anywhere. The page is served as `http://localhost` in the debug app because a page served over `https` may not call `http://` addresses; the `http://localhost` origin is a secure context in Chromium, so location and the other web features the app uses should behave the same (not yet tried on a device). A release APK must be made from `build:android` and a `cap sync` **without** `STRAYSAFE_ANDROID_DEBUG` (a future release workflow's job).

## Build and download the APK (GitHub)

1. Optionally add the variable `VITE_API_BASE_URL` (an HTTPS address, the first-launch default) and the two Cloudinary secrets, once. With no variable the app asks for an address when it first opens.
2. GitHub → **Actions** → **Build Android APK** → **Run workflow**. The workflow, `.github/workflows/build-apk.yml`, runs only when started by hand (it has no inputs now: the old `allow_http` switch is gone, because the debug app takes a LAN address on the phone), never runs on a push and never publishes or deploys anything.
3. When the run finishes (probably around 10 minutes; not yet measured, nothing has run), open it → **Artifacts** → **StraySafe-Resident-debug-apk** (a zip with `app-debug.apk`, kept 14 days). Unzip it outside the repository (Git ignores `*.apk`).
4. Copy the APK to an Android phone and open it (allow installing from that source when asked). **Uninstall an earlier build first:** every cloud build is signed with a new debug key, so Android refuses to update over a different one. (The saved backend address is lost with the uninstall; it is typed again.)

What the workflow does: checks the settings; Node 22 and `npm ci` from the lockfile; `npm run build:android:debug` (type check, then `vite build --mode android-debug`); `npx cap sync android` with `STRAYSAFE_ANDROID_DEBUG=true`; **two guards** that fail the run if the Connection Settings chunk is missing or the app's page is not `http://localhost`; Java 21; `./gradlew assembleDebug`; uploads the APK. The Android SDK, Gradle and their caches are on the GitHub runner; none of it is downloaded to a laptop. The local script (`npm run build:android:debug`) exists for completeness, but building an APK locally is not part of this plan.

## Checked offline, and not checked

Checked (no Android SDK, Gradle, emulator or device, nothing installed, no GitHub run):

- the address logic: normalization, validation, the five test outcomes (with a stubbed `fetch`), persistence across a simulated restart, wiping everything on a switch (`tests/devBackend.test.mjs`);
- the **real** `utils/api.ts` loaded by Vite in each build mode with fake storage and a stub network (`tests/devBackendApi.test.mjs`): in the debug mode every request in a sequence covering sign-in, OTP, report creation, a media upload, pets, notices, cases, claims, notifications, a 401 → refresh → retry, and sign-out went to the saved address; a damaged saved value is ignored; with no address at all the base is empty (not `localhost`, not `/api`); the release-style mode ignores a saved address; the web production and development modes are unchanged;
- the screen renders without errors for the three starting situations (`tests/devConnectionPage.test.mjs`, a server-side render: **taps, typing and the confirmation sheet were not exercised**);
- real `vite build` runs: the debug build emits one `ConnectionPage` chunk and contains the screen's text; the release-style build has **no** `ConnectionPage` chunk and none of the screen's, bar's or Settings row's text; neither Android build contains the Admin interface, the preview chunks, the sample credentials or the simulation tools; the web build has an `AdminLiveRoot` and a `ResidentLiveRoot` chunk, with no debug text and no preview or sample-data chunk (re-verified 2026-11-10, when the legacy portals and previews were removed); the build refuses a missing address (release-style), `http://…`, `localhost` and a trailing slash in both modes;
- `capacitor.config.ts` evaluated with and without `STRAYSAFE_ANDROID_DEBUG`; both manifests parse, the main one sets no cleartext attribute and only the debug overlay does; the overlay is not git-ignored;
- the workflow: YAML, a manual trigger only, no `push`/`schedule`/release/deploy step, all 7 shell blocks pass `bash -n`, the settings check and the two guards run against sample inputs; `tsc`, lint of the changed files and the unit test suite.

**Not verified until the workflow has actually run:** that the APK builds (the `MainActivity` change and the debug manifest overlay have not been compiled or merged by Gradle; the runner image must have Android platform 36, which `compileSdk` requires); and everything that needs a phone: Connection Settings itself (typing, the tests, the confirmation, the reload), a LAN request and a tunnel request actually working from the web view, the back button, keyboard and safe areas on real devices, the location prompt, the system photo picker, the map tiles, sign-in against the backend, and session persistence.

## Before the first build: blockers and decisions

1. **Nothing is required before the first build now.** The `VITE_API_BASE_URL` variable is optional (a first-launch default) and so are the Cloudinary secrets (without them chat and claim photos fail). A staging backend still needs a valid HTTPS certificate if a tunnel or server (not the LAN) is used.
2. **The Android shell now opens the Resident app, not the legacy site.** The same Capacitor project and application ID used to load the whole legacy web app, and its workflow also ran on every push touching `frontend/`. Both are replaced: the workflow is manual only, and the app is the Resident interface. The legacy website, the live Admin interface and the web build are untouched. If the old legacy-shell APK is still needed, it needs its own build mode; say so.
3. **Camera:** decide whether the Resident app needs a "take a photo now" button (it needs `CAMERA` and a `capture` input). Today the system picker is used, which may not offer the camera on every phone.
4. **Debug signing only.** The APK is for testing. A release build needs a keystore kept in GitHub secrets and its own workflow (a separate decision): it would use `build:android`, a `cap sync` without `STRAYSAFE_ANDROID_DEBUG`, and `assembleRelease`.
5. **The debug APK is for developers.** Anyone who has it can point it at any backend they can reach; it must not be given to residents.

## Test checklist on a phone

Install; the app opens on Welcome (not the Admin portal, not the legacy site), or on "Connect to a backend" if no address was built in. **Connection:** the amber bar shows the address; tap **Connection**; **Test connection** on your computer's `http://<its Wi-Fi address>:8000` says Reachable; try `localhost` (refused with the reason) and a wrong address (a clear failure); **Save & connect** (confirm when asked), the app reloads on Welcome; the bar shows the new address; do the same with an `https://` tunnel; repeat from Settings → Developer once signed in; confirm you are signed out after a switch. **App:** register and verify with the emailed code, or sign in; Home loads the subdivision's own name; file a report: tap the map pin and "Use my current location" (allow when asked), add a photo from the gallery; submit; My reports shows it; press Back from a nested screen (should go back one screen) and from Home (should leave the app: if it goes back to a sign-in screen instead, report it); rotate the phone, open the keyboard on a text field (the field stays visible and the bottom bar is not hidden); switch to airplane mode (the app says it can't reach the server and recovers); close and reopen the app (still signed in, same backend).
