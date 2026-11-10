# Disk recovery and final integration validation

- **Date:** 2026-11-09 15:25 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/auth/AuthProvider.tsx`, `frontend/src/resident/auth/AuthProvider.tsx`, `frontend/tests/liveInterfaces.browser.mjs`, `docs/01-system/NEW_INTERFACES_INTEGRATION.md`, `docs/05-operations/CUTOVER_READINESS.md`, `docs/05-operations/agents/feature-updates/2026-11-09_1525_disk-recovery-final-validation.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Disk Recovery and Final Integration Validation", which names the three folder prefixes that may be removed and the conditions, orders the three interrupted suites to be re-run, and asks for focused regression checks. FREEZE was OFF. Nothing was committed or pushed.
- **Type:** Fix

## Intent

Follow-up to `2026-11-09_1350_frontend-backend-integration.md`, whose last regression run was cut short when the C: drive filled up. Recover the space safely, finish the interrupted validation, check that the final code still preserves what was promised, and stop. The earlier record stays as written; the corrections to it are in this one.

## Key changes

### Disk recovery (nothing in the repository, no application data)

- **Before:** 32.8 MB free (30.9 MB at the moment of deletion) on a 240 GB volume. **After:** 3,527.5 MB free. **Recovered:** about 3,497 MB.
- **Inspected first, nothing deleted:** every folder in the temp directory whose name starts with `sa-cdp-`, `straysafe-live-test-` or `straysafe-test-` (290 folders): path, creation and modification time, file count, size, contents. No process referenced them (checked by command line), no test port was listening, no backend was running. Every folder was created during this work (2026-11-08 20:32 to 2026-11-09 22:35); the newest had not been touched for more than 10 minutes. A manifest was written first and only its entries were deleted, each re-checked for exact prefix, parent folder and not being a link.
- **Classified:** 170 Chrome profiles (162 `sa-cdp-`, 8 `straysafe-live-test-`; every one has a `Default` folder and only standard Chrome entries), 113 `straysafe-test-` throwaway databases (each holds only `test.db`), 7 empty folders (launches that failed when the disk was full). None was uncertain, so none was excluded.
- **Removed:** all 290, 3,409.5 MB of file content; none failed. The whole temp directory, the repository, Git files, `.env`, SQL dumps, database files and the Claude checkpoint folders were not touched. (Earlier, three of my own regenerable scratch items were also removed: two build outputs and a lint report in the session scratch folder.)
- **Why it happened:** the scratch browser harness used for the preview suites killed one Chrome process, waited 0.3 s and ignored a failed removal, so on Windows (where Chrome's child processes keep profile files open) a profile of about 18 MB was left behind per launch; `backend/tests/_isolated_db.py` also leaves a database folder (about 1.2 MB) for every test run. The scratch harness now stops the whole process tree and retries the removal; it left nothing behind in this session's final runs.
- **After the final runs:** 4 more folders (1 browser profile from the interrupted session, 3 databases, 5.1 MB) were inspected the same way and removed; none remains.

### One fix, found by the login-appearance check

Both live sign-ins (`/subd-admin/login`, `/resident-app/login`) showed "Your session expired. Sign in again to continue." to every first-time visitor, and the Resident app sent a signed-out visitor to its login page instead of Welcome. Cause: on start-up each provider asked the server to verify a restored session even when none had been restored, and read "no session" as "the server disagrees". It also made three needless calls (`verify-session`, `refresh`, `logout`). The check "the original Subdivision Leader sign-in appearance is preserved" caught it. Fix: the verification runs only when a session was restored (one condition in `admin/auth/AuthProvider.tsx` and `resident/auth/AuthProvider.tsx`). Two browser steps now cover it: a first visit to each live sign-in keeps the original wording, shows no "session expired" and makes no `verify-session` request; a signed-out visit to a Resident page lands on Welcome. A restored but invalid session is still reported as expired (the existing expiry steps pass).

## Validation evidence

Everything ran on throwaway SQLite files or the preview, never against the configured database: the dev server for the preview suites had its API proxy pointed at an unreachable port, no backend was listening, and no backend test was run (none is needed: no backend file changed).

- **The three interrupted suites, re-run alone and sequentially, on the final code:** maps 84 of 84 checks, 0 page errors; Resident overflow sweep 31 screens, 0 with horizontal overflow, no errors; accessibility sweep 47 items, the list identical to the original baseline (same screens, same items).
- **Browser journey:** `node tests/liveInterfaces.browser.mjs` 43 of 43 steps (41 before plus the two above).
- **Focused checks** (a scratch script on the isolated stack, with the server's data changed to values the preview does not contain: reporting radius 750 m instead of 500 m, a landmark that exists only on the server, new office details): 25 of 25. The live Admin and Resident sign-ins render, with the original Subdivision Leader wording, no sample helper or credential and no false "session expired"; signed-out visitors are sent to sign in or Welcome; `/login`, `/staff/login`, `/admin/login` and `/resident-home` are still the legacy pages; the Admin and the Resident use the server's radius, centre and label; the Resident's landmark list is exactly the server's and lacks the preview's sample park; Contact and Settings show the server's office details, not the sample office; the location step offers the server's landmarks and states the server's radius.
- **Bundles, rebuilt from the final source:** the default build has no preview or live chunk and none of the 46 markers of the existing isolation check; the `VITE_NEW_UI=true` build has only `AdminLiveRoot-*` and `ResidentLiveRoot-*`, and none of 20 mock, sample-credential, seed-data, simulation-tool or preview-storage-key markers. A few strings from the preview remain in the pilot build, inert and shared with the live screens: the preview base path inside the shared path helper, one unused stylesheet rule, the shared reducers' simulation case names (dispatched only by preview-only files that are not in the live chunks) and the sample landmark names as the geography helper's fallback constant, which no live screen shows. Documented in `docs/05-operations/CUTOVER_READINESS.md`.
- **Preview and legacy suites on the fixed code:** Resident preview sign-in 40 checks, Admin sign-in 96, rename 30, Admin flows all passed, design tokens resolve in both UIs, legacy Admin/staff/Resident routes untouched with no page errors.
- **Types and lint:** `npx tsc -b` clean; `npx eslint src/admin src/resident src/live src/preview src/main.tsx` exits 0; `node --test tests/*.test.mjs` 158 of 158.

## Corrections to the earlier record

- Its browser count (41 steps) is now 43. Its note that the maps, overflow and accessibility suites were not re-run on the final code is closed: they were, and they match their baselines. Its risk 8 (disk full) is resolved by the cleanup above.
- Its statement that neither bundle contains a sample credential, preview tool or test-only string stands. "A few preview strings remain, inert" is the precise form (above).
- Its list of things the browser run found now has a ninth: the false "session expired" on first visits.

## Remaining risks and decisions

The open decisions of the earlier record are unchanged (no conversation view in the new Admin, functions only the legacy portals have, a run on a staging MySQL copy with the "Lost Pet is category 6" and time-zone checks, what a reporter's timeline may show, photo uploads and emailed codes not run end to end). New or still open:

1. **`backend/tests/_isolated_db.py` leaves a database folder per test run** (about 1.2 MB each, 119 had piled up). Not changed here (a shared helper for 130 tests). A follow-up: remove its folder when the process ends.
2. **Free space on C: is still low and moves by gigabytes** (2.7 to 8.7 GB seen during this task, with nothing of mine running); other applications are using the volume.
3. **The preview and legacy browser suites live in the session scratch folder, not in the repository.** Their baselines are recorded here and in the cutover document; moving them into `frontend/tests` is a separate decision.

## Not done

No commit, push, dependency change, `.env` change, migration or schema change; no backend test run; no access to the configured database. No application data and no source file was deleted: only throwaway test folders in the temp directory (290 and then 4) and three regenerable items in my own scratch folder.
