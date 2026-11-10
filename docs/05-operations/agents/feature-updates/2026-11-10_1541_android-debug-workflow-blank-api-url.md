# Android debug workflow: a blank or missing backend address no longer stops the APK run

- **Date:** 2026-11-10 15:41 (UTC)
- **AI tool:** Claude Code (Sonnet 5.5)
- **Files changed:** `.github/workflows/build-apk.yml`, `docs/05-operations/README.md`, `docs/05-operations/ANDROID_RESIDENT_APP.md`, `docs/README.md`
- **Authorization:** the developer's brief "StraySafe 2.0 — Fix Android Debug APK GitHub Actions" (2026-11-10), written after the first run of `Build Android APK` failed with `VITE_API_BASE_URL must start with https://`. The brief asks for the smallest correct fix and forbids redesigning the connection system, changing the backend, database, `.env` or credentials, installing dependencies, running broad tests, touching unrelated files, and committing or pushing without approval.
- **Type:** Fix

## Intent

The debug Android app takes its backend address on the phone (Connection Settings), so a debug build must not need a fixed address. An unset or blank `VITE_API_BASE_URL` has to be accepted; LAN `http://` and HTTPS tunnel addresses stay usable on the phone; an address that is built in stays validated; and the release build (`--mode android`) keeps requiring one HTTPS address. The first cloud run never reached the build.

## Root cause

Run 42843658919 (manual dispatch, job `apk`, commit `6db99de`) failed at step 3, **Check the settings**; steps 4 to 12 (Node, install, build, sync, Gradle, upload) were skipped. The message was that step's own (`::error::VITE_API_BASE_URL must start with https:// (or be removed: ...)`), not the build guard's (`androidApiUrlProblem` in `frontend/scripts/androidApiUrl.ts`, which ends "(it starts with X://)").

The old job read `VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}`. A variable that does not exist evaluates to an empty string, and the old step accepted an empty string, so its failing branch can only run when the repository has an Actions variable `VITE_API_BASE_URL` whose value is not empty and does not start with the lowercase text `https://`. The value itself is not readable without repository admin access (the step's log in the Actions tab should show it under `env:`). Replaying the old step as the runner runs it (`bash -e`): unset and empty pass; one space, a line break only, a leading space, `HTTPS://...`, an `http://` LAN address and a host without a scheme all stop the run with that message.

The shell check also disagreed with the TypeScript guard, which trims the value and treats a blank one as not set: a value of only blanks (easy to paste into the GitHub form by accident) was an "address" to the shell and a blank to the guard. Separately, the operations README still said the workflow "needs the repository variable `VITE_API_BASE_URL`", builds "on pushes" and keeps the APK "30 days", none of which is true since the workflow became manual-only with an optional variable. That paragraph is a plausible reason the variable was created, but this is an inference.

## Key changes

- `.github/workflows/build-apk.yml`: the job-level `VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}` is removed. The step **Check the settings** now receives the variable as `RAW_API_URL`, removes leading and trailing blanks (spaces, tabs, line breaks) and then: nothing left → says so and exports nothing (the app asks for an address on the phone); a blank inside the value → stops and shows the value; starts with `https://` → exports `VITE_API_BASE_URL=<trimmed value>` through `GITHUB_ENV` for the later steps (a single line, so no second variable can be injected); anything else (an `http://` LAN address, an uppercase scheme, no scheme, quotes) → stops, shows the value and says where the variable lives (Settings → Secrets and variables → Actions → Variables). The header comment says a blank value counts as unset. The Cloudinary warning, the two guards, the manual-only trigger and every later step are unchanged.
- `docs/05-operations/README.md`: the Android paragraph corrected (manual only, nothing required, optional https variable, LAN address typed in the app, 14 days).
- `docs/05-operations/ANDROID_RESIDENT_APP.md`: the build steps and the "what the workflow does" paragraph say what the settings check accepts and where to fix a bad variable.
- `docs/README.md`: this record indexed.

Not changed: `frontend/scripts/androidApiUrl.ts` and `frontend/vite.config.ts` (the build guard: empty accepted only in the debug mode, HTTPS required in the release mode, explicit values always validated), the connection logic and Connection Settings, `capacitor.config.ts`, the Android project, the backend, the database, `.env*`, credentials, `frontend/package.json` and `frontend/package-lock.json`.

## Validation evidence

- The step's script was run exactly as the runner runs it (`bash -e`, a real `GITHUB_ENV` file) for 17 values. Unset, empty, a single space, a line break only, and tab/space/CR LF: exit 0, nothing exported. `https://api.example.org` plain, with a leading space, with a trailing line break and with blanks on both sides: exit 0, `VITE_API_BASE_URL=https://api.example.org` exported. `https://api.example.org` followed by a second line `PATH=/evil`, and `https://api example.org`: exit 1, nothing exported. `HTTPS://api.example.org`, `http://192.168.1.10:8000`, `abc-def.trycloudflare.com` and a quoted address: exit 1 with the value shown. `https://localhost:8000` and an address with a trailing slash pass this step and reach the build guard, which refuses them as before.
- The workflow still parses as YAML (js-yaml 4.1.1, from `frontend/node_modules`) and its only trigger is `workflow_dispatch`.
- `node frontend/tests/androidApiUrl.test.mjs`: 7 of 7 pass (the guard is unchanged).
- Real `vite build` runs with an explicit process value overriding the developer's `.env`: `--mode android-debug` with no address builds and emits the Connection Settings chunk; with an `https://` address it builds; with an explicit `http://` address it stops (the guard refuses it; a LAN address is typed on the phone); `--mode android` with no address stops; with an `https://` address it builds.
- Strict documentation audit (`npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`): 12 failures, the same count and kinds as the baseline recorded before this change (8 broken links: 2 in `docs/01-system/overview.md` and 6 in `docs/README.md`, all to files that do not exist; 4 missing agent-pointer files). None concerns this change: the new record resolves from `docs/README.md` and the new link in the operations README resolves.
- Working tree: the workflow and the documents above only; no commit, no push, no installation, no `npm ci` in the repository; `.env`, backend and database untouched.

## Not verified, and found while checking

- **No run of the edited workflow yet.** It has to be pushed first and then started by hand (Actions → Build Android APK → Run workflow). If the repository variable holds an `http://` LAN address, the first step will still stop the run, by design (an explicit value stays validated); delete or correct the variable (Settings → Secrets and variables → Actions → Variables) and run again.
- **Next blocker, not changed here:** `frontend/package-lock.json` has no `node_modules/@emnapi/core` and `node_modules/@emnapi/runtime` entries (1.11.3). `npm ci --dry-run` under npm 10.9.3 (the 10.9 line that Node 22 brings to the runner) fails with `Missing: @emnapi/core@1.11.3 from lock file`; npm 11.6.2 accepts the same file. The three earlier push-triggered runs (2026-11-07 14:27 and 14:33, 2026-11-08 12:34; commits `62e7ecc`, `316b537`, `ac2d2d2`) stopped at **Install packages**, while the runs of 2026-11-06 (last `a7693cf`) succeeded. A lockfile regenerated with `npm install --package-lock-only` under npm 10.9.3 in a scratch copy adds those two entries and six nested ones under `@tailwindcss/oxide-wasm32-wasi`, changes the `peer` flag on 16 existing entries, and leaves every version, `resolved` URL and `integrity` value unchanged; it passes `npm ci --dry-run` under npm 10.9.3 and 11.6.2. It is not applied: it is outside this change and needs its own approval and record.
