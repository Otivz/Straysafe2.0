# Admin and Subdivision Barangay trace removal checklist

- Status: Phases 1-3 (B01-B09) implemented and verified on 2026-11-06 (UTC). Remaining presentation concerns outside these findings are listed in the linked follow-up; this does not claim every Barangay reference is removed.
- Scope: Remove retired Barangay account/operations features and misleading wording from the active Admin and Subdivision portals.
- Basis: [Admin and Subdivision Barangay trace audit](ADMIN_SUBD_BARANGAY_TRACES_2026-11-06.md), findings B01-B09.
- Authorization: User requested the checklist, then explicitly authorized "phase 1", "phase 2" and "phase 3". Evidence is recorded per phase below.

## Preservation requirements

- [x] Preserve external Barangay referrals, contact records, reported updates, outcomes and referral analytics.
- [x] Preserve historical read endpoints and the read-only Admin Adoption Archive. The Holding Archive was preserved during Phases 1-3, then removed by the user's later explicit request; related report custody history remains readable.
- [x] Preserve original stored letters, warning issuers, custody events, ownership history, status IDs and existing database records.
- [x] Preserve Barangay address/geographic fields and reference pins where still needed.
- [x] Preserve retired-portal information redirects and role-3 session/login blocking.
- [x] Keep resident-owner confirmation, matching and legitimate owner-return flows working.
- [x] Make no database/schema deletions or migrations as part of this UI/account cleanup. Keep production data out of tests.

## Phase 1 - Account boundary and document accuracy

### B01 - Remove active Barangay account provisioning

Files: `frontend/src/pages/Admin/AdminUserManagement.tsx`, `backend/app/routes/users.py`, relevant user schemas and existing retirement helpers.

- [x] Remove Barangay Staff / Personnel from new-account and role-conversion choices.
- [x] Remove head-officer designation controls, their submission handlers, Barangay position provisioning choices and tactical-command wording.
- [x] Retain existing role-3 identities as historical records, clearly separated from active staff provisioning; do not delete or silently convert them.
- [x] Enforce the subdivision-only restriction on backend create, update, role conversion and assign-head paths; hiding UI controls alone is insufficient.
- [x] Preserve the established legacy switch contract where existing compatibility tests depend on it.
- [x] Verify with synthetic Admin requests in a throwaway database: role-3 creation/conversion/head assignment is rejected by default, supported roles still work, and existing role-3 sign-in stays blocked.

### B02 - Remove unsupported custody/transfer claims from current printouts

File: `frontend/src/pages/Admin/AdminReportView.tsx`.

- [x] Replace current referral preview headings and missing-content fallbacks that claim impound, quarantine or physical transfer with external-referral wording.
- [x] Make current screen and printable referral summaries agree on who recorded the referral and what the Barangay reported.
- [x] Preserve saved historical letter content verbatim; only synthesized current labels/fallbacks change.
- [x] Verify a current referral without letter content and an older saved custody letter in screen and print views.

### Phase 1 verification evidence

Change records: [Phase 1 B01: retire Barangay account provisioning](../../05-operations/agents/feature-updates/2026-11-06_1506_phase1-retired-barangay-provisioning.md), [Phase 1 B02: accurate referral letter previews and printouts](../../05-operations/agents/feature-updates/2026-11-06_1506-01_phase1-referral-print-accuracy.md).

- `backend/tests/test_barangay_provisioning_retired.py`: 44 checks passed using throwaway SQLite and mocked invitation delivery. Covers both creation routes, role/head edits, head assignment, preserved historical reads, login/token refusal, supported role creation/editing, public registration and the enabled legacy switch.
- `backend/tests/test_admin_invite.py`: 28 existing invitation/password-setup checks passed in isolated SQLite with mocked email.
- `backend/tests/test_barangay_gate.py`: 50 existing login/workflow/archive gate checks passed in isolated SQLite.
- `frontend/tests/adminRetirementPhase1.browser.mjs`: desktop (1280px) and mobile (390px) checks passed for normal creation/editing, restricted roles/positions, read-only historical rows, missing/blank current referral text, saved object/string letters, missing recorder attribution, and matching screen/iframe print output. APIs mocked; no real account writes or physical printing.
- `frontend/tests/adminArchive.browser.mjs`: passed historical Admin holding/adoption access and referral/status checks at desktop/mobile sizes.
- `npm --prefix frontend run build`: passed TypeScript and production bundling; the existing large-chunk warning remains.
- No migrations, account deletions/conversions, environment changes or application-database writes were performed. Existing legacy account metadata is preserved; the read-only account presentation is in the Admin UI, while backend restrictions specifically guard new provisioning/authority changes.

Because B01 changes API role/authority controls, a focused API-layer permission review is recommended. Evidence should include the account-route guards, permitted-role matrix, synthetic rejected-write results and existing session checks. Worksheet command: `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`. No worksheet or security certification was created as part of this implementation.

## Phase 2 - Active portal wording and navigation

### B03 - Remove retired claims/holding shortcuts from the Subdivision dashboard

File: `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`.

- [x] Remove the active Pending Claims and At Barangay / Your animals held shortcuts that lead to retired routes.
- [x] Remove facility/claims operational summaries from the current dashboard; expose historical information only with clear historical context where required.
- [x] Replace "with Barangay HQ" wording with accurate external-referral wording that does not imply physical custody.
- [x] Separate current referral counts from legacy dispatch/approval statuses; avoid treating a referral as a holding record.
- [x] Verify counts against synthetic current and legacy records and confirm every remaining shortcut lands on the module it names.

### B04 - Remove live-operation wording from earlier endorsements

File: `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx`.

- [x] Replace Live, Awaiting active dispatch sync and live Barangay-operation labels with historical-record labels for older endorsements.
- [x] Remove unnecessary live polling/dispatch expectations from historical-only presentation while retaining historical reads and stored events.
- [x] Keep current external-referral updates attributed to the Barangay and the leader who recorded them.
- [x] Verify both current referral and older rescue-endorsement fixtures without rewriting their saved letters or timelines.

### B05 - Remove live Barangay rescue tracking from report maps

Files: `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx` and relevant shared map presentation.

- [x] Remove the active "Barangay Dispatch Team En Route" and "Live Tracking Active" presentation from the subdivision-only flow.
- [x] Present any retained earlier dispatch positions as recorded historical data rather than a current responder location.
- [x] Apply the same behavior to inline and expanded maps.
- [x] Remove response/dispatch navigation controls; retain a hall pin only as an explicitly geographic reference if still used.
- [x] Verify a current sighting, current referral, old status-5 record with a stale active flag, and an actual historical custody record. Confirm current sighting and real custody pins remain correct.

### B06 - Remove Barangay operational setup from active settings

Files: `frontend/src/pages/Admin/AdminAccountSettings.tsx`, `frontend/src/pages/Subd_Leaders/SubdSettings.tsx`.

- [x] Replace Headquarters & Dispatch / Rescue Headquarters language with accurate reference-location or external-contact wording.
- [x] Remove new Barangay impound/shelter operational classifications from active setup choices; preserve existing classifications for historical display.
- [x] Replace Barangay Operations / escalation-command wording with external referral terminology.
- [x] Verify supported landmark/location editing and existing map references still work without advertising retired rescue/holding management.

### B07 - Remove invented Barangay attribution from shared pet records

File: `frontend/src/components/PetRecords/PetDetailPanel.tsx`.

- [x] Replace missing-issuer fallbacks of "Barangay Staff" with neutral "Not recorded" or equivalent wording.
- [x] Replace synthesized current status-4 labels with "Referred to Barangay".
- [x] Clarify that Barangay adoption work happens outside StraySafe; retain real historical adoption origins.
- [x] Verify Admin and Subdivision pet views with populated and missing issuer details, current referrals and older ownership/adoption records.

### Phase 2 verification evidence

Change records: [Phase 2 B03: current subdivision dashboard](../../05-operations/agents/feature-updates/2026-11-06_1544_phase2-current-dashboard.md), [Phase 2 B04: historical endorsement provenance](../../05-operations/agents/feature-updates/2026-11-06_1544-01_phase2-historical-endorsements.md), [Phase 2 B05: historical dispatch positions and GPS directions](../../05-operations/agents/feature-updates/2026-11-06_1544-02_phase2-historical-report-maps.md), [Phase 2 B06: reference settings and retired designation guard](../../05-operations/agents/feature-updates/2026-11-06_1544-03_phase2-reference-settings.md), [Phase 2 B07: neutral pet-history attribution](../../05-operations/agents/feature-updates/2026-11-06_1544-04_phase2-pet-history-attribution.md).

- `frontend/tests/adminSubdRetirementPhase2.browser.mjs`: passed at 390 and 1280px. Covers current status-4 dashboard counts versus old status-5/13 records, correct shortcut destinations, absence of retired queue fetches, earlier/current endorsement provenance, recorded assignments, one-time earlier position reads, inline/expanded parity, known/unknown actual custody coordinates, GPS success/denial, reference settings, ordinary landmark creation/editing, historical facility metadata, neutral missing issuer labels, real recorded issuers and saved adoption locks. APIs/map props are mocked; case/custody/ownership mutations are prohibited. Pet fixture displays a synthetic-data notice.
- Existing referral browser regression passed. Existing real-Leaflet map regression passed all 14 scenarios. Existing pet/ownership/adoption-lock browser regression passed all 26 scenarios. These use synthetic fixtures and do not reach the live backend.
- `backend/tests/test_retired_landmark_designations.py`: 25 checks passed in throwaway SQLite. Admin and leader creation/conversion to a holding designation is refused by default through both the facility flag and reserved category; ordinary references, existing metadata, HQ reference edits and the legacy switch still work.
- Existing `backend/tests/test_facility_and_map_sync.py`: 20 checks passed in throwaway SQLite with the legacy switch enabled only for that test process.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains. No database migrations, configured database edits, environment-file changes or historical-record rewrites were performed.
- Strict documentation audit retains the same 12 pre-existing findings. Real GPS, route providers and deployed configuration are unverified.

B06 also closes the server-side new-designation gap using the existing retirement gate. A focused API-layer permission review is recommended, using the create/update guards, 25 isolated rejection/preservation checks and legacy regression as evidence: `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`. This recommendation is not a claim that a security review or deployment gate was completed.

## Phase 3 - Remove unreachable operational code

### B08 - Remove stale Admin dispatch controls and copy

Files: `frontend/src/pages/Admin/AdminReport.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`.

- [x] Remove retired action definitions already filtered out of the current pickers and unreachable target-status-5 dispatch controls/handlers.
- [x] Replace direct-action descriptions that still advertise rescue-team assignment with descriptions of the supported Admin actions.
- [x] Keep historical status decoding and current status filters intact.
- [x] Verify available Admin actions and older report rendering; retired status IDs 5, 6, 8 and 13 remain unavailable for new selections.

### B09 - Remove genuinely unused retired pages and branches

Candidates: `SubdHoldingFacility.tsx`, `SubdPetClaims.tsx`, `EscelatedMissions.tsx`, stale sidebar active-state branches and shared role-3-only code.

- [x] Check static/dynamic imports, route mounting, tests and shared callers before deleting each candidate.
- [x] Remove only proven-unused pages, imports, state and branches; update tests that intentionally mounted removed pages.
- [x] Preserve Admin archive implementations still imported from `Barangay_Staff`, or extract their read-only implementation before removing any shared code.
- [x] Keep `/brgy/*` retirement information and old Subdivision route redirects working.
- [x] Do not delete the entire Barangay directory or schema merely because its name remains in search results.
- [x] Verify production build, route handling and historical archive access after removal.

## Completion checks

- [x] Re-scan all Admin/Subdivision pages and relevant shared components; classify preserved references and explicitly list unresolved presentation concerns in the follow-up.
- [x] Run focused mocked browser checks for Admin/Subdivision navigation, referral screen/print, map variants, pet records, settings and archive views.
- [x] Run account-boundary backend tests only against an explicitly isolated throwaway database; do not point them at the application database.
- [x] Run the repository TypeScript/build commands and relevant existing regressions; record any pre-existing failures separately.
- [x] Run `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`; compare with the previously observed 12 documentation issues rather than claiming a clean baseline.
- [x] Create permanent change records per implementation topic and update the documentation index with each material change.
- [x] Attach validation evidence before checking off B01-B09 and update the audit with a linked follow-up report rather than claiming every lexical match must disappear.

Recommended execution order: B01, B02, B03, B04/B05 together, B06, B07, B08, then B09. This keeps account/document correctness ahead of cosmetic and dead-code cleanup.


## Phase 3 verification and remaining scope

[Implementation follow-up and remaining-reference classification](../implementation-reports/BARANGAY_TRACE_REMOVAL_FOLLOWUP_2026-11-06.md) records removed sources, import/route evidence, retained archive dependencies, regression results and limits. The original audit remains a point-in-time snapshot with a link to this follow-up.

- Admin archive/status regression passed: archives remain read only; 16 supported status-only writes at 390/1280px were mocked, with no responder field; historical statuses 5/6/8/13 render but cannot be newly selected.
- Updated holding/pet browser regressions passed 14/26 scenarios. Current matching/owner/observation regression passed 24 scenarios across mobile, desktop and dark mode. Old fixtures now test actual redirects/current shared screens rather than mounting the deleted pages.
- Referral regression passed, including old Subdivision claims/holding/escalation URLs, `/brgy/*` information pages and stored role-3 session blocking. Existing Phase 1 account/print and Phase 2 dashboard/endorsement/map/settings/pet-history regressions passed.
- The 44 provisioning, 28 invitation and 50 retirement-gate checks passed again against their own isolated SQLite databases. No application-database writes or new backend changes were part of Phase 3.

Follow-up concerns outside B01-B09 are still open: the Hazard Alert **Barangay Only** audience, unverified Admin warning policy wording, shared map operational wording/hall-origin routing and additional shared legacy role presentation. See the follow-up for exact locations and the evidence needed before changing their contracts. Completing B01-B09 is not a claim that these separate concerns were implemented or that no Barangay strings remain.

Change records: [B08 status-only actions](../../05-operations/agents/feature-updates/2026-11-06_1603_phase3-admin-status-only-actions.md), [B09 retired source and branches](../../05-operations/agents/feature-updates/2026-11-06_1603-01_phase3-retired-source-removal.md). Final TypeScript/production build and all 14 real-Leaflet map scenarios passed. Strict documentation audit at 16:03 UTC retained exactly the known 12 earlier findings; no additional link errors were introduced.


## Later authorized change: remove Admin Holding Archive

The user subsequently requested removing the Holding Archive. Its Admin sidebar entry and lazy page import/mount are removed; `/admin/holding-facility` now redirects to `/admin/incidents`. Related reports still read earlier holding records, and the Adoption Archive remains available. No database records, endpoints or legacy compatibility source were deleted. This later decision supersedes the earlier requirement to keep a standalone holding archive, without changing the historical Phase 1-3 evidence above.

[Holding Archive removal change record](../../05-operations/agents/feature-updates/2026-11-06_1619_remove-admin-holding-archive.md): mobile/desktop archive/status checks, 12 custody/route scenarios, retired-session/login regression and TypeScript/production build passed. Documentation audit retains the same 12 earlier findings.
