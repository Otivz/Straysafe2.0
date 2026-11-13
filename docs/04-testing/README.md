# Testing

Status: Current inventory (written 2026-10-25 from repository evidence). **Pass/fail results are not recorded here**; a full run of every suite was not done for this baseline.

## Update 2026-11-10: frontend suites of the legacy portals removed

The legacy portals were removed ([change record](../05-operations/agents/feature-updates/2026-11-10_1456_final-legacy-repository-cleanup.md)), and with them 14 frontend unit-test files, 23 browser runners and the `fixtures/` folder that mounted legacy components. The dated sections below that name `frontend/tests/*.browser.mjs` runners or the removed unit tests describe suites that **no longer exist**; they stay as the record of what was checked then. What remains is in the table below. The backend scripts were not removed: five of the older ones (`test_manual_matching`, `test_admin_003_admin_create_user`, `test_owner_warning_rules`, `test_case_review`, `test_false_alarm_auth`) still assert behavior of the retired Barangay accounts and pass only with `BARANGAY_WORKFLOWS_ENABLED=1` (default mode fails them; checked 2026-11-10).

## What exists

| Suite | Location | How it runs | Covers (from file names and headers) |
|---|---|---|---|
| Backend scripts | `backend/tests/` (106 `test_*.py` files) | `.venv\Scripts\python.exe backend/tests/<file>.py`, one at a time; each prints its own pass count | sessions and sign-in (`test_session_security`, `test_app_stay_signed_in`), report visibility and edit authorization (`test_report_visibility`, `test_report_edit_auth`), AI pipeline and matching, claims, adoption stages and authority, pet records and ownership, admin controls, notifications, analytics |
| Frontend unit | `frontend/tests/*.test.mjs` (8 files) | `node --test frontend/tests/*.test.mjs` | the two live interfaces' adapters (`adminLiveAdapters`, `residentLiveAdapters`), live helpers (dates, references, errors), data refresh, and the Android backend-address rules and Connection Settings page (`androidApiUrl`, `devBackend`, `devBackendApi`, `devConnectionPage`) |
| Frontend browser | `frontend/tests/liveInterfaces.browser.mjs` with `_liveHarness.mjs` | `node frontend/tests/liveInterfaces.browser.mjs`; starts and stops its own isolated API (port 8780), Vite dev server (5190) and Chrome | the Subdivision Leader (`/subd-admin`) and Resident (`/resident-app`) interfaces on the real routers and a throwaway SQLite file (60 steps on 2026-11-12) |
| Lost & Found matching (backend) | `backend/tests/test_lost_found_matching.py` | from `backend/`: `..\.venv\Scripts\python.exe tests/test_lost_found_matching.py` (throwaway SQLite) | 64 checks (2026-11-12): possible matches in both directions and either filing order, kind of animal as a hard rule, strong and possible, nobody but the Leader told before a decision, confirm / rule out / review again / moot, several found reports per lost report, closed reports, the check failing never blocks filing, scans, permissions and subdivision scope, the work queue |
| Lost & Found case messaging & bridge (backend) | `backend/tests/test_case_messaging.py` | from `backend/`: `..\.venv\Scripts\python.exe tests/test_case_messaging.py` (throwaway SQLite) | 100 checks (2026-11-12): 1-to-1 Leader–resident direct chats with automatic Activity logging, manual Lost/Found linking and unlinking, 1-to-1 resident-to-resident communication bridge, automatic closure of all open conversations on case closure, Barangay-only referrals |
| Lost & Found, Leader screens (unit) | `frontend/tests/adminLostFound.test.mjs` | from `frontend/` in PowerShell: `node --test tests/adminLostFound.test.mjs` | 13 tests (2026-11-12): the adapter, which matches are waiting, a report seen from either side, a missing pet and a found animal "monitored from the start", what deciding a match sends |
| Lost & Found, Leader page logic | `frontend/tests/adminMonitoredCase.test.mjs` | from `frontend/` in PowerShell: `node --test tests/adminMonitoredCase.test.mjs` | 15 tests (2026-11-13): nothing is asked of a report just filed; what needs the Leader and in which order; the system's link record is never a lead; a silent Barangay is asked about only after days; the situation tiles (the notice and the alerts each have their own; a private report has neither) and the calm line; the animal, the people and the activity |
| Lost & Found notification alerts (backend) | `backend/tests/test_case_alerts.py` | from `backend/`: `..\.venv\Scripts\python.exe tests/test_case_alerts.py` (throwaway SQLite) | 62 checks (2026-11-13): an alert never touches the Community notice; now / later / repeating at any interval or set times, every repeat ends; the 5-minute floor, the 60-day limit, the 60/180 lengths and the public-text rule; exactly once (a claimed occurrence is refused), only the latest missed send after downtime; pause, resume without catch-up, edit (future only), stop and cancel; recipients (switch off, sighting reporters, never the reporter or owner) and `push_ready`; one in-app row per alert and where a tap goes; closing the case stops them; only the case's Leader; the SQL migration check |
| Android push, FCM (backend) | `backend/tests/test_push_fcm.py` | from `backend/`: `..\.venv\Scripts\python.exe tests/test_push_fcm.py` (throwaway SQLite, a fake Google endpoint, no credentials) | 25 checks (2026-11-13): FCM on only with the service-account file (or the key in `~/.straysafe/` when no variable is set; an empty variable is off); messages ring and vibrate at high priority on the right channel; the app's token registered, moved to the account that signs in, removed at sign-out; sent through FCM HTTP v1 with the text and the tap target; each delivery claimed once, a crashed claim never resent; busy → retried, gone → device revoked |
| Lost & Found alert schedule (Leader window) | `frontend/tests/adminAlertSchedule.test.mjs` | from `frontend/` in PowerShell: `node --test tests/adminAlertSchedule.test.mjs` | 7 tests (2026-11-13): the window's plan of sends (now, later, every N, set times, a later start, a number of sends), the safeguards and the heavy-schedule warning, what is sent to the server, an alert opened for editing, the words on the case page |
| Lost & Found, Resident conversations & Home attention | `frontend/tests/residentCaseMessages.test.mjs` | from `frontend/` in PowerShell: `node --test tests/residentCaseMessages.test.mjs` | 6 tests (2026-11-12): thread notification links, privacy of participant summaries, Home "Needs your attention" prioritization and read state |
| Lost & Found, Leader & Resident browser journey | `frontend/tests/liveLostFound.browser.mjs` | from `frontend/` in PowerShell, `PYTHON` set to the project's `.venv` python: `node tests/liveLostFound.browser.mjs`; its own isolated API (port 8781), Vite (5191) and Chrome | 14 steps (2026-11-12): suggested and nobody told, the dashboard, the comparison, rule out and review again, confirm (both residents told), the calm page of a missing pet and of a found animal (no tabs, no toolbar, one status, one strong button at most), the Barangay choice, 1-to-1 Leader contact, 1-to-1 resident-to-resident bridge, unlink and manual relink, mobile and desktop widths |
| Type check and build | `frontend/` | `npm --prefix frontend run build` | TypeScript and Vite build |
| Lint | `frontend/` | `npm --prefix frontend run lint` | ESLint; 2026-11-01: 2,013 problems (1,887 errors, 126 warnings) across the frontend, mostly pre-existing; see the Phase 9 section |

Backend tests build throwaway SQLite databases; they must not be pointed at the application database. **Exception:** eight scripts import the real app and use the configured database (`.env`): `test_admin_001_users_rbac`, `test_admin_002_notifications_rbac`, `test_admin_003_admin_create_user`, `test_admin_010_direct_action`, `test_admin_011_warnings`, `test_admin_012_gemini_governance`, `test_admin_013_real_metrics` and `test_phase_2_stability`. Importing the app also runs its startup schema steps against that database. `test_admin_003` creates two user accounts there and deletes them at the end. Run them only against a database you can restore, or convert them to an in-memory database first. There is no aggregate test command, no coverage measurement, and no CI that runs tests (the only workflow builds the APK).

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

The existing Phase 1 browser suite still passes 14 scenarios. The production build and scoped ESLint on `tests/fixtures/phase2Holding.tsx` pass. `PHASE2_HOLDING_TEST_URL` and `CHROME_BIN` configure the browser runner. Existing deprecation/build-size warnings remain; native-device and live-data checks are unverified. Current behavior: [Holding place and custody rules](../archive/legacy-retirement/HOLDING_PLACE_AND_CUSTODY_RULES.md).

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

## Phase 9 full regression — 2026-11-01

Point-in-time results for the restore plan's Phase 9. They cover the working tree after Manual Matching, owner-first pet matching and Phases 6–8.

| Check | Command | Result |
|---|---|---|
| Backend scripts (isolated) | Each `backend/tests/test_*.py` with `DATABASE_URL=sqlite:///:memory:` set, and `GEMINI_API_KEY`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_URL` and `VAPID_PRIVATE_KEY` set empty, so no test can reach external services | **101/101 passed**. The 8 scripts that use the configured database (listed above) were **not run** |
| Frontend unit | `node --test frontend/tests/*.test.mjs` | **79/79 passed** |
| Phases 6–8 browser | `npx vite --port 5175 --strictPort --host 127.0.0.1` in `frontend/`, then `node frontend/tests/phase6to8.browser.mjs` | **24 scenarios passed** at 390 px, 1280 px and 390 px dark. Backend requests: 0 |
| Earlier browser suites | Same server, with `PHASE1_MAPS_TEST_URL`, `PHASE2_HOLDING_TEST_URL` and `PHASE5_PETS_TEST_URL` set to `http://127.0.0.1:5175` | Phase 1 maps 14, Phase 2 holding 18 and Phase 5 pets 26 scenarios passed |
| Older browser suites | `adoptionDetails`, `chatCache`, `claimEvidence`, `matchReviewLocation`, `notifications`, `petBehaviorHistory`, `petClaimRecords` and `petPhotoAccess` with their `*_TEST_URL` set to the same server | **Could not run in this environment.** Each timed out on its first page evaluation, including `chatCache` and `adoptionDetails`, which mount screens this work didn't change. These suites serve their page through request interception, unlike the passing ones. Not evidence either way |
| Type check and build | `npm --prefix frontend run build` | Passed (existing large-chunk warning remains) |
| Lint | `npm --prefix frontend run lint` | 2,013 problems. For the 20 existing frontend files this work changed, ESLint was compared with each file's committed version: no new errors on lines this work wrote. The only increases are on lines already changed before this work (`SubdSidebar.tsx` +1, `BrgyReportView.tsx` +7). New files lint clean |
| Whitespace | `git diff --check` | Clean |
| Documentation | `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` | PASS |

Phase 9 also fixed two problems:

- A note on a report under owner observation was titled "Moved to holding place" on the timeline. It is now "Observation update".
- The `test_multi_animal_split` claim fixture claimed animals nobody held, so the fixture now marks them as held.

Not done: the 8 database-backed scripts, native Android, live GPS and network, and checks against real data.

## Claiming fines and fees - 2026-11-01

`backend/tests/test_claim_fees.py` passes 66 isolated checks (its own temporary SQLite file):
- the RA 9482 dog range;
- the manual cat claiming charge: nothing added automatically; amount, description and reason / basis required; negative, letters and more than 2 decimals refused; "no charge applicable" with a reason; adjustments on record; dog and cat fields kept separate; no configured cat fine;
- impounding and boarding fees;
- permissions;
- adjustments and waivers with reasons, and the change log;
- payment with the official receipt;
- the handover gate on the claim endpoint and in `record_owner_return`;
- cancellation on rejection;
- audit actions.

Run it with `.venv/Scripts/python.exe backend/tests/test_claim_fees.py`.

With local Vite on port 5175, `node frontend/tests/claimFees.browser.mjs` passes 14 scenarios at 390 and 1280 px. It covers:
- the dog assessment with the range check, total preview and confirmation step, payment with OR, and the settled state;
- a cat claiming charge typed in by staff (no default, invalid amounts refused, description and basis required, the total is the entered amount);
- a cat with "no charge applicable" and its reason;
- a waiver with a reason;
- Subdivision Leader and resident read-only views;
- the settings tab, where a legal basis is required.

All APIs are mocked with synthetic data. Backend and external requests are blocked. `CLAIM_FEES_TEST_URL` and `CHROME_BIN` override the address and Chrome path.

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5175 --strictPort
# In a second terminal:
node frontend/tests/claimFees.browser.mjs
```

Earlier behavior (the subsystem was retired 2026-11-10): [Claim fee assessment rules](../archive/legacy-retirement/CLAIM_FEE_ASSESSMENT_RULES.md). Not verified: real payments and receipts, and the legal citations themselves.

## Improvement pass: access, performance, build, accessibility - 2026-11-02

- `backend/tests/test_announcement_access.py` (16 checks, isolated SQLite) covers announcement reads:
  - anonymous requests are refused;
  - the subdivision and barangay listings (drafts included) are only for that area's officials;
  - a resident's feed is only their own.
- `backend/tests/test_holding_list_queries.py` (11 checks):
  - the batched adoption-eligibility check gives the same answers and reasons as the per-animal check for every kind of evidence;
  - `GET /holding/` uses a constant number of queries (10, measured) as the list grows.
- `npm --prefix frontend run build` (type check, then bundle) passes again.

## Compact subdivision observation interface - 2026-11-06

`frontend/tests/underObservation.browser.mjs` runs the existing `/subd/under-observation` page against mocked APIs in an isolated Chrome profile. Start a local Vite server, then run from the repository root:

```powershell
$env:OBSERVATION_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/underObservation.browser.mjs
```

The runner checks 320, 375, 390, 430, 640, 767, 768, 1024, 1280 and 1536px layouts: compact equal-height summary cards, a full-width status dropdown below 768px, wrapping desktop status tabs, responsive controls, small photos, elapsed observation progress, and card-only case presentation without a Table toggle. It exercises all summary and category filters through the mobile dropdown and desktop tabs, verifies that summary selections stay synchronized with the dropdown (including combined Warning & Escalation), and checks search and reset, the existing observation-day filter, refresh, case navigation, warning/referral dialog opening, and empty/error states. API mutations are prohibited in this regression; it does not issue warnings, refer cases, or change real records. Mobile and desktop previews are saved to uniquely named files in the system temporary directory.

The list reuses the existing status/day badges, shared subdivision navigation, colors, fonts and rounded card/button styles. All four summary categories and stage-specific actions remain available. Backend workflow rules and persistence are unchanged.

## Barangay trace removal Phase 1 - 2026-11-06

Current behavior: Admin user management offers Resident/Citizen, Subdivision Leader and Administrator provisioning. Historical Barangay accounts remain available through a separate read-only history filter, without edit/delete/invite/head-designation actions. Default backend retirement guards refuse new role-3 accounts, new head authority and head assignment, and refuse setup invitations for retired accounts. The existing `BARANGAY_WORKFLOWS_ENABLED` switch still restores legacy backend behavior; the Admin UI stays scoped to supported roles. Public signup retains its existing unverified-resident role clamp.

Commands from the repository root:

```powershell
.venv\Scripts\python.exe backend/tests/test_barangay_provisioning_retired.py
.venv\Scripts\python.exe backend/tests/test_admin_invite.py
.venv\Scripts\python.exe backend/tests/test_barangay_gate.py
# With an isolated local Vite server running on port 5180:
$env:PHASE1_ADMIN_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/adminRetirementPhase1.browser.mjs
$env:ARCHIVE_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/adminArchive.browser.mjs
npm --prefix frontend run build
```

All three backend scripts set a temporary SQLite database before importing application models/routes and mock mail delivery; they do not import the application startup module or use the live database. Recorded results for this phase: 44 provisioning, 28 invitation and 50 existing retirement-gate checks passed. The mocked Phase 1 browser suite passes at 390 and 1280px, covering supported creation/editing, historical account visibility, role/position restrictions and current/legacy referral preview/print consistency. The existing Admin archive browser suite passes. The production build passes with the existing large-chunk warning. Native print dialogs/physical printers and deployed environment-switch settings were not tested.

## Barangay trace removal Phase 2 - 2026-11-06

Phase 2 covers B03-B07: current dashboard counts/navigation, historical endorsement provenance, static earlier dispatch positions and viewer-only GPS directions, reference-only settings with preserved historical metadata, and neutral missing warning-issuer attribution. No current case/ownership transitions or archived record contents are rewritten.

```powershell
# Each backend script sets its own temporary SQLite database before importing routes.
.venv\Scripts\python.exe backend/tests/test_retired_landmark_designations.py
# Compatibility-only facility synchronization regression; use a separate terminal/process:
$env:BARANGAY_WORKFLOWS_ENABLED='1'
.venv\Scripts\python.exe backend/tests/test_facility_and_map_sync.py
Remove-Item Env:BARANGAY_WORKFLOWS_ENABLED
# With isolated local Vite on port 5180, from another terminal:
$env:RETIREMENT_PHASE2_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/adminSubdRetirementPhase2.browser.mjs
$env:REFERRAL_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/barangayReferral.browser.mjs
$env:PHASE1_MAPS_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/phase1Maps.browser.mjs
$env:PHASE5_PETS_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/phase5Pets.browser.mjs
npm --prefix frontend run build
```

Recorded results: 25 default/legacy landmark-designation checks and 20 legacy facility/map synchronization checks passed in isolated SQLite. The targeted Phase 2 browser suite uses mocked APIs and a MapComponent prop observer for current sightings, current referrals, stale active dispatch records, known/unknown historical custody coordinates, inline/expanded map parity, GPS success/denial, current/historical endorsement provenance, ordinary landmark creation/editing, warning histories and recorded adoption locks at 390 and 1280px. Its pet-only fixture includes a synthetic-data notice. Settings submissions are mocked; no live data is edited. The existing referral browser suite, all 14 real-Leaflet map scenarios and all 26 pet/ownership/adoption-lock scenarios passed. TypeScript and production build passed with the existing large-chunk warning. Real GPS, routing services, devices and production configuration remain unverified.


## Barangay trace removal Phase 3 - 2026-11-06

Phase 3 removes unreachable Admin dispatch state/controls and proven-unused Subdivision holding/claims/escalation pages, the unused Barangay matching wrapper and its wording-only utility/branches. Historical status labels, Admin archives, retirement/session guards and compatibility redirects remain. See the [implementation follow-up](../03-development/implementation-reports/BARANGAY_TRACE_REMOVAL_FOLLOWUP_2026-11-06.md) for caller evidence and remaining concerns.

With isolated local Vite on port 5180, run from the repository root:

```powershell
$env:ARCHIVE_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/adminArchive.browser.mjs
$env:PHASE2_HOLDING_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/phase2Holding.browser.mjs
$env:PHASE5_PETS_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/phase5Pets.browser.mjs
$env:PHASE6TO8_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/phase6to8.browser.mjs
$env:REFERRAL_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/barangayReferral.browser.mjs
# Existing account/print, Phase 2 presentation and real-Leaflet suites use the commands above.
npm --prefix frontend run build
```

The extended Admin suite mocks 16 status-only submissions and asserts that no responder ID or unused responder-directory fetch survives; archive checks still assert zero writes. The updated holding suite passes 14 scenarios, pet suite 26 and matching/owner/observation suite 24. Fixtures now exercise actual retired URLs and the current shared Potential Match Review modal. The matching regression checks that missing/pending owner responses block final submission, owner YES enables it and owner NO blocks confirmation; it does not finalize a real match. A role-3 claim component is mounted only for explicit legacy-compatibility regression, not as evidence that its portal is available. Matching test expectations for prior button/banner/photo-alt/observation labels were updated to the existing product UI; workflow code was not changed to satisfy them.

The three account/retirement backend scripts passed 122 checks again using temporary SQLite; all mail is mocked. All browser APIs are mocked or blocked, and no application backend/database is used. Existing Phase 1 print/account and Phase 2 dashboard/map/settings/pet-history regressions passed, together with referral/retirement-route checks. No new backend/schema changes were made in Phase 3. Strict documentation audit must be compared with the known 12 pre-existing findings rather than described as a clean baseline.

Final Phase 3 verification also passed all 14 real-Leaflet map scenarios and the TypeScript/production build (existing large-chunk warning). The strict documentation audit at 16:03 UTC returned the same 12 known broken-link/agent-pointer failures, with no new findings.


## Admin Holding Archive removal

Following the user's explicit removal request, the standalone Holding Archive is no longer mounted or linked in desktop/mobile Admin navigation. `/admin/holding-facility` redirects to `/admin/incidents`. Historical holding details remain visible inside related reports; the Adoption Archive remains read only. Earlier phase results above describe their point-in-time behavior before this decision.

The existing `adminArchive.browser.mjs` now checks removed holding navigation/redirect at 390/1280px, no holding-list fetch for that redirect, preserved report enclosure details, unchanged Adoption Archive and supported status overrides. `phase2Holding.browser.mjs` retains resident-custody/single/multi-animal checks and verifies both retired holding URLs (12 scenarios). `barangayRetired.browser.mjs` checks the updated Admin destination together with existing retired-role/login guards. These tests mock/block APIs in isolated Chrome; no real backend or database is used.

```powershell
# With isolated Vite on port 5180:
$env:ARCHIVE_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/adminArchive.browser.mjs
$env:PHASE2_HOLDING_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/phase2Holding.browser.mjs
$env:BRGY_TEST_URL='http://127.0.0.1:5180'
node frontend/tests/barangayRetired.browser.mjs
npm --prefix frontend run build
```

Removal verification passed all three browser scripts above and the TypeScript/production build. The documentation audit retains the same 12 existing findings; the browser checks do not use the application database.
