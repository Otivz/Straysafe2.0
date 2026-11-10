# Controlled cutover: are the new Admin and Resident interfaces ready?

Status: **Historical analysis (2026-11-09); the cutover was made on 2026-11-10.** It judged the state after the frontend–backend connection described in [NEW_INTERFACES_INTEGRATION.md](../01-system/NEW_INTERFACES_INTEGRATION.md). On 2026-11-10 the developer's cleanup brief made the two interfaces the only ones ([change record](agents/feature-updates/2026-11-10_1456_final-legacy-repository-cleanup.md)): the legacy portals, the previews and `VITE_NEW_UI` are gone and the old entry addresses redirect. Blocker 2 was settled by retiring the unreplaced legacy functions on purpose; blockers 1 (messages about a case in the Leader app) and 3 (a run on a staging MySQL copy) are still open. The rest of this document is the analysis as it stood on 2026-11-09.

## Verdict

**Ready for a controlled pilot. Not ready to replace the legacy portals.**

- **Pilot: yes.** Every in-scope action is wired to an existing endpoint, and the main journeys, including nearly every action that writes, were driven in a real browser against the real routers and passed (43 steps; the few that were not are listed under "What was not checked"). A pilot is opt-in (one build variable), so nobody is moved. Do it on a staging copy of the database first (blocker 3).
- **Replace the legacy portals: not yet.** Three things must be settled first. They are blockers 1 to 3 below, each with the decision it needs from the developer.

## What was checked

| Check | Command | Result on 2026-11-09 |
|---|---|---|
| Types | `cd frontend && npx tsc -b` | clean (exit 0) |
| Lint | `cd frontend && npx eslint .` | 1,868 errors and 146 warnings, **the same count as before this work** (525 files linted now, 492 before); every one is in a legacy file this work did not edit. None in `src/admin`, `src/resident`, `src/live`, `src/preview` or `src/main.tsx` (`npx eslint src/admin src/resident src/live src/preview src/main.tsx` exits 0) |
| Unit tests (adapters, dates, references, errors) | `cd frontend && node --test tests/*.test.mjs` | 158 of 158 pass (19 files; 47 are new: `liveHelpers` 6, `adminLiveAdapters` 21, `residentLiveAdapters` 20) |
| Browser journeys, real routers on a throwaway SQLite file | `cd frontend && node tests/liveInterfaces.browser.mjs` | 43 of 43 steps pass (about 3 minutes) |
| Live routes, sign-in wording, legacy routes and real-data maps, on the isolated stack with the server's data changed to values the preview does not contain | a scratch script (not in the repository) | 25 of 25: the live Admin and Resident sign-ins render (original Subdivision Leader wording, no sample helper, no false "session expired"), signed-out visitors are sent to sign in or Welcome, the four legacy routes are still the legacy pages, and both live apps use the server's reporting radius, centre and label, the server's own landmark list (not the preview's) and the server's office details |
| New and changed backend endpoints | `cd backend && python tests/test_case_notes_queue.py` (103 checks), `python tests/test_resident_live_api.py` (35), `python tests/test_case_lifecycle.py` (159) | all pass, in both modes below |
| Whole backend suite, one script at a time, isolated | every `backend/tests/test_*.py`, with an unreachable MySQL URL exported, in the default mode and with `BARANGAY_WORKFLOWS_ENABLED=1` | 136 files in each mode. The 134 files that existed before are identical to the last full run (same exit codes, same pass counts); the 2 new files pass; none reached for MySQL. Default mode still fails the 49 files that need the retired Barangay accounts; the legacy-flag mode still fails the same 3 (`test_monitoring_logs`, `test_multi_animal_split`, `test_session_security`). None is caused by this work |
| Production bundle without the flag | `cd frontend && npx vite build` | builds; no `AdminRoot`, `ResidentRoot` or live chunk; no sample credential, preview tool or test-only string in any file |
| Production bundle with the flag | `VITE_NEW_UI=true npx vite build` | builds; only `AdminLiveRoot-*` and `ResidentLiveRoot-*` (no preview chunk); none of 20 mock, sample-credential, seed-data, simulation-tool or preview-storage-key markers appears. What does remain is inert and shared with the live screens: the preview base path inside the shared path helper (the helper uses the live base under `/subd-admin` and `/resident-app`), one unused stylesheet rule for the preview bar, the shared reducers' simulation cases (dispatched only by preview-only files that are not in the live chunks), and the sample landmark names as the geography helper's fallback constant, which no live screen shows |
| Preview and legacy portals still behave | the earlier preview and legacy browser suites (kept in the session scratch folder, not in the repository), one browser at a time | on the final code, identical to their earlier results: Resident preview 40, 68, 55, 57, 33, 21, 15 and 7 checks; the maps suite 84; the 31-screen overflow sweep with 0 overflow; the accessibility sweep with the same 47 items (same list); Admin preview flows, rename check (30) and sign-in check (96); design tokens in both UIs; legacy routes untouched, no page errors. (The maps, overflow and accessibility suites were interrupted once when the computer's disk filled up; after the leftover test folders were removed they were re-run on the final code.) |
| Documentation audit | `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` | the same 12 failures as before this work (8 links to ERD, DFD and audit documents that do not exist, 4 missing agent pointer files); nothing from the new documents |

The browser run signs in with real accounts and covers, on the Leader side: a wrong password, a resident refused at the Leader sign-in (and the session the server opened closed again), the dashboard and case list built from the server's own summaries, a case opened in full with its photo, the assessment, an internal note kept off the resident timeline, a follow-up, ownership with evidence, a warning whose tier the server chose, a compliance observation, closing with a documented outcome, reopening, a safety advisory published to residents, a priority change, an external referral created and then updated, owner coordination, a follow-up scheduled and marked done, a related report linked and unlinked, an ownership claim reviewed (more information asked for, the resident's answer, then accepted), a lost-pet notice a resident asked for published and then closed when the owner marks the pet home, a policy added, the publication rules, the office phone and the notification choices saved, the Leader's own profile, a session the server would not renew, and a lost connection with recovery. On the resident side: a wrong password, a Leader refused at the resident sign-in, Home and My reports (own reports only), a report opened with its timeline, a report filed before the case workflow (under an older category) named by the kind it is read as, filing a new report at a registered landmark, a lost-pet report held for the Leader's review under the default setting (and invisible to neighbours until approved), a found-animal report published at once when the Leader chooses so (with the screens saying which will happen), community notices, information added to a report, a pet registered and edited, the profile and notification choices saved, an ownership claim (which the Leader then sees, asks about and accepts), a neighbour's sighting of a lost pet, the owner marking a pet home, and registering a new account with its emailed code. After each action it asks the API what was actually stored.

The run found, and this work fixed, nine things the unit tests and the first fixtures had hidden: the resident timeline never showed "Report received" (the server lists history oldest first and the adapter assumed newest first); the Admin timeline would have shown the original submission twice; the resident screens promised "your notice is live" whatever the subdivision's publication setting; older-category reports would have been labelled "Other animal concern"; the Admin case maps drew the sample reporting area instead of the server's; the resident welcome line named the sample subdivision; the resident profile edit offered a sample list of streets and described a verification the server does not ask for; and the claim dialog told the Leader that accepting a claim confirms ownership, which the server deliberately does not do (ownership stays under review until the Leader records that decision with evidence), so the connected screens now say what the server does; and both live sign-ins told every first-time visitor "Your session expired" (the providers verified a session even when none had been restored; the Resident app also sent signed-out visitors to the login page instead of Welcome), which broke the original sign-in appearance and made needless calls to the server, found by the final login-appearance check and now covered by two browser steps.

`backend/tests/e2e_server.py` is the API for that run: the real routers and models on a throwaway SQLite file. It never imports `app.main`, never reads `.env` and never opens the configured database (the test guard would refuse it). Its one extra route, `/__e2e/otp`, exists only in that script.

## What was not checked

- **The configured MySQL database and any real data.** The brief forbids it. The new queries (status filter, case summaries, work queue) are plain SQL expected to behave the same on MySQL, but they were run on SQLite only.
- **Storage and email services.** Photo uploads (reports, pets and advisories through the API; chat and claim photos straight from the browser to the storage service) and emailed codes (sign-up, recovery) need credentials the isolated stack deliberately does not have. The code paths were read, not run end to end.
- **A few actions are wired and unit-tested but were not driven in the browser:** a manual status move, cancelling a follow-up, archiving or deleting a notice, editing or closing a lost-pet notice by hand, switching incident categories off, removing a policy, marking notifications read, changing a password, and every photo or video upload. The first six go through the same request builders and dialogs as the ones that were driven. Marking notifications read and changing a password are single calls to existing endpoints. Uploads need the storage service, which the isolated stack does not have.
- **Other browsers and real phones.** The browser run is one desktop Chrome, headless, at 1280 × 900.
- **Load.** The case list reads up to 2,000 cases in pages of 200 and says so when it shows fewer.

## Blockers for replacing the legacy portals

1. **Messages about a case.** A resident's "add information to this report" is posted to the case chat. The new Admin has no conversation view, so a Leader who only uses the new screens would not see it (the legacy Messages page still does). Decide: add a conversation panel to the case screen (a small API read, `GET /chat/reports/{id}/messages`, plus a design for the panel), or keep the legacy Messages page open next to the new Admin until it exists. A pilot with the legacy portal still reachable is not affected.
2. **Functions that exist only in the legacy portals.** The new screens do not replace: the owner's observation updates after a warning (`/resident/observations`), lost-pet match review (`/resident/reports/:id/match-review`), manual matching and the hazard-alert page (`/subd/manual-matching`, `/subd/hazard-alert`), removed pet records (`/subd/removed-pets`), and the system administrator's portal (`/admin/*`, role 4, never in scope). A redirect from the old entry routes would strand these, so each needs a decision: keep it reachable, build it, or retire it on purpose. (The pet QR tag card and its scan history, `/resident/pet/:id/qr` and `/subd/pet/:id/qr`, were retired on purpose on 2026-11-09 with the QR feature; their routes, backend and tables are gone.)
3. **One run on the real engine.** Run the browser journey, and the backend scripts that cover the new endpoints, against a staging MySQL copy filled with test data (no real identity, medical, receipt or payment data, as the project rules require). Until then "works on MySQL" is an expectation, not a result. Check one fact there before anything else: **the category named "Lost Pet" must have id 6** (`SELECT category_id, category_name FROM report_categories ORDER BY category_id`, a read-only query). Older backend code recognises a lost-pet report by that number (`claim_custody.LOST_PET_CATEGORY_ID`, also used by matching and the legacy screens), while the new app chooses a category by name. `Database3.4_subdivision.sql` numbers it 6, so a database built from it is fine; a database whose categories were numbered differently would make the server refuse the notice a lost-pet report asks for ("Neighborhood alerts are for Lost Pet Reports only"). The app then says so in a banner and keeps the report; it does not hide the failure. The browser test found this because the throwaway database numbered the categories from 1; the test server now numbers them like the schema script.

## What each subdivision must do before pilot users rely on it

- A Leader account must be assigned to a subdivision; without one the Admin says so and shows nothing.
- The subdivision's policies must be confirmed in Settings. A warning can only cite a confirmed policy (the server enforces it), so until one is confirmed the Issue warning button stays unavailable.
- The office profile (address, phone, email, hours) must be filled in. Residents see it on Contact and Help; until then they see a plain note that none was added.
- The publication settings decide, separately for lost-pet notices and for found-animal notices, whether a resident's notice goes live at once or waits for the Leader's review (the default for both is review). A nuisance, safety or injured-animal report is never published. The resident screens read the setting and word the review step and the confirmation accordingly ("Your notice is live" only when it is). Leaders should know which they chose.

## Facts about the deployment that the screens rely on

1. **"Lost Pet" is category 6** (see blocker 3). It is a property of the database, not of the app.
2. **Time zone.** The server stores local wall-clock times without an offset; the screens read them as the device's local time, as the legacy screens do. The database server's time zone and the users' devices are therefore expected to be in the subdivision's time zone (Asia/Manila). A server set to UTC would show every time eight hours early.
3. **The reporting area** is the server's single coverage row (`GET /reports/coverage-area`): it decides where the maps open, the outline they draw and which pins a report may have. The connected screens read it; they do not carry a copy.
4. **Storage and email.** Photos on reports, pets and advisories go through the API; photos in a report's case chat and in ownership claims go straight from the browser to the storage service with the existing helper, so that service must be configured exactly as for the legacy screens. Sign-up and recovery codes are emailed by the existing mailer. Neither was run in the isolated tests.

## What remains mock-only or unavailable

No live screen uses sample data: a failed request leaves its part empty and says so. What is left is listed, with its reason, in "What the connected interfaces cannot do" in [NEW_INTERFACES_INTEGRATION.md](../01-system/NEW_INTERFACES_INTEGRATION.md). In short, the Admin cannot suspend or verify accounts (administrator only on the backend), edit the position title or the subdivision's name, record "possible match" decisions per pet, choose a warning's delivery or start time, or remove a stored advisory photo; the Resident cannot message the office, switch community notices and safety advisories separately, receive text messages, report without a pinned position, or re-register a pet the subdivision already registered. Sample data, sample accounts and the preview bar exist only in `/admin-preview` and `/resident-preview`, which are written into development builds only.

## Turning the pilot on

*Superseded on 2026-11-10: the routes are always mounted; there is no flag and no pilot build.*

1. Build with the flag: `cd frontend`, then `VITE_NEW_UI=true npm run build` (PowerShell: `$env:VITE_NEW_UI='true'; npm run build`).
2. Check the bundle: `dist/assets` must contain `AdminLiveRoot-*.js` and `ResidentLiveRoot-*.js` and must not contain `AdminRoot-*.js` or `ResidentRoot-*.js` (those are the sample-data previews).
3. Give pilot users the addresses: **`/subd-admin`** for a Subdivision Leader (role 2) and **`/resident-app`** for a resident (role 1). The accounts, passwords, emailed codes and recovery are the existing ones; there is nothing to migrate. A role that signs in at the wrong address is refused and the session the server opened is closed.
4. In `npm run dev` the live entries and the two previews are all mounted, for developers.

## The cutover edit (do not make it until the blockers are settled)

*Made on 2026-11-10 in `frontend/src/main.tsx` (the old entry addresses redirect; the legacy router was removed).*

It is a routing change in `frontend/src/routes/AppRoutes.tsx`, nothing else: point the entry routes at the new bases, for example `/staff/login` to `/subd-admin/login`, `/subd/dashboard` to `/subd-admin/dashboard`, `/login` to `/resident-app/login` and `/resident-home` to `/resident-app/home`, with `<Navigate replace />`. Keep every route that blocker 2 says must stay, the public QR scan page, the adoption certificate check and `/admin/*`. Read `ProtectedRoute` and `SessionGuard` first: they decide where a signed-out visitor is sent, and that must land on the new sign-in pages too.

## Rolling back

*Superseded on 2026-11-10: the legacy portals no longer exist in the repository; rolling back means restoring them from Git history.*

Rebuild without `VITE_NEW_UI` and redeploy. The live routes are then not in the build; `/subd-admin` and `/resident-app` fall through to the legacy catch-all and the legacy portals, which never changed, carry on. If the routing edit was made, revert that one file. The backend needs no rollback: this work added endpoints, one optional key in the stored case settings, one query flag and one response field, and changed no table.

## A manual pilot checklist (staging, test data only)

- Leader: sign in; the dashboard counts match the legacy dashboard; open one case of each category and compare it with the legacy view; save an assessment; add a note and a follow-up; confirm ownership; issue a warning and read the owner's copy as the owner; record compliance; close and reopen; publish a lost-pet notice and a safety advisory and read both as a resident; change a policy and the office profile; let a session expire.
- Resident: sign up with a real inbox, enter the code, sign in on a phone; file a report with a photo; add information; read the timeline; report a sighting; file and follow an ownership claim; register a pet with a photo; read notifications; change the profile and the password (every session ends, and the screen says so).
- Both: switch the phone to airplane mode in the middle of each of the above and confirm the screen says so and recovers.

## Commands in one place

```text
cd frontend
npx tsc -b
npx eslint .
node --test tests/*.test.mjs
node tests/liveInterfaces.browser.mjs        # starts and stops its own API (8780), dev server (5190) and Chrome
npm run build                                # default bundle: no preview, no live chunks
VITE_NEW_UI=true npm run build               # pilot bundle: live chunks only

cd backend                                   # every script isolates itself on a throwaway SQLite file
python tests/test_case_notes_queue.py
python tests/test_resident_live_api.py
python tests/test_case_lifecycle.py
```

One known failure is not from this work: `tests/test_lost_pet_sighting_ping.py` has one check that expects the retired Barangay flow to answer 404 and gets 403 unless `BARANGAY_WORKFLOWS_ENABLED=1` is set; with it, 51 of 51 pass.
