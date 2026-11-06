# Barangay trace removal follow-up

- Date: 2026-11-06 (UTC)
- Tool: Codex (GPT-6)
- Authorization: User explicitly requested cleanup phases 1, 2 and 3.
- Status: B01-B09 implemented and verified with the limitations below. This is an implementation follow-up, not a new security certification or a claim that every Barangay occurrence is a defect.
- Basis: [Original point-in-time audit](../audits/ADMIN_SUBD_BARANGAY_TRACES_2026-11-06.md) and [implementation checklist](../audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md).

## Phase 3 changes

Admin report list and detail overrides no longer fetch a responder directory, maintain a default selected responder or display unreachable status-5 dispatch controls. The list no longer declares the already-filtered status-5/13 actions. Detail overrides submit status and remarks without silently adding a responder ID. Supported choices are unchanged: list investigation/dismissal; detail verification, external referral, observation, resolution, rejection and dismissal. Historical status decoding and filters are retained.

Import/route searches established the following deletion boundaries:

| Removed source | Previous application callers | Previous test callers and replacement |
|---|---|---|
| `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx` | None; its old URL already redirected to referrals | Holding fixture now exercises the actual redirect and Admin archive; supported resident-custody and animal-record checks remain |
| `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx` | None; its old URL already redirected to referrals | Pet fixture now exercises the actual redirect; retained legacy Barangay component checks remain explicitly labeled compatibility-only |
| `frontend/src/pages/Subd_Leaders/EscelatedMissions.tsx` | None; the escalation bookmark already redirected to filtered reports | No fixture importer; the old bookmark is now explicitly tested |
| `frontend/src/pages/Barangay_Staff/BrgyManualMatching.tsx` | None; all `/brgy/*` URLs show retirement information | None; current Subdivision workspace and owner-confirmation tests retained |
| `frontend/src/utils/matchingScope.ts` | Only the deleted wrapper and the wrapper-only wording branch of the shared matching workspace | None; removed after those references were removed |

Searches covered static/dynamic imports, lazy routes, tests, component symbols and `import.meta.glob` (no such glob loader found). `ManualMatchingWorkspace` retains its supported Subdivision caller and test caller; its unused Barangay wording prop and message/claim path branch are gone. Admin sidebar active-state aliases for retired `/brgy` URLs are gone. An unreachable Barangay adoption destination inside an Admin-only pet action now directly opens the Admin adoption archive.

`AppRoutes.tsx`, retired-session guards, backend matching/claim rules, databases and schemas were not changed by Phase 3. Admin archive routes still deliberately import `BrgyHoldingFacility` and `BrgyAdoptions`, with their supporting shared components. This is why the Barangay source directory was not deleted wholesale.

## Remaining-reference classification

A final case-insensitive `barangay|brgy` scan covers all 12 Admin and 17 remaining Subdivision page files: 163 matching lines in Admin, 162 in Subdivision. These are line counts including identifiers/comments, not defect counts; the original audit remains an earlier snapshot. Relevant shared components, navigation, route mounts, status utilities and auth handling were also inspected.

| Classification | Retained examples and reason |
|---|---|
| External referrals | Referral card, observation referrals, current status 4, analytics, contact method/reference number and attributed reported updates remain supported |
| Geography and stored contracts | Address fields, `barangay_id`, jurisdiction APIs, HQ coordinates and geographic reference markers remain valid |
| Historical records | Original letters/issuers, status IDs 5/6/8/13, real custody/ownership/adoption records and Admin read-only archives remain readable |
| Retirement and compatibility | `/brgy/*` information page, role-3 session/API refusal, legacy switch and shared archive/legacy implementation branches remain intentionally present |
| Historical terminology/comments | Old status aliases, earlier dispatch/holding descriptions and comments comparing shared layouts do not provision or mount a Barangay portal |

The scan also identifies presentation concerns outside the B01-B09 implementation scope; these are **not classified as cleared**:

- `SubdHazardAlert.tsx` still offers **Barangay Only - Visible only to barangay officials/responders**. Review the visibility API contract and stored alerts before retiring that choice or changing its audience. No visibility data was converted here.
- `AdminWarnings.tsx` still asserts municipal bylaw/escalation requirements. That is external-escalation wording, but its policy authority and threshold were not verified by this cleanup.
- Shared `MapComponent.tsx` still contains **Operations HQ** and live-dispatch compatibility wording, and report-list maps retain hall-origin routing/fallbacks. Phase 2 removed live tracking and hall fallback from the current report-detail maps; it did not redesign every shared map caller. Review current callers before further removal.
- Some shared pet components still mention role-3 authority or retain legacy role-based links. They share archive/compatibility callers; this cleanup removed only the branch proven unreachable inside an Admin-only action and the unused matching wrapper/prop. A broader extraction needs its own caller/permission review.

## Verification and limits

- Extended `adminArchive.browser.mjs`: read-only holding/adoption archives, current referrals and historical owner observation; 16 mocked supported status-only submissions at 390/1280px; historical IDs 5/6/8/13 render but are absent from new selections; no responder directory reads or assignments.
- Updated `phase2Holding.browser.mjs`: 14 scenarios at 390/1280px, actual retired route, actual Admin archive, ordinary/returned fixtures, resident custody choices and single/multi-animal controls. No live backend requests.
- Updated `phase5Pets.browser.mjs`: 26 scenarios at 390/1280px, including actual claims redirect, photo/owner controls and saved adoption locks. Legacy Barangay fixture coverage is explicitly compatibility-only.
- Updated `phase6to8.browser.mjs`: 24 scenarios at 390px, 1280px and 390px dark mode. Current match-pair modal and missing/pending/YES/NO owner gates; resident response, repeat incident, identity verification, notices, claim-not-needed and historical observation timeline. Its previous banner/button/photo-alt/observation expectations predated the current shared screen and were corrected in the test/fixture; product behavior was not changed to satisfy them.
- Existing Phase 1 account/print browser suite and Phase 2 dashboard/endorsement/maps/settings/pet-history suite passed with mocked APIs. Referral regression passed, including the escalation bookmark, old claims/holding redirects, `/brgy` information routes and a blocked stored role-3 session.
- Existing account/provisioning/invitation/retirement backend scripts passed 44 + 28 + 50 = 122 checks using their own throwaway SQLite databases. Initial sandbox attempts could not open temporary SQLite files; the same isolated scripts passed with approved execution outside that restriction. No application database was used.
- Final `npm --prefix frontend run build` passed TypeScript and production bundling with the existing large-chunk warning. The real-Leaflet map suite passed all 14 scenarios. Strict documentation audit at 16:03 UTC retained exactly the known 12 failures: eight broken links and four absent configured agent pointers. `git diff --check` passed. No dependency/environment changes, migrations, commits, deployments or data rewrites were performed.

Live devices, GPS providers, physical printing, deployment settings and the remaining policy/visibility presentation concerns above are unverified. The focused API-layer permission-review recommendation from Phases 1/2 remains a recommendation, not an executed review.

Permanent Phase 3 records: [B08](../../05-operations/agents/feature-updates/2026-11-06_1603_phase3-admin-status-only-actions.md), [B09](../../05-operations/agents/feature-updates/2026-11-06_1603-01_phase3-retired-source-removal.md).


## Later user decision: Holding Archive removal

After Phase 3, the user explicitly requested removing the Admin Holding Archive. The sidebar item and lazy page mount are now removed; its old URL redirects to `/admin/incidents`. Holding read APIs and recorded custody shown inside related reports remain, along with the Adoption Archive and unmounted compatibility implementation. This supersedes the standalone holding-archive preservation described in the Phase 3 snapshot above; no historical records were deleted.

[Holding Archive removal change record](../../05-operations/agents/feature-updates/2026-11-06_1619_remove-admin-holding-archive.md): mobile/desktop archive/status checks, 12 custody/route scenarios, retired-session/login regression and TypeScript/production build passed. Documentation audit retains the same 12 earlier findings.
