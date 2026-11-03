# Project documentation

This directory is the maintained project record. Documentation grows with the project; security and engineering worksheets remain separate, scoped reviews.

## Start here

1. The three starter documents (`01-system/overview.md`, `02-project/README.md`, `05-operations/README.md`) were replaced with facts verified from the repository on 2026-10-25. Statements marked **Unverified** or **Unknown** there still need evidence; update them as it is gathered. `audit documentation --strict` fails while a starter marker or its untouched starter text remains.
2. Choose how to complete the baseline:
   - AI-assisted: install the project skill with `npx @ghostbyte/agent-docs-kit@latest skill install --target project`, restart the AI session if needed, then ask it to use `$manage-project-quality` and inspect repository evidence.
   - Manual: run `npx @ghostbyte/agent-docs-kit@latest list documentation`, then open one focused area with `documentation guide <area>`.
3. Run `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict --report --format markdown`.
4. Run `npx @ghostbyte/agent-docs-kit@latest next` whenever you need the next project-specific action.

Generated structure is not proof of completeness. Keep unknowns explicit, label planned behavior as planned, and never assign a security result without evidence.

## Maintain documentation with every change

Every repository change receives a documentation-impact check before it is complete:

1. Inspect the changed behavior, configuration, tests, dependencies, and operating assumptions.
2. Update only the affected areas below. Do not touch every document merely to create activity.
3. Support current-state claims with repository or authorized operational evidence.
4. Record durable decisions, material implementation changes, test evidence, and operational changes in the appropriate area.
5. Run `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` after the update. Add `--report --format markdown` when a durable point-in-time audit is needed.
6. In the change or review summary, list the documentation updated or explain why no documentation change was necessary.

For AI-assisted work, the protected root `AGENTS.md` created when absent carries the same maintenance contract. Existing `AGENTS.md` files are never overwritten; merge this policy into existing instructions deliberately. Optional coding-agent pointer files import `AGENTS.md` instead of copying it, so the policy keeps one source. Manual users follow this section directly.

The workflow is AI-first and agent-assisted, not an unattended background service. `AGENTS.md` does not execute by itself: a compatible coding agent must be active, must load the repository instructions, and must be allowed to edit these records. Run `npx @ghostbyte/agent-docs-kit@latest suggest reviews --staged` before a commit, or compare a pushed branch with `npx @ghostbyte/agent-docs-kit@latest suggest reviews --base <git-ref>`, to receive advisory review candidates. These commands do not edit files or perform an audit.

Documentation maintenance does not automatically start a security or engineering review. This workspace must be initialized before those worksheets can be created. Keep documentation active for every material change, then recommend the narrowest relevant review when the change introduces a security risk, release concern, design tradeoff, reliability question, or testing gap. Explain the reason and evidence needed; create and complete a worksheet only when that review is actually selected.

## Document index

Status values: **Current** (matches the code when last checked), **Reference** (accurate background, may lag the code), **Needs update** (known to disagree with the code), **Archived**.

### In this folder

| Document | Status | Notes |
|---|---|---|
| [Settings landmark cards change record](05-operations/agents/feature-updates/2026-11-03_0200_settings-landmark-cards.md) | Current | Readable names and category badges, natural card heights, wrapping actions, desktop and phone mock-data preview |
| [Minimal history layout change record](05-operations/agents/feature-updates/2026-11-03_0145_minimal-history-layout.md) | Current | Shared Summary / Report details / Activity layout for Subdivision and Barangay history, cleaner shared summaries including Admin, keyboard and responsive checks, PDF validation, broader fixture timeout |
| [01-system/overview.md](01-system/overview.md) | Current | System boundary, roles, services, known gaps |
| [01-system/HEATMAP_RULES.md](01-system/HEATMAP_RULES.md) | Current | Incident counting, original sighting heat, active pins, hotspot thresholds, public directions and Phase 1 validation |
| [01-system/OWNER_FOLLOWUP_RULES.md](01-system/OWNER_FOLLOWUP_RULES.md) | Current | Phase 3 owner follow-up observation rules, 3-day window, single reasoned extension, rabies guards, privacy, concurrency, append-only monitoring logs, and owner observation updates |
| [01-system/PET_REGISTRATION_AND_MATCH_REVIEW.md](01-system/PET_REGISTRATION_AND_MATCH_REVIEW.md) | Current | Phase 5 pet-photo analysis, form cleanup, behavior preservation, appearance comparison, claim shortcuts and adoption compatibility |
| [Subdivision Leader custody wording change record](05-operations/agents/feature-updates/2026-11-01_1542_subdivision-custody-wording.md) | Current | Leader-facing wording: no subdivision holding facility; temporary community care and the Barangay Holding Facility; build, browser suites |
| [Phase 9 regression and records change record](05-operations/agents/feature-updates/2026-11-01_1524_phase-9-regression-and-records.md) | Current | 101/101 isolated backend scripts, 79 frontend unit tests, Phases 6–8 browser suite, timeline label fix, final diff review, review recommendation |
| [01-system/REPORT_STATUS_SYNC_RULES.md](01-system/REPORT_STATUS_SYNC_RULES.md) | Current | One report status as source of truth; resolving an observation (both endpoints) resolves its case report in the same transaction, with warnings, history, audit and single notifications; refresh signals and polling for other pages |
| [Report status sync change record](05-operations/agents/feature-updates/2026-11-01_2106_report-status-sync.md) | Current | Observation resolution sync, case-closure hook fix, refresh coverage, 33 isolated checks, backend scripts, 79 frontend unit tests |
| [01-system/CLAIM_FEE_ASSESSMENT_RULES.md](01-system/CLAIM_FEE_ASSESSMENT_RULES.md) | Current | Pet claiming charges: RA 9482 dog fine (₱500–₱1,000), separate cat fine only when configured from an ordinance ("No Authorized Fine Configured" otherwise), impounding/boarding fees, payment with OR, waivers, change log, handover only after settlement |
| [01-system/ANALYTICS_RULES.md](01-system/ANALYTICS_RULES.md) | Current | Analytics pages and scope (Subdivision and Admin; no Barangay analytics), status groups, rescue / custody / adoption / claim / observation counting rules, filters, states, known data limits |
| [01-system/LOST_PET_SIGHTING_PING.md](01-system/LOST_PET_SIGHTING_PING.md) | Current | Neighbor-to-Neighbor Lost Pet Sighting Ping: neighborhood alerts, Spotted Here sightings, tracking map and timeline, notifications, privacy, closure with the report |
| [Lost pet sighting ping change record](05-operations/agents/feature-updates/2026-11-02_1551_lost-pet-sighting-ping.md) | Current | New tables lost_pet_alerts / lost_pet_sightings, API, resident and leader pages, dashboard section, 51 checks, browser scenarios |
| [Remove sidebar lost pet alert button change record](05-operations/agents/feature-updates/2026-11-02_1622_remove-sidebar-lost-pet-alert-button.md) | Current | Remove redundant Lost Pet Alerts button from sidebar navigation drawers while preserving routes, notifications, and workflow |
| [Remove resident menu lost pet alerts change record](05-operations/agents/feature-updates/2026-11-02_1624_remove-resident-menu-lost-pet-alerts.md) | Current | Remove Lost Pet Alerts button from resident profile dropdown menu while preserving routes, notifications, and workflow |
| [Remove standalone lost pet alerts page change record](05-operations/agents/feature-updates/2026-11-02_1632_remove-subd-lost-pet-alerts-standalone-page.md) | Current | Remove redundant standalone /subd/lost-pet-alerts dashboard page, integrating monitoring directly into Subdivision Dashboard while preserving workflows |
| [Replace lost pet alert with back button change record](05-operations/agents/feature-updates/2026-11-02_1644_replace-lost-pet-alert-with-back-button.md) | Current | Replace alert navigation button with Back button routing to Report Information page |
| [Remove standalone resident lost pet alerts page change record](05-operations/agents/feature-updates/2026-11-02_1649_remove-resident-lost-pet-alerts-standalone-page.md) | Current | Remove redundant standalone /resident/lost-pets list page, redirecting requests to /resident-home while preserving workflows |
| [Replace back to dashboard with back to report change record](05-operations/agents/feature-updates/2026-11-02_1652_replace-back-to-dashboard-with-back-to-report.md) | Current | Replace Back to Dashboard button with Back to Report button routing to Report Information page |
| [Remove uncharged service fees from receipt change record](05-operations/agents/feature-updates/2026-11-02_1703_remove-uncharged-service-fees-from-receipt.md) | Current | Omit uncharged service fees and empty service fee headers from claim receipt breakdown and confirmation modal |
| [Route Go Back button to resident dashboard change record](05-operations/agents/feature-updates/2026-11-02_1708_navigate-go-back-to-resident-dashboard.md) | Current | Update handleBack on resident report view to navigate directly to /resident-home |
| [Manual matching without AI terminology change record](05-operations/agents/feature-updates/2026-11-02_1028_manual-matching-no-ai-terminology.md) | Current | No AI wording, scores or conclusions on manual records (match lists, claims, resident claims, duplicates, merge, chat, disputes); server sends matching_mode and no manual scores; hardcoded claim metrics removed |
| [Remove Barangay analytics change record](05-operations/agents/feature-updates/2026-11-02_0949_remove-barangay-analytics.md) | Current | Barangay analytics endpoint, page, route and sidebar link removed; other analytics corrections kept for Admin and Subdivision |
| [Analytics audit change record](05-operations/agents/feature-updates/2026-11-02_0935_analytics-audit-and-fix.md) | Current | Audit findings, root causes, Barangay analytics endpoint and page, corrected adoption / custody / rescue counts, 34 accuracy checks, browser scenarios |
| [Improvement pass change record](05-operations/agents/feature-updates/2026-11-02_0844_improvement-pass-access-performance-a11y.md) | Current | Announcement reads require scope (drafts/members-only no longer public), holding list 144 → 10 queries, `npm run build` passes, close-button labels and image alt text, measured next candidates |
| [Manual cat claiming charge change record](05-operations/agents/feature-updates/2026-11-02_0810_manual-cat-claiming-charge.md) | Current | Cats: staff-entered charge description, amount (₱) and reason / basis or "no charge applicable"; no default or configured cat amount; validation, audit trail, 66 checks, browser and unit tests |
| [Claiming fines change record](05-operations/agents/feature-updates/2026-11-01_2000_dog-cat-claiming-fines.md) | Current | Claim assessments, fee schedules, handover gate on every owner-return path, Barangay/Subdivision/resident panels, settings tab, backend and browser checks |
| [01-system/ADOPTION_ELIGIBILITY_RULES.md](01-system/ADOPTION_ELIGIBILITY_RULES.md) | Current | Animals returned to their owner are never adopted: record-based evidence, guarded entry points, catalog retirement, application closure, reconciliation of existing records |
| [Adoption eligibility change record](05-operations/agents/feature-updates/2026-11-01_1907_adoption-eligibility-after-owner-return.md) | Current | Handover discharge fixes, adoption guards, retirement and reconciliation, 29 isolated checks, 102 backend scripts, browser suites |
| [01-system/ACTIVITY_TIMELINE_RULES.md](01-system/ACTIVITY_TIMELINE_RULES.md) | Current | Phase 8: observation started/extended/ended timeline entries, database-clock history times, Under observation stage text, owner names and contacts out of the public timeline |
| [Phase 8 activity timeline change record](05-operations/agents/feature-updates/2026-11-01_1437_phase-8-activity-timeline.md) | Current | Observation timeline events, observation summary, stage text, timeline redaction, 24 isolated backend checks, 7 new frontend unit tests |
| [01-system/CLAIM_ELIGIBILITY_RULES.md](01-system/CLAIM_ELIGIBILITY_RULES.md) | Current | Phase 7: claims only for held animals (merged cases, stale data, adoption), owner Home / Still missing, closing as Not Needed with approval recovery, Pet Recovered only on lost-pet reports |
| [Phase 7 claim eligibility change record](05-operations/agents/feature-updates/2026-11-01_1423_phase-7-claim-eligibility.md) | Current | Held check, claim guards, Not Needed closure, lost-pet restrictions, 50 isolated backend checks, regression suites, tsc and eslint |
| [01-system/OWNER_WARNING_RULES.md](01-system/OWNER_WARNING_RULES.md) | Current | Phase 6: leader-only warnings to the actual owner, one per incident and tier, scoped reads and checkbox acknowledgement, verbal warnings, repeat incidents, staff pet summary, leader identity verification |
| [Phase 6 owner warnings and identity change record](05-operations/agents/feature-updates/2026-11-01_1358_phase-6-owner-warnings-identity.md) | Current | Warning, repeat-incident and leader-identity endpoints and screens, two new tables, 81 isolated backend checks, regression suites, tsc and eslint |
| [01-system/MANUAL_REPORT_MATCHING.md](01-system/MANUAL_REPORT_MATCHING.md) | Current | Manual Matching as the Gemini fallback: AI status, role data scope (Barangay-managed records and published Lost Pet reports for staff; private subdivision registry protected), report and registered-pet candidates, side-by-side comparison, staff decisions, owner-first confirmation for pets, append-only decision log, no automatic merge |
| [Manual Matching record display change record](05-operations/agents/feature-updates/2026-11-01_2158_manual-matching-record-display.md) | Current | Saved matching method per record, Stray Report / Registered Pet cards with actual values and "Not Provided", no AI fallbacks or scores for manual records (staff modal, My Pets, resident match review), 141 manual matching checks, 83 frontend unit tests |
| [Manual Matching data scope change record](05-operations/agents/feature-updates/2026-11-01_2035_manual-matching-data-scope.md) | Current | SQL-level report and pet pools per role, 403 on pet detail / match-pair / confirmations / decisions, Barangay scope banner and empty state, 136 manual matching checks, 97 backend scripts |
| [Manual Report Matching change record](05-operations/agents/feature-updates/2026-10-31_1804_manual-report-matching.md) | Current | New `/manual-matching` API and pages, `manual_match_decisions` table, 44 isolated backend checks, tsc and eslint |
| [Manual Matching pets and report-page entry change record](05-operations/agents/feature-updates/2026-10-31_1858_manual-matching-pets-and-report-entry.md) | Reference | Registered-pet candidates and report-page buttons; its pet decision order is superseded by the owner-first change record |
| [Owner-first pet matching change record](05-operations/agents/feature-updates/2026-10-31_1925_owner-first-pet-matching.md) | Current | Send Confirmation, owner YES/NO on My Pets, staff final verification only after YES, `pet_match_confirmation_requests` table, backend bypass guard, 111 isolated backend checks |
| [01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md](01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md) | Current | Phase 2 labels, account-scoped leader holding views, read-only Barangay care, earlier pens, resident custody and adoption compatibility |
| [Phase 3 owner follow-up backend change record](05-operations/agents/feature-updates/2026-10-30_1638_phase-3-owner-followup.md) | Reference | Changed files, models/schemas/routes/utils, 40 isolated API/business-logic checks, non-destructive schema additions |
| [Phase 4 owner follow-up screens change record](05-operations/agents/feature-updates/2026-10-30_1733_phase-4-owner-followup-screens.md) | Reference | Leader report view panel, resident report view panel, card components, badge sync, unit test suite |
| [Subdivision Leader Under Observation page change record](05-operations/agents/feature-updates/2026-10-31_1102_subd-under-observation-page.md) | Current | Under Observation page (/subd/under-observation), First Warning auto-integration, 3-day countdown, sidebar badge, card/table views, monitoring logs, and Barangay endorsement |
| [Phase 5 pet registration and match review change record](05-operations/agents/feature-updates/2026-10-30_1439_phase-5-pet-registration-matches.md) | Reference | Changed files, adoption preservation, 124 API checks, 13 unit checks, 26 browser scenarios, build/lint and audit limitations |
| [Subdivision Leader Under Observation & Escalation change record](05-operations/agents/feature-updates/2026-10-31_1143_subd-under-observation-escalation.md) | Current | First Warning start, 3-day countdown, verified resolution, 2nd Warning gating, Barangay endorsement, and 5-section UI |
| [Subdivision Leader Under Observation Modal Fix change record](05-operations/agents/feature-updates/2026-10-31_1204_subd-under-observation-modal-fix.md) | Current | Modal header animal details, clean 12-hour AM/PM timestamps, locked Stage 2 design, and auto-scroll to top |
| [Subdivision Leader Under Observation Full-Page View change record](05-operations/agents/feature-updates/2026-10-31_1250_subd-observation-full-page-view.md) | Current | Dedicated full-page observation details view replacing centered modal, route integration, breadcrumbs, and full-width monitoring logs |
| [Subdivision Leader Under Observation Monitoring Log Popup Panel change record](05-operations/agents/feature-updates/2026-10-31_1313_subd-monitoring-log-popup.md) | Current | Redesign monitoring logs section, replace permanently visible form with header button, responsive modal popup, and database persistence |
| [Animal & Incident Details Direct Report Redirection change record](05-operations/agents/feature-updates/2026-10-31_1355_animal-incident-detail-redirect.md) | Current | Clicking Animal & Incident Details card directly redirects to original incident report (/subd/reports/:id) |
| [Remove Community Owner Observation from Report View change record](05-operations/agents/feature-updates/2026-10-31_1402_remove-owner-observation-from-report-view.md) | Current | Remove redundant Community Owner Observation card from resident report detail view (/subd/reports/:id) |
| [Under Observation Dashboard 4 KPI UI Redesign change record](05-operations/agents/feature-updates/2026-10-31_1503_under-observation-4-kpi-redesign.md) | Current | Redesign Under Observation page with 4 KPI summary cards, owner update notification banner, 6 status tabs, and 2-column horizontal cards grid |
| [Under Observation Cards Owner Name and Number Display change record](05-operations/agents/feature-updates/2026-10-31_1530_card-owner-name-phone-display.md) | Current | Replace species/breed and location lines with pet owner name and contact number on Under Observation cards |
| [Under Observation Cards Clean Typography and Remove Color/Coat change record](05-operations/agents/feature-updates/2026-10-31_1535_clean-card-typography-remove-icons.md) | Current | Remove color/coat row and emoji icons from animal observation cards with clean modern typography |
| [Under Observation Navbar Consistency Update change record](05-operations/agents/feature-updates/2026-10-31_1541_subd-under-observation-navbar-consistency.md) | Current | Update SubdNavbar layout, typography, and back button functionality to match other Subdivision portal pages |
| [Remove Add Monitoring and Open Full Report Buttons from Header change record](05-operations/agents/feature-updates/2026-10-31_1547_remove-add-monitoring-and-open-report-header-buttons.md) | Current | Remove redundant Add Monitoring Log and Open Full Report buttons from top header in observation details view |
| [Owner Followups Attribute and Lint Fix change record](05-operations/agents/feature-updates/2026-10-31_1210_owner-followups-lint-fixes.md) | Current | Replace pet.color_pattern with pet.color_markings, eliminate redundant bool calls |
| [Under Observation monitoring log persistence change record](05-operations/agents/feature-updates/2026-10-31_1223_under-observation-monitoring-log-persistence.md) | Current | Add Monitoring Log saved to followup_contact_logs with report/animal/staff links, duplicate-safe POST/GET /logs, dashboard sync commit fix, 36 API checks |
| [Pet Owner observation updates change record](05-operations/agents/feature-updates/2026-10-31_1348_pet-owner-observation-updates.md) | Current | Owner Observation Updates page and modal with photo evidence, owner_observation_updates tables, staff review, owner/leader notifications, committed follow-up notifications, 55 API checks |
| [Phase 2 holding and custody change record](05-operations/agents/feature-updates/2026-10-30_1414_phase-2-holding-custody.md) | Reference | Changed files, server scope/custody restrictions, adoption preservation, 146 API checks and 18 browser scenarios |
| [Phase 1 incident maps change record](05-operations/agents/feature-updates/2026-10-30_1337_phase-1-incident-maps.md) | Reference | Source selection, adoption preservation, changed files, 25 unit checks, 14 browser scenarios, build/lint evidence and audit limitation |
| [02-project/README.md](02-project/README.md) | Current | Requirements, decisions, milestones, status, stale records |
| [04-testing/README.md](04-testing/README.md) | Current | Inventory plus scoped map, holding, custody, pet/claim and adoption validation; full suite not re-run |
| [02-project/DEFENSE_PLAN.md](02-project/DEFENSE_PLAN.md) | Current | Capstone defense plan: roles, countdown, outline, demo script, risks, panel questions |
| [02-project/MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md](02-project/MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md) | Current | Manuscript Chapter 1 (STRAYSAFEEE1.pdf) checked against the system, rated 8.4/10 |
| [03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md](03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md) | Current | Missing details on the Subdivision, Barangay and Admin history report pages; phased fix checklist |
| [03-development/audits/reportprocess.md](03-development/audits/reportprocess.md) | Current | Whole-system and report process audit: remaining work, thesis alignment, database sync, AI test set, and roadmap |
| [03-development/audits/SYSTEM_AUDIT_2026-11-02.md](03-development/audits/SYSTEM_AUDIT_2026-11-02.md) | Current | Dated pointer to whole-system and report process audit |
| [03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md](03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md) | Current | Chat isolation findings, fixed 2026-10-25; duplicate-thread merge still to run |
| [05-operations/README.md](05-operations/README.md) | Current | Local setup, run, validate, build; deployment, monitoring and recovery are not set up |
| [05-operations/LOCAL_NETWORK_IP_AND_APK_SETUP_GUIDE.md](05-operations/LOCAL_NETWORK_IP_AND_APK_SETUP_GUIDE.md) | Current | Guide for finding PC IP and changing address in the APK without rebuilds |
| [AI_TECHNOLOGIES.md](AI_TECHNOLOGIES.md) | Reference | AI technology notes; last verified against code: Unverified |
| [NOTIFICATION_UI_IMPROVEMENTS.md](NOTIFICATION_UI_IMPROVEMENTS.md) | Reference | Notification panel changes |
| [Adoption details UI change record](05-operations/agents/feature-updates/2026-10-25_1347_adoption-details-ui.md) | Reference | Initial tabbed redesign, compact assignments, certificate viewer, and browser evidence |
| [Adoption lifecycle without sideways scrolling](05-operations/agents/feature-updates/2026-10-25_1354_lifecycle-no-sideways-scroll.md) | Current | Wrapping lifecycle stages at every screen width; extends the adoption details redesign |
| [ERD/](ERD/00_ERD_MODULE_OVERVIEW.md) | Reference | Entity-relationship diagrams and database design; match with the ORM is Unverified |
| [DFD/](DFD/00_DFD_OVERVIEW.md) | Reference | Data-flow diagrams (context, level 1, level 2) and review notes |
| [06-future-proposals/TUNNEL_INTEGRATION_RESEARCH_AND_PLANNING.md](06-future-proposals/TUNNEL_INTEGRATION_RESEARCH_AND_PLANNING.md) | Reference | Tunnel integration research, mobile compatibility, and implementation plan |
| [06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md](06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md) | Current (plan, partial) | Phases 1 to 9 done with recorded gaps (Phase 0 source comparisons, 8 database-backed scripts, 8 older browser runners, native Android); adoption retained |
| [01-system/OWNER_FOLLOWUP_RULES.md](01-system/OWNER_FOLLOWUP_RULES.md) | Current | Community owner observation rules, rabies rejection, 3-day window, single extension and privacy redaction |
| [Phase 3 Owner follow-up backend change record](05-operations/agents/feature-updates/2026-10-30_1638_phase-3-owner-followup.md) | Current | 40 isolated backend checks, models, lifecycle hooks, background checker |
| [Phase 4 Owner follow-up screens change record](05-operations/agents/feature-updates/2026-10-30_1733_phase-4-owner-followup-screens.md) | Current | Leader follow-up card, citizen panel, Under Observation filter, Vite build and 28 unit checks |
| [Orange primary-action implementation](05-operations/agents/feature-updates/2026-10-30_1316_orange-primary-actions.md) | Reference | Shared orange styling, 38 converted controls, adoption UI preserved, build and synthetic CSS browser evidence |
| [Restoration implementation checklist change record](05-operations/agents/feature-updates/2026-10-30_1254_restoration-implementation-checklist.md) | Reference | Records the documentation request, files, source inspection and audit limitation |
| [Orange-button checklist preference](05-operations/agents/feature-updates/2026-10-30_1308_orange-button-checklist-preference.md) | Reference | Explicit orange primary actions across all portals and adoption screens, with dark-style and accessibility checks |

### At the repository root (not yet moved under `docs/`)

| Document | Status | Notes |
|---|---|---|
| [setup.md](../setup.md) | Needs update | Names `STRAYSAFE_DB_URL` and `Database.txt`; see [operations](05-operations/README.md) |
| [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) | Current (plan) | Phased plan: Aiven, Cloudinary, Render, Vercel; nothing deployed |
| [tunnel.md](../tunnel.md) | Current | Active Cloudflare tunnel URL, setup steps, mobile connection instructions |
| `STRAYSAFE_MAP_AUDIT_AND_IMPROVEMENTS.md` | Deleted | Removed in commit `5e46d00`; last version: `git show 8cb074f:STRAYSAFE_MAP_AUDIT_AND_IMPROVEMENTS.md`. Cited by the project and testing records as history |
| [CHAPTER_1_2_SYSTEM_CHECK.md](../CHAPTER_1_2_SYSTEM_CHECK.md) | Reference | Older manuscript version; superseded for Chapter 1 by the 2026-10-26 check |
| [ANALYTICS_SPECIFICATION.md](../ANALYTICS_SPECIFICATION.md) | Current | Implemented dashboards (updated 2026-10-24) |
| [AI_TODO.md](../AI_TODO.md) | Current | AI status and remaining work (2026-10-20) |
| [MULTI_ANIMAL_REPORT_PLAN.md](../MULTI_ANIMAL_REPORT_PLAN.md) | Current | Implemented 2026-10-20 |
| [PET_RECORD_DUPLICATE_PREVENTION_PLAN.md](../PET_RECORD_DUPLICATE_PREVENTION_PLAN.md) | Current | Implemented 2026-10-15 |
| [PUSH_NOTIFICATION_IMPLEMENTATION.md](../PUSH_NOTIFICATION_IMPLEMENTATION.md) | Current | Web push implemented; Android push not started |
| [LIVE_GPS_RESPONDER_TRACKING_PLAN.md](../LIVE_GPS_RESPONDER_TRACKING_PLAN.md) | Reference | Plan only, nothing built; belongs in `06-future-proposals/` |
| [SYSTEM_PRESENTATION_FLOW.md](../SYSTEM_PRESENTATION_FLOW.md) | Reference | Presentation script; match with the code Unverified |
| [CLAUDE_HANDOFF.md](../CLAUDE_HANDOFF.md) | Reference | Session handoff, 2026-10-25 |
| `tech_stack_details.txt`, `architectural_design.txt` | Needs update | Disagree with the code (see [project](02-project/README.md)) |
| [message.md](../message.md) | Unknown | Not reviewed |

Moving these under `docs/` (and archiving the stale ones with `git mv`) is a separate decision for the project owner.

## Areas

- `01-system/`: system scope, architecture, data, and security design
- `02-project/`: requirements, roadmap, decisions, and status
- `03-development/`: implementation notes and engineering reviews
- `04-testing/`: test plans, security audits, and evidence
- `05-operations/`: setup, deployment, runbooks, and agent operations
- `06-future-proposals/`: proposals that are not current commitments
- `archive/`: superseded material retained for traceability
