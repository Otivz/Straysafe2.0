# Testing

Status: Current inventory (written 2026-10-25 from repository evidence). **Pass/fail results are not recorded here**; a full run of every suite was not done for this baseline.

## What exists

| Suite | Location | How it runs | Covers (from file names and headers) |
|---|---|---|---|
| Backend scripts | `backend/tests/` (95 `.py` files) | `.venv\Scripts\python.exe backend/tests/<file>.py`, one at a time; each prints its own pass count | sessions and sign-in (`test_session_security`, `test_app_stay_signed_in`), report visibility and edit authorization (`test_report_visibility`, `test_report_edit_auth`), AI pipeline and matching, claims, adoption stages and authority, pet records and ownership, admin controls, notifications, analytics |
| Frontend unit | `frontend/tests/*.test.mjs` | `node frontend/tests/<file>.test.mjs` | claim evidence, data refresh, original sighting, personnel availability |
| Frontend browser | `frontend/tests/*.browser.mjs` with `fixtures/*.tsx` | `node frontend/tests/<file>.browser.mjs`; needs Vite on port 5173 and local Chrome | claim evidence, match-review location, notifications, pet claim records, pet photo access, adoption details |
| Type check and build | `frontend/` | `npm --prefix frontend run build` | TypeScript and Vite build |
| Lint | `frontend/` | `npm --prefix frontend run lint` | ESLint; last result **Unverified** |

Backend tests build throwaway SQLite databases; they must not be pointed at the application database. **Exception:** `test_admin_001_users_rbac.py` and `test_admin_003_admin_create_user.py` import the real app and use the configured database (`.env`); `test_admin_003` creates two user accounts there and deletes them at the end. Run them only against a database you can restore, or convert them to an in-memory database first. There is no aggregate test command, no coverage measurement, and no CI that runs tests (the only workflow builds the APK).

## Results recorded elsewhere (point in time, not re-run for this baseline)

| Date | Area | Reported result | Source |
|---|---|---|---|
| 2026-10-22/24 | Map pages (picker, pins, small maps, geofence radius, error cases, phone card) | browser checks all passed at 360 to 1366 px; `test_report_edit_auth` 36/36, `test_report_visibility` 76/76, `test_app_stay_signed_in` 19/19 | map audit (deleted from the working tree in commit `5e46d00`; last version: `git show 8cb074f:STRAYSAFE_MAP_AUDIT_AND_IMPROVEMENTS.md`) (section 5) |
| 2026-10-25 | Pet record custody permission and related claim checks | 16 permission tests and several existing suites reported passing | [CLAUDE_HANDOFF](../../CLAUDE_HANDOFF.md) |

These are reports by earlier work sessions. Treat them as leads, not as current evidence.

## Adoption details UI validation — 2026-10-25

`node frontend/tests/adoptionDetails.browser.mjs` passed at 320, 375, 390, 430, 768, and 1280 px. It mounts the real adoption page with mocked APIs and verifies overflow, tabs, procedures, applicant information, assignment history/submission, certificate availability/preview/zoom, print-only PDF rendering, certificate delivery/handover callbacks, and staff restrictions. The frontend TypeScript/production build also passed.

The generated mock certificate PDF contained one page. Screenshots and PDF are local artifacts under `scratch/adoption-ui-review/`. Physical Android/Capacitor behavior, live delivery, and physical printing remain unverified. Details: [adoption UI change record](../05-operations/agents/feature-updates/2026-10-25_1347_adoption-details-ui.md).

## Gaps

- **Unverified:** current pass rate of the backend scripts and the frontend suites.
- **Not covered:** a real Android phone or the APK (GPS, two-finger map gestures, the Android back button), deployed environments, load or performance tests, accessibility audits.
- **Security audits:** none recorded. `security-audits/` and `evidence/` hold only placeholders.
- **Manual checklist:** the map checklist in the map audit (git history, commit `8cb074f`) (section 5a) is the only written manual test list; its unticked items are still open.
