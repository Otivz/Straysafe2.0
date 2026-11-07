# Engineering review: Barangay traces in Admin and Subdivision portals

- Date: 2026-11-06 14:17 UTC
- Reviewer: Codex (GPT-6)
- Overall status: Unverified
- Expected finding IDs: ENG-15-01, ENG-15-02, ENG-15-03, ENG-15-04, ENG-15-05, ENG-15-06, ENG-15-07, ENG-15-08
- Authorization: User requested checking the whole Admin and Subdivision portals for Barangay traces.
- Scope: Passive source review of all 12 Admin and 20 Subdivision page files, route mounting, sidebars/navbars, directly relevant shared components, and supporting account/workflow guards. This is a source snapshot of the current working tree, including existing user changes.
- Limits: No live sessions, account creation, API mutations, database queries, deployment settings, browser interactions or environment files were used for this audit. Reachability below is established from routes and source conditions; runtime behavior and the deployed legacy switch are Unverified. Lexical matches include comments, field names, legitimate referrals and historical records; they are not defect counts.

## Scope boundary

The current product rule is that the Barangay is an external organization without a StraySafe account. Leaders record referrals and externally reported updates. Earlier holding, adoption, claim and dispatch records remain readable. See [Barangay Referral log](../../01-system/BARANGAY_REFERRAL_LOG.md), [restructuring decisions](../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md), and `backend/app/utils/retired.py`.

A remaining occurrence of Barangay, `barangay_id`, an old status label or a `Brgy` filename is not automatically wrong. The review distinguishes active mismatches, conditional legacy displays, intentional archives and unreachable old code.

## Practices reviewed

| Practice ID | Status | Evidence | Impact | Recommendation | Owner | Verification |
|---|---|---|---|---|---|---|
| ENG-15-01 | Partial | `AdminUserManagement.tsx:790`; `users.py:301`; findings B01/B03 | Active account/dashboard UI still crosses the retired boundary | Align active operations with referral-only scope | Project maintainer | Isolated account and navigation checks |
| ENG-15-02 | Partial | `AppRoutes.tsx:181`; archive guards in `BrgyHoldingFacility.tsx:429` and `BrgyAdoptions.tsx:218` | Admin archives reuse old portal implementations | Preserve archives while isolating legacy-only behavior | Project maintainer | Admin archive browser regression |
| ENG-15-03 | Partial | `retired.py:retired_workflow`; `main.py:1988`; `users.py:128` | Retired router guard does not cover account provisioning | Guard account create/update/head assignment explicitly | Backend maintainer | Throwaway database tests with legacy switch off/on |
| ENG-15-04 | Unverified | No Git co-change analysis in this review | Cannot establish historical change coupling | Review only if cleanup repeatedly spans unrelated modules | Project maintainer | Focused history review |
| ENG-15-05 | Partial | `SubdViewReport.tsx:1929` and `:3753`; `AdminReport.tsx:1946` | Large mixed historical/current views retain stale branches | Make historical context explicit and remove unreachable operational UI | Frontend maintainer | Legacy/current fixture comparisons |
| ENG-15-06 | Unverified | Error recovery was outside this passive scope | No reliability conclusion | Retain existing error states during any cleanup | Project maintainer | Scoped error-state regression |
| ENG-15-07 | Partial | Inline and expanded map branches in `SubdViewReport.tsx` | The same retired dispatch presentation appears twice | Use a shared presentation rule when updating both branches | Frontend maintainer | Both map sizes show consistent historical labels |
| ENG-15-08 | Recommended | `test_barangay_gate.py` exists; account paths remain outside retirement guard | Current evidence does not establish complete retirement coverage | Add isolated regression coverage for B01 and label/navigation findings | Project maintainer | Run targeted tests on synthetic data |

## Confirmed findings

### B01 - High priority: Admin still provisions retired Barangay identities

**Status: Partial.** Evidence: `frontend/src/pages/Admin/AdminUserManagement.tsx:373` includes the Barangay account filter; `:790` includes role 3 in the create/edit picker; `:812` offers head-officer designation and dispatch authority; `:251` posts to `/users/barangay/1/assign-head`. `backend/app/routes/users.py:301` accepts Admin creation and `:331` copies the supplied role; `:128` permits Admin head assignment and `:162` sets role 3. `backend/app/schemas/user.py:18` has an integer role without a retirement validator. `backend/app/main.py:1988` mounts users without the retired workflow dependency. The login/session guard in `backend/app/utils/auth.py:302` refuses Barangay identities by default, but does not prevent an Administrator creating or converting them.

Impact: the supported UI can create identities that cannot use the subdivision-only system, and head assignment can change a person's role. This is a product-boundary correctness gap inferred from the inspected code; no account was created and no privilege bypass is claimed. Owner: backend and Admin UI maintainers. Recommendation: remove role-3 provisioning/designation from active UI and enforce the same condition on create/update/assign-head when the legacy switch is off; preserve existing identities as history. Verification: synthetic role-4 requests against an isolated database must reject creating/promoting to role 3 by default, without rejecting legitimate resident/leader/admin operations.

### B02 - High priority: Admin's printable fallback still invents a custodial transfer

**Status: Partial.** Evidence: `frontend/src/pages/Admin/AdminReportView.tsx:2044` labels the preview an Official Endorsement & Transfer Certificate; `:2091` describes impound/quarantine; `:2101` falls back to text claiming temporary subdivision holding followed by transfer to Barangay custody if no stored letter content is present. The main page at `:1253` correctly calls it a Barangay Referral Document and `:1311` uses an external-referral fallback.

Impact: an empty-content referral preview can assert physical custody/transfer that the current workflow did not perform. Owner: Admin UI maintainer. Recommendation: use the current referral fallback in the printable preview; render actual stored historical letter content verbatim. Verification: compare a current referral without letter content against a historical letter with saved content in screen/print views.

### B03 - Medium priority: Subdivision dashboard retains active claims/holding shortcuts and ambiguous referral counts

**Status: Partial.** Evidence: `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx:228` counts statuses 4, 5 and 13 as `underBrgyCount`; `:863` shows At Barangay / Your animals held and links to `/subd/holding-facility`; the preceding shortcut links Pending Claims to `/subd/pet-claims`. `:1193` and `:1195` say cases are with Barangay HQ; `:1211` presents held animals and pending claims. `AppRoutes.tsx:150` and `:156` redirect the two retired destinations to referrals.

Impact: live-looking dashboard summaries imply active custody/claim management and lead to a different module. Owner: Subdivision UI maintainer. Recommendation: replace or label historical-only counts, use referral language without implying custody, and remove dead-purpose shortcuts. Verification: new referrals and legacy statuses/holding records must remain distinguishable, and each visible shortcut must land on the module it names.

### B04 - Medium priority: earlier endorsements are presented as live Barangay operations

**Status: Partial.** Evidence: `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx:133` correctly bypasses dispatch for current referrals; the legacy branch reads `/rescue-requests/report/...`; `:697` calls the result Live / Barangay operations, updates automatically, and `:702` says Awaiting active dispatch sync from the Barangay. The workflow helper at `:105`-`:117` also describes assignment and deployed rescue squads.

Impact: old read-only records can look like current integrated Barangay operations. Owner: Subdivision UI maintainer. Recommendation: label earlier dispatch data Historical and remove live/awaiting-sync claims while preserving recorded events and letters. Verification: current referral and earlier rescue endorsement fixtures should display their respective provenance clearly.

### B05 - Medium priority: report maps still contain a conditional live dispatch presentation

**Status: Partial.** Evidence: `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx:1922` gates a Barangay Dispatch Team En Route / Live Tracking Active banner on legacy status 5 and an active dispatch record; `:2086` and `:3753` label map teams Barangay Rescue Team (Live); `:2098` and `:3765` offer directions from the hall. `frontend/src/components/MapComponent.tsx:1692` supplies the shared From hall action.

Impact: a stale legacy active flag can imply the system still tracks external responders. This is conditional on legacy data, not a claim that every current report shows the banner. Owner: Subdivision/map UI maintainers. Recommendation: display earlier dispatch as recorded history, use actual freshness/source evidence before any live claim, and decide whether the hall is still a useful geographic reference. Verification: current sighting/referral, old status-5 active record, and earlier actual custody fixtures in inline/expanded maps.

### B06 - Medium priority: Admin Settings still describes active Barangay dispatch and impound setup

**Status: Partial.** Evidence: `frontend/src/pages/Admin/AdminAccountSettings.tsx:828` says Barangay Headquarters & Dispatch Location; `:831` describes Rescue Headquarters configuration; `:1151` offers Barangay-wide / Impound Facility and `:1203` offers Barangay Main Shelter. `frontend/src/pages/Subd_Leaders/SubdSettings.tsx:715` refers to Barangay Operations and `:1278` uses Barangay Escalation Verification.

Impact: current configuration screens blur external geographic/contact records with active rescue/facility operations. Geographic barangay/address fields are still valid. Owner: settings maintainer. Recommendation: retain reference geography and existing historic facility metadata, rename operational wording, and determine whether new legacy facility classifications should remain creatable. Verification: existing map references survive, while current settings do not advertise retired operations.

### B07 - Medium priority: shared Pet Record history can invent a Barangay issuer

**Status: Partial.** Evidence: `frontend/src/components/PetRecords/PetDetailPanel.tsx:1846` and `:1957` default a missing warning issuer name to Barangay Staff, while this component is shared by Admin and Subdivision pet records. `:405` still calls status 4 Escalated to Barangay; `:1314` says adoptions are managed exclusively by Barangay without the outside-StraySafe distinction.

Impact: missing historical attribution can be replaced by a specific role not established by the record. Owner: pet-record UI maintainer. Recommendation: use a neutral Not recorded/Staff fallback, preserve real issuer names and old stored events, and use current external-referral wording for synthesized labels. Verification: warnings with/without issuer details and current/legacy ownership records.

### B08 - Low priority: dead dispatch copy survives inside Admin direct action code

**Status: Partial.** Evidence: `frontend/src/pages/Admin/AdminReport.tsx:1929` says Directly assign rescue teams; `:1946` and `:1947` still declare Team Dispatched / Approved by Barangay options, but `:1950` filters them through `isSelectableReportStatus`. `frontend/src/utils/reportStatus.ts:24` excludes 5, 6, 8 and 13; the modal defaults to 16. `AdminReportView.tsx:1848` also has a target-status-5 dispatch branch, although its visible picker no longer contains 5.

Impact: stale copy and unreachable branches remain a maintenance trap. This finding does NOT claim retired statuses can be selected through the current pickers. Owner: Admin UI maintainer. Recommendation: remove unreachable UI branches and describe the remaining admin actions accurately; retain historical status decoding. Verification: visible choices still omit retired states and historical reports continue to render.

### B09 - Low priority: source-only retired pages and compatibility branches remain

**Status: Partial.** Evidence: `SubdHoldingFacility.tsx`, `SubdPetClaims.tsx` and `EscelatedMissions.tsx` retain earlier workflows but are not mounted as those components in `AppRoutes.tsx`; old URLs redirect to reports/referrals. `AdminSidebar.tsx:325`-`:326` still recognizes `/brgy/...` locations for active-state compatibility. Shared components and the `Barangay_Staff` source directory retain role-3 branches.

Impact: source searches still find many traces that are not active portal features. Owner: project maintainer. Recommendation: perform a separate dead-code/import audit before deletion; Admin archive routes still intentionally import two Barangay components. Verification: route/build and historical archive regressions, with no schema/history deletion.

## Intentional references that should remain

- External referral creation, contacts, reported outcomes and clearly attributed updates in `BarangayReferralCard`, observation referral actions and referral analytics.
- Barangay geographic names, addresses, reference pins and foreign keys, where they do not claim integrated operations.
- Read-only Admin holding/adoption archives: `AppRoutes.tsx:181`-`:182`; holding `archiveReadOnly`/`viewOnly` at `BrgyHoldingFacility.tsx:429`-`:430`; adoption archive state at `BrgyAdoptions.tsx:218` and `adoptionDetails.css:42`. Backend retired-router writes are gated in `main.py:1986` and `retired.py` by default. These source guards are evidence of intent, not a fresh runtime security certification.
- Real earlier custody/claim/adoption/dispatch records, their original issuer names, stored letters and historical status labels.
- `/brgy/*` information redirects and stale-session role checks that prevent the retired portal from opening.

## Page inventory

All 32 files below were searched, including pages with zero lexical matches. 7 Admin files contain 239 matches, and 13 Subdivision files contain 361 matches. These 600 lexical occurrences are not 600 issues. Direct-route availability is taken from the current AppRoutes element names; shared components are reviewed separately above.

| Page source | Lexical matches | Direct route(s) |
|---|---:|---|
| `frontend/src/pages/Admin/AdminAccountSettings.tsx` | 111 | `/admin/account-settings`, `/admin/settings` |
| `frontend/src/pages/Admin/AdminAnalytics.tsx` | 0 | `/admin/analytics` |
| `frontend/src/pages/Admin/AdminDashboard.tsx` | 11 | `/admin/dashboard` |
| `frontend/src/pages/Admin/AdminHeatMap.tsx` | 4 | `/admin/heatmap` |
| `frontend/src/pages/Admin/AdminLogin.tsx` | 0 | `/admin/login` |
| `frontend/src/pages/Admin/AdminLogs.tsx` | 0 | `/admin/logs` |
| `frontend/src/pages/Admin/AdminPetManagement.tsx` | 0 | No direct route for this component in AppRoutes |
| `frontend/src/pages/Admin/AdminReport.tsx` | 8 | `/admin/incidents` |
| `frontend/src/pages/Admin/AdminReportView.tsx` | 63 | `/admin/incidents/:id`, `/admin/reports/:id` |
| `frontend/src/pages/Admin/AdminUserManagement.tsx` | 40 | `/admin/users` |
| `frontend/src/pages/Admin/AdminWarnings.tsx` | 2 | `/admin/warnings` |
| `frontend/src/pages/Admin/PetRecords.tsx` | 0 | `/admin/pet-records` |
| `frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx` | 1 | `/staff/login` |
| `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx` | 31 | `/subd/endorsements` |
| `frontend/src/pages/Subd_Leaders/EscelatedMissions.tsx` | 44 | No direct route for this component in AppRoutes |
| `frontend/src/pages/Subd_Leaders/SubdAnalytics.tsx` | 0 | `/subd/analytics` |
| `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx` | 10 | `/subd/dashboard` |
| `frontend/src/pages/Subd_Leaders/SubdHazardAlert.tsx` | 4 | `/subd/hazard-alert` |
| `frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx` | 0 | `/subd/history` |
| `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx` | 123 | No direct route for this component in AppRoutes |
| `frontend/src/pages/Subd_Leaders/SubdLostPetAlerts.tsx` | 0 | `/subd/lost-pet-alerts/:alertId` |
| `frontend/src/pages/Subd_Leaders/SubdManualMatching.tsx` | 0 | `/subd/manual-matching` |
| `frontend/src/pages/Subd_Leaders/SubdMessages.tsx` | 1 | `/subd/messages`, `/subd-messages` |
| `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx` | 3 | No direct route for this component in AppRoutes |
| `frontend/src/pages/Subd_Leaders/SubdPetRecords.tsx` | 0 | `/subd/pet-records` |
| `frontend/src/pages/Subd_Leaders/SubdProfile.tsx` | 0 | `/subd/profile` |
| `frontend/src/pages/Subd_Leaders/SubdRemovedPetRecords.tsx` | 0 | `/subd/removed-pets` |
| `frontend/src/pages/Subd_Leaders/SubdReports.tsx` | 30 | `/subd/reports` |
| `frontend/src/pages/Subd_Leaders/SubdSettings.tsx` | 10 | `/subd/settings` |
| `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx` | 34 | `/subd/under-observation`, `/subd/under-observation/:id` |
| `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx` | 8 | `/subd/history/:id` |
| `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx` | 62 | `/subd/reports/:id` |

## Priority recommendations

1. Fix the account boundary (B01) and unsupported printable fallback (B02) first.
2. Align the dashboard, historical endorsement/dispatch display, settings and issuer fallbacks (B03-B07).
3. Remove unreachable operational copy and carefully retire unused source (B08-B09), preserving read-only archives and compatibility routes.
4. Validate against synthetic current-referral and historical-record fixtures; do not use the live application database to test account writes. No migrations, deletions or implementation fixes were performed by this audit.

The earlier Reports Refresh request is already satisfied in the reviewed workspace: `SubdReports.tsx:819` places Refresh beside the search input, while the separate report-creation toolbar is desktop-only. This audit made no additional refresh changes.

## Reference checklist

Source: project manage-project-quality skill, Engineering Topic 15 (Architecture & Maintainability).

- ENG-15-01: Clear module responsibilities.
- ENG-15-02: Dependency direction.
- ENG-15-03: Public versus internal contracts.
- ENG-15-04: Change coupling.
- ENG-15-05: Complexity control.
- ENG-15-06: Failure boundaries.
- ENG-15-07: Duplication decisions.
- ENG-15-08: Architecture verification.


## Implementation follow-up

The source inventory/findings above remain the original 2026-11-06 14:17 UTC snapshot. Subsequent authorized cleanup Phases 1-3 are tracked in the [implementation checklist](BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md) and [implementation follow-up](../implementation-reports/BARANGAY_TRACE_REMOVAL_FOLLOWUP_2026-11-06.md). The follow-up records B01-B09 completion, mocked/isolated validation, preserved history and explicitly unresolved presentation concerns; it does not replace this snapshot with an unsupported all-clear.
