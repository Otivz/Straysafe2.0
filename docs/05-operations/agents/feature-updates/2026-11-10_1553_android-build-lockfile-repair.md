# Android debug GitHub Actions build: npm 10 lockfile repair

- **Date:** 2026-11-10 15:53 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/package-lock.json`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-10_1553_android-build-lockfile-repair.md`
- **Authorization:** The developer's "StraySafe 2.0 — Final GitHub Actions Build Fix" explicitly approves keeping the existing Android debug workflow correction, repairing the missing lockfile entries without upgrades, validating npm 10.9.3 compatibility, and committing both fixes with directly related documentation in one commit followed by a normal push to `origin/main`.
- **Type:** Fix

## Intent

Complete the lockfile follow-up identified in the [earlier workflow correction](2026-11-10_1541_android-debug-workflow-blank-api-url.md). That permanent record describes the earlier state, when lockfile repair and publishing were not yet authorized. Both are now explicitly authorized. The existing workflow correction and its operations documentation are retained without further changes.

## Key changes

- Generate a candidate lockfile using npm 10.9.3 with `install --package-lock-only --ignore-scripts --no-audit --no-fund` in a temporary copy containing only the frontend manifest and lockfile.
- Apply only its eight missing package entries: root `@emnapi/core` and `@emnapi/runtime` at 1.11.3, and the six bundled entries under `@tailwindcss/oxide-wasm32-wasi` (`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`, and `tslib`). Bundled entries correctly have no separate resolved URL or integrity hash.
- Preserve every existing package entry exactly, including versions, resolved URLs, integrity hashes and peer flags. Discard npm's unrelated peer-flag normalization. No package is removed, no manifest is changed, and the lockfile diff contains only 89 added lines.
- Index this record in `docs/README.md`. The combined commit also includes the previously implemented workflow correction, `docs/05-operations/ANDROID_RESIDENT_APP.md`, `docs/05-operations/README.md`, and its original change record.

## Validation evidence

- Node 22.19.0 and npm 10.9.3: `npm ci --dry-run --no-audit --no-fund --loglevel=error` in the repository's `frontend/` exits 0. This is a dry run; its printed package additions/removals describe proposed actions only.
- npm 10.9.3 in a temporary manifest/lockfile-only copy: `npm ci --dry-run --ignore-scripts --no-audit --no-fund --os=linux --cpu=x64 --loglevel=error` exits 0, checking resolution for the GitHub runner platform.
- JSON comparison confirms every original package entry and all original top-level metadata are unchanged; eight entries are added, none removed.
- Workflow parses as YAML, remains manual-only, and passes 11 replays of the actual settings script using Git Bash and temporary `GITHUB_ENV` files. Unset, empty and whitespace-only values export nothing; HTTPS is trimmed and exported; explicit HTTP, scheme-less addresses, embedded spaces and newline injection are rejected.
- `node --experimental-strip-types frontend/tests/androidApiUrl.test.mjs`: 7/7 pass. `node --experimental-strip-types frontend/tests/devBackend.test.mjs`: 18/18 pass, with stubbed network and in-memory storage.
- Isolated Vite web bundles using copies of the actual source/configuration and existing node_modules, with no `.env` files copied: `android-debug` succeeds with an unset value and with whitespace, and emits the Connection Settings chunk in both cases. `android` rejects unset, blank and HTTP values; HTTPS succeeds and excludes the Connection Settings chunk. No Android compilation, Gradle or Capacitor sync runs locally.
- Documentation audit baseline (`agent-docs-kit` 1.3.8, `audit documentation --strict`): 12 existing failures, comprising eight broken links and four missing agent pointers. They are outside this approved repair and are not cleaned up here.

## Remaining verification

The GitHub workflow must be started manually after the push. A successful APK build and phone behavior remain unverified until that run succeeds and the artifact is tested. Any nonblank repository API variable must still be a valid HTTPS address; delete or correct an explicit invalid value before rerunning. No GitHub settings, MySQL, `.env` files, application source, or Android project files are changed.
