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

The Phase 1 map checks below provide newer, scoped evidence; they do not establish a current pass rate for every suite.

- **Unverified:** current pass rate of the backend scripts and the frontend suites.
- **Not covered:** a real Android phone or the APK (GPS, two-finger map gestures, the Android back button), deployed environments, load or performance tests, accessibility audits.
- **Security audits:** none recorded. `security-audits/` and `evidence/` hold only placeholders.
- **Manual checklist:** the map checklist in the map audit (git history, commit `8cb074f`) (section 5a) is the only written manual test list; its unticked items are still open.

## Restored incident maps — 2026-10-30

Verified 16 checks in `frontend/tests/heatmapRules.test.mjs` and the existing 9 checks in `frontend/tests/originalSighting.test.mjs`. The new helper and browser fixture pass scoped ESLint checks. The frontend type check/production build passes; the existing large-chunk warning remains.

`frontend/tests/phase1Maps.browser.mjs` passes 14 scenarios at 390 and 1280 px. It mounts the real Admin, Subdivision, Barangay and resident report pages through `tests/fixtures/phase1Maps.html` and its TSX fixture. Coverage includes heat versus current pins, resolved/lost/category controls, hotspot click/zoom, empty data, report cards, expanded maps, absent selection markers/rings and public/owner/adopter directions.

Commands from the repository root:

```powershell
node frontend/tests/heatmapRules.test.mjs
node frontend/tests/originalSighting.test.mjs
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174 --strictPort
# In another terminal, with that server running:
node frontend/tests/phase1Maps.browser.mjs
```

`PHASE1_MAPS_TEST_URL` and `CHROME_BIN` can select a different local Vite address or Chrome executable. The browser runner uses a temporary isolated profile, mocks every application API in memory, and blocks backend/external requests; it does not modify live data. The fixture displays a persistent synthetic-data notice. Native Android, real routing/GPS and tile-provider/network availability remain unverified.

Current behavior: [Incident map and hotspot rules](../01-system/HEATMAP_RULES.md).

## Phase 2 holding, custody and adoption compatibility — 2026-10-30

The following isolated backend checks pass (146 checks total):

| Script | Checks | Focus |
| --- | --- | --- |
| `backend/tests/test_holding_leader_barangay_view.py` | 25 | Account-bound read scope, parameter bypasses, detail access, read-only Barangay records, earlier pens and retained adoption promotion |
| `backend/tests/test_phase2_custody.py` | 18 | Resident care without intake/relocation, invalid custody combinations, new-pen restrictions and earlier designation handling |
| `backend/tests/test_holding_privacy.py` | 23 | Resident/staff visibility and evidence filtering |
| `backend/tests/test_holding_stay_clock.py` | 17 | Facility stay clocks and historical/discharged records |
| `backend/tests/test_adoption_catalog_handover.py` | 27 | Catalog reservations, two-way handover, release history and pet photos |
| `backend/tests/test_report_edit_auth.py` | 36 | Report editing, jurisdiction and media authorization |

The two new scripts create only in-memory SQLite stores and can be run with `.venv/Scripts/python.exe backend/tests/<script>.py`. Older scripts were run with an in-memory engine wrapper because Windows sandbox access prevented opening their temporary database files. The wrapper permits SQLite only; it never substitutes the configured application database:

```powershell
@'
import runpy, sqlalchemy
from sqlalchemy.pool import StaticPool
real_create = sqlalchemy.create_engine
def in_memory(url, *args, **kwargs):
    if not str(url).startswith('sqlite:'):
        raise RuntimeError('Only isolated SQLite is permitted')
    kwargs['poolclass'] = StaticPool
    kwargs['connect_args'] = {'check_same_thread': False}
    return real_create('sqlite://', *args, **kwargs)
sqlalchemy.create_engine = in_memory
runpy.run_path('backend/tests/test_adoption_catalog_handover.py', run_name='__main__')
'@ | .venv/Scripts/python.exe -
```

`node frontend/tests/phase2Holding.browser.mjs` uses the same local Vite setup as the Phase 1 suite, defaulting to port 5174. Its 18 scenarios cover 390/1280 px, same-Barangay read-only rows, earlier pens, dashboard counts, resident/held custody choices, submitted custody fields, single/multiple-animal panels, new-landmark settings and Barangay adoption controls. The fixture also checks both historical and current holding wording. All application APIs are mocked; backend and external requests are blocked.

The existing Phase 1 browser suite still passes 14 scenarios. The production build and scoped ESLint on `tests/fixtures/phase2Holding.tsx` pass. `PHASE2_HOLDING_TEST_URL` and `CHROME_BIN` configure the browser runner. Existing deprecation/build-size warnings remain; native-device and live-data checks are unverified. Current behavior: [Holding place and custody rules](../01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md).

## Phase 5 pet registration and match review - 2026-10-30

The following isolated backend checks pass (124 checks total):

| Script | Checks | Focus |
| --- | --- | --- |
| `backend/tests/test_pet_photo_multi_animal.py` | 30 | Pet-mode YOLO, no Gemini verdict, negative/unavailable detection, multi-animal crops/overrides, registration, permissions and side photos |
| `backend/tests/test_match_claim_shortcut.py` | 12 | Filed claim metadata, merged reports/aliases, rejection, cross-case aliases, staff jurisdiction and resident redaction |
| `backend/tests/test_pet_behavior_history.py` | 9 | Declaration preservation and verified incident-history protection |
| `backend/tests/test_pet_record_access.py` | 16 | Registry reads/writes and photo access |
| `backend/tests/test_match_review_location.py` | 7 | Owner-only match location and privacy |
| `backend/tests/test_claim_identity.py` | 12 | Claim decision and identity rules |
| `backend/tests/test_pet_adoption_lock.py` | 11 | Adoption indicators and ownership assignment locks |
| `backend/tests/test_adoption_catalog_handover.py` | 27 | Adoption catalog, handover, release and pet photos |

The first six scripts use in-memory SQLite and can run directly with `.venv/Scripts/python.exe backend/tests/<script>.py`. The last two were run through the SQLite-only wrapper above. No application database or live upload/AI services were used. Obsolete pet-photo recheck mocks were removed from the behavior/access tests because that job was removed.

`node frontend/tests/petRegistrationRules.test.mjs` passes 5 checks for legacy markings, real-detail round trips, unknown ages and staff route links. `node frontend/tests/claimEvidence.test.mjs` passes 8 existing evidence/retry checks. The frontend TypeScript/production build passes with the existing chunk-size warning. The new claim-link helper and Phase 5 TSX fixture pass scoped ESLint. A full clean lint result is not claimed; `petAge.ts` retains the same two lint findings as HEAD (an existing `let` and empty catch).

With Vite on port 5174, `node frontend/tests/phase5Pets.browser.mjs` passes 26 scenarios at 390 and 1280 px. It mounts the real guard, staff registration/edit, resident registration/edit, match modal, both claims pages and adoption-aware pet detail. It checks negative/error/multiple detections, reasoned overrides, pet-purpose requests, form cleanup, retained manual breed, empty markings, saved declarations, unknown ages, appearance-only comparison, claim navigation, empty review remarks, draft/refresh behavior and retained adoption locks. The fixture mocks APIs in memory, displays a persistent synthetic-data notice and blocks backend/external requests. Browser backend requests: zero.

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174 --strictPort
# In a second terminal:
node frontend/tests/phase5Pets.browser.mjs
node frontend/tests/petRegistrationRules.test.mjs
node frontend/tests/claimEvidence.test.mjs
# Scoped new-file lint, from frontend/:
node node_modules/eslint/bin/eslint.js src/utils/petClaimLink.ts tests/fixtures/phase5Pets.tsx
```

`PHASE5_PETS_TEST_URL` and `CHROME_BIN` override the local test address and Chrome path. Production services, real YOLO accuracy, live uploads/identity-document processing and Android remain unverified. Current behavior: [Pet registration and match review](../01-system/PET_REGISTRATION_AND_MATCH_REVIEW.md).
