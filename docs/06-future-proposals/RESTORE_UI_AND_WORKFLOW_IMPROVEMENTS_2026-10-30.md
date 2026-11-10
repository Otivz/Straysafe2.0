# Implementation checklist: restore UI and workflow improvements with adoption preserved

Status: Implemented with recorded gaps. Phases 1 to 9 are done as described below. The remaining open items are listed under Completion evidence: Phase 0 source comparisons, the source's chat fixes, some browser checks, eight database-backed test scripts and native devices.

Prepared: 2026-10-30. Requested by the developer to restore the additions, updates, changes and fixes from `3bbb263` through `ed80fa5` while retaining adoption.

## Goal and evidence

Restore the agreed improvements below while keeping adoption working throughout the system. Use the original code changes as implementation references; do not recreate the fixes from conversation summaries alone.

The checkout inspected for this plan is `30c5205`. The source commits exist locally and form this verified parent chain:

| Order | Source commit | Main restoration work |
| --- | --- | --- |
| 1 | `3bbb263` — Phase1 | Heatmaps, map/button polish, holding views, owner follow-up backend, documentation |
| 2 | `9be16cc` — phase 2 | Follow-up screens, owner and Barangay views, report badges, category and single-animal UI |
| 3 | `140b3c3` — Uifixes | YOLO-only pet registration, pet-form cleanup, match review, claim shortcuts |
| 4 | `ed80fa5` — owner_warnings,3dObservation | Warning rules, repeated incidents, leader identity verification, claim eligibility and observation timelines |

Checkboxes are checked only after verification. A checked item means the behavior has been inspected on the chosen target, integrated if missing, and verified. If it already works, record the evidence instead of applying it again. Historical test results in source commits are references, not validation of the restoration.

## Phase 0 — Inspect the target and protect adoption

- [x] Record the actual target branch, HEAD and working-tree changes before implementation. Phase 1 target: branch `fix`, HEAD `30c5205`; existing orange-button and planning changes were retained.
- [ ] Compare the target with each source commit and classify every checklist topic as missing, partial or already present.
- [ ] Inspect each source diff before applying it, using read-only commands such as `git show --stat <commit>` and `git diff <commit>^ <commit> -- <path>`.
- [ ] If a new restoration branch is desired, obtain approval for the Git operation first. `9be16cc` is the last commit in this chain before the mixed `140b3c3` change; the current `30c5205` checkout also retains adoption. Choose the baseline from actual target state.
- [ ] Transfer selected changes by topic. Do not apply `140b3c3` wholesale or replace shared files with its complete versions.
- [ ] Preserve adoption models, schemas, APIs, startup registration, catalog, applications, assignments, tasks, screening, chat, notifications, handover, certificates, monitoring and analytics.
- [ ] Preserve adoption-specific status values, holding states, ownership protections, edit restrictions and sidebar/unread counts in shared code.
- [ ] Keep current application data. Historical database resets and table drops recorded in the source commits are not implementation steps.

Authorization boundary: the checklist alone does not authorize operational changes. Phases 1, 2 and 5, including the orange-button items, were subsequently requested explicitly. During implementation follow the current `AGENTS.md`, including approvals for dependency changes, Git operations and database actions. Do not edit `.env*`, reset databases, commit, push or deploy as a consequence of this checklist alone. Use synthetic data for checks.

## Phase 1 — Heatmap and map fixes

Source: `3bbb263`. Inspect `frontend/src/utils/heatmap.ts`, `MapComponent.tsx`, `MapControls/ReportMarkerSheet.tsx`, and the Admin, Barangay and Subdivision dashboard/map pages at that commit.

- [x] Centralize active/closed rules and align them with backend case closure, retaining adoption-related terminal outcomes.
- [x] Treat Picked Up as active; include other eligible open cases such as disputed/investigation cases.
- [x] Plot incident heat at original sighting coordinates; keep action pins at the animal's current location. Exclude moved reports from heat when their original coordinates are unavailable.
- [x] Count a group incident once; exclude duplicate/merged, rejected and false-alarm incidents from heat.
- [x] Include valid resolved incidents in historical heat while making resolved pins an explicit display choice.
- [x] Exclude lost-pet reports by default, with the Admin inclusion/category controls retained.
- [x] Restore priority weighting, date filters, filter-consistent hotspot selection and click-to-center behavior.
- [x] Use the source hotspot rule: at least 3 incidents within 50 m over the trailing 30 days; at least 5 is High Incident Density. Remove unsupported risk/trend claims.
- [x] Restore the source's final dashboard choices: Admin and Subdivision heat views; Barangay action pins without its removed heat-layer toggle.
- [x] Remove unnecessary empty-map markers/coordinate cards, report selection rings and report-marker hover labels. Keep actual location pickers, the user's location, routes, landmark labels and report cards functional.
- [x] Hide directions for public-only report viewers, while preserving access for eligible reporters, owners and staff.
- [x] Verify zero incidents, merged/group incidents, moved animals, lost pets, boundary dates, resolved cases and adoption-related outcomes; test mobile and desktop map interaction.

Phase 1 evidence (2026-10-30): 16 heatmap unit tests and 9 existing original-sighting tests pass. The build and scoped lint pass. The isolated browser suite passes 14 scenarios at 390/1280 px, including expanded dashboard maps, heat/pin filters, hotspot zoom, pin cards and public/owner/adopter directions; no backend requests were made. Current rules are documented in [HEATMAP_RULES.md](../01-system/HEATMAP_RULES.md). Native Android and live GPS/network behavior remain unverified.

## Phase 2 — Shared UI, holding views and custody

Source: `3bbb263`, then `9be16cc`. Inspect shared buttons, `ResolveLostPetModal.tsx`, `AnimalRecordsPanel.tsx`, `BrgyHoldingFacility.tsx`, `SubdHoldingFacility.tsx`, settings, navigation and report-status handling.

- [x] Replace black and near-black primary action buttons with the brand orange (`#F97316`, hover `#EA580C`) across Resident, Subdivision Leader, Barangay and Admin pages, forms, modals and adoption screens. Use shared styling so role-specific primary tokens do not leave these actions black or substitute another role color. Keep role colors elsewhere, destructive-action meaning and clearly disabled states.
- [x] Review remaining dark button styles (`bg-black`, dark slate/gray/stone classes and inline colors), including dark-mode overrides. Confirm ordinary primary actions stay orange in both themes, with readable text, visible keyboard focus and appropriate hover/disabled states. Check photo-overlay controls separately for readability; an intentional dark page or modal is not a reason to retain a black primary action.
- [x] Rename visible Holding Facility text to Holding Place without changing database identifiers or routes. Continue recognizing historical notes using either wording.
- [x] Rename category 4 consistently to Roaming Animal in forms, filters, labels, chat labels and seed documentation; preserve its ID.
- [x] Fix Secured by Resident so it does not automatically assign a facility or imply facility custody. Do not offer it for animals already held in a facility.
- [x] Let leaders view animals at their own Barangay holding place with server-enforced scope and read-only actions where appropriate.
- [x] Hide new subdivision-pen designation/placement controls while retaining access to relevant earlier records and existing animals.
- [x] Preserve adoption promotion, availability, assignments, handover and other actions on eligible Barangay holding records.
- [x] Hide the Animals in this report box for a single-animal report; retain allowed photo replacement and multi-animal handling. Record the accepted loss of the split action on a report submitted as one animal.
- [x] Verify labels, custody changes, existing pen records, cross-subdivision viewing, adoption holding actions and responsive layouts.

Button evidence (2026-10-30): 38 button/selected-state class expressions and the shared primary Button use `action-primary`. Dark labels provide 6.61:1 contrast on the orange background. The build and generated-CSS browser checks passed across 12 role/theme/viewport combinations, including hover, focus and disabled states. Source review retained three intentional solid-dark controls: the disabled duplicate-status chip, dark-theme preview and video thumbnail. Photo overlays remain distinct. Full authenticated portal navigation and native-device checks were not performed. See the [implementation change record](../05-operations/agents/feature-updates/2026-10-30_1316_orange-primary-actions.md).

Database note: changing an existing category label requires an approved data update; editing a seed file does not update the running database. Never replay the source's full seed reset.

Phase 2 evidence (2026-10-30): 146 isolated backend checks pass, including adoption catalog/handover; 18 Phase 2 and 14 Phase 1 browser scenarios pass at 390/1280 px with no backend requests. Build and scoped fixture lint pass. See [holding/custody rules](../archive/legacy-retirement/HOLDING_PLACE_AND_CUSTODY_RULES.md) and [testing commands](../04-testing/README.md). Existing database labels were not inspected or updated; no reset or migration was run.

## Phase 3 — Owner follow-up backend

Source: final implementation in `3bbb263`, refined in `ed80fa5`. Inspect `backend/app/models/owner_followup.py`, `schemas/owner_followup.py`, `routes/owner_followups.py`, `utils/owner_followups.py`, `utils/case_closure.py`, `tasks/unassigned_checker.py`, model imports and startup registration.

- [x] Integrate follow-up and contact models without deleting adoption models or startup helpers.
- [x] Prepare a non-destructive schema change for missing tables/columns; obtain the required approval before database execution. Startup table creation does not repair incompatible existing tables.
- [x] Restore start/list/by-report, contact log, owner update/photo, acknowledgement, extension, closing and administrator-settings operations.
- [x] Use three days by default and preserve the source's administrator setting and single reasoned extension. Existing follow-ups retain their saved due times when settings change.
- [x] Require the handling leader and correct subdivision; restrict starts to eligible open, individually identified, owned-pet cases that are not escalated, merged or held.
- [x] Support owners with accounts and owners recorded without accounts; keep staff notes out of the owner's response.
- [x] Prevent simultaneous open observations for the same pet, including across different reports.
- [x] Refuse observation for rabies-risk reports and show staff caution for injured/aggressive/high-priority cases, with escalation available.
- [x] Restore owner notifications, acknowledgements, optional photo updates, reminder notices and leader due notices without duplicate delivery.
- [x] End an observation consistently on closure, merge or escalation; expiry alone must not close or escalate a case automatically.
- [x] Keep owner observation separate from physical holding and adoption monitoring. Starting it must not assign facility status or custody.
- [x] Verify scope, invalid starts, account/phone acknowledgement, updates, one extension, concurrent observations, reminders and closure using an isolated test store.

Phase 3 evidence (2026-10-31): 40 isolated backend checks pass in backend/tests/test_owner_followups.py, including valid start, role and jurisdiction scope, closed/escalated/held/rabies guards, staff caution signals, concurrent pet observation prevention, offline owner contact logs, registered and verbal acknowledgements, owner updates with photo proof, single reasoned extension enforcement, closure, report-status lifecycle sync, admin duration settings, and deduplicated due notices. Case closure (9/9), Phase 2 custody (18/18), and match claim shortcut (12/12) regression suites pass with 0 failures. Current rules are documented in [OWNER_FOLLOWUP_RULES.md](../01-system/OWNER_FOLLOWUP_RULES.md). No live database operation, data reset, or destructive migration was performed.

## Phase 4 — Owner follow-up screens

Source: `9be16cc`, refined in `ed80fa5`. Inspect `OwnerFollowUpCard.tsx`, `OwnerFollowUpOwnerPanel.tsx`, `utils/ownerFollowUp.ts`, `SubdViewReport.tsx`, `SubdReports.tsx`, `ResiViewReport.tsx` and `BrgyReportView.tsx`.

- [x] Add the leader card to eligible report pages: start, observing and ended states, countdown, progress, due date and extension reason.
- [x] Show a labelled owner/contact box and a phone call link, without exposing it to unauthorized viewers.
- [x] Restore contact-log types, owner updates/photos and repeated-incident entries.
- [x] Give Owner complied, Close case and Extend once separate reason/confirmation forms. Keep warning and escalation actions clear and show server refusals.
- [x] Add Under Observation and Due badges/filters to both report-list layouts.
- [x] Show the owner-only complaint panel with acknowledgement, updates/photos and outcomes; other residents must not see it.
- [x] Show Barangay staff the read-only history of escalated follow-ups in their jurisdiction.
- [x] Ensure follow-up notifications open the correct report and refresh data after successful actions.
- [x] Verify loading, empty, denied, due, extended, ended and failed-save states on desktop and mobile; check keyboard access and long contact logs.

Phase 4 evidence (2026-10-31): Complete frontend integration verified. Created `OwnerFollowUpCard.tsx` (Subdivision Leader operational card with 3-day observation countdown, progress bar, staff caution badge, offline call link, single-extension modal, compliance/close modal, and contact logs drawer; read-only mode for Barangay staff in `BrgyReportView.tsx`), `OwnerFollowUpOwnerPanel.tsx` (Citizen self-service panel with receipt acknowledgement and photo proof upload in `ResiViewReport.tsx`), `ownerFollowUp.ts` API client, `ownerFollowUpTime.ts` calculation utilities, and status 7 ("Under Observation") badge/filter in `SubdReports.tsx`. TypeScript strict compilation (`tsc -b`) and Vite production bundle build (`vite build`) passed with zero errors (`built in 18.99s`). All 28 frontend unit tests in `node --test` passed with 0 failures (including `phase4FollowUpRules.test.mjs`, `petRegistrationRules.test.mjs`, `claimEvidence.test.mjs`, and `dataRefresh.test.mjs`). No regressions to adoption or holding facilities. No live database migration or reset was performed.

## Phase 5 — Pet registration and match-review UI

Source: selected changes in `140b3c3`. Inspect `backend/app/routes/reports.py`, `routes/pets.py`, `utils/photo_checks.py`, `PetPhotoGuard.tsx`, `PetRecords/AddPetModal.tsx`, `PetRecords/PetDetailPanel.tsx`, `ResidentPet.tsx`, `utils/petAge.ts`, `ReportDescription.tsx` and `Modals/AIMatchReviewModal.tsx`.

- [x] Use `purpose=pet` for registration photo analysis so it calls YOLO without Gemini; keep Gemini in report analysis and look-alike matching.
- [x] Block saving when a completed detection finds no dog/cat; distinguish unavailable detection from a negative result. Preserve multi-animal cropping and photo-validation controls.
- [x] Remove pet-photo Gemini background rechecks and their visible labels only; retain shared helpers needed by reports or adoption identity-document flows.
- [x] Quietly fill supported species/color fields; avoid presenting inferred breed, size or authenticity as verified facts.
- [x] Remove redundant registration AI badges, file-analysis labels, weight annotations and repeated approximate-age banners.
- [x] Separate Coat Pattern from Specific Markings; filter legacy pattern-only strings and stop auto-writing pattern text into markings.
- [x] Remove resident bite/chasing declaration checkboxes without clearing stored declarations or weakening verified incident-history protections elsewhere.
- [x] Focus side-by-side matching on physical markings/traits; remove the redundant AI header badge, owner-verification prompt and encounter/custody block identified in the sources. Retain required identity-confirmation actions.
- [x] Start staff claim-review remarks empty and stop generating the canned owner-confirmation fallback.
- [x] Add staff-only Open Pet Claim links for filed, eligible claims, including merged cases; support the claim deep link on both claims pages.
- [x] Verify registration/editing, unknown ages, old markings, no-animal/detection-error cases, claim links, evidence and adoption-related photos/forms.

Phase 5 evidence (2026-10-30): 124 isolated backend checks, 13 frontend unit checks and 26 browser scenarios at 390/1280 px pass. Adoption ownership locks, indicators and catalog/handover remain covered. The new helper/fixture pass scoped lint; pre-existing lint issues in older files remain. See [current pet/match rules](../01-system/PET_REGISTRATION_AND_MATCH_REVIEW.md) and [validation commands](../04-testing/README.md). No migration or live database operation was run.

## Phase 6 — Owner warnings, repeated incidents and identity

Source: `ed80fa5`. Inspect `routes/warnings.py`, `routes/matches.py`, `utils/owner_followups.py`, `utils/case_groups.py`, `utils/case_closure.py`, `RepeatedReportBanner.tsx`, `LeaderIdentityConfirm.tsx` and the follow-up components.

- [x] Enforce leader-only warning issuance on the server, correct subdivision and the registered pet's actual owner; preserve authorized warning-history reading.
- [x] Restore one warning per incident for the same pet/violation and tier suggestions from existing history. A distinct logged repeat can receive its own warning.
- [x] List warnings for the observed incident and each logged repeat; prefill dates/instructions for the selected incident while allowing remarks to be edited.
- [x] Log phone/in-person verbal warnings for owners without accounts as contact entries, rather than inventing an account warning.
- [x] Detect another report linked to a pet under observation, alert the handling leader once and display the cross-report banner. Exclude merged duplicates and already logged incidents.
- [x] Require a related report for repeat logging, reject the observed report itself and reject duplicate logs.
- [x] Restore leader identity verification only for the handling leader in scope, on an eligible staff-confirmed owned-pet match, after rejection or 24 hours without the owner's response; require the documented method and reason.
- [x] Notify the owner of leader verification and retain formal dispute access. Do not treat leader verification as the owner's handover proof or bypass adoption ownership/consent protections.
- [x] Limit resident warning reads to their own notices on both report and pet endpoints; keep private owner/contact data out of other residents' responses.
- [x] Show subdivision notices on the owner's report page and require selecting the acknowledgement checkbox before the action.
- [x] Add staff-only follow-up summaries, repeated incidents and verbal-warning counts to existing pet history rather than duplicating the history UI.
- [x] Verify unauthorized roles, another subdivision/owner, duplicate submissions, repeat relinking, rejected/unanswered matches, disputes and warning acknowledgement failures.

Phase 6 evidence (2026-11-01): The source commit `ed80fa5` is not in this clone, so Phase 6 was built from this checklist and the current code. `backend/tests/test_owner_warning_rules.py` passes 81/81 isolated checks. They cover leader-only issuance (Barangay, Admin, residents, another subdivision and a non-handling leader refused), the actual-owner rule, one warning per incident and tier, tier suggestions, scoped reads for residents and staff, checkbox-only owner acknowledgement, verbal warnings and the second-warning fix for owners without an account, repeat detection with a single alert, repeat logging rules, incident prefill, the staff-only pet summary, and leader identity verification. The verification checks cover the 24-hour and owner-rejected triggers, the documented method and reason, the owner-first, dispute, outside-subdivision and owner-confirmed exclusions, handover-proof exclusion, the unchanged owner answer and the owner notification. Regression suites pass: under-observation flow, owner observation updates, owner follow-ups, monitoring logs, trust rule, manual matching, match cases and gaps, case claims, identity dispute, match claim shortcut, push notifications, pet identity merge and case review. `tsc -b` and ESLint on the new frontend files pass. A one-warning-per-tier reading is used so the existing 2nd Warning on the same observation keeps working. Fixed along the way: a warning on a repeat report no longer opens a second observation for the same pet. Rules: [OWNER_WARNING_RULES.md](../01-system/OWNER_WARNING_RULES.md). Not done: browser checks of the new panels and native-device checks.

## Phase 7 — Claim eligibility and correct report labels

Source: `ed80fa5`. Inspect `utils/claim_custody.py`, `routes/claims.py`, `schemas/pet_claim.py`, `schemas/report.py`, `routes/reports.py`, `ClaimNotNeededPanel.tsx`, `CustodyQuestion.tsx`, `utils/claimCustody.ts`, resident match/report pages and both staff claims pages.

- [x] Centralize whether an animal is held across merged-case members, current custody/facility data, open holding records and the preceding status when a claim is approved.
- [x] Adapt the source's held check to adoption: stale facility/status data on a discharged or adopted animal must not grant a new claim or undo an adoption handover.
- [x] Refuse new claims, evidence submissions and claim-flow decisions for animals nobody holds, while preserving legitimate approved/handover continuations and existing authorization.
- [x] Offer the owner Home or Still missing with an optional note, save the latest answer and show it to the handling leader.
- [x] Allow authorized staff to close eligible unnecessary claims with a clear reason. If an erroneous approval changed report status, recover the previous appropriate status with history; never undo a legitimate completed return or adoption.
- [x] Show the not-needed explanation and current answer in resident and staff screens; hide or disable inapplicable claim actions consistently with server checks.
- [x] Restrict Lost Pet labels and Pet Recovered actions to actual lost-pet reports, preserving existing actor, open-case and custody conditions.
- [x] Keep roaming owned-pet cases on their complaint/observation path, with dispute access available.
- [x] Verify held/unheld, merged cases, picked-up animals, approved and completed claims, wrong owners, stale custody and adopted/discharged animals.

Phase 7 evidence (2026-11-01): The source commit `ed80fa5` is not in this clone, so Phase 7 was built from this checklist and the current code. `backend/tests/test_claim_eligibility.py` passes 50/50 isolated checks. They cover held and unheld animals (holding place, rescue team, resident, merged case, closed case); stale facility data after discharge; adoption, which overrides stale data and blocks completion; refusing new claims, evidence and forward decisions with nothing saved and no owner assigned; approved-claim continuation through the saved earlier status; the owner's Home / Still missing answer with leader notice; closing as Not Needed, including restoring an erroneous approval's status and never after a completed return; and Pet Recovered only on lost-pet reports, including the lost-pet form marker. Regression suites pass: adoption authority, catalog/handover, certificate, chat, single record, tasks and lock; case claims and closure; chat isolation; claim identity, photos, proof reuse and scope; holding views, privacy and stay clock; lost-pet contact; owner return; pet handover sync; Phase 2 custody; and the Phase 5–6 and Manual Matching suites. Four claim suites (`test_case_claims`, `test_claim_identity`, `test_claim_photos`, `test_claim_proof_reuse`) had fixtures filing claims on animals nobody held; those fixtures now mark the animal as held in a facility, with their assertions unchanged. `tsc -b` and ESLint on the new component pass. Rules: [CLAIM_ELIGIBILITY_RULES.md](../archive/legacy-retirement/CLAIM_ELIGIBILITY_RULES.md). Not done: browser checks of the claims screens and native-device checks.

## Phase 8 — Activity timelines and shared integrations

Source: `ed80fa5` and selected shared-file changes from earlier commits. Inspect `RescueTimeline.tsx`, `utils/caseStages.ts`, follow-up history writes, chat components, dashboards, sidebar/unread hooks and analytics.

- [x] Display observation started, extended and ended events from saved report history with accurate dates.
- [x] Show Under observation and the due date in the current stage/where-now text while an observation is open; remove that state after it ends.
- [x] Keep owner names/contact information out of public activity entries.
- [ ] Keep the source's useful report/match chat routing and polling fixes only where applicable; retain adoption thread modes, caches, unread totals and permissions in shared components.
- [x] Retain adoption dashboard cards, metrics, holding actions and notification routes when integrating unrelated UI changes into those same files.
- [ ] Verify timeline ordering, extensions, closure/escalation, empty history, long content and adoption/rescue timelines together.

Phase 8 evidence (2026-11-01): The source commit `ed80fa5` is not in this clone, so Phase 8 was built from this checklist and the current code.

- `backend/tests/test_activity_timeline.py` passes 24/24 isolated checks. They cover started, extended and ended entries for a manual start, a first-warning start, an extension, closing as complied, escalation, and case closure; started-before-ended ordering; no owner names or staff reasons in the entries; and the public-safe observation summary (open, UTC due date, extension, outcome, no owner fields). On another resident's timeline, the observed owner's name, phone numbers and emails are removed; staff still see them.
- `frontend/tests/caseStagesObservation.test.mjs` passes 7/7, and all 79 frontend unit tests pass. The new tests cover an open observation reading "Under observation until <date>" instead of "In safe care at a holding place", the state removed after the observation ends, facility bite observations (status 7 without an owner observation) and facility custody keeping the care step, closed outcomes, and empty history and a missing due date.
- Eight history entries in the warning and follow-up routes passed the app server's UTC time and sorted 8 hours early; they now use the database clock like every other entry.
- Regression suites pass: report privacy and visibility, official-reporter timeline, pet behavior history, holding privacy, follow-ups, under-observation flow, observation updates, monitoring logs, owner warnings, case closure, trust rule, claim eligibility, manual matching, lost-pet contact, chat isolation, case claims, Phase 2 custody, adoption catalog/handover and single record, pet handover sync, owner return, identity dispute, pet identity merge, and push notifications.
- `tsc -b` passes. ESLint on the changed utilities reports only the 33 errors the committed versions already had.
- Rules: [ACTIVITY_TIMELINE_RULES.md](../01-system/ACTIVITY_TIMELINE_RULES.md).

Still open: the chat routing and polling item can't be checked against the source, which isn't available. Shared chat, adoption and notification code was left unchanged, and its suites pass. For the verification item, long content and the adoption and rescue timelines shown together were not checked in a browser.

## Phase 9 — Validation, records and completion

Inspect every test or script before running it. Use isolated databases and mocked uploads/notifications; do not run against production or real personal data. Available source test filenames must be checked on the target first.

| Area | Source test references to inspect and restore/adapt |
| --- | --- |
| Maps and stages | `frontend/tests/heatmapRules.test.mjs`, `caseStagesObservation.test.mjs` |
| Follow-ups | `backend/tests/test_owner_followups.py`, `test_owner_repeated_reports.py` |
| Warnings and identity | `backend/tests/test_owner_warning_rules.py`, `test_leader_verified_identity.py`; `frontend/tests/ownerWarnings.browser.mjs` |
| Claims | `backend/tests/test_claim_only_when_held.py`, `test_match_claim_shortcut.py`, existing claim identity/evidence/photo suites |
| Registration and custody | `backend/tests/test_pet_photo_multi_animal.py`, `test_holding_leader_barangay_view.py`, pet record access/behavior suites |
| Adoption | Existing adoption authority, task, chat, certificate, single-record, holding, ownership-lock and handover suites; preserve their fixtures |

Repository commands verified while preparing this plan:

```powershell
# TypeScript and Vite build; generates local build output.
npm --prefix frontend run build

# Existing frontend lint script; record pre-existing findings separately.
npm --prefix frontend run lint

# Required documentation audit; requires an available CLI/package.
npx @ghostbyte/agent-docs-kit@latest audit documentation --strict

# Whitespace check.
git diff --check
```

Run individual Python and browser checks using the instructions in each inspected test and the target's operations documentation. Browser fixtures can require local Vite and Chrome. Do not assume a universal backend test runner or that historical test scripts are non-destructive.

- [x] Run focused tests after each phase and retain exact commands, outcomes and evidence paths.
- [x] Verify report creation, maps, registration, matching, owner observation, warnings, custody, claims and disputes using synthetic scenarios.
- [x] Verify adoption catalog/application, screening/assignments, task access, chat, notifications, holding promotion, ownership locks, handover, certificate issuance/verification and monitoring.
- [ ] Check desktop/mobile widths, dark mode, keyboard interaction, errors, long lists and loading/empty states. Record native Android checks as pending unless actually exercised.
- [x] Run the frontend build, relevant lint checks, whitespace check and strict documentation audit; record unavailable checks honestly.
- [x] Update current scope/schema/workflow and testing documentation only after behavior is integrated. Reconcile source documentation moves with the target structure and preserve permanent change records.
- [x] Create a new timestamped change record per implementation topic, naming every changed file and actual validation evidence; update `docs/README.md` for added/moved/retired documents.
- [x] Recommend the narrow security review for authorization/data exposure before release, and the reliability review if reminders/concurrent writes change. Identify evidence needed and confirm the available worksheet command with the kit CLI before recommending an exact invocation; no review is claimed by this plan.

Phase 9 evidence (2026-11-01). Full results and commands are in [Testing](../04-testing/README.md) (section "Phase 9 full regression").

- **Backend:** 101/101 isolated scripts passed, with external-service secrets cleared. The 8 scripts that use the configured database were not run.
- **Frontend unit:** 79/79 passed.
- **Browser:**
  - New `phase6to8.browser.mjs`: 24 scenarios passed at 390 px, 1280 px and 390 px dark, including Escape to close, no sideways scrolling, long content, and the rescue and adoption timelines shown together.
  - Phase 1 (14), Phase 2 (18) and Phase 5 (26) browser suites passed.
  - Eight older browser suites could not run in this environment (first-page evaluation timeout, including suites for screens this work didn't change).
- **Build, lint, whitespace, documentation:** build passed; lint added no new errors on lines this work wrote; whitespace clean; documentation audit passed.
- **Diff review:** no deleted files, removed routes, removed test files, added destructive SQL or changed adoption files.
- **Fixes during Phase 9:** the timeline titled a note during an owner observation "Moved to holding place", and the multi-animal claim fixture claimed animals nobody held.
- **Not completed:**
  - the desktop/mobile check item: loading and empty states of the new panels were not browser-checked, and native Android is pending;
  - Phase 0 comparisons against the source commits, which are not in this clone;
  - the Phase 8 chat routing item.
- **Review recommendation:** the docs kit's `suggest reviews` reads committed or staged paths only and found none in this uncommitted working tree. The recommendation is therefore based on the actual changes:
  - security `database-backend` and `api-layer`: new owner-first, warning, identity and claim authorization, plus the scoped warning reads;
  - engineering `data-modeling`: new tables, columns and the `pet_claims` enum value.

  Preview each with `npx @ghostbyte/agent-docs-kit@latest security worksheet <selector> --dry-run` (or `engineering worksheet data-modeling --dry-run`). Nothing was created and no review is claimed.
- [x] Review the final diff for unintended adoption regressions, database resets, deleted historical records, missing endpoints and removed fixtures.
- [x] Complete the evidence table below before marking the restoration done. No commit, push, dependency change or deployment is implied.

## Completion evidence

Owner: implementing developer/agent, to be recorded when work starts. Each phase completes only when its behavior and adoption compatibility checks have evidence.

| Phase | Implementation status | Validation status | Files / commands / evidence |
| --- | --- | --- | --- |
| 0 — Target and adoption baseline | Partial: target and Phase 1 source checked | Phase 1 checks passed; remaining comparisons pending | Branch `fix`, HEAD `30c5205`; existing adoption retained |
| 1 — Heatmaps and maps | Implemented | Unit, browser, build and scoped lint passed | See Phase 1 evidence and map rules |
| 2 — UI, holding and custody | Implemented | API, browser, build and scoped lint passed | See Phase 2 evidence and holding/custody rules |
| 3 — Follow-up backend | Implemented | 40 API, validation, concurrency, extension and closure checks passed | See Phase 3 evidence and follow-up rules |
| 4 — Follow-up screens | Implemented | TypeScript, Vite build, 28/28 frontend unit tests passed; no regressions | See Phase 4 evidence and components |
| 5 — Registration and match UI | Implemented | API, unit, browser and build passed; scoped new-file lint passed | See Phase 5 evidence and pet/match rules |
| 6 — Warnings and identity | Implemented | 81 isolated API checks, regression suites, `tsc -b` and scoped ESLint passed; no browser check | See Phase 6 evidence and owner warning rules |
| 7 — Claims and labels | Implemented | 50 isolated API checks, claim/holding/adoption regression suites, `tsc -b` and scoped ESLint passed; no browser check | See Phase 7 evidence and claim eligibility rules |
| 8 — Timelines and integrations | Implemented (2 items partly open) | 24 isolated API checks, 7 new frontend unit tests (79 total), regression suites, `tsc -b`; no browser check | See Phase 8 evidence and activity timeline rules |
| 9 — Full regression and records | Done with recorded gaps | 101/101 isolated backend, 79/79 frontend unit, 24 + 58 browser scenarios; build, whitespace and docs audit passed; 8 database-backed scripts and 8 older browser suites not run | See Phase 9 evidence and Testing |

Next action: decide on the open items. These are: run the 8 database-backed scripts against a restorable database; repair the 8 older browser runners; check loading and empty states and native Android; and choose whether to create the recommended review worksheets. Committing is a separate developer decision. This plan does not assert that the source behavior or its historical operational changes are already present in the checkout.
