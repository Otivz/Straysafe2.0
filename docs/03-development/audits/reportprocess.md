# STRAY-SAFE reporting process audit

- **Audit date:** 2026-10-29
- **Reviewer:** Codex
- **Status:** Reference — point-in-time audit of the working tree, including uncommitted reporting and owner-warning changes.
- **Scope:** Reporting submission, AI, matching, duplicates, verification, assignment, escalation, rescue, ownership, warnings, observation, holding, resolution, closure, permissions, data integrity, frontend, reliability, and privacy.
- **Implementation status:** Audit only. No findings have been implemented as part of this report.
- **Record:** Saved from the audit delivered in the conversation at the user's request: “Create an md file name reportprocess.md”. Recommendations are proposed work, not descriptions of completed fixes.

- **Separate module guide:** [All modules by role, routes, APIs and data models](../../01-system/ROLE_MODULES.md).

## A. Executive summary

**The reporting process is not ready for real-world use yet.** The existing architecture supports most of the requested workflow, but several backend endpoints bypass authorization, ownership verification, or lifecycle rules.

The audit identified **30 findings: 5 Critical, 18 High, 6 Medium, and 1 Low**. These are distinct findings, not a count of affected endpoints.

The original audit did not change files, dependencies, configuration, migrations, or databases. Saving this document and indexing it are documentation-only follow-up actions.

The strongest existing implementations are worth preserving:

- Private report creation and resident response redaction.
- Human review of AI suggestions.
- Case-wide pet identity reconciliation and conflict checks.
- Locked leader claim and transfer operations.
- Multi-animal records with split-request idempotency.
- Owner observation, acknowledgement, reminders, extensions, and repeated-report notifications.
- Shared rescue-closure hooks.
- Original-sighting coordinates for historical heatmaps.
- Claim-evidence upload retries.

The main weakness is **inconsistent enforcement across endpoints**. A dedicated endpoint may enforce a rule correctly while a general update endpoint permits the same operation without those checks.

The most serious examples are:

1. A resident can link a report to another person's pet and receive private owner information.
2. Staff list and detail endpoints can expose records outside their jurisdiction.
3. Several privileged mutation endpoints lack equivalent jurisdiction and assignment checks.
4. General report editing bypasses dedicated status and pet-link safeguards.
5. A resident can submit a dispute without identifying a related pet or match and change an unrelated report's status.

### Verification performed

Six existing frontend suites passed: **49/49 checks**.

| Command | Result | Coverage |
|---|---|---|
| `node frontend/tests/caseStagesObservation.test.mjs` | 3/3 passed | Observation labels, extension dates, ended observations |
| `node frontend/tests/heatmapRules.test.mjs` | 12/12 passed | Active/closed states, historical heat, original coordinates, hotspots |
| `node frontend/tests/claimEvidence.test.mjs` | 8/8 passed | Evidence registration, retries, partial failures, invalid identifiers |
| `node frontend/tests/originalSighting.test.mjs` | 9/9 passed | Original locations, relocation, coordinate precision, invalid coordinates |
| `node frontend/tests/dataRefresh.test.mjs` | 10/10 passed | Refresh coordination, account scope, visibility, network restoration |
| `node frontend/tests/personnelAvailability.test.mjs` | 7/7 passed | Availability, inactive accounts, assignments, roster filters |

The aggregate `node --test` launcher encountered the environment's child-process restriction (`spawn EPERM`). Running the existing suites directly with their documented commands produced the passing results above. This launcher limitation was not classified as an application defect.

Isolated execution of repository functions also reproduced:

- Acceptance of an untrusted hostname ending in `cloudinary.com`.
- Acceptance of arbitrary bytes as a `.docx` document.
- Disclosure of merged reporters' names and internal merge notes after redaction.
- “Back home” messaging for status 9 even when custody remains “Secured in Facility.”

The isolated checks extracted functions or imported a pure frontend utility. They did not import the running backend application, connect to the application database, send network requests, or write application data.

### Evidence limitations and classification

Backend findings below are principally source-confirmed. The audit did not exercise live endpoints, connect to the application database, start the application—which performs schema work—or run database-writing backend suites. Concurrent processing, deployed media access, browser layout, Android camera behavior, and production configuration remain unverified.

“Confirmed” means the inspected implementation establishes the defect; it does not imply a production exploit was performed. Potential bugs, design inconsistencies, missing validations, and optional improvements are identified separately in each finding. Source line numbers refer to the audited working tree and can move after subsequent changes; function names are provided for rediscovery.

## B. Complete findings table

| ID | Severity | Category | Finding | Evidence classification |
|---|---|---|---|---|
| RP01 | Critical | Security | Report creation permits unauthorized pet linking and owner-data disclosure | Confirmed from source |
| RP02 | Critical | Security | Staff read APIs do not consistently enforce jurisdiction | Confirmed from source |
| RP03 | Critical | Security | Privileged mutations lack consistent scope, handler, and assignment authority | Confirmed from source |
| RP04 | Critical | Security | General report PATCH bypasses protected workflows | Confirmed from source |
| RP05 | Critical | Security | Unrelated residents can place reports into dispute | Confirmed from source |
| RP06 | High | Security / validation | Creation accepts protected initial state and investigation fields | Confirmed from source |
| RP07 | High | Inconsistency | Report transitions lack a shared backend state model | Confirmed from source |
| RP08 | High | Workflow | Reporter cancellation can dismiss an active operation | Confirmed from source |
| RP09 | High | Security / workflow | Self-reunion accepts insufficient ownership and jurisdiction evidence | Confirmed from source |
| RP10 | High | Security | Claim submission assigns ownership of unowned pets before validation | Confirmed from source |
| RP11 | High | Bug | Claim transitions can skip approval and handover or reset completed claims | Confirmed from source |
| RP12 | High | Bug | Dispatched rescue is treated as physical custody | Confirmed from source |
| RP13 | High | Inconsistency | Approval, handover, report closure, and holding outcomes disagree | Source-confirmed; label reproduced |
| RP14 | High | Reliability | Submission reports success despite failed attachments | Confirmed from source |
| RP15 | High | Security | Media URL allowlist accepts attacker-controlled hosts | Validator reproduced; SSRF unverified |
| RP16 | High | Security / integrity | Media can be attached to unrelated history and modified after closure | Confirmed from source |
| RP17 | High | Validation | Warning issuance does not enforce the verified-incident rules | Confirmed from source |
| RP18 | High | Privacy | Nested merged-report data bypasses redaction | Reproduced |
| RP19 | High | Reliability | AI jobs can finish successfully after processing fails | Confirmed from source |
| RP20 | High | Reliability | Submission and processing lack consistent idempotency | Confirmed gap; races unverified |
| RP21 | High | Integrity | Merge rescue reconciliation may reactivate closed missions | Potential bug requiring reproduction |
| RP22 | High | Integrity / security | Helpers commit partial workflows and permit unreliable audit attribution | Confirmed from source |
| RP23 | High | Reliability | Analysis outages block ordinary report submission | Confirmed from source |
| RP24 | Medium | Data consistency | ORM constraints differ from the SQL schema | Confirmed mismatch; live schema unverified |
| RP25 | Medium | Validation | Repeated-incident references and observation identity are insufficiently checked | Confirmed from source |
| RP26 | Medium | Performance / UX | Clients treat a capped report page as the complete dataset | Confirmed from source |
| RP27 | Medium | Privacy / UX | Drafts are shared across accounts and cannot restore attachments | Confirmed from source |
| RP28 | Medium | Redundancy | Forms and AI processing repeat substantial work | Confirmed implementation overlap |
| RP29 | Medium | Security / reliability | Document validation and media reads have gaps | Partly reproduced |
| RP30 | Low | Accessibility | Some form controls cannot be operated reliably by keyboard | Confirmed markup defects |

### RP01 — Unauthorized pet linking exposes owner information

1. **Finding ID:** RP01.
2. **Category:** Security. Classification: confirmed from source.
3. **Severity:** Critical.
4. **Affected role:** Residents and pet owners.
5. **Affected files:** `backend/app/routes/reports.py`, functions `create_report` and `populate_pet_and_owner_info`.
6. **Current behavior:** Creation checks that a supplied pet exists and is not deceased. It does not establish that the caller owns or may link that pet. The response subsequently includes owner contact information and QR information without resident redaction. Category 6 also marks the selected pet Lost.
7. **Expected behavior:** Another owner's pet must require the established matching/identity workflow; responses must respect viewer access.
8. **Root cause:** Creation bypasses the existing direct-link authorization helper.
9. **Impact:** Owner-data disclosure, false lost-pet records, and unauthorized pet relationships.
10. **Evidence:** `backend/app/routes/reports.py:2277` validates existence/deceased status; `:2287` changes Lost status; `:279` populates pet/owner/QR information; `:2460` populates the creation response without resident redaction. Compare `require_direct_pet_link` in `backend/app/utils/case_groups.py:241`.
11. **Recommended fix:** Validate pet ownership and link authority before mutation; apply the shared response-redaction policy.
12. **Regression risk:** Legitimate owner-filed lost reports and staff-created animal records.

### RP02 — Jurisdiction is optional on several staff reads

1. **Finding ID:** RP02.
2. **Category:** Security. Classification: confirmed from source.
3. **Severity:** Critical.
4. **Affected role:** Leaders, Barangay staff, Head Officers, and residents whose records are exposed.
5. **Affected files:** `backend/app/routes/reports.py`, `get_reports`; `backend/app/routes/rescue.py`, rescue list/detail functions; `backend/app/routes/holding.py`, `list_animals`; `backend/app/routes/warnings.py`, warning reads.
6. **Current behavior:** Several routes accept optional subdivision/barangay filters without deriving mandatory restrictions from the authenticated officer. Rescue detail reads also lack resource-scope checks.
7. **Expected behavior:** Query parameters may narrow an officer's permitted records, never broaden them.
8. **Root cause:** Staff-role authentication is treated as sufficient authorization.
9. **Impact:** Cross-jurisdiction access to private reports, owner contacts, warnings, and care records. Escalation broadcasts also select all Barangay staff rather than the relevant barangay.
10. **Evidence:** `backend/app/routes/reports.py:1042`; `backend/app/routes/rescue.py:289`, `:327`, `:344`; `backend/app/routes/holding.py:450`; `backend/app/routes/warnings.py:245`, `:262`, `:275`, `:288`, `:305`. Escalation broadcast: `backend/app/routes/reports.py:4157`.
11. **Recommended fix:** Apply authenticated scope before filtering, counting, loading, or broadcasting.
12. **Regression risk:** Intended administrator oversight and legitimate shared Barangay holding views.

### RP03 — Privileged writes use inconsistent authority checks

1. **Finding ID:** RP03.
2. **Category:** Security. Classification: confirmed from source.
3. **Severity:** Critical.
4. **Affected role:** All operational roles.
5. **Affected files:** `backend/app/routes/rescue.py`, `create_rescue_request`, `assign_rescue_team`, `update_rescue_request`; `backend/app/routes/holding.py`, `update_animal`; `backend/app/routes/claims.py`, `update_claim_status`; `backend/app/utils/staff_assignment.py`; `backend/app/routes/report_split.py`.
6. **Current behavior:** These paths do not consistently enforce resource jurisdiction, handling officer, or Head Officer authority. Assignment validation checks whether a user is active, but not whether that user is an eligible responder in the correct jurisdiction.
7. **Expected behavior:** Every write must independently establish actor authority and target eligibility.
8. **Root cause:** Checks differ between route families; frontend restrictions are stronger than some APIs.
9. **Impact:** Unauthorized dispatch, reassignment, custody changes, or claim decisions.
10. **Evidence:** `backend/app/routes/rescue.py:162`, `:365`, `:987`; `backend/app/routes/holding.py:643`; `backend/app/routes/claims.py:468`; `backend/app/utils/staff_assignment.py:10`. Split authority checks subdivision membership in `backend/app/routes/report_split.py:72`, without the shared handling-leader check.
11. **Recommended fix:** Reuse shared resource and action guards across these paths, including split operations that currently check subdivision membership without handler authority.
12. **Regression risk:** Emergency administrator actions and authorized responder updates.

### RP04 — General report editing bypasses protected actions

1. **Finding ID:** RP04.
2. **Category:** Security. Classification: confirmed from source.
3. **Severity:** Critical.
4. **Affected role:** Leaders, Barangay staff, and administrators.
5. **Affected files:** `backend/app/routes/reports.py`, `update_report`; `backend/app/schemas/report.py`, `ReportUpdate`.
6. **Current behavior:** Staff pass a scope check, after which supplied fields are applied directly. `status_id` becomes `current_status_id`; `pet_id` can also be assigned.
7. **Expected behavior:** Status transitions and pet linking must use their dedicated validation, custody, identity, history, and notification rules.
8. **Root cause:** Descriptive editing and consequential workflow actions share a broad update schema.
9. **Impact:** Bypassed handler checks, closed-case changes, invalid identity links, and incomplete operational history.
10. **Evidence:** `backend/app/routes/reports.py:3403`, especially `:3440`–`:3457`; `ReportUpdate` in `backend/app/schemas/report.py`. Compare `update_report_status` and `link_pet_to_report` in the same routes module.
11. **Recommended fix:** Restrict general PATCH to descriptive fields and route protected actions through shared workflow functions.
12. **Regression risk:** Existing staff edit forms that currently depend on the broad endpoint.

### RP05 — A resident can dispute an unrelated report

1. **Finding ID:** RP05.
2. **Category:** Security. Classification: confirmed from source.
3. **Severity:** Critical.
4. **Affected role:** Residents and active response teams.
5. **Affected files:** `backend/app/routes/reports.py`, `create_report_dispute`.
6. **Current behavior:** Both `pet_id` and `match_id` are optional. Without either, the route checks resident role and a nonempty reason, then sets the report to status 15 and verification state `disputed`. Supplying an owned pet also does not by itself establish that it belongs to this case.
7. **Expected behavior:** Disputes must relate to the caller's pet or another explicitly authorized relationship with the case.
8. **Root cause:** Conditional identifier validation never becomes a required case-relationship check.
9. **Impact:** Unauthorized disruption or reopening of unrelated incidents.
10. **Evidence:** `backend/app/routes/reports.py:6062`; optional inputs at `:6066`–`:6067`; conditional relationship checks at `:6082`–`:6103`; unconditional state mutation at `:6147`–`:6149`.
11. **Recommended fix:** Require a validated report–pet–owner or report–match–owner relationship before uploading evidence or changing state.
12. **Regression risk:** Legitimate ownership disputes, particularly legacy reports without a match record.

### RP06 — Creation accepts protected state fields

1. **Finding ID:** RP06.
2. **Category:** Security / validation. Classification: confirmed from source.
3. **Severity:** High.
4. **Affected role:** Report submitters and reviewing officers.
5. **Affected files:** `backend/app/schemas/report.py`, `ReportBase` and `ReportCreate`; `backend/app/routes/reports.py`, `create_report`.
6. **Current behavior:** A caller can supply an existing status ID, verified behavior flags, behavior findings, and facility-related fields. A valid supplied subdivision is accepted without establishing filing jurisdiction.
7. **Expected behavior:** New reports must receive server-defined initial lifecycle and investigation state.
8. **Root cause:** Creation inherits fields also used for responses and trusted investigation information.
9. **Impact:** Reports can begin as resolved, escalated, or apparently investigated without the corresponding workflow.
10. **Evidence:** `backend/app/schemas/report.py:9`, `ReportBase`; `backend/app/routes/reports.py:2266` copies the payload, `:2290` accepts existing status IDs, and `:2299` accepts an existing supplied subdivision.
11. **Recommended fix:** Introduce a narrow creation allowlist; initialize protected fields on the server.
12. **Regression risk:** Older clients sending fields that were previously accepted.

### RP07 — Status transitions have no shared authoritative model

1. **Finding ID:** RP07.
2. **Category:** Inconsistency. Classification: source-confirmed state-model and design inconsistencies.
3. **Severity:** High.
4. **Affected role:** All roles.
5. **Affected files:** `backend/app/routes/reports.py`, `update_report_status`, `verify_incident_report`, `claim_report`, merge checks; `backend/app/routes/rescue.py`, `update_rescue_request`.
6. **Current behavior:** Guards address selected roles and states, but do not define permitted source-to-target transitions. Verification can reset an otherwise eligible closed or merged report to 2. Manual merge exclusions omit closed status 17. Claiming a report sets status 2 even while `verification_status` remains unverified.
7. **Expected behavior:** State transitions must preserve verification, merge, custody, and closure invariants.
8. **Root cause:** Multiple local status lists and mutation implementations.
9. **Impact:** Reopened cases, skipped steps, “Verified” labels without investigation, and contradictory merged records.
10. **Evidence:** `backend/app/routes/reports.py:3757`, `:5345`, `:5385`, `:4584`, `:5632`; `backend/app/routes/rescue.py:547`. Compare `CLOSED_REPORT_STATUS_IDS` in `backend/app/utils/case_closure.py` and status labels in `frontend/src/utils/reportStatus.ts`.
11. **Recommended fix:** Centralize transition policy while keeping assignment and incident verification distinct.
12. **Regression risk:** Legitimate exceptions, dispute reopening, and administrator overrides.

### RP08 — Cancellation can dismiss an active rescue

1. **Finding ID:** RP08.
2. **Category:** Workflow.
3. **Severity:** High.
4. **Affected role:** Reporters and response teams.
5. **Affected files:** `backend/app/routes/reports.py`, `cancel_report_by_citizen`; `backend/app/utils/case_closure.py`, closure hook.
6. **Current behavior:** Any reporter can set their report to dismissed status 14 regardless of operational progress. The closure hook can consequently close rescue work. The cancellation path does not add a corresponding status-history entry or operational notification.
7. **Expected behavior:** Cancellation after verification, dispatch, or custody requires an appropriate officer decision.
8. **Root cause:** Ownership is checked without lifecycle eligibility.
9. **Impact:** Active work can be dismissed while an animal remains in custody or responders are operating.
10. **Evidence:** Confirmed from `backend/app/routes/reports.py:3128`, especially `:3137`–`:3145`; `close_open_rescues` and `_sync_rescues_with_closed_reports` in `backend/app/utils/case_closure.py`.
11. **Recommended fix:** Permit direct cancellation only in the initial eligible state; route later requests to staff.
12. **Regression risk:** Residents correcting accidental submissions.

### RP09 — Self-reunion does not establish actual ownership

1. **Finding ID:** RP09.
2. **Category:** Security / workflow.
3. **Severity:** High.
4. **Affected role:** Reporters, pet owners, and staff.
5. **Affected files:** `backend/app/routes/reports.py`, `confirm_reunited_by_citizen`.
6. **Current behavior:** Being the reporter is sufficient even for a sighting of someone else's animal. Any staff role is also accepted without jurisdiction checks. The return snapshot identifies the actor as the owner and can mark reporter status as ownership proof.
7. **Expected behavior:** Recovery must distinguish reporter knowledge from verified ownership and actual handover.
8. **Root cause:** Reporter, owner, and officer authority are combined.
9. **Impact:** False reunion records, incorrect ownership evidence, and premature case closure.
10. **Evidence:** Confirmed from `backend/app/routes/reports.py:3164`, authorization at `:3180`–`:3189`, snapshot at `:3217`–`:3232`, and closure at `:3235`–`:3237`.
11. **Recommended fix:** Restrict resident recovery to a validated owner relationship and check actual case custody; apply staff scope and action authority.
12. **Regression risk:** Legitimate owner self-recovery without facility involvement.

### RP10 — Claim submission immediately acquires unowned pets

1. **Finding ID:** RP10.
2. **Category:** Security.
3. **Severity:** High.
4. **Affected role:** Residents and community-animal custodians.
5. **Affected files:** `backend/app/routes/claims.py`, `create_or_update_claim`.
6. **Current behavior:** An unowned pet is assigned to the submitting account and committed before proof validation and claim review. The chosen report and pet are not first required to have an established relationship.
7. **Expected behavior:** A claim records a proposed ownership relationship pending review.
8. **Root cause:** Claim filing directly changes registry ownership.
9. **Impact:** Unauthorized acquisition of community records; ownership can persist even when later validation fails.
10. **Evidence:** Confirmed from `backend/app/routes/claims.py:277`–`:314`; ownership assignment and commit at `:299`–`:302` precede proof validation.
11. **Recommended fix:** Preserve ownership until an authorized decision; validate the report–pet relationship before mutation.
12. **Regression risk:** The existing ownerless-animal claim flow.

### RP11 — Claim transitions skip required steps

1. **Finding ID:** RP11.
2. **Category:** Bug.
3. **Severity:** High.
4. **Affected role:** Owners and reviewing staff.
5. **Affected files:** `backend/app/routes/claims.py`, `update_claim_status`, `create_or_update_claim`, `update_claim_documents`; `backend/app/schemas/pet_claim.py`.
6. **Current behavior:** An owner can select “Pet Received” without a preceding approved handover. Resubmission resets existing claims to Pending Review. Staff document PATCH can set a claim status without executing the corresponding decision logic.
7. **Expected behavior:** Claim transitions must validate both actor and previous state.
8. **Root cause:** Status authorization is based mainly on the requested destination.
9. **Impact:** Approval bypass, completed claims reopening, and status changes without associated return records.
10. **Evidence:** Confirmed from `backend/app/routes/claims.py:488`–`:516`, `:696`–`:751`, `:333`–`:337`, and `:881`–`:887`; status inputs in `backend/app/schemas/pet_claim.py`.
11. **Recommended fix:** Define one claim transition function; make document updates status-neutral.
12. **Regression risk:** Evidence-request resubmission and legacy recovery shortcuts.

### RP12 — Dispatch is treated as custody

1. **Finding ID:** RP12.
2. **Category:** Bug.
3. **Severity:** High.
4. **Affected role:** Owners and rescue personnel.
5. **Affected files:** `backend/app/utils/claim_custody.py`, `HELD_REPORT_STATUS_IDS` and `animal_held`.
6. **Current behavior:** Report status 5 qualifies as held. Elsewhere, status 5 means a team has been dispatched.
7. **Expected behavior:** A claim requiring physical custody must begin only after someone actually holds the animal.
8. **Root cause:** Expected future custody and actual custody are combined.
9. **Impact:** Claims and approvals can proceed before the animal is found.
10. **Evidence:** Confirmed from the inclusion of 5 in `HELD_REPORT_STATUS_IDS` and the early return in `animal_held`; compare `frontend/src/utils/caseStages.ts`, whose status-5 label says a rescue team is on the way.
11. **Recommended fix:** Require pickup, an active holding record, or another explicit verified custody fact.
12. **Regression risk:** Animals genuinely secured by a resident before official pickup.

### RP13 — Approval and physical completion disagree

1. **Finding ID:** RP13.
2. **Category:** Inconsistency.
3. **Severity:** High.
4. **Affected role:** Residents, owners, and staff.
5. **Affected files:** `backend/app/routes/claims.py`, approval and handover; `backend/app/routes/holding.py`, outcome synchronization; `backend/app/utils/case_closure.py`; `backend/app/routes/chat.py`, chat closure; `frontend/src/utils/caseStages.ts`.
6. **Current behavior:** Claim approval sets report status 9 before handover. Closure logic treats 9 as finished, while chat intentionally remains open for pickup. The resident timeline says “Back home.” Holding outcomes use report 11 broadly, while impound history can record 8. Holding outcome updates do not use the report-status notification path.
7. **Expected behavior:** Approval, handover, custody, outcome labels, and notifications must describe the same facts.
8. **Root cause:** Status 9 represents both an approved claim and a completed return; outcome logic is duplicated.
9. **Impact:** Premature closure and contradictory dashboards, timelines, and notifications.
10. **Evidence:** `backend/app/routes/claims.py:521`; `backend/app/routes/holding.py:715`–`:744`; `backend/app/routes/chat.py:553`; `frontend/src/utils/caseStages.ts:77`. Isolated utility execution with `{status_id: 9, custody_status: 'Secured in Facility', history: []}` returned both a case label and location statement of “Back home with its owner.”
11. **Recommended fix:** Keep claim approval in `PetClaim.status`; apply final report outcome only after physical completion.
12. **Regression risk:** Claim queues, chat closure, holding discharge, and statistics.

### RP14 — Failed attachments still produce success

1. **Finding ID:** RP14.
2. **Category:** Reliability.
3. **Severity:** High.
4. **Affected role:** Residents and leaders.
5. **Affected files:** `frontend/src/pages/citizen/ReportStrayPage.tsx`, `handleSubmit`; `frontend/src/components/Modals/SubdReportModal.tsx`, parallel submission implementation.
6. **Current behavior:** The report is saved first. Upload and media-registration failures are caught individually. Success is displayed even when every attachment fails; the resident draft is cleared.
7. **Expected behavior:** Users must receive an accurate partial-success result and a way to retry attachments against the existing report.
8. **Root cause:** Attachment failures do not affect the submission result.
9. **Impact:** Evidence-free reports, lost local recovery context, and unnecessary resubmission.
10. **Evidence:** Confirmed from `frontend/src/pages/citizen/ReportStrayPage.tsx:802`–`:854` and `frontend/src/components/Modals/SubdReportModal.tsx:639`–`:690`.
11. **Recommended fix:** Preserve the report ID and failed attachments, show partial completion, and reuse the claim-evidence retry pattern.
12. **Regression risk:** Multi-file progress and successful partial uploads.

### RP15 — Media URL validation accepts untrusted hosts

1. **Finding ID:** RP15.
2. **Category:** Security.
3. **Severity:** High.
4. **Affected role:** API and AI worker.
5. **Affected files:** `backend/app/utils/uploads.py`, `validate_cloudinary_url`; `backend/app/routes/reports.py`, `process_report_media_ai` remote download.
6. **Current behavior:** `netloc.endswith("cloudinary.com")` accepts unrelated hosts such as `untrustedcloudinary.com`. The worker later downloads the supplied URL.
7. **Expected behavior:** Only the exact approved delivery host/account and verified assets should be accepted.
8. **Root cause:** A string-suffix test substitutes for hostname and asset validation.
9. **Impact:** Untrusted remote content reaches the worker; server-side request forgery through redirects is a potential consequence, not dynamically verified.
10. **Evidence:** `backend/app/utils/uploads.py:143`–`:159`; `backend/app/routes/reports.py:3485`–`:3490`. Isolated execution accepted both `https://res.cloudinary.com/audit-example/image/upload/photo.jpg` and `https://untrustedcloudinary.com/audit-example/photo.jpg` with a dummy configured cloud name. No network request was made.
11. **Recommended fix:** Validate the exact hostname, asset ownership, redirects, destination restrictions, and response limits.
12. **Regression risk:** Valid Cloudinary delivery variants and existing attachments.

### RP16 — Media association and closure rules are incomplete

1. **Finding ID:** RP16.
2. **Category:** Security / integrity.
3. **Severity:** High.
4. **Affected role:** Reporters and staff.
5. **Affected files:** `backend/app/routes/reports.py`, `upload_report_media` and `delete_report_media`.
6. **Current behavior:** A supplied `history_id` is not checked against the target report. Reporters can add media after closure and supply evidence/status/authenticity fields. Evidence uploads bypass the normal AI-processing branch.
7. **Expected behavior:** Attachments must belong to the authorized case and permitted action, with trustworthy provenance.
8. **Root cause:** Report ownership is checked without validating attachment relationships and lifecycle.
9. **Impact:** Cross-report timeline contamination, fabricated authenticity labels, and changes to closed evidence.
10. **Evidence:** Confirmed from `backend/app/routes/reports.py:3664`, metadata assignment at `:3711`–`:3724`, AI branch at `:3740`–`:3744`; compare deletion checks at `:4422`.
11. **Recommended fix:** Validate history ownership, derive protected metadata, and define explicit post-closure evidence actions.
12. **Regression risk:** Reunion photos and legitimate supplemental evidence.

### RP17 — Warning issuance does not enforce incident eligibility

1. **Finding ID:** RP17.
2. **Category:** Validation.
3. **Severity:** High.
4. **Affected role:** Leaders and pet owners.
5. **Affected files:** `backend/app/routes/warnings.py`, `issue_warning`; `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, documented warning decisions.
6. **Current behavior:** Warning creation does not require incident verification or the assigned handling leader. A report is optional. Explicit pet selection can avoid the inherited-identity check. Duplicate checking includes violation type, allowing multiple warnings for one report under different types.
7. **Expected behavior:** The documented “one warning per verified incident” rule must hold on the backend.
8. **Root cause:** Local checks cover selected fields rather than warning eligibility as a whole.
9. **Impact:** Unsupported warnings, wrong-pet incidents, and duplicate enforcement.
10. **Evidence:** Confirmed from `backend/app/routes/warnings.py:74`–`:168`, including conditional report checks at `:95`, violation-type duplicate filtering at `:127`, and the conditional inherited-link check at `:140`. The current owner-follow-up plan states one warning per verified incident.
11. **Recommended fix:** Require a verified incident, authorized handler, trusted case identity, correct owner, and incident-level duplicate protection.
12. **Regression risk:** Historical standalone warnings and repeated-incident warning progression.

### RP18 — Merged-report redaction leaks nested data

1. **Finding ID:** RP18.
2. **Category:** Privacy.
3. **Severity:** High.
4. **Affected role:** Reporters and owners in merged cases.
5. **Affected files:** `backend/app/routes/reports.py`, `populate_duplicate_and_merge_info`; `backend/app/utils/report_visibility.py`, `redact_response`.
6. **Current behavior:** Top-level identities and merge notes are removed, but nested merged summaries retain `reporter_name` and `merge_notes` for nonpublic resident access levels.
7. **Expected behavior:** Privacy rules must apply to every embedded report.
8. **Root cause:** Nested dictionaries are copied through a field allowlist containing private fields.
9. **Impact:** Other reporters' full names and internal merge explanations become visible.
10. **Evidence:** `backend/app/routes/reports.py:598`–`:621`, `:633`–`:656`; `backend/app/utils/report_visibility.py:374`–`:393`. Isolated `redact_response` execution for `case_reporter` retained “Other Reporter Full Name” and “Internal staff decision note” in the merged summary.
11. **Recommended fix:** Serialize each nested sighting using its viewer access policy.
12. **Regression risk:** Staff case review and residents following their own merged reports.

### RP19 — Failed AI processing can be recorded as done

1. **Finding ID:** RP19.
2. **Category:** Reliability.
3. **Severity:** High.
4. **Affected role:** Reporters and reviewing officers.
5. **Affected files:** `backend/app/routes/reports.py`, `process_report_media_ai`; `backend/app/utils/ai_jobs.py`, `process_one`; `backend/app/routes/matches.py`, `_scan_and_generate_matches_for_report`.
6. **Current behavior:** Media-processing exceptions and download failures are swallowed. The job runner then sees successful completion. Match-save failures are also rolled back and printed without being raised.
7. **Expected behavior:** Retryable failure must reach the queue runner.
8. **Root cause:** Worker functions hide failures from their execution contract.
9. **Impact:** Missing analysis or matches appear successfully processed and are not retried.
10. **Evidence:** Confirmed from `backend/app/routes/reports.py:3491`–`:3493`, `:3652`–`:3660`; `backend/app/utils/ai_jobs.py:167`–`:193`; `backend/app/routes/matches.py:1184`–`:1190`.
11. **Recommended fix:** Return explicit outcomes or raise typed retryable failures; retain truthful failure state.
12. **Regression risk:** Intentionally tolerated AI fallback and genuinely ineligible media.

### RP20 — Idempotency is incomplete

1. **Finding ID:** RP20.
2. **Category:** Reliability. Classification: confirmed missing protection; concurrent failure modes require reproduction.
3. **Severity:** High.
4. **Affected role:** All reporting roles.
5. **Affected files:** `backend/app/routes/reports.py`, creation; `backend/app/routes/rescue.py`, check-then-create; `backend/app/routes/warnings.py`; `backend/app/routes/owner_followups.py`; `backend/app/utils/ai_jobs.py`, enqueue functions; `backend/app/models/report_match.py`.
6. **Current behavior:** Report creation has no request idempotency key. Several rescue, warning, follow-up, and matching paths depend on checking for an existing row before insertion.
7. **Expected behavior:** Retries and simultaneous equivalent actions must converge on one result.
8. **Root cause:** Request identity and concurrency protection are uneven.
9. **Impact:** Lost-response retries can duplicate reports. Concurrent duplicate jobs, matches, or operational records are plausible but were not reproduced.
10. **Evidence:** `backend/app/routes/reports.py:2249`; `backend/app/routes/rescue.py:180`; `backend/app/utils/ai_jobs.py:73`; `backend/app/models/report_match.py`. Contrast row locking and client-token reuse in `backend/app/routes/report_split.py:199`–`:209`. Constraint availability must be checked per database; this is not a claim that every table lacks uniqueness constraints.
11. **Recommended fix:** Reuse the split workflow's request-token approach; lock relevant existing rows and add only justified uniqueness guarantees.
12. **Regression risk:** Legitimate separate incidents involving the same animal.

### RP21 — Merge reconciliation may reopen a closed rescue

1. **Finding ID:** RP21.
2. **Category:** Integrity. Classification: potential bug requiring reproduction.
3. **Severity:** High.
4. **Affected role:** Rescue teams and case handlers.
5. **Affected files:** `backend/app/routes/reports.py`, `_merge_one` and `unmerge_duplicate_report`; `backend/app/utils/case_closure.py`, flush hook.
6. **Current behavior:** When both reports have rescues, consolidation can set a rescue outside statuses 3, 4, and 5 to status 5—including resolved status 6. This interacts with the report-closure hook and autoflush timing.
7. **Expected behavior:** Merging must leave one authoritative mission and preserve completed operational history.
8. **Root cause:** Rescue reconciliation writes status independently of the shared closure rules.
9. **Impact:** A closed mission or assignment may appear active again. The exact database sequence requires reproduction.
10. **Evidence:** `backend/app/routes/reports.py:5718`–`:5728`; `close_open_rescues` and `_sync_rescues_with_closed_reports` in `backend/app/utils/case_closure.py`. Unmerge at `backend/app/routes/reports.py:5926` resets independent handling state but requires separate verification of custody/mission provenance.
11. **Recommended fix:** Consolidate under locks, explicitly close redundant missions, and preserve original provenance for unmerge review.
12. **Regression risk:** Merging cases with active teams, previous rescues, or holding records.

### RP22 — Transactions and audit attribution are unreliable

1. **Finding ID:** RP22.
2. **Category:** Integrity / security.
3. **Severity:** High.
4. **Affected role:** All operational roles.
5. **Affected files:** `backend/app/services/email_service.py`, `queue_email`; `backend/app/utils/audit.py`, `log_activity`; `backend/app/routes/owner_followups.py`, `close_followup`; report mutation callers.
6. **Current behavior:** Helpers commit the caller's session. A workflow can therefore persist before later steps fail. Audit logging can infer the actor from caller-controlled `X-User-Id`. Some audit snapshots also capture state after mutation.
7. **Expected behavior:** One workflow transaction should own its commit, and the authenticated actor should determine attribution.
8. **Root cause:** Transaction and identity responsibilities leak into generic helpers.
9. **Impact:** Partial outcomes, misleading failures, and inaccurate audit evidence.
10. **Evidence:** Confirmed from `backend/app/services/email_service.py:196`; default commit and header fallback in `backend/app/utils/audit.py`; nested status update followed by further writes in `backend/app/routes/owner_followups.py:418`–`:438`; post-mutation verification snapshot in `backend/app/routes/reports.py:5451`.
11. **Recommended fix:** Have helpers add rows without committing; commit once at the action boundary; pass authenticated actor and pre-change snapshots explicitly.
12. **Regression risk:** Email queuing, push hooks, and callers relying on implicit commits.

### RP23 — AI outages block reporting

1. **Finding ID:** RP23.
2. **Category:** Reliability.
3. **Severity:** High.
4. **Affected role:** Residents.
5. **Affected files:** `frontend/src/pages/citizen/ReportStrayPage.tsx`, analysis failure and submission gate; `backend/app/routes/reports.py`, analysis fallback.
6. **Current behavior:** Analysis failure becomes `animalDetected: false`, which blocks progression/submission.
7. **Expected behavior:** Service failure must differ from a successful finding that no eligible animal is present.
8. **Root cause:** “Not checked” and “not detected” share the rejection path.
9. **Impact:** Ordinary reports cannot be submitted during analysis/network outages.
10. **Evidence:** Confirmed from `frontend/src/pages/citizen/ReportStrayPage.tsx:599`–`:620`, submission guard at `:731`–`:734`, and `backend/app/routes/reports.py:1983`–`:2004`.
11. **Recommended fix:** Permit a clearly marked unanalysed report for staff review, with normal manual species validation.
12. **Regression risk:** Maintaining the dog/cat reporting restriction without treating AI as authoritative.

### RP24 — ORM and SQL constraints differ

1. **Finding ID:** RP24.
2. **Category:** Data consistency. Classification: confirmed schema-definition mismatch; live schema unverified.
3. **Severity:** Medium.
4. **Affected role:** Maintainers and all workflows.
5. **Affected files:** `backend/app/models/report.py`, `Report` and `HoldingAnimal`; `Database3.3.txt`.
6. **Current behavior:** The SQL schema declares a report–pet foreign key and unique holding report, while the corresponding ORM declarations omit those guarantees.
7. **Expected behavior:** Supported schema-creation paths must enforce equivalent invariants.
8. **Root cause:** Parallel schema definitions have drifted.
9. **Impact:** Integrity behavior differs by database provenance. Existing orphaned or duplicate data was not established.
10. **Evidence:** `backend/app/models/report.py:35`, `:361`–`:392`; `Database3.3.txt:698`, `:827`. No database metadata inspection was performed.
11. **Recommended fix:** First compare actual schema metadata; reconcile only demonstrated differences.
12. **Regression risk:** Existing data that violates a proposed constraint.

### RP25 — Repeated-incident references are weakly validated

1. **Finding ID:** RP25.
2. **Category:** Validation. Classification: confirmed missing relationship validation.
3. **Severity:** Medium.
4. **Affected role:** Leaders and owners.
5. **Affected files:** `backend/app/routes/owner_followups.py`, `add_contact`; `backend/app/utils/owner_followups.py`, `start_refusal`.
6. **Current behavior:** A repeated-incident reference principally requires an existing, different report. It does not establish the same pet, relevant jurisdiction, or incident relationship. Observation eligibility also does not enforce the inherited-pet trust check used elsewhere.
7. **Expected behavior:** Consequential observation history must reference the correct, sufficiently verified animal.
8. **Root cause:** Existing-record checks substitute for relationship validation.
9. **Impact:** Unrelated reports can become apparent repeat-offense history.
10. **Evidence:** `backend/app/routes/owner_followups.py:284`–`:298`; `backend/app/utils/owner_followups.py:85`–`:115`. Compare `pet_link_trusted` in `backend/app/utils/case_groups.py`.
11. **Recommended fix:** Validate scope, trusted identity, and incident relationship; record any explicit override.
12. **Regression risk:** Legitimate sightings across subdivision boundaries.

### RP26 — Capped pages are presented as complete datasets

1. **Finding ID:** RP26.
2. **Category:** Performance / UX.
3. **Severity:** Medium.
4. **Affected role:** Residents and dashboard users.
5. **Affected files:** `backend/app/routes/reports.py`, default page size and `get_reports`; `frontend/src/pages/citizen/ResiHomePage.tsx`, `fetchReports`; `frontend/src/pages/Admin/AdminHeatMap.tsx`.
6. **Current behavior:** The API defaults to the newest 500 reports. These clients request one page and filter or aggregate it as their dataset. List responses also embed extensive detail.
7. **Expected behavior:** Active feeds and analytics must state or retrieve their complete intended scope.
8. **Root cause:** API pagination was introduced without consistent consumer handling.
9. **Impact:** Older active incidents disappear and maps/counts become incomplete; frequent refreshes reload heavy payloads.
10. **Evidence:** Confirmed from `backend/app/routes/reports.py:168`, `:1073`–`:1109`; `frontend/src/pages/citizen/ResiHomePage.tsx:882`–`:947`; `frontend/src/pages/Admin/AdminHeatMap.tsx:164`. Performance costs were not benchmarked.
11. **Recommended fix:** Filter on the server before pagination; honor pagination headers; provide compact list projections.
12. **Regression risk:** Counts, exports, historical maps, and merged-parent lookup.

### RP27 — Drafts are not account-scoped

1. **Finding ID:** RP27.
2. **Category:** Privacy / UX.
3. **Severity:** Medium.
4. **Affected role:** Residents using shared devices.
5. **Affected files:** `frontend/src/pages/citizen/ReportStrayPage.tsx`, draft storage and restoration.
6. **Current behavior:** One `straysafe_report_draft` key stores descriptions and coordinates for up to 48 hours. It is not tied to an account. Attachments are not persisted.
7. **Expected behavior:** Draft restoration must belong to the current account and accurately explain what can be recovered.
8. **Root cause:** Draft storage is browser-wide text persistence.
9. **Impact:** Another account can inherit a draft; interruption loses selected evidence despite restored form text.
10. **Evidence:** Confirmed from `frontend/src/pages/citizen/ReportStrayPage.tsx:234`–`:318`. Repository search found the draft key in this component; restoration does not validate account ownership.
11. **Recommended fix:** Scope drafts by account, clear appropriately on sign-out, and explicitly disclose attachment restoration limits.
12. **Regression risk:** Existing draft recovery and browser storage failures.

### RP28 — Forms and AI repeat substantial work

1. **Finding ID:** RP28.
2. **Category:** Redundancy. Classification: confirmed overlap; consolidation and optimization are recommendations.
3. **Severity:** Medium.
4. **Affected role:** Residents, leaders, and maintainers.
5. **Affected files:** `frontend/src/pages/citizen/ReportStrayPage.tsx`; `frontend/src/components/Modals/SubdReportModal.tsx`; `backend/app/routes/reports.py`; `backend/app/utils/ai_pipeline.py`; `backend/app/utils/ai_suggestions.py`.
6. **Current behavior:** Forms duplicate analysis and attachment orchestration. Creation can perform synchronous AI suggestions; follow-up processing generates them again. Direct URL registration does not carry the form's analysis cache to a separate worker.
7. **Expected behavior:** Shared mechanics and verified analysis results should be reused.
8. **Root cause:** Separate forms and process-local caches.
9. **Impact:** Repeated inference, longer submissions, and divergent error handling. Actual latency/cost was not measured.
10. **Evidence:** `frontend/src/pages/citizen/ReportStrayPage.tsx`, `triggerAiAnalysis` and `handleSubmit`; equivalent functions in `frontend/src/components/Modals/SubdReportModal.tsx`; `backend/app/routes/reports.py:2340`, `:3740`–`:3744`; `backend/app/utils/ai_pipeline.py:98`; `generate_ai_suggestions` in `backend/app/utils/ai_suggestions.py`.
11. **Recommended fix:** Share submission logic and persist server-verified analysis by asset/content identity.
12. **Regression risk:** Cache invalidation and analysis settings changes.

### RP29 — File validation does not fully verify content

1. **Finding ID:** RP29.
2. **Category:** Security / reliability.
3. **Severity:** Medium.
4. **Affected role:** Uploaders and API workers.
5. **Affected files:** `backend/app/utils/uploads.py`, `verify_file_signature` and `read_and_validate_upload`; `backend/app/routes/reports.py`, remote media read.
6. **Current behavior:** `.doc`/`.docx` validation returns true without inspecting structure. Uploads and remote downloads are read fully before size enforcement or without an equivalent response-size cap.
7. **Expected behavior:** Accepted document formats require structural validation, and reads must be bounded.
8. **Root cause:** Incomplete format checks and post-read limits.
9. **Impact:** Invalid proof files and avoidable memory pressure.
10. **Evidence:** `backend/app/utils/uploads.py:47`–`:65`, `:119`; `backend/app/routes/reports.py:3489`–`:3490`. Isolated validation returned true for `b'not a Word document'` with `.docx` and its expected MIME type. Memory-exhaustion behavior was not tested.
11. **Recommended fix:** Remove unnecessary formats or validate them properly; use bounded reads and decoded-image limits.
12. **Regression risk:** Legitimate document evidence and large valid media.

### RP30 — Some controls lack keyboard access

1. **Finding ID:** RP30.
2. **Category:** UX / accessibility.
3. **Severity:** Low.
4. **Affected role:** Keyboard and assistive-technology users.
5. **Affected files:** `frontend/src/pages/citizen/ReportStrayPage.tsx`, species radios and labels; corresponding controls in `frontend/src/components/Modals/SubdReportModal.tsx`.
6. **Current behavior:** Radio inputs use `className="hidden"`. Several visible labels are not programmatically associated with their controls.
7. **Expected behavior:** Ordinary reporting must work through keyboard navigation and accessible names.
8. **Root cause:** Visual styling replaces native control accessibility.
9. **Impact:** Users can become unable to select or understand required fields.
10. **Evidence:** Confirmed markup defects in `frontend/src/pages/citizen/ReportStrayPage.tsx:1330`–`:1350` and corresponding form markup in `frontend/src/components/Modals/SubdReportModal.tsx`. Screen-reader behavior requires browser testing.
11. **Recommended fix:** Use visually hidden, focusable controls, visible focus states, and associated labels.
12. **Regression risk:** Radio-card styling.

## C. Reporting workflow analysis

### Current workflow

| Stage | Verified implementation | Main concern |
|---|---|---|
| Submission | Authenticated reporter, coverage check, Private visibility, separate media registration | Protected creation fields and partial upload success |
| AI analysis | Local detection, Gemini assistance, persistent job queue and fallbacks | Submission blocking, repeated work, swallowed failures |
| Potential pet matching | Scored suggestions, owner/staff confirmation, case identity reconciliation | Alternate endpoints bypass identity rules |
| Duplicate detection | Active candidates, seven-day time window, 1.5 km radius, human merge decision | Concurrent scans and inconsistent manual merge exclusions |
| Leader assignment | Row locking, handler ownership, transfer workflow | Status 2 also reads as Verified |
| Verification | Explicit investigation fields and officer attribution | Some paths skip or reset it |
| Owner intervention | Observation defaults to three days; acknowledgement, updates, extension, due notification | Warning and repeat-reference validation |
| Escalation | Animal-record requirement, endorsement/rescue records, approval gate | Equivalent checks absent from alternate routes |
| Rescue | Approval, dispatch, pickup, assignment records | Dispatch authority and custody semantics |
| Holding | Intake, care timeline, stay clocks, return/impound outcomes | Scope and outcome synchronization |
| Closure | Shared rescue cleanup and owner-follow-up cleanup | Approval can trigger premature closure |
| Reopening | Disputes, unmerge, reverse decisions, general updates | No single controlled reopening policy |

### Role consistency

| Role | Intended responsibility supported by current code | Required correction |
|---|---|---|
| Resident | File reports, edit early own reports, provide evidence, communicate, confirm own pet information | Prevent unrelated disputes, unauthorized pet links, and operational cancellation |
| Subdivision Leader | Claim, verify, review identity/duplicates, warn, observe, escalate | Enforce handler authority across every related endpoint |
| Barangay Staff | Work approved/escalated cases and assigned rescues | Enforce jurisdiction and action-specific authority |
| Head Officer | Approval and team coordination | Backend assignment authority must match the frontend |
| Administrator | Oversight and explicit operational overrides | Overrides should remain attributable and preserve data invariants |

### Recommended state model

Reuse the current models and IDs. A replacement architecture is unnecessary.

| Existing state | Recommended meaning and guard |
|---|---|
| 1 Reported | Submitted, awaiting handling; eligible resident corrections |
| 2 | Handling/review state; show “Verified” only when investigation verification is complete |
| 15 / 16 | Authorized dispute or investigation; preserve the prior operational context |
| OwnerFollowUp Observing | Separate owner-observation state; never imply facility custody |
| 4 Escalated | Awaiting authorized Barangay approval |
| 13 Approved | Approved for operational planning |
| 5 Rescue In Progress | Team dispatched; animal may still be unlocated |
| 6 Picked Up | Physical pickup confirmed |
| 7 Holding observation | Animal in verified custody; distinct from owner observation |
| 8 Impounded | Explicit impound custody/disposition policy used consistently across consumers |
| 9 Returned to Owner | Physical return completed; claim approval remains on the claim |
| 10 / 11 / 12 / 17 | Explicit released, resolved, deceased, or not-found outcomes |
| 3 / 14 | Reasoned rejection or dismissal by an authorized action |
| 18 Merged | Sighting linked to its primary case; no independent dispatch |

Every transition should validate actor, jurisdiction, handler/assignment, previous state, identity trust, custody, and required evidence. It should save state, history, audit, and notifications together.

Closed cases should change through an explicit reopening or correction action. A new incident involving the same pet should remain a new incident.

## D. Redundancy analysis

| Existing overlap | Consolidation that preserves the architecture |
|---|---|
| Report status, rescue status, holding outcome, and claim decision handlers | Shared action functions for transition and outcome synchronization |
| Dedicated pet linking versus general PATCH/create assignment | One pet-link authorization and identity function |
| Resident form and leader report modal | Shared analysis, upload, submission, and retry logic |
| Repeated status arrays and labels | Shared documented status policy, with explicit contextual distinctions |
| Form analysis, submission suggestions, worker analysis | Reuse server-verified asset analysis |
| Notification creation in several route families | Shared event-specific notification functions with scoped recipients |
| Case-wide identity and claim reconciliation | Reuse the existing `case_groups` helpers rather than introducing another case system |

Some apparent duplication is intentional and should remain: **report lifecycle, claim review, rescue activity, owner observation, and physical custody are different concepts**. Consolidate their rules and synchronization without collapsing them into one status field.

## E. Edge cases and real-world scenarios

| Scenario | Assessment |
|---|---|
| Resident submits the same report twice | No submission idempotency; RP20 |
| Two residents report the same animal simultaneously | Human-reviewed duplicate handling exists; concurrent scan/merge behavior needs reproduction |
| Registered pet mistaken for a stray | Two-way identity review and disputes exist; alternate linking paths undermine them |
| New report during owner observation | Detection and leader notification exist; repeat relationship checks need strengthening |
| Animal already rescued | Held/closed exclusions exist, but dispatch is incorrectly treated as held |
| Multiple animals | Split records exist; frontend advice to file separate reports does not clearly explain the existing group workflow |
| Potential match is wrong | Reject, reverse, identity dispute, and unmerge mechanisms exist |
| Owner has no account | Observation snapshots, phone acknowledgement, and manual returns exist; formal warnings remain account-based |
| Animal cannot be found | Status 17 exists; manual merge exclusions are inconsistent |
| Animal crosses subdivision boundaries | Cross-subdivision duplicate review exists; movement/handover ownership needs explicit operational policy |
| AI analysis fails | Worker fallbacks exist, but the resident submission gate can block filing |
| Connection fails during reporting | Text drafts exist; attachments and request identity are not recoverable consistently |
| Two staff process one report | Leader claiming/transfers use locks; equivalent protection is incomplete elsewhere |
| Wrong report was merged | Unmerge exists; custody and mission restoration require verification |
| Resolved animal receives a new report | A new incident can be created; the proposed late-report-to-closed-case workflow is not implemented |
| Owner confirms receipt before handover | Currently possible; RP11 |
| Pet ownership changes during observation | Owner snapshot is preserved; authority for subsequent updates needs runtime scenario testing |
| Staff member is reassigned | Chat assignment checks do not consistently filter assignment state; verify former responders' access |
| Queue fails after report commit | Client can receive failure despite a saved report; RP20/RP22 |
| Every attachment fails | Success still appears; RP14 |
| Same device changes accounts | Draft may transfer between users; RP27 |

The closed-case late-report proposal should be treated as **planned functionality**, not a broken feature already promised by the implementation. Any implementation should distinguish a late sighting of the original event from a genuinely new incident.

Relevant implementation references for these scenarios include `backend/app/routes/chat.py`, `is_user_assigned_to_report` (`:308`); `backend/app/routes/report_split.py`; `backend/app/utils/report_split.py`; `backend/app/utils/owner_followups.py`; and `docs/06-future-proposals/LATE_REPORTS_FOR_CLOSED_CASES_PLAN.md`.

## F. Recommended improvements

The safest approach is to strengthen the current boundaries:

1. **Create shared authorization guards** for reading, investigating, dispatching, assigning, holding, deciding claims, and issuing warnings.
2. **Narrow creation and general update schemas.**
3. **Centralize report and claim transitions**, reusing the current case and closure utilities.
4. **Make physical custody explicit** rather than inferring it from dispatch.
5. **Make submission resumable**, preserving report identity and failed attachments.
6. **Use one transaction per action**, including audit and notification queue records.
7. **Apply privacy rules recursively** to embedded reports and related records.
8. **Keep AI advisory and failure-tolerant**, with truthful queue outcomes.
9. **Align schema definitions only after inspecting actual database metadata.**
10. **Finish browser and device verification** before describing responsiveness or Android behavior as validated.

## G. Prioritized action plan

| Priority | Work | Why first |
|---|---|---|
| P0 | RP01–RP05: ownership, read/write scope, general PATCH, dispute authorization | Direct unauthorized access or actions |
| P1 | RP06–RP13, RP16–RP18: lifecycle, custody, claims, warnings, privacy | Prevent incorrect case outcomes and enforcement |
| P1 | RP15: media URL boundary | Untrusted server-side downloads |
| P2 | RP14, RP19–RP23: partial submission, retries, merge behavior, transactions, AI outages | Prevent silent failure and duplicate processing |
| P3 | RP24–RP29: schema parity, repeat references, pagination, drafts, consolidation, file handling | Consistency, maintainability, and scale |
| P4 | RP30 and browser/device checks | Complete accessible, understandable reporting |

The first repair batch should remain narrowly scoped to authorization and input boundaries. Broad UI consolidation should follow after those rules are secured.

## H. Regression testing checklist

Before accepting repairs, verify:

- [ ] A resident cannot link, mark Lost, or obtain private details for another owner's pet.
- [ ] Every list, detail, mutation, count, and notification respects jurisdiction.
- [ ] Only permitted officers assign eligible responders.
- [ ] General PATCH cannot change workflow state or protected identity.
- [ ] Unrelated residents cannot dispute a case.
- [ ] Creation ignores protected statuses and investigation findings.
- [ ] Claiming a case does not imply completed incident verification.
- [ ] Closed and merged cases reject ordinary operational updates.
- [ ] Reporter cancellation cannot terminate active rescue or holding work.
- [ ] Self-recovery requires the correct owner relationship.
- [ ] Filing a claim does not acquire an unowned pet.
- [ ] Claim receipt cannot bypass approval and handover.
- [ ] Dispatch does not qualify as physical custody.
- [ ] Approval, handover, discharge, labels, maps, and notifications agree.
- [ ] Attachment failures remain retryable against the same report.
- [ ] Untrusted URL hosts, redirects, invalid documents, and oversized responses are refused.
- [ ] Media history belongs to the authorized report.
- [ ] Warnings require a verified incident and trusted identity.
- [ ] Nested merged responses contain no unauthorized identities or staff notes.
- [ ] Failed AI jobs remain failed/retryable.
- [ ] Simultaneous equivalent requests produce one authoritative result.
- [ ] Merge/unmerge preserves mission, custody, evidence, and claim provenance.
- [ ] Failures cannot leave partial decisions committed.
- [ ] Audit actor identity comes from authentication.
- [ ] New and imported schemas enforce the same verified invariants.
- [ ] Repeated incidents belong to the correct animal and case.
- [ ] Feeds and maps remain complete beyond 500 reports.
- [ ] Drafts do not cross accounts.
- [ ] Reporting remains usable when AI is unavailable.
- [ ] Keyboard navigation, mobile widths, camera denial, GPS denial, offline recovery, and Android back navigation work.

These are proposed regression checks, not a claim that backend, browser, device, concurrency, or deployment verification has already passed.

## I. Features that should remain unchanged

Preserve these behaviors while closing their bypasses:

- **Private-by-default reports** and leader-controlled publication.
- **Human-reviewed AI suggestions**, including the documented, audited leader identity-confirmation exception.
- **Case-wide identity conflict prevention**, inherited-identity tracking, and recheck support.
- **Human duplicate confirmation**, explanations, cross-subdivision review, and retained sightings.
- **Leader claim/transfer locking** and split-request idempotency.
- **Per-animal split records**, protected unsplit behavior, and automatic group resolution.
- **Separate owner observation**, with acknowledgement distinct from compliance and leader decisions at expiry.
- **Original sighting preservation** and historical heatmaps that retain valid resolved incidents.
- **Claim evidence retry caching** and partial-upload reporting.
- **Shared rescue cleanup**, strengthened rather than replaced.
- **Visibility-aware refresh coordination**, which passed the inspected unit checks.
- **Manual owner-return support** for people without accounts.

The source audit is complete. Live authorization behavior, concurrent operations, deployed media privacy, and browser/Android usability still require controlled verification. The next concrete step is to review **RP01–RP05** as the first repair scope; no implementation was started by this audit or by saving this document.
