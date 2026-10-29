# STRAY-SAFE modules by role

- **Status:** Current source inventory; runtime behavior and security conclusions remain limited to the evidence described below.
- **Last source verification:** 2026-10-29 14:26:32 UTC.
- **Roles covered:** Resident / Citizen (1), Subdivision Leader (2), Barangay Staff / Head Officer (3), Administrator (4).
- **Scope:** All role portal modules, public/shared entry points, actions, screens, backend connections, workflows, settings persistence, frontend/API routes and ORM model declarations.
- **Related audit:** [Reporting process audit and all 30 findings](../03-development/audits/reportprocess.md).
- **Change scope:** Documentation only; no application fixes, migrations, dependency changes or database updates.

## Contents

- A. Current modules by role: Resident, Subdivision Leader, Barangay Staff/Head Officer, Administrator, public and shared entry points.
- B. Shared modules, cross-role handoffs, settings persistence, removed/aliased/planned features.
- C. Complete frontend route catalog, including aliases and redirects.
- D. Complete backend API route catalog and direct authentication dependencies.
- E. Database model/table inventory.
- F. Source verification snapshot, maintenance procedure and remaining evidence.

## A. Current modules by role

This document inventories **every module exposed through the four role portals**, including modules that are not reporting screens. It was checked against `frontend/src/routes/AppRoutes.tsx`, the actual page components, shared components, navigation, backend route declarations, and ORM model declarations. Sections C–E enumerate the source surfaces so a module is not omitted merely because it is absent from a sidebar.

**Coverage distinction:** A module being present in this inventory means its source, entry point, and responsibility were identified. It does not mean its complete authorization, security, accessibility, or runtime behavior passed an end-to-end audit. The 30 reporting findings retain their original evidence classifications. No finding is marked fixed merely because this inventory was refreshed.

Paths in the tables are repository-relative. API prefixes are the server router paths, before any client proxy/base URL. The actual frontend routes and compatibility aliases are listed in section C.

### A.1 Resident / Citizen — role 1

| Module | Current functions and actions | Screens / implementation evidence | Backend connection and reporting relationship |
|---|---|---|---|
| Resident sign-in and onboarding | Resident login, account/profile onboarding, subdivision selection, email verification, password recovery; Google sign-in is supported through shared authentication components/API | `frontend/src/pages/citizen/ResidentsLogin.tsx`; `frontend/src/components/GoogleSignInButton.tsx`; `frontend/src/components/Modals/ForgotPasswordModal.tsx`; `frontend/src/components/ProtectedRoute.tsx` | `backend/app/routes/auth.py`; `backend/app/routes/users.py`. Resident protected routes check server session validity, verification, and profile completion |
| Home, reports feed, and community feed | View accessible active reports, switch community feed content, inspect sightings/maps, react/comment on announcements, open notifications, start a report; an inline report editor also remains in this page | `frontend/src/pages/citizen/ResiHomePage.tsx`; `frontend/src/components/Navbars/ResiNavbar.tsx`; `frontend/src/components/Navbars/ResiMobileNav.tsx` | `/reports/`, `/announcements/feed/resident/{user_id}`, `/notifications/`, `/warnings/my-warnings`; relates to RP14, RP26–RP28 |
| New stray report | Select camera/gallery media; analyse dog/cat media; review/edit animal attributes, category, count, condition, location, and custody; declaration, draft restoration, upload progress, submission result | `frontend/src/pages/citizen/ReportStrayPage.tsx`; `frontend/src/components/CameraCapture.tsx`; `frontend/src/utils/cloudinaryUpload.ts` | `/reports/analyze-media`, `/reports/`, `/reports/{id}/media`, `/landmarks`, coverage lookup; source-confirmed limitations remain in RP06, RP14, RP20, RP23, RP27–RP30 |
| Report detail and activity | View report evidence, timeline/stages, original/current location, holding information, related matches; open report communication; submit dispute or supported recovery evidence | `frontend/src/pages/citizen/ResiViewReport.tsx`; `frontend/src/components/RescueTimeline.tsx`; `frontend/src/components/CaseStageStepper.tsx`; `frontend/src/components/Chat/ReportChatDrawer.tsx` | `/reports/{id}`, `/holding/by-report/{id}`, `/matches/report/{id}`, dispute/media/reunion routes. Access and closure findings remain unresolved |
| My reports and profile | View own reports through the profile, edit identity/contact/home location and profile image; mobile “My Reports” links to the reports tab | `frontend/src/pages/citizen/ResiProfile.tsx`; `frontend/src/components/Navbars/ResiMobileNav.tsx` | `/users/{id}`, `/users/{id}/profile-picture`, `/reports/`; no separate “My Reports” page component is required for the tab |
| My Pets / pet registry | Register and update owned pets, animal photos and attributes, vaccination/health records, behavior information, remove records, identify existing pets, report a pet lost, review warning notices and pending recovery activity | `frontend/src/pages/citizen/ResidentPet.tsx`; shared ownership and pet components | `/pets/`, `/pets/owner/{id}`, pet media endpoints, `/reports/`, `/pet-qr/pending-recoveries/my-pets`, `/warnings/`. Registry ownership and incident identity must remain distinct |
| Potential match review | Compare report and owned pet, view location and AI evidence, confirm/reject a look-alike, answer an owner-verification request, submit/reuse ownership proof, access claim and custody questions | `frontend/src/pages/citizen/PetMatchReview.tsx`; `frontend/src/components/OwnerVerificationBlocks.tsx`; `frontend/src/components/CustodyQuestion.tsx`; `frontend/src/components/ClaimNotNeededPanel.tsx` | `/matches/case-review/{reportId}`, owner-feedback/owner-verification routes, `/claims/proof-on-file`, `/claims/`, `/claims/custody-answer`; AI suggestions are not themselves confirmed ownership |
| Claim / match history dashboard | View claims for a pet, submit evidence, inspect report/pet comparison, follow claim decisions and recovery state | `frontend/src/pages/citizen/PetClaimsDashboard.tsx`; `frontend/src/utils/claimEvidence.ts` | `/claims/`, evidence and status endpoints; RP10–RP13 remain relevant |
| Owner observation response | Acknowledge an observation complaint, send an owner update and optional photo, read observation dates/outcome, answer whether an unheld pet is home or missing | `frontend/src/components/OwnerFollowUpOwnerPanel.tsx`; `frontend/src/components/CustodyQuestion.tsx`; embedded in case/match screens | `/owner-followups/by-report/{id}`, owner-update/acknowledge endpoints, `/claims/custody-answer`. Acknowledgement is not compliance or a physical handover |
| Warnings / subdivision notice | Read own warning notices and acknowledge them from resident surfaces; no resident warning-issuance module | `frontend/src/pages/citizen/ResiHomePage.tsx`; `frontend/src/pages/citizen/ResidentPet.tsx`; shared warning details | `/warnings/my-warnings`, `/warnings/{id}/acknowledge`; RP17 describes unresolved issuance validation |
| QR card and scan/recovery history | Open/download a pet QR card, request QR generation where authorized, inspect scan/recovery and pet-history information | `frontend/src/pages/citizen/PetQrCardPage.tsx`; `frontend/src/pages/citizen/PetScanHistoryPage.tsx` | `backend/app/routes/pet_qr.py`. These components also serve authenticated staff/admin route aliases; authorization still belongs on the backend |
| Settings, notifications, archived pet history, and help | Account settings, pet/removal history and restoration, notification inbox/archive/read state, server email preferences, push subscription controls, privacy/location/appearance/help/about panels | `frontend/src/pages/citizen/ResidentSettings.tsx`; `frontend/src/components/PushSettingsCard.tsx`; theme and notification components | `/users/`, `/auth/change-password`, `/notifications/`, `/pets/restore`, `/pets/owner/{id}/history`, `/push/`. Do not describe all UI preferences as server-enforced policy; see B.3 |

### A.2 Subdivision Leader — role 2

| Module | Current functions and actions | Screens / implementation evidence | Backend connection and reporting relationship |
|---|---|---|---|
| Staff sign-in | Staff authentication shared with Barangay users; server role determines portal access | `frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx`; `frontend/src/components/ProtectedRoute.tsx` | `/auth/login`, session verification and shared authentication endpoints |
| Dashboard | Local operational summary, priority queue, report/claim/pet/holding/announcement summaries, community map and case links | `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx` | `/reports/`, `/rescue-requests/`, `/pets/`, `/claims/`, `/holding/`, subdivision announcements; frontend scope parameters do not replace the backend restrictions identified in RP02 |
| Community analytics | Date/animal/category/priority/status filters, local incident counts, response durations, holding outcomes, pet vaccination/behavior snapshots, CSV export and print/PDF | `frontend/src/pages/Subd_Leaders/SubdAnalytics.tsx`; `frontend/src/components/analytics/AnalyticsDashboard.tsx`; `frontend/src/components/analytics/analytics.ts` | `/analytics/subdivision`; backend explicitly restricts leaders to their assigned subdivision in `backend/app/routes/analytics.py:14` |
| Resident reports / incident queue | Search/filter report queue, claim a report, inspect details, comments, warning and escalation dialogs; legacy inline action paths coexist with the detail screen | `frontend/src/pages/Subd_Leaders/SubdReports.tsx`; `frontend/src/components/Modals/SubdReportModal.tsx` | `/reports/`, claim/status/comment/media routes, `/warnings/`, `/rescue-requests/`; RP03–RP08, RP14, RP17, RP28 apply |
| Report investigation and case handling | Assigned handler, take-over/transfer controls, verification/dismissal, visibility decisions, AI/pet/duplicate review, merge/unmerge, multi-animal actions, identity recheck/dispute handling, animal records, escalation and timeline | `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`; shared case, match, split, and transfer components | `reports.py`, `matches.py`, `report_split.py`, `rescue.py`, `report_returns.py`, `case_groups.py`, `case_review.py`; full workflow remains subject to the findings in the separate reporting audit |
| Owner warnings and three-day observation | Issue owner warning, start default three-day observation, log contacts and repeated incidents, review owner updates, record offline acknowledgement, extend once, resolve or escalate; leader identity confirmation has the documented wait/reason rules | `frontend/src/components/OwnerFollowUpCard.tsx`; `frontend/src/components/RepeatedReportBanner.tsx`; `frontend/src/components/LeaderIdentityConfirm.tsx`; embedded in the report detail | `/warnings/`, `/owner-followups/`, `/matches/{id}/leader-verify-identity`. The observation period is configurable server-side by Admin; defaults to three days |
| Case messages | Case/match thread selection, messages and unread state; case claim action where exposed | `frontend/src/pages/Subd_Leaders/SubdMessages.tsx`; `frontend/src/components/Chat/MessagesDrawer.tsx`; `frontend/src/components/Chat/ReportChatDrawer.tsx` | `/chat/threads`, report/match message endpoints, `/reports/{id}/claim`; read/send permissions differ and must be checked independently |
| Barangay holding view | Follow animals in Barangay holding, inspect custody, facility and care history; source retains escalation/timeline/status handlers whose actual authority depends on backend guards and custody state | `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`; sidebar label “Barangay Holding” | `/holding/`, `/landmarks`, report media, holding timeline/escalation/update endpoints. Do not interpret this page as proof that the subdivision operates its own active holding place |
| Pet records and ownership review | Registry search/detail, add/edit according to actual custody permissions, duplicate/merge and ownership confirmation/request components, restoration controls, pet history and warning/observation context | `frontend/src/pages/Subd_Leaders/SubdPetRecords.tsx`; `frontend/src/components/PetRecords/`; `frontend/src/components/PetRecordReviewPanel.tsx`; `frontend/src/components/PendingOwnershipRequests.tsx` | `/pets/`, `/pet-ownership/`, pet media/history, QR and shared record-access helpers |
| Removed pet records | Inspect archived/removed records and restore eligible pets | `frontend/src/pages/Subd_Leaders/SubdRemovedPetRecords.tsx` | `/pets/removed` / `/pets/archived`, `/pets/{id}/restore`; an active route exists even though it is not a separate primary sidebar item |
| Pet claims | Review claims/evidence, request evidence, record decisions and handover using shared verification components | `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`; shared claim and handover components | `/claims/` with subdivision filter, claim status/evidence and return integration; custody and lifecycle gaps remain in RP10–RP13 |
| Broadcast alerts | Create/edit/delete subdivision announcements, upload media, inspect reactions/comments, interact with community posts | `frontend/src/pages/Subd_Leaders/SubdHazardAlert.tsx`; sidebar label “Broadcast Alerts” | `/announcements/subdivision/{id}`, announcement CRUD/media/comments/react endpoints |
| Report history and history detail | Browse completed report records; inspect archived case evidence, rescue and holding context, map and timeline | `frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx`; `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx` | `/reports/`, `/reports/{id}`, `/rescue-requests/report/{id}`, `/holding/`; historical heat and active pins have different intended purposes |
| Endorsement archive | Inspect transmitted endorsement letters, attached documents, related report/rescue, progress and resolution evidence | `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx` | Report/rescue reads; endorsement data is part of the reporting/rescue models, not a standalone endorsement router |
| Profile and leader settings | Profile/contact/home location/photo, scoped landmarks, local dispatch/citation/UI preferences, server email preferences, push controls, password change | `frontend/src/pages/Subd_Leaders/SubdProfile.tsx`; `frontend/src/pages/Subd_Leaders/SubdSettings.tsx` | `/users/`, `/landmarks`, `/notifications/preferences`, `/push/`, `/auth/change-password`; B.3 separates browser preferences from server policy |

### A.3 Barangay Staff and Head Officer — role 3

The Head Officer is **not a fifth application role**. It is a role-3 user with `is_head_officer` enabled. The sidebar changes “Personnel Directory” to “Personnel Management” for that flag. Frontend visibility is not sufficient authorization; RP03 remains applicable.

| Module | Current functions and actions | Screens / implementation evidence | Backend connection and reporting relationship |
|---|---|---|---|
| Staff sign-in and role session | Shared staff login and authenticated role-3 portal | `frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx`; `frontend/src/components/ProtectedRoute.tsx` | Shared `/auth/` endpoints |
| Dashboard | Incident/rescue map, recent incidents, holding overview, personnel availability, rescue summaries; dispatch, update and broadcast dialogs are present | `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx` | `/reports/`, `/rescue-requests/`, `/users/`, `/holding/`, `/landmarks`, `/announcements/` |
| Incident / rescue queue | Review escalated rescue requests, approval/rejection, responder and facility information, progress/outcome updates, report evidence | `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`; sidebar label “Incident Reports” | `/rescue-requests/`, `/users/`, `/landmarks`, `/reports/{id}/media`; approval-before-operation rules exist but do not cover every alternate API path |
| Case detail / Barangay operations | Read the incident dossier, original evidence and field verification, owner follow-up escalation history, AI matches, assigned operations team; approve, dispatch, update pickup/holding/outcome and attach proof | `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`; shared case/claim/match/return components | Reports, rescues, match review, returns, users, landmarks, holding; `canUpdateStatus` considers head/assigned personnel in the UI |
| Team assignment and personnel | Staff directory; Head Officer provisioning/edit/status controls and responder selection; administrator designates the Head Officer | `frontend/src/pages/Barangay_Staff/BrgyPersonnelManagement.tsx`; `frontend/src/utils/personnelAvailability.ts`; assignment controls in operational screens | `backend/app/routes/users.py`, including `admin_create_user`, `update_user_status`, and admin-only `assign_barangay_head`; `rescue.py`, assignment routes |
| Holding place | Facility/jurisdiction selection, custody list and metrics, animal detail, care timeline, supporting evidence and outcome actions; the same page component also serves Admin | `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx` | `/holding/`, `/holding/metrics`, `/holding/{id}/timeline`, `/reports/{id}/media`, `/landmarks`; local stay-limit display settings must not be confused with watcher policy |
| Pet records | Active/removed registry, pet detail, custody-aware edits, restore, duplicate/ownership/merge review via shared panels | `frontend/src/pages/Barangay_Staff/BrgyPetRecords.tsx`; `frontend/src/components/PetRecords/`; shared ownership components | `/pets/`, `/pet-ownership/`, pet media/history/QR endpoints and `pet_record_access.py` |
| Pet claims and handover | Claim list, evidence/decision review, physical handover information and owner return integration | `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`; shared handover components | `/claims/`, status/evidence/return functions; not equivalent to unrestricted claim authority |
| Case messages | View operational case/match conversations, unread counts, and send messages where current case assignment permits | `frontend/src/pages/Barangay_Staff/BrgyMessages.tsx`; shared Chat components | `/chat/`; current/previous assignments and read-versus-send checks require regression verification |
| Community alerts | Read Barangay announcements, create alerts, archive/delete where permitted | `frontend/src/pages/Barangay_Staff/BrgyCommunityAlerts.tsx` | `/announcements/barangay/{id}`, create/status/delete endpoints; older/general reads found in source are not assumed valid unless registered in section D |
| Report history and detail | Historical report list and incident archive with rescue, custody and map evidence | `frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx`; `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx` | Report, rescue and holding reads; `/brgy/history-reports` and `/brgy/history` share the list component |
| Profile and station settings | Officer details/photo/location, Barangay landmarks/holding places, local quarantine/stay/SLA/broadcast preferences, server email preferences, push, password and cache controls | `frontend/src/pages/Barangay_Staff/BrgyProfile.tsx`; `frontend/src/pages/Barangay_Staff/BrgySettings.tsx` | `/users/`, `/landmarks`, `/notifications/preferences`, `/push/`, `/auth/change-password`. Actual landmark writes require head/admin or scoped leader authority, not any displayed settings form |
| Owner warnings / observation history | View warning and escalated owner-follow-up context through relevant records/components; the selected warning workflow reserves issuance to the Subdivision Leader | `frontend/src/components/OwnerFollowUpCard.tsx`; report/pet details; `backend/app/routes/warnings.py` | `/warnings/` reads and `/owner-followups/`; no new Barangay warning-issuance feature should be inferred |

### A.4 Administrator — role 4

| Module | Current functions and actions | Screens / implementation evidence | Backend connection and reporting relationship |
|---|---|---|---|
| Admin sign-in and login verification | Separate Admin login UI, server authentication, admin verification step, protected role-4 pages | `frontend/src/pages/Admin/AdminLogin.tsx`; `frontend/src/components/ProtectedRoute.tsx` | `/auth/login`, `/auth/admin/verify-login`, shared session/refresh/logout endpoints |
| Global overview | System dashboard, activity map, report flow, subdivision performance, account/security summaries, recent activity and API status | `frontend/src/pages/Admin/AdminDashboard.tsx`; sidebar label “Global Overview” | `/admin/dashboard-stats`, root API response and shared notification/sidebar services |
| Municipal analytics and benchmarks | System/subdivision filters, incident cohorts, response durations, holding outcomes, human-reviewed AI suggestion metrics, account snapshots, CSV export and print/PDF | `frontend/src/pages/Admin/AdminAnalytics.tsx`; shared `AnalyticsDashboard.tsx` and `analytics.ts` | `/analytics/admin`, explicitly role-4-only; `backend/app/services/analytics_service.py` computes results. Mean similarity is not measured AI accuracy |
| Incident management | System report list/search/filter, comments, direct status override/dispatch choices, deletion controls | `frontend/src/pages/Admin/AdminReport.tsx` | `/reports/`, `/reports/{id}/status`, report delete/comments, `/users/`; broad administrator authority must still preserve lifecycle and attribution |
| Incident dossier | Full report/evidence/animal/field-verification/endorsement view, handler/reporter details, AI analysis, location, direct actions, holding/care logs | `frontend/src/pages/Admin/AdminReportView.tsx` | Report, holding, user, timeline and status APIs; aliases `/admin/incidents/:id` and `/admin/reports/:id` share this page |
| Incident heatmap | Active/closed incident context, historical heat/hotspots, date/category filters and case drill-down | `frontend/src/pages/Admin/AdminHeatMap.tsx`; `frontend/src/utils/heatmap.ts`; `frontend/src/utils/originalSighting.ts` | `/reports/`, `/rescue-requests/`; historical valid resolved incidents remain legitimate heat data, while RP26 limits dataset completeness |
| Holding place | Shared Barangay holding UI under Admin routing, facility/animal care history, evidence and outcome functions | `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`; `/admin/holding-facility` | `/holding/`, `/landmarks`, report evidence; there is no separate Admin holding implementation to rebuild |
| Pet records and ownership | Central registry view and shared pet detail/edit/add/merge/ownership/history/QR functionality | `frontend/src/pages/Admin/PetRecords.tsx`; shared PetRecords and ownership components | `/pets/`, `/pet-ownership/`, pet QR/history/media endpoints. `AdminPetManagement.tsx` is a deprecated alias, not another active registry |
| User management and Head Officer designation | List/edit/provision users, invitation resend, status change/delete controls, role/position selection, designate Barangay Head Officer | `frontend/src/pages/Admin/AdminUserManagement.tsx` | `/users/`, `/users/admin-create`, `/users/{id}/resend-invite`, `/users/{id}/status`, `/users/barangay/{id}/assign-head` |
| Citations and warnings | Read/filter citation history and warning details; visibility does not imply warning issuance authority | `frontend/src/pages/Admin/AdminWarnings.tsx`; sidebar label “Citations & Warnings” | `/warnings/`; current `issue_warning` is leader-only |
| Audit and security logs | Filter/search/paginate audit events, inspect event details, export CSV | `frontend/src/pages/Admin/AdminLogs.tsx` | `/audit-logs/`; audit attribution/transaction gaps remain in RP22 |
| Settings and headquarters | Admin personal details/password, headquarters and jurisdiction landmarks, reporting coverage radius, AI matching settings; shared server observer-days setting is available in the owner-follow-up module | `frontend/src/pages/Admin/AdminAccountSettings.tsx`; shared observation settings UI where embedded | `/users/`, `/landmarks/barangay/{id}/hq`, `/landmarks`, `/reports/coverage-area`, `/matches/settings`, `/owner-followups/settings`; do not infer a standalone Admin observation page |
| AI queue diagnostics | Administrator API can inspect worker heartbeat, queued/running counts and recent failures; not a dedicated page in current `AppRoutes.tsx` | `backend/app/routes/ai_jobs.py:17`; `backend/app/utils/ai_jobs.py` | `/admin/ai-jobs`; this is an API/diagnostic module rather than a separate routed portal screen |
| Notifications and QR access | Shared notification menus/preferences/push and shared authenticated QR card/scan history routes | `frontend/src/components/Notifications/AdminNotificationMenu.tsx`; `PetQrCardPage.tsx`; `PetScanHistoryPage.tsx` | `/notifications/`, `/push/`, `/pets/{id}/qr`, pet history/scan endpoints |

### A.5 Public entry points and shared routes

| Module | Current behavior | Evidence / boundary |
|---|---|---|
| Landing page | Public product entry and sign-in navigation | `frontend/src/pages/citizen/LandingPage.tsx`, route `/` |
| Resident/Admin/staff login routes | Separate UI entry points into the shared authentication system | `/login`, `/admin/login`, `/staff/login`; full route mapping in section C |
| Public QR scan | Token-based animal information and finder/location submission; public owner email and exact house address are not returned by the inspected scan-info implementation, while configured contact/name information may be shown | `frontend/src/pages/citizen/PetScanPage.tsx`; `backend/app/routes/pet_qr.py:159`, `:238`. A public token view is a distinct privacy boundary from a private pet profile |
| QR scan result | Finder submission result and token-based pet information | `frontend/src/pages/citizen/PetScanSuccessPage.tsx`. A successful scan is not itself a confirmed recovery |
| QR ownership/recovery response | Pending scan recovery can later be confirmed/rejected through authenticated actions | `backend/app/routes/pet_qr.py:538`, `:683`; review actor and jurisdiction rules before treating a recovery action as verified |
| Shared QR card/history pages | Resident, leader, Barangay, and Admin URL prefixes reuse two components and permit roles 1–4 at the route layer | `frontend/src/routes/AppRoutes.tsx:93`–`:101`; backend pet/scan access checks remain necessary |

## B. Shared modules, data flow, and persistence boundaries

### B.1 Cross-role workflow and dependencies

| Shared module | Implemented responsibility | Source evidence | What remains distinct / unverified |
|---|---|---|---|
| Sessions and authorization | JWT/session verification, refresh/logout, verified-resident requirements, frontend role routing, idle/session guards | `backend/app/routes/auth.py`; `backend/app/utils/auth.py`; `frontend/src/utils/api.ts`; `frontend/src/components/Auth/`; `ProtectedRoute.tsx` | Frontend guards do not secure API requests; RP01–RP06 cover reporting bypasses |
| Report records and evidence | Reports, statuses, comments, attachments, investigation, location, assignment, endorsement and history | `backend/app/routes/reports.py`; `backend/app/models/report.py`; `backend/app/schemas/report.py` | General edits, investigation, public visibility and custody are separate actions |
| Case identity and duplicates | Root/member lookup, pet identity conflicts, inherited identities, case-wide claims, review and merge/unmerge | `backend/app/utils/case_groups.py`; `case_review.py`; `backend/app/routes/matches.py` | Human identity decisions must not be inferred from AI score or unreviewed inherited identity |
| Multiple animals | Group and per-animal records, carry-over, count notes, photo replacement, unsplit protection, per-animal holding and group closure | `backend/app/routes/report_split.py`; `backend/app/utils/report_split.py` | Parent incident and individual animal identities/custody must not be collapsed |
| Rescue coordination | Escalation request, approval, team assignment, pickup, mission history and closure | `backend/app/routes/rescue.py`; report/rescue/assignment models | Responder dispatch is not pickup; RP03, RP12, RP20–RP22 remain unresolved |
| Holding and stay clocks | Intake, care timeline, condition/status, facility movement, stay timing, outcomes, metrics | `backend/app/routes/holding.py`; `backend/app/utils/holding_stay.py`; `backend/app/tasks/unassigned_checker.py` | Owner observation and holding observation are different; displayed local stay preferences are not authoritative backend settings |
| Owner observation and warnings | Linked owner snapshot, contacts, updates, acknowledgements, repeat notifications, extension, due reminders and closure; formal warning records | `backend/app/routes/owner_followups.py`; `backend/app/utils/owner_followups.py`; `backend/app/routes/warnings.py`; respective models | Default observation is three days; the leader decides compliance/escalation, not the timer or AI |
| Claims and physical return | Claim evidence/proof reuse, decisions, custody questions, handover, return snapshots, registry synchronization | `backend/app/routes/claims.py`; `report_returns.py`; `backend/app/utils/claim_custody.py`; `claim_identity.py`; `owner_returns.py` | Claim review, pet ownership and physical receipt must be independently justified |
| Pet registry and ownership confirmation | Registered pet data, vaccinations, media, history, duplicate/merge review, soft removal/restoration and proposed ownership confirmation | `backend/app/routes/pets.py`; `pet_ownership.py`; `backend/app/utils/pet_record_access.py`; `pet_ownership.py`; pet/confirmation models | Custody-aware editing already exists and should be reused; reported health/vaccination data is not clinical verification |
| QR and finder recovery | QR token generation/toggle, public scan, pending recovery, owner/staff response and pet history | `backend/app/routes/pet_qr.py`; `backend/app/models/pet_qr.py`; `pet_history.py` | A scan/finder submission is pending information, not automatic recovery |
| Conversations | Report and look-alike/match threads, participants, messages, unread/read states, closed-thread behavior | `backend/app/routes/chat.py`; `backend/app/models/chat.py`; `frontend/src/components/Chat/` | Read access and send access differ; unrelated residents must not inherit conversations merely by seeing a public report |
| Announcements / community alerts | Scoped feed, announcement creation/media, edit/delete/archive, comments and reactions | `backend/app/routes/announcements.py`; `backend/app/models/announcement.py`; resident and staff alert pages | UI labels “Hazard Alert,” “Broadcast Alerts,” and “Community Alerts” are surfaces of the announcement module |
| Notifications, email, and push | In-app inbox/archive/preferences, scoped notification content, email queue, browser push subscriptions/delivery | `backend/app/routes/notifications.py`; `push.py`; `backend/app/utils/notification_dispatcher.py`; `backend/app/services/email_service.py`; `push_service.py`; `frontend/src/components/Notifications/`; `PushSettingsCard.tsx` | No SMS delivery guarantee follows from a settings checkbox. Native Android push delivery was not verified |
| Geography and maps | Coverage radius, landmarks/facilities/HQ, report pin selection, original sightings, heat/hotspots, route/geolocation helpers | `backend/app/routes/landmarks.py`; report coverage endpoints; `frontend/src/components/MapComponent.tsx`; `frontend/src/utils/coverageArea.ts`; `heatmap.ts`; `originalSighting.ts` | Current custody location and original incident location serve different purposes; GPS/browser/network behavior needs device testing |
| Analytics and dashboards | Role-specific incident cohorts, response durations, current registry/account snapshots, comparisons, CSV/print; separate dashboard counters | `backend/app/routes/analytics.py`; `admin.py`; `backend/app/services/analytics_service.py`; `frontend/src/components/analytics/` | Similarity and acceptance among reviewed suggestions are not model accuracy or completed reunions |
| User/personnel administration | Users, roles, positions, jurisdiction, invitations, status changes, head designation and profile image | `backend/app/routes/users.py`; `backend/app/models/user.py`; personnel/admin user pages | Head Officer is a role-3 flag. Provisioning and designation permissions are action-specific |
| Audit evidence | Actor/action/target, old/new values, request metadata, log browsing/export | `backend/app/models/audit_log.py`; `backend/app/utils/audit.py`; `backend/app/routes/audit_logs.py` | The presence of an audit table does not resolve RP22 attribution or atomicity issues |
| Background operations | AI media/follow-up/backfill queue, dedicated or embedded worker, unassigned-report watcher, overdue holding and observation reminders, email and push queue workers | `backend/app/ai_worker.py`; `backend/app/utils/ai_jobs.py`; `backend/app/tasks/unassigned_checker.py`; `backend/app/main.py:1507` | Job states and delivery outcomes need runtime evidence; RP19 identifies swallowed failures |
| Media pipeline | Camera/gallery capture, direct Cloudinary upload, backend URL/file validation, image/video analysis and display transformations | `frontend/src/components/CameraCapture.tsx`; `frontend/src/utils/cloudinaryUpload.ts`; `backend/app/utils/uploads.py`; `cloudinary_config.py`; `video_processing.py` | Client validation is not the trust boundary; protected proof files and deployed delivery privacy remain unverified |
| Navigation, refresh, cache, presentation | Role sidebars/navbars, lazy-loaded pages, badges, theme, loading states, cached reads, cross-tab/session-aware refresh | `frontend/src/routes/AppRoutes.tsx`; `frontend/src/components/*Sidebar.tsx`; `frontend/src/utils/dataRefresh.ts`; `useAutoRefresh.ts`; `cache.ts`; `backend/app/routes/sidebar.py` | A cached screen or badge is not independent authorization evidence; preserve the passing refresh tests |

### B.2 Main handoffs across all roles

1. **Resident → Subdivision Leader:** resident files a private report with location/media; the leader claims and investigates it. AI analysis and matching support review. The case must not become verified solely because it was assigned.
2. **Leader → registered owner:** human-confirmed identity supports owner contact, verified incident warnings and observation. The owner acknowledges or sends updates; the leader evaluates compliance. A resident reporter and a registered owner are not interchangeable.
3. **Leader → Barangay:** escalation/endorsement and the animal record identify the case. Barangay approval, team assignment, dispatch and pickup are separate milestones. Leader tracking continues without implying authority to change Barangay custody.
4. **Barangay → holding / owner:** responders confirm physical custody, facility staff record intake/care, authorized claim review supports physical handover, and the return/outcome closes the correct records.
5. **All roles → Admin oversight:** Admin reads system records, manages users and jurisdiction settings, reviews logs/analytics, and may perform explicit overrides. Overrides still require truthful attribution and coherent linked records.
6. **Public finder → pet owner / staff:** a QR scan records pending finder information; authenticated recovery confirmation determines the actual outcome.
7. **All actions → notifications/history/analytics:** changes should save their history and audit trail, notify the appropriate authorized participants, and appear consistently in feeds, maps, queues and statistics.

### B.3 Settings: what is persisted and what is not established

| Setting group | Verified storage / execution | Evidence | Documentation rule |
|---|---|---|---|
| Account/profile/password | API-backed user updates, profile image routes and password-change endpoint | User/profile/settings pages; `backend/app/routes/users.py`; `auth.py` | Describe actual supported API actions, not every older frontend URL as a working endpoint |
| Landmarks, facilities and HQ | API-backed records with scoped write guards | `backend/app/routes/landmarks.py:106`, `:161`, `:279` | Leader, Head Officer and Admin permissions differ from ordinary staff access |
| Reporting coverage | Server coverage-setting endpoint; Admin write guard in reporting routes | `backend/app/routes/reports.py:1421`, `:1439`; `frontend/src/utils/coverageArea.ts` | This is server-validated coverage, not simply a client map circle |
| AI matching setting | API-backed matching settings and server-side use | `backend/app/routes/matches.py:1391`, `:1410`; Admin settings page | Actual model availability/quota/quality still needs runtime evidence |
| Owner observation duration | Server system setting, default 3 days, bounded 1–14 days; admin-only updates | `backend/app/routes/owner_followups.py:167`; `backend/app/utils/owner_followups.py:30` | Open observations retain their existing due time; do not confuse this with quarantine or browser holding limits |
| Email and push preferences | User-specific database preferences and push subscriptions | `backend/app/routes/notifications.py:240`, `:263`; `backend/app/models/notification_preference.py`; `/push/` router | Server delivery preferences exist; actual delivery success is separate |
| Leader dispatch/citation/UI preferences | `straysafe_subd_settings` in localStorage; save also sends selected email booleans to `/notifications/preferences` | `frontend/src/pages/Subd_Leaders/SubdSettings.tsx:88`, `:436` | Takeover hours, default warning tier, refresh interval and other local values must not be documented as centrally enforced backend policies without a consumer/guard trace |
| Barangay operational preferences | `straysafe_brgy_settings` and `holding_impound_stay_duration` in localStorage; selected email booleans also sync to the server | `frontend/src/pages/Barangay_Staff/BrgySettings.tsx:68`, `:408`; consumers in `BrgyHoldingFacility.tsx`, `BrgyDashboard.tsx`, `BrgySidebar.tsx` | These can affect display locally. The backend watcher separately invokes its overdue check with 3 days in `backend/app/tasks/unassigned_checker.py:286` |
| SMS checkboxes | Browser preference fields were found; the save handlers do not establish an SMS provider/delivery workflow | `SubdSettings.tsx`, `smsNotifications`; `BrgySettings.tsx`, `smsAlertsEnabled` | Do not claim operational SMS sending based on these controls |
| Resident privacy/location/appearance/QR defaults | Settings panels and browser/user controls exist; account saves and notification saves have their own API paths | `frontend/src/pages/citizen/ResidentSettings.tsx`; theme and QR components | Verify each consumer before claiming that a preference overrides server report visibility, access, or notification policy |

Some older frontend call sites use paths not present in the declared backend routes, such as `/users/{id}/upload-avatar`, `/pets/user/{id}`, or a general `/announcements/` GET. They are recorded as integration-verification targets, not declared working features. The current supported API declarations are catalogued in section D. This inventory does not silently repair those call sites.

### B.4 Removed, aliased, and planned modules

- **Adoption:** no active adoption page or adoption router is registered in the current frontend/backend route composition. Historical fields, comments, notification preferences or schema compatibility remnants do not establish an active adoption workflow.
- **Escalated missions:** `frontend/src/pages/Subd_Leaders/EscelatedMissions.tsx` remains in the source tree, but is not loaded by `AppRoutes.tsx`; `/subd/escalated` redirects to the filtered report queue.
- **AdminPetManagement:** `frontend/src/pages/Admin/AdminPetManagement.tsx` explicitly aliases `PetRecords.tsx` and is not separately routed. `/admin/pets` redirects to `/admin/pet-records`.
- **Alternate report/history/settings/chat URLs:** aliases and redirects in section C reuse screens; they are not separate independent module implementations.
- **Live responder GPS tracking and late reports linked to closed cases:** proposal documents exist, but those proposed complete workflows must not be presented as implemented modules merely because map helpers or normal report records exist.
- **AI queue diagnostics:** the Admin API exists; no dedicated AI jobs page is registered in `AppRoutes.tsx`.

## C. Complete frontend route catalog

Every named route declaration in `frontend/src/routes/AppRoutes.tsx` is listed below, including shared QR routes, aliases, redirects and the catch-all. Role labels describe the frontend route guard, not a claim that every backend action is authorized correctly. Query-string tabs such as `/resident/profile?tab=reports` and embedded dialogs are covered in section A rather than counted as independent routes.

| Frontend guard | URL | Page / action | Source evidence |
|---|---|---|---|
| Public | `/` | `LandingPage` | `frontend/src/routes/AppRoutes.tsx:85`; `frontend/src/pages/citizen/LandingPage.tsx` |
| Public | `/login` | `ResidentsLogin` | `frontend/src/routes/AppRoutes.tsx:86`; `frontend/src/pages/citizen/ResidentsLogin.tsx` |
| Public | `/admin/login` | `AdminLogin` | `frontend/src/routes/AppRoutes.tsx:87`; `frontend/src/pages/Admin/AdminLogin.tsx` |
| Public | `/staff/login` | `CommunityStaffLogin` | `frontend/src/routes/AppRoutes.tsx:88`; `frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx` |
| Public | `/pet/scan/:token` | `PetScanPage` | `frontend/src/routes/AppRoutes.tsx:89`; `frontend/src/pages/citizen/PetScanPage.tsx` |
| Public | `/pet/scan/:token/success` | `PetScanSuccessPage` | `frontend/src/routes/AppRoutes.tsx:90`; `frontend/src/pages/citizen/PetScanSuccessPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/resident/pet/:petId/qr` | `PetQrCardPage` | `frontend/src/routes/AppRoutes.tsx:94`; `frontend/src/pages/citizen/PetQrCardPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/resident/pet/:petId/scan-history` | `PetScanHistoryPage` | `frontend/src/routes/AppRoutes.tsx:95`; `frontend/src/pages/citizen/PetScanHistoryPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/subd/pet/:petId/qr` | `PetQrCardPage` | `frontend/src/routes/AppRoutes.tsx:96`; `frontend/src/pages/citizen/PetQrCardPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/subd/pet/:petId/scan-history` | `PetScanHistoryPage` | `frontend/src/routes/AppRoutes.tsx:97`; `frontend/src/pages/citizen/PetScanHistoryPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/brgy/pet/:petId/qr` | `PetQrCardPage` | `frontend/src/routes/AppRoutes.tsx:98`; `frontend/src/pages/citizen/PetQrCardPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/brgy/pet/:petId/scan-history` | `PetScanHistoryPage` | `frontend/src/routes/AppRoutes.tsx:99`; `frontend/src/pages/citizen/PetScanHistoryPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/admin/pet/:petId/qr` | `PetQrCardPage` | `frontend/src/routes/AppRoutes.tsx:100`; `frontend/src/pages/citizen/PetQrCardPage.tsx` |
| Resident, Subdivision Leader, Barangay Staff / Head Officer, Administrator | `/admin/pet/:petId/scan-history` | `PetScanHistoryPage` | `frontend/src/routes/AppRoutes.tsx:101`; `frontend/src/pages/citizen/PetScanHistoryPage.tsx` |
| Resident | `/resident-home` | `ResiHomePage` | `frontend/src/routes/AppRoutes.tsx:106`; `frontend/src/pages/citizen/ResiHomePage.tsx` |
| Resident | `/resident/report/new` | `ReportStrayPage` | `frontend/src/routes/AppRoutes.tsx:107`; `frontend/src/pages/citizen/ReportStrayPage.tsx` |
| Resident | `/resident/reports/:id` | `ResiViewReport` | `frontend/src/routes/AppRoutes.tsx:108`; `frontend/src/pages/citizen/ResiViewReport.tsx` |
| Resident | `/resident/report/:id` | `ResiViewReport` | `frontend/src/routes/AppRoutes.tsx:109`; `frontend/src/pages/citizen/ResiViewReport.tsx` |
| Resident | `/resident/pets` | `ResidentPet` | `frontend/src/routes/AppRoutes.tsx:110`; `frontend/src/pages/citizen/ResidentPet.tsx` |
| Resident | `/resident/profile` | `ResiProfile` | `frontend/src/routes/AppRoutes.tsx:111`; `frontend/src/pages/citizen/ResiProfile.tsx` |
| Resident | `/resident/settings` | `ResidentSettings` | `frontend/src/routes/AppRoutes.tsx:112`; `frontend/src/pages/citizen/ResidentSettings.tsx` |
| Resident | `/resident/reports/:reportId/match-review` | `PetMatchReview` | `frontend/src/routes/AppRoutes.tsx:113`; `frontend/src/pages/citizen/PetMatchReview.tsx` |
| Resident | `/resident/pet/:petId/claims-dashboard` | `PetClaimsDashboard` | `frontend/src/routes/AppRoutes.tsx:114`; `frontend/src/pages/citizen/PetClaimsDashboard.tsx` |
| Subdivision Leader | `/subd/dashboard` | `SubdDashboard` | `frontend/src/routes/AppRoutes.tsx:120`; `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx` |
| Subdivision Leader | `/subd/analytics` | `SubdAnalytics` | `frontend/src/routes/AppRoutes.tsx:121`; `frontend/src/pages/Subd_Leaders/SubdAnalytics.tsx` |
| Subdivision Leader | `/subd/messages` | `SubdMessages` | `frontend/src/routes/AppRoutes.tsx:122`; `frontend/src/pages/Subd_Leaders/SubdMessages.tsx` |
| Subdivision Leader | `/subd-messages` | `SubdMessages` | `frontend/src/routes/AppRoutes.tsx:123`; `frontend/src/pages/Subd_Leaders/SubdMessages.tsx` |
| Subdivision Leader | `/subd/reports` | `SubdReports` | `frontend/src/routes/AppRoutes.tsx:124`; `frontend/src/pages/Subd_Leaders/SubdReports.tsx` |
| Subdivision Leader | `/subd/reports/:id` | `SubdViewReport` | `frontend/src/routes/AppRoutes.tsx:125`; `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx` |
| Subdivision Leader | `/subd/history` | `SubdHistoryReport` | `frontend/src/routes/AppRoutes.tsx:126`; `frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx` |
| Subdivision Leader | `/subd/history/:id` | `SubdViewHistory` | `frontend/src/routes/AppRoutes.tsx:127`; `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx` |
| Subdivision Leader | `/subd/escalated` | Redirect to `/subd/reports?status=Escalated%20to%20Barangay` | `frontend/src/routes/AppRoutes.tsx:128` |
| Subdivision Leader | `/subd/pet-claims` | `SubdPetClaims` | `frontend/src/routes/AppRoutes.tsx:129`; `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx` |
| Subdivision Leader | `/subd/endorsements` | `EndorsementArch` | `frontend/src/routes/AppRoutes.tsx:130`; `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx` |
| Subdivision Leader | `/subd/pet-records` | `SubdPetRecords` | `frontend/src/routes/AppRoutes.tsx:131`; `frontend/src/pages/Subd_Leaders/SubdPetRecords.tsx` |
| Subdivision Leader | `/subd/removed-pets` | `SubdRemovedPetRecords` | `frontend/src/routes/AppRoutes.tsx:132`; `frontend/src/pages/Subd_Leaders/SubdRemovedPetRecords.tsx` |
| Subdivision Leader | `/subd/hazard-alert` | `SubdHazardAlert` | `frontend/src/routes/AppRoutes.tsx:133`; `frontend/src/pages/Subd_Leaders/SubdHazardAlert.tsx` |
| Subdivision Leader | `/subd/holding-facility` | `SubdHoldingFacility` | `frontend/src/routes/AppRoutes.tsx:134`; `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx` |
| Subdivision Leader | `/subd/profile` | `SubdProfile` | `frontend/src/routes/AppRoutes.tsx:135`; `frontend/src/pages/Subd_Leaders/SubdProfile.tsx` |
| Subdivision Leader | `/subd/settings` | `SubdSettings` | `frontend/src/routes/AppRoutes.tsx:136`; `frontend/src/pages/Subd_Leaders/SubdSettings.tsx` |
| Barangay Staff / Head Officer | `/brgy/dashboard` | `BrgyDashboard` | `frontend/src/routes/AppRoutes.tsx:141`; `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx` |
| Barangay Staff / Head Officer | `/brgy/messages` | `BrgyMessages` | `frontend/src/routes/AppRoutes.tsx:142`; `frontend/src/pages/Barangay_Staff/BrgyMessages.tsx` |
| Barangay Staff / Head Officer | `/brgy/rescue-requests` | `BrgyRescueRequests` | `frontend/src/routes/AppRoutes.tsx:143`; `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx` |
| Barangay Staff / Head Officer | `/brgy/reports/:id` | `BrgyReportView` | `frontend/src/routes/AppRoutes.tsx:144`; `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` |
| Barangay Staff / Head Officer | `/brgy/rescue-requests/:id` | `BrgyReportView` | `frontend/src/routes/AppRoutes.tsx:145`; `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx` |
| Barangay Staff / Head Officer | `/brgy/history-reports` | `BrgyHistoryReports` | `frontend/src/routes/AppRoutes.tsx:146`; `frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx` |
| Barangay Staff / Head Officer | `/brgy/community-alerts` | `BrgyCommunityAlerts` | `frontend/src/routes/AppRoutes.tsx:147`; `frontend/src/pages/Barangay_Staff/BrgyCommunityAlerts.tsx` |
| Barangay Staff / Head Officer | `/brgy/profile` | `BrgyProfile` | `frontend/src/routes/AppRoutes.tsx:148`; `frontend/src/pages/Barangay_Staff/BrgyProfile.tsx` |
| Barangay Staff / Head Officer | `/brgy/settings` | `BrgySettings` | `frontend/src/routes/AppRoutes.tsx:149`; `frontend/src/pages/Barangay_Staff/BrgySettings.tsx` |
| Barangay Staff / Head Officer | `/brgy/personnel` | `BrgyPersonnelManagement` | `frontend/src/routes/AppRoutes.tsx:150`; `frontend/src/pages/Barangay_Staff/BrgyPersonnelManagement.tsx` |
| Barangay Staff / Head Officer | `/brgy/holding-facility` | `BrgyHoldingFacility` | `frontend/src/routes/AppRoutes.tsx:151`; `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx` |
| Barangay Staff / Head Officer | `/brgy/pet-records` | `BrgyPetRecords` | `frontend/src/routes/AppRoutes.tsx:152`; `frontend/src/pages/Barangay_Staff/BrgyPetRecords.tsx` |
| Barangay Staff / Head Officer | `/brgy/pet-claims` | `BrgyPetClaims` | `frontend/src/routes/AppRoutes.tsx:153`; `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx` |
| Barangay Staff / Head Officer | `/brgy/history` | `BrgyHistoryReports` | `frontend/src/routes/AppRoutes.tsx:154`; `frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx` |
| Barangay Staff / Head Officer | `/brgy/history/:id` | `BrgyViewHistory` | `frontend/src/routes/AppRoutes.tsx:155`; `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx` |
| Administrator | `/admin/dashboard` | `AdminDashboard` | `frontend/src/routes/AppRoutes.tsx:160`; `frontend/src/pages/Admin/AdminDashboard.tsx` |
| Administrator | `/admin/analytics` | `AdminAnalytics` | `frontend/src/routes/AppRoutes.tsx:161`; `frontend/src/pages/Admin/AdminAnalytics.tsx` |
| Administrator | `/admin/pet-records` | `PetRecords` | `frontend/src/routes/AppRoutes.tsx:162`; `frontend/src/pages/Admin/PetRecords.tsx` |
| Administrator | `/admin/users` | `AdminUserManagement` | `frontend/src/routes/AppRoutes.tsx:163`; `frontend/src/pages/Admin/AdminUserManagement.tsx` |
| Administrator | `/admin/account-settings` | `AdminAccountSettings` | `frontend/src/routes/AppRoutes.tsx:164`; `frontend/src/pages/Admin/AdminAccountSettings.tsx` |
| Administrator | `/admin/settings` | `AdminAccountSettings` | `frontend/src/routes/AppRoutes.tsx:165`; `frontend/src/pages/Admin/AdminAccountSettings.tsx` |
| Administrator | `/admin/incidents` | `AdminReport` | `frontend/src/routes/AppRoutes.tsx:166`; `frontend/src/pages/Admin/AdminReport.tsx` |
| Administrator | `/admin/incidents/:id` | `AdminReportView` | `frontend/src/routes/AppRoutes.tsx:167`; `frontend/src/pages/Admin/AdminReportView.tsx` |
| Administrator | `/admin/reports/:id` | `AdminReportView` | `frontend/src/routes/AppRoutes.tsx:168`; `frontend/src/pages/Admin/AdminReportView.tsx` |
| Administrator | `/admin/heatmap` | `AdminHeatMap` | `frontend/src/routes/AppRoutes.tsx:169`; `frontend/src/pages/Admin/AdminHeatMap.tsx` |
| Administrator | `/admin/warnings` | `AdminWarnings` | `frontend/src/routes/AppRoutes.tsx:170`; `frontend/src/pages/Admin/AdminWarnings.tsx` |
| Administrator | `/admin/citations` | Redirect to `/admin/warnings` | `frontend/src/routes/AppRoutes.tsx:171` |
| Administrator | `/admin/logs` | `AdminLogs` | `frontend/src/routes/AppRoutes.tsx:172`; `frontend/src/pages/Admin/AdminLogs.tsx` |
| Administrator | `/admin/pets` | Redirect to `/admin/pet-records` | `frontend/src/routes/AppRoutes.tsx:173` |
| Administrator | `/admin/holding-facility` | `BrgyHoldingFacility` | `frontend/src/routes/AppRoutes.tsx:174`; `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx` |
| Public | `*` | `ResidentsLogin` | `frontend/src/routes/AppRoutes.tsx:179`; `frontend/src/pages/citizen/ResidentsLogin.tsx` |

### C.1 Page files without a route of their own

These files exist, but they are not lazy-imported as a separate route page by `AppRoutes.tsx`:

- `frontend/src/pages/Admin/AdminPetManagement.tsx` — source presence alone does not establish an independently reachable module; see B.4.
- `frontend/src/pages/Subd_Leaders/EscelatedMissions.tsx` — source presence alone does not establish an independently reachable module; see B.4.

## D. Complete backend API route catalog

This is a static catalog of route declarations, not a live OpenAPI export. The backend was not imported or started. Lines 1645–1670 of `backend/app/main.py` register these router modules; static compatibility routes added with `add_api_route` are included. Paths omit the frontend proxy/base URL. The dependency column records **direct authentication dependencies only**; inline checks and shared helper guards still need review. A dependency of `get_current_staff_or_admin` alone does not prove jurisdiction or action authorization.

### D.1 `backend/app/routes/admin.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/admin/dashboard-stats` | `get_admin_dashboard_stats` (`backend/app/routes/admin.py:31`) | `get_current_user` |
| GET | `/admin/badge-counts` | `get_admin_badge_counts` (`backend/app/routes/admin.py:298`) | `get_current_user` |

### D.2 `backend/app/routes/ai_jobs.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/admin/ai-jobs` | `ai_job_summary` (`backend/app/routes/ai_jobs.py:17`) | `get_current_user` |

### D.3 `backend/app/routes/analytics.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/analytics/subdivision` | `get_subdivision_analytics` (`backend/app/routes/analytics.py:14`) | `get_current_user` |
| GET | `/analytics/admin` | `get_admin_analytics` (`backend/app/routes/analytics.py:35`) | `get_current_user` |

### D.4 `backend/app/routes/announcements.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/announcements/subdivision/{subdivision_id}` | `get_subdivision_announcements` (`backend/app/routes/announcements.py:131`) | `No direct authentication dependency` |
| GET | `/announcements/barangay/{barangay_id}` | `get_barangay_announcements` (`backend/app/routes/announcements.py:155`) | `No direct authentication dependency` |
| PATCH | `/announcements/{announcement_id}/status` | `update_announcement_status` (`backend/app/routes/announcements.py:186`) | `get_current_staff_or_admin` |
| GET | `/announcements/feed/resident/{user_id}` | `get_resident_announcement_feed` (`backend/app/routes/announcements.py:219`) | `No direct authentication dependency` |
| POST | `/announcements/` | `create_announcement` (`backend/app/routes/announcements.py:259`) | `get_current_staff_or_admin` |
| POST | `/announcements/{announcement_id}/media` | `upload_announcement_media` (`backend/app/routes/announcements.py:327`) | `get_current_staff_or_admin` |
| POST | `/announcements/{announcement_id}/comments` | `add_announcement_comment` (`backend/app/routes/announcements.py:357`) | `get_current_user` |
| POST | `/announcements/{announcement_id}/react` | `react_to_announcement` (`backend/app/routes/announcements.py:399`) | `get_current_user` |
| PUT | `/announcements/{announcement_id}` | `update_announcement` (`backend/app/routes/announcements.py:440`) | `get_current_staff_or_admin` |
| DELETE | `/announcements/{announcement_id}` | `delete_announcement` (`backend/app/routes/announcements.py:507`) | `get_current_user` |

### D.5 `backend/app/routes/audit_logs.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/audit-logs/` | `get_audit_logs` (`backend/app/routes/audit_logs.py:55`) | `get_optional_user` |

### D.6 `backend/app/routes/auth.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/auth/subdivisions` | `get_subdivisions` (`backend/app/routes/auth.py:149`) | `No direct authentication dependency` |
| POST | `/auth/login` | `login` (`backend/app/routes/auth.py:262`) | `No direct authentication dependency` |
| POST | `/auth/admin/verify-login` | `admin_verify_login` (`backend/app/routes/auth.py:376`) | `No direct authentication dependency` |
| POST | `/auth/google` | `google_auth` (`backend/app/routes/auth.py:421`) | `No direct authentication dependency` |
| POST | `/auth/complete-profile` | `complete_profile` (`backend/app/routes/auth.py:638`) | `get_pending_user` |
| POST | `/auth/verify-otp` | `verify_otp` (`backend/app/routes/auth.py:704`) | `get_pending_user` |
| POST | `/auth/resend-otp` | `resend_otp` (`backend/app/routes/auth.py:823`) | `get_pending_user` |
| POST | `/auth/forgot-password` | `forgot_password` (`backend/app/routes/auth.py:877`) | `No direct authentication dependency` |
| POST | `/auth/verify-reset-code` | `verify_reset_code` (`backend/app/routes/auth.py:948`) | `No direct authentication dependency` |
| POST | `/auth/reset-password` | `reset_password` (`backend/app/routes/auth.py:956`) | `No direct authentication dependency` |
| POST | `/auth/change-password` | `change_password` (`backend/app/routes/auth.py:986`) | `get_current_user` |
| GET | `/auth/verify-session` | `verify_session` (`backend/app/routes/auth.py:1027`) | `get_current_user` |
| GET | `/auth/verify-session/{user_id}` | `verify_session_by_id` (`backend/app/routes/auth.py:1052`) | `get_current_user` |
| GET | `/auth/me` | `get_me` (`backend/app/routes/auth.py:1073`) | `get_current_user` |
| POST | `/auth/refresh` | `refresh_session_token` (`backend/app/routes/auth.py:1078`) | `No direct authentication dependency` |
| POST | `/auth/logout` | `logout` (`backend/app/routes/auth.py:1162`) | `No direct authentication dependency` |

### D.7 `backend/app/routes/chat.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/chat/reports/{report_id}/thread` | `get_report_thread_endpoint` (`backend/app/routes/chat.py:638`) | `get_current_user` |
| GET | `/chat/reports/{report_id}/messages` | `get_report_messages` (`backend/app/routes/chat.py:673`) | `get_current_user` |
| POST | `/chat/reports/{report_id}/messages` | `send_report_message` (`backend/app/routes/chat.py:687`) | `get_current_user` |
| GET | `/chat/reports/{report_id}/stats` | `get_report_chat_stats` (`backend/app/routes/chat.py:793`) | `get_current_user` |
| PATCH | `/chat/threads/{thread_id}/read` | `mark_thread_messages_as_read` (`backend/app/routes/chat.py:826`) | `get_current_user` |
| PATCH | `/chat/reports/{report_id}/read` | `mark_report_messages_as_read` (`backend/app/routes/chat.py:858`) | `get_current_user` |
| GET | `/chat/matches/{match_id}/thread` | `get_match_thread_endpoint` (`backend/app/routes/chat.py:883`) | `get_current_user` |
| GET | `/chat/matches/{match_id}/messages` | `get_match_messages` (`backend/app/routes/chat.py:916`) | `get_current_user` |
| POST | `/chat/matches/{match_id}/messages` | `send_match_message` (`backend/app/routes/chat.py:931`) | `get_current_user` |
| GET | `/chat/matches/{match_id}/stats` | `get_match_chat_stats` (`backend/app/routes/chat.py:994`) | `get_current_user` |
| PATCH | `/chat/matches/{match_id}/read` | `mark_match_messages_as_read` (`backend/app/routes/chat.py:1027`) | `get_current_user` |
| GET | `/chat/threads` | `list_user_threads` (`backend/app/routes/chat.py:1183`) | `get_current_user` |
| GET | `/chat/unread-count` | `get_unread_chat_count` (`backend/app/routes/chat.py:1492`) | `get_current_user` |

### D.8 `backend/app/routes/claims.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/claims/` | `get_claims` (`backend/app/routes/claims.py:61`) | `get_current_user` |
| GET | `/claims/proof-on-file` | `get_proof_on_file` (`backend/app/routes/claims.py:158`) | `get_current_user` |
| GET | `/claims/{claim_id}` | `get_claim` (`backend/app/routes/claims.py:240`) | `get_current_user` |
| POST | `/claims/` | `create_or_update_claim` (`backend/app/routes/claims.py:272`) | `get_current_user` |
| POST | `/claims/{claim_id}/evidence` | `upload_claim_evidence` (`backend/app/routes/claims.py:405`) | `get_current_user` |
| PATCH | `/claims/{claim_id}/status` | `update_claim_status` (`backend/app/routes/claims.py:468`) | `get_current_user` |
| PATCH | `/claims/{claim_id}` | `update_claim_documents` (`backend/app/routes/claims.py:838`) | `get_current_user` |
| DELETE | `/claims/{claim_id}` | `delete_claim` (`backend/app/routes/claims.py:917`) | `get_current_user` |
| POST | `/claims/custody-answer` | `answer_custody` (`backend/app/routes/claims.py:975`) | `get_current_user` |
| POST | `/claims/{claim_id}/close-not-needed` | `close_claim_not_needed` (`backend/app/routes/claims.py:1018`) | `get_current_staff_or_admin` |

### D.9 `backend/app/routes/holding.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/holding/metrics` | `get_metrics` (`backend/app/routes/holding.py:380`) | `get_current_staff_or_admin` |
| GET | `/holding/` | `list_animals` (`backend/app/routes/holding.py:450`) | `get_current_staff_or_admin` |
| GET | `/holding/by-report/{report_id}` | `get_holding_for_report` (`backend/app/routes/holding.py:497`) | `get_current_user` |
| GET | `/holding/{holding_id}` | `get_animal` (`backend/app/routes/holding.py:572`) | `get_current_staff_or_admin` |
| POST | `/holding/` | `create_animal` (`backend/app/routes/holding.py:582`) | `get_current_staff_or_admin` |
| PATCH | `/holding/{holding_id}` | `update_animal` (`backend/app/routes/holding.py:643`) | `get_current_staff_or_admin` |
| POST | `/holding/{holding_id}/escalate` | `escalate_to_barangay` (`backend/app/routes/holding.py:828`) | `get_current_staff_or_admin` |
| POST | `/holding/{holding_id}/timeline` | `add_timeline_entry` (`backend/app/routes/holding.py:1032`) | `get_current_staff_or_admin` |
| DELETE | `/holding/{holding_id}` | `delete_animal` (`backend/app/routes/holding.py:1101`) | `get_current_staff_or_admin` |

### D.10 `backend/app/routes/landmarks.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/landmarks` | `get_landmarks` (`backend/app/routes/landmarks.py:51`) | `No direct authentication dependency` |
| GET | `/landmarks/jurisdictions` | `get_jurisdictions` (`backend/app/routes/landmarks.py:76`) | `No direct authentication dependency` |
| GET | `/landmarks/{landmark_id}` | `get_landmark` (`backend/app/routes/landmarks.py:99`) | `No direct authentication dependency` |
| POST | `/landmarks` | `create_landmark` (`backend/app/routes/landmarks.py:106`) | `get_current_user` |
| PUT | `/landmarks/{landmark_id}` | `update_landmark` (`backend/app/routes/landmarks.py:161`) | `get_current_user` |
| DELETE | `/landmarks/{landmark_id}` | `delete_landmark` (`backend/app/routes/landmarks.py:224`) | `get_current_user` |
| GET | `/landmarks/barangay/{barangay_id}/hq` | `get_barangay_hq` (`backend/app/routes/landmarks.py:263`) | `No direct authentication dependency` |
| PUT | `/landmarks/barangay/{barangay_id}/hq` | `update_barangay_hq` (`backend/app/routes/landmarks.py:279`) | `get_current_user` |

### D.11 `backend/app/routes/matches.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/matches/` | `get_matches` (`backend/app/routes/matches.py:1194`) | `get_current_staff_or_admin` |
| GET | `/matches/duplicates` | `get_duplicate_matches` (`backend/app/routes/matches.py:1241`) | `get_current_staff_or_admin` |
| GET | `/matches/duplicates/report/{report_id}` | `get_duplicates_for_report` (`backend/app/routes/matches.py:1315`) | `get_current_staff_or_admin` |
| GET | `/matches/settings` | `get_ai_matching_settings` (`backend/app/routes/matches.py:1391`) | `get_current_user` |
| PUT | `/matches/settings` | `update_ai_matching_settings` (`backend/app/routes/matches.py:1410`) | `get_current_staff_or_admin` |
| GET | `/matches/case/{report_id}/merged-sightings` | `get_merged_sightings` (`backend/app/routes/matches.py:1476`) | `get_current_staff_or_admin` |
| POST | `/matches/case/{report_id}/merged-sightings/keep` | `keep_merged_sightings` (`backend/app/routes/matches.py:1493`) | `get_current_staff_or_admin` |
| GET | `/matches/merged-sightings/needs-review` | `get_sightings_needing_review` (`backend/app/routes/matches.py:1509`) | `get_current_staff_or_admin` |
| GET | `/matches/case-review/{report_id}` | `get_case_match_review` (`backend/app/routes/matches.py:1522`) | `get_current_user` |
| GET | `/matches/{match_id}` | `get_match_by_id` (`backend/app/routes/matches.py:1928`) | `get_current_user` |
| GET | `/matches/report/{report_id}` | `get_matches_for_report` (`backend/app/routes/matches.py:1949`) | `get_current_user` |
| GET | `/matches/{match_id}/case-preview` | `preview_match_decision` (`backend/app/routes/matches.py:1968`) | `get_current_staff_or_admin` |
| POST | `/matches/{match_id}/verify` | `verify_match` (`backend/app/routes/matches.py:2023`) | `get_current_staff_or_admin` |
| PUT | `/matches/{match_id}/verify` | `verify_match` (`backend/app/routes/matches.py:2023`) | `get_current_staff_or_admin` |
| POST | `/matches/{match_id}/owner-feedback` | `submit_owner_feedback` (`backend/app/routes/matches.py:2351`) | `get_current_user` |
| POST | `/matches/{match_id}/unlink-pet` | `unlink_disputed_pet_match` (`backend/app/routes/matches.py:2749`) | `get_current_staff_or_admin` |
| POST | `/matches/{match_id}/reverse` | `reverse_pet_match_decision` (`backend/app/routes/matches.py:2824`) | `get_current_staff_or_admin` |
| POST | `/matches/{match_id}/leader-verify-identity` | `leader_verify_identity` (`backend/app/routes/matches.py:2940`) | `get_current_staff_or_admin` |
| POST | `/matches/{match_id}/request-owner-verification` | `request_owner_verification` (`backend/app/routes/matches.py:3018`) | `get_current_staff_or_admin` |
| POST | `/matches/{match_id}/owner-verification` | `answer_owner_verification` (`backend/app/routes/matches.py:3065`) | `get_current_user` |
| POST | `/matches/scan-all` | `scan_all_reports` (`backend/app/routes/matches.py:3104`) | `get_current_staff_or_admin` |
| POST | `/matches/scan/{report_id}` | `scan_single_report` (`backend/app/routes/matches.py:3125`) | `get_current_staff_or_admin` |

### D.12 `backend/app/routes/notifications.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/notifications/me` | `get_my_notifications` (`backend/app/routes/notifications.py:53`) | `get_current_user` |
| GET | `/notifications/user/{user_id}` | `get_user_notifications` (`backend/app/routes/notifications.py:65`) | `get_current_user` |
| POST | `/notifications/` | `create_notification` (`backend/app/routes/notifications.py:83`) | `get_current_user` |
| PATCH | `/notifications/{notification_id}` | `update_notification` (`backend/app/routes/notifications.py:102`) | `get_current_user` |
| PATCH | `/notifications/{notification_id}/read` | `update_notification` (`backend/app/routes/notifications.py:102`) | `get_current_user` |
| POST | `/notifications/{notification_id}/archive` | `archive_notification` (`backend/app/routes/notifications.py:128`) | `get_current_user` |
| POST | `/notifications/{notification_id}/unarchive` | `unarchive_notification` (`backend/app/routes/notifications.py:149`) | `get_current_user` |
| DELETE | `/notifications/{notification_id}` | `delete_notification` (`backend/app/routes/notifications.py:170`) | `get_current_user` |
| POST | `/notifications/mark-all-read/{user_id}` | `mark_all_read` (`backend/app/routes/notifications.py:190`) | `get_current_user` |
| POST | `/notifications/archive-all/{user_id}` | `archive_all_notifications` (`backend/app/routes/notifications.py:205`) | `get_current_user` |
| DELETE | `/notifications/archived/clear/{user_id}` | `clear_archived_notifications` (`backend/app/routes/notifications.py:220`) | `get_current_user` |
| GET | `/notifications/preferences` | `get_my_notification_preferences` (`backend/app/routes/notifications.py:240`) | `get_current_user` |
| PUT | `/notifications/preferences` | `update_my_notification_preferences` (`backend/app/routes/notifications.py:263`) | `get_current_user` |
| POST | `/notifications/test-email` | `test_email_delivery` (`backend/app/routes/notifications.py:297`) | `get_current_user` |

### D.13 `backend/app/routes/owner_followups.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/owner-followups/settings` | `get_followup_settings` (`backend/app/routes/owner_followups.py:162`) | `get_current_staff_or_admin` |
| PUT | `/owner-followups/settings` | `update_followup_settings` (`backend/app/routes/owner_followups.py:167`) | `get_current_user` |
| POST | `/owner-followups` | `start_followup` (`backend/app/routes/owner_followups.py:190`) | `get_current_staff_or_admin` |
| POST | `/owner-followups/` | `start_followup` (`backend/app/routes/owner_followups.py:190`) | `get_current_staff_or_admin` |
| GET | `/owner-followups` | `list_followups` (`backend/app/routes/owner_followups.py:235`) | `get_current_staff_or_admin` |
| GET | `/owner-followups/` | `list_followups` (`backend/app/routes/owner_followups.py:235`) | `get_current_staff_or_admin` |
| GET | `/owner-followups/by-report/{report_id}` | `followup_for_report` (`backend/app/routes/owner_followups.py:265`) | `get_current_user` |
| POST | `/owner-followups/{followup_id}/contacts` | `add_contact` (`backend/app/routes/owner_followups.py:284`) | `get_current_staff_or_admin` |
| POST | `/owner-followups/{followup_id}/owner-update` | `add_owner_update` (`backend/app/routes/owner_followups.py:305`) | `get_current_user` |
| POST | `/owner-followups/{followup_id}/acknowledge` | `acknowledge` (`backend/app/routes/owner_followups.py:332`) | `get_current_user` |
| POST | `/owner-followups/{followup_id}/extend` | `extend_followup` (`backend/app/routes/owner_followups.py:369`) | `get_current_staff_or_admin` |
| POST | `/owner-followups/{followup_id}/close` | `close_followup` (`backend/app/routes/owner_followups.py:403`) | `get_current_staff_or_admin` |

### D.14 `backend/app/routes/pet_ownership.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/pet-ownership/mine` | `my_pending_confirmations` (`backend/app/routes/pet_ownership.py:40`) | `get_current_user` |
| POST | `/pet-ownership/{confirmation_id}/accept` | `accept` (`backend/app/routes/pet_ownership.py:67`) | `get_current_user` |
| POST | `/pet-ownership/{confirmation_id}/reject` | `reject` (`backend/app/routes/pet_ownership.py:72`) | `get_current_user` |
| GET | `/pet-ownership/by-pet/{pet_id}` | `latest_for_pet` (`backend/app/routes/pet_ownership.py:77`) | `get_current_staff_or_admin` |
| POST | `/pet-ownership/{confirmation_id}/cancel` | `cancel` (`backend/app/routes/pet_ownership.py:93`) | `get_current_staff_or_admin` |
| POST | `/pet-ownership/claim` | `claim_pet` (`backend/app/routes/pet_ownership.py:125`) | `get_current_user` |
| GET | `/pet-ownership/my-claims` | `my_claims` (`backend/app/routes/pet_ownership.py:165`) | `get_current_user` |
| GET | `/pet-ownership/claims` | `pending_claims` (`backend/app/routes/pet_ownership.py:184`) | `get_current_staff_or_admin` |
| POST | `/pet-ownership/claims/{confirmation_id}/approve` | `approve_claim` (`backend/app/routes/pet_ownership.py:250`) | `get_current_staff_or_admin` |
| POST | `/pet-ownership/claims/{confirmation_id}/decline` | `decline_claim` (`backend/app/routes/pet_ownership.py:256`) | `get_current_staff_or_admin` |

### D.15 `backend/app/routes/pet_qr.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| POST | `/pets/{pet_id}/generate-qr` | `generate_pet_qr` (`backend/app/routes/pet_qr.py:92`) | `get_current_user` |
| GET | `/pets/{pet_id}/qr` | `get_pet_qr` (`backend/app/routes/pet_qr.py:111`) | `get_current_user` |
| PUT | `/pets/{pet_id}/toggle-qr` | `toggle_pet_qr` (`backend/app/routes/pet_qr.py:132`) | `get_current_user` |
| GET | `/pet-qr/scan/{token}` | `get_public_scan_info` (`backend/app/routes/pet_qr.py:159`) | `No direct authentication dependency` |
| GET | `/pet/scan/{token}` | `get_public_scan_info` (`backend/app/routes/pet_qr.py:159`) | `No direct authentication dependency` |
| POST | `/pet/scan/{token}/submit` | `submit_pet_scan` (`backend/app/routes/pet_qr.py:238`) | `No direct authentication dependency` |
| GET | `/pet-qr/recovery-requests/{scan_id}` | `get_recovery_request` (`backend/app/routes/pet_qr.py:356`) | `get_current_user` |
| GET | `/pets/{pet_id}/pending-recovery` | `get_pending_pet_recovery` (`backend/app/routes/pet_qr.py:418`) | `get_current_user` |
| GET | `/pet-qr/pending-recoveries/my-pets` | `get_my_pets_pending_recoveries` (`backend/app/routes/pet_qr.py:478`) | `get_current_user` |
| POST | `/pet-qr/recovery-requests/{scan_id}/confirm` | `confirm_pet_recovery` (`backend/app/routes/pet_qr.py:538`) | `get_current_user` |
| POST | `/pet-qr/recovery-requests/{scan_id}/reject` | `reject_pet_recovery` (`backend/app/routes/pet_qr.py:683`) | `get_current_user` |
| GET | `/pets/{pet_id}/history` | `get_pet_history_timeline` (`backend/app/routes/pet_qr.py:755`) | `get_current_user` |
| GET | `/pets/{pet_id}/scan-history` | `get_pet_scan_history` (`backend/app/routes/pet_qr.py:781`) | `get_current_user` |

### D.16 `backend/app/routes/pets.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/pets/` | `get_pets` (`backend/app/routes/pets.py:114`) | `get_current_user` |
| GET | `/pets/removed` | `get_removed_pets` (`backend/app/routes/pets.py:188`) | `get_current_user` |
| GET | `/pets/archived` | `get_removed_pets` (`backend/app/routes/pets.py:188`) | `get_current_user` |
| GET | `/pets/existing-for-me` | `existing_pets_for_me` (`backend/app/routes/pets.py:248`) | `get_current_user` |
| GET | `/pets/possible-duplicates` | `get_possible_duplicate_pets` (`backend/app/routes/pets.py:263`) | `get_current_staff_or_admin` |
| POST | `/pets/possible-duplicates/not-same` | `mark_not_same_pet` (`backend/app/routes/pets.py:280`) | `get_current_staff_or_admin` |
| POST | `/pets/possible-duplicates/merge-request` | `request_owner_merge` (`backend/app/routes/pets.py:300`) | `get_current_staff_or_admin` |
| GET | `/pets/merge-requests/mine` | `my_merge_requests` (`backend/app/routes/pets.py:368`) | `get_current_user` |
| POST | `/pets/merge-requests/{request_id}/answer` | `answer_merge_request` (`backend/app/routes/pets.py:384`) | `get_current_user` |
| GET | `/pets/{pet_id}/merge-candidates` | `get_merge_candidates` (`backend/app/routes/pets.py:428`) | `get_current_staff_or_admin` |
| GET | `/pets/{pet_id}` | `get_pet` (`backend/app/routes/pets.py:449`) | `get_current_user` |
| GET | `/pets/owner/{owner_id}` | `get_owner_pets` (`backend/app/routes/pets.py:462`) | `get_current_user` |
| GET | `/pets/subdivision/{subdivision_id}` | `get_subdivision_pets` (`backend/app/routes/pets.py:501`) | `get_current_user` |
| POST | `/pets/{pet_id}/assign-owner` | `assign_pet_owner` (`backend/app/routes/pets.py:548`) | `get_current_user` |
| POST | `/pets/` | `create_pet` (`backend/app/routes/pets.py:693`) | `get_current_user` |
| PUT | `/pets/{pet_id}` | `update_pet` (`backend/app/routes/pets.py:936`) | `get_current_user` |
| GET | `/pets/owner/{owner_id}/history` | `get_owner_pet_history` (`backend/app/routes/pets.py:1004`) | `get_current_user` |
| POST | `/pets/{pet_id}/restore` | `restore_pet_by_id` (`backend/app/routes/pets.py:1210`) | `get_current_user` |
| POST | `/pets/restore` | `restore_pet` (`backend/app/routes/pets.py:1265`) | `get_current_user` |
| POST | `/pets/{pet_id}/merge-into` | `merge_pet_record` (`backend/app/routes/pets.py:1516`) | `get_current_user` |
| DELETE | `/pets/{pet_id}` | `remove_pet` (`backend/app/routes/pets.py:1561`) | `get_current_user` |
| POST | `/pets/{pet_id}/remove` | `remove_pet` (`backend/app/routes/pets.py:1561`) | `get_current_user` |
| POST | `/pets/{pet_id}/photo` | `upload_pet_photo` (`backend/app/routes/pets.py:1706`) | `get_current_user` |
| POST | `/pets/{pet_id}/vaccine-card` | `upload_vaccine_card` (`backend/app/routes/pets.py:1744`) | `get_current_user` |
| POST | `/pets/{pet_id}/photo-front` | `upload_pet_photo_front` (`backend/app/routes/pets.py:1780`) | `get_current_user` |
| POST | `/pets/{pet_id}/photo-left` | `upload_pet_photo_left` (`backend/app/routes/pets.py:1817`) | `get_current_user` |
| POST | `/pets/{pet_id}/photo-right` | `upload_pet_photo_right` (`backend/app/routes/pets.py:1854`) | `get_current_user` |
| DELETE | `/pets/{pet_id}/permanent` | `delete_pet_record` (`backend/app/routes/pets.py:1892`) | `get_current_user` |

### D.17 `backend/app/routes/push.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/push/public-key` | `get_public_key` (`backend/app/routes/push.py:37`) | `No direct authentication dependency` |
| POST | `/push/subscribe` | `subscribe` (`backend/app/routes/push.py:44`) | `get_current_user` |
| POST | `/push/unsubscribe` | `unsubscribe` (`backend/app/routes/push.py:73`) | `get_current_user` |
| GET | `/push/status` | `status` (`backend/app/routes/push.py:85`) | `get_current_user` |
| POST | `/push/test` | `send_test` (`backend/app/routes/push.py:96`) | `get_current_user` |

### D.18 `backend/app/routes/report_returns.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/report-returns/owner-search` | `owner_search` (`backend/app/routes/report_returns.py:15`) | `get_current_staff_or_admin` |
| GET | `/report-returns/by-report/{report_id}` | `get_return_for_report` (`backend/app/routes/report_returns.py:35`) | `get_current_user` |

### D.19 `backend/app/routes/report_split.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/reports/{report_id}/split-group` | `get_split_group` (`backend/app/routes/report_split.py:165`) | `get_current_user` |
| POST | `/reports/{report_id}/split` | `split_report` (`backend/app/routes/report_split.py:199`) | `get_current_user` |
| POST | `/reports/{report_id}/count-note` | `confirm_fewer_animals` (`backend/app/routes/report_split.py:342`) | `get_current_user` |
| POST | `/reports/{report_id}/unsplit` | `unsplit_report` (`backend/app/routes/report_split.py:369`) | `get_current_user` |
| POST | `/reports/{report_id}/replace-photo` | `replace_animal_photo` (`backend/app/routes/report_split.py:420`) | `get_current_user` |

### D.20 `backend/app/routes/reports.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/reports/admin-badge-counts` | `get_admin_badge_counts` (`backend/app/routes/reports.py:1023`) | `get_current_staff_or_admin` |
| GET | `/reports/` | `get_reports` (`backend/app/routes/reports.py:1042`) | `get_current_user` |
| GET | `/reports/coverage-area` | `get_reporting_coverage_area` (`backend/app/routes/reports.py:1421`) | `No direct authentication dependency` |
| PUT | `/reports/coverage-area` | `update_reporting_coverage_area` (`backend/app/routes/reports.py:1439`) | `get_current_staff_or_admin` |
| POST | `/reports/analyze-media` | `analyze_report_media` (`backend/app/routes/reports.py:1530`) | `get_current_user` |
| POST | `/reports/validate-images` | `validate_report_images` (`backend/app/routes/reports.py:2010`) | `get_current_user` |
| POST | `/reports/` | `create_report` (`backend/app/routes/reports.py:2249`) | `get_current_user` |
| GET | `/reports/sidebar-ids` | `get_sidebar_report_ids` (`backend/app/routes/reports.py:2481`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/identity-dispute` | `flag_incorrect_sighting` (`backend/app/routes/reports.py:2569`) | `get_current_user` |
| POST | `/reports/{report_id}/identity-dispute/{dispute_id}/decide` | `decide_identity_dispute` (`backend/app/routes/reports.py:2624`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/recheck-identity` | `recheck_inherited_identity` (`backend/app/routes/reports.py:2695`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/separate-incident` | `mark_separate_incident` (`backend/app/routes/reports.py:2744`) | `get_current_staff_or_admin` |
| GET | `/reports/{report_id}` | `get_report` (`backend/app/routes/reports.py:2825`) | `get_current_user` |
| DELETE | `/reports/{report_id}` | `delete_report` (`backend/app/routes/reports.py:3072`) | `get_current_staff_or_admin` |
| PATCH | `/reports/{report_id}/cancel` | `cancel_report_by_citizen` (`backend/app/routes/reports.py:3128`) | `get_current_user` |
| POST | `/reports/{report_id}/confirm-reunited` | `confirm_reunited_by_citizen` (`backend/app/routes/reports.py:3164`) | `get_current_user` |
| POST | `/reports/{report_id}/request-reunion-photo` | `request_reunion_photo` (`backend/app/routes/reports.py:3295`) | `get_current_user` |
| PATCH | `/reports/{report_id}` | `update_report` (`backend/app/routes/reports.py:3403`) | `get_current_user` |
| POST | `/reports/{report_id}/media` | `upload_report_media` (`backend/app/routes/reports.py:3664`) | `get_current_user` |
| PUT | `/reports/{report_id}/status` | `update_report_status` (`backend/app/routes/reports.py:3757`) | `get_current_staff_or_admin` |
| PATCH | `/reports/{report_id}/status` | `update_report_status` (`backend/app/routes/reports.py:3757`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/comments` | `add_comment` (`backend/app/routes/reports.py:4349`) | `get_current_user` |
| DELETE | `/reports/media/{media_id}` | `delete_report_media` (`backend/app/routes/reports.py:4422`) | `get_current_user` |
| GET | `/reports/{report_id}/review-permission` | `get_review_permission` (`backend/app/routes/reports.py:4445`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/link-pet` | `link_pet_to_report` (`backend/app/routes/reports.py:4458`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/claim` | `claim_report` (`backend/app/routes/reports.py:4513`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/take-over` | `takeover_report` (`backend/app/routes/reports.py:4652`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/unclaim` | `unclaim_report` (`backend/app/routes/reports.py:4815`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/transfer/request` | `request_transfer_report` (`backend/app/routes/reports.py:4901`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/transfer/accept` | `accept_transfer_report` (`backend/app/routes/reports.py:5029`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/transfer/reject` | `reject_transfer_report` (`backend/app/routes/reports.py:5143`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/transfer/cancel` | `cancel_transfer_report` (`backend/app/routes/reports.py:5252`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/verify-incident` | `verify_incident_report` (`backend/app/routes/reports.py:5345`) | `get_current_staff_or_admin` |
| PATCH | `/reports/{report_id}/visibility` | `set_report_visibility` (`backend/app/routes/reports.py:5478`) | `get_current_user` |
| POST | `/reports/{report_id}/mark-false-alarm` | `mark_report_false_alarm` (`backend/app/routes/reports.py:5520`) | `get_current_staff_or_admin` |
| POST | `/reports/merge-group` | `merge_report_group` (`backend/app/routes/reports.py:5889`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/merge` | `merge_duplicate_report` (`backend/app/routes/reports.py:5905`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/unmerge` | `unmerge_duplicate_report` (`backend/app/routes/reports.py:5926`) | `get_current_staff_or_admin` |
| POST | `/reports/{report_id}/disputes` | `create_report_dispute` (`backend/app/routes/reports.py:6062`) | `get_current_user` |
| GET | `/reports/{report_id}/disputes` | `get_report_disputes` (`backend/app/routes/reports.py:6199`) | `get_current_user` |
| PATCH | `/reports/{report_id}/disputes/{dispute_id}/review` | `review_report_dispute` (`backend/app/routes/reports.py:6224`) | `get_current_staff_or_admin` |

### D.21 `backend/app/routes/rescue.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| POST | `/rescue-requests/` | `create_rescue_request` (`backend/app/routes/rescue.py:162`) | `get_current_staff_or_admin` |
| GET | `/rescue-requests/` | `get_rescue_requests` (`backend/app/routes/rescue.py:289`) | `get_current_staff_or_admin` |
| GET | `/rescue-requests/report/{report_id}` | `get_request_by_report` (`backend/app/routes/rescue.py:327`) | `get_current_staff_or_admin` |
| GET | `/rescue-requests/{rescue_id}` | `get_rescue_request` (`backend/app/routes/rescue.py:344`) | `get_current_staff_or_admin` |
| PATCH | `/rescue-requests/{rescue_id}` | `update_rescue_request` (`backend/app/routes/rescue.py:365`) | `get_current_staff_or_admin` |
| PUT | `/rescue-requests/{rescue_id}` | `update_rescue_request` (`backend/app/routes/rescue.py:365`) | `get_current_staff_or_admin` |
| PATCH | `/rescue-requests/{rescue_id}/status` | `update_rescue_request` (`backend/app/routes/rescue.py:365`) | `get_current_staff_or_admin` |
| POST | `/rescue-requests/assign-team` | `assign_rescue_team` (`backend/app/routes/rescue.py:987`) | `get_current_staff_or_admin` |
| POST | `/rescue/assign-team` | `assign_rescue_team` (`backend/app/routes/rescue.py:987`); compatibility alias declared at line 1119 | `get_current_staff_or_admin` |
| PATCH | `/rescue/{rescue_id}` | `update_rescue_request` (`backend/app/routes/rescue.py:365`); compatibility alias declared at line 1120 | `get_current_staff_or_admin` |
| PUT | `/rescue/{rescue_id}` | `update_rescue_request` (`backend/app/routes/rescue.py:365`); compatibility alias declared at line 1120 | `get_current_staff_or_admin` |
| PATCH | `/rescue/{rescue_id}/status` | `update_rescue_request` (`backend/app/routes/rescue.py:365`); compatibility alias declared at line 1121 | `get_current_staff_or_admin` |

### D.22 `backend/app/routes/sidebar.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/sidebar/badges` | `sidebar_badges` (`backend/app/routes/sidebar.py:25`) | `get_current_staff_or_admin` |

### D.23 `backend/app/routes/users.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| GET | `/users/positions/list` | `get_positions` (`backend/app/routes/users.py:80`) | `No direct authentication dependency` |
| GET | `/users/` | `get_users` (`backend/app/routes/users.py:86`) | `get_current_user` |
| POST | `/users/barangay/{barangay_id}/assign-head` | `assign_barangay_head` (`backend/app/routes/users.py:129`) | `get_current_user` |
| GET | `/users/{user_id}` | `get_user` (`backend/app/routes/users.py:183`) | `get_current_user` |
| POST | `/users/` | `create_user` (`backend/app/routes/users.py:224`) | `get_optional_user` |
| POST | `/users/admin-create` | `admin_create_user` (`backend/app/routes/users.py:303`) | `get_current_user` |
| POST | `/users/{user_id}/resend-invite` | `resend_invite` (`backend/app/routes/users.py:387`) | `get_current_user` |
| PUT | `/users/{user_id}` | `update_user` (`backend/app/routes/users.py:456`) | `get_current_user` |
| PATCH | `/users/{user_id}/status` | `update_user_status` (`backend/app/routes/users.py:565`) | `get_current_user` |
| DELETE | `/users/{user_id}` | `delete_user` (`backend/app/routes/users.py:611`) | `get_current_user` |
| POST | `/users/{user_id}/profile-picture` | `upload_profile_picture` (`backend/app/routes/users.py:659`) | `get_current_user` |

### D.24 `backend/app/routes/warnings.py`

| Method | Full server path | Function / line | Direct auth dependency |
|---|---|---|---|
| POST | `/warnings/` | `issue_warning` (`backend/app/routes/warnings.py:74`) | `get_current_user` |
| GET | `/warnings/my-warnings` | `get_my_warnings` (`backend/app/routes/warnings.py:235`) | `get_current_user` |
| GET | `/warnings/user/{user_id}` | `get_user_warnings` (`backend/app/routes/warnings.py:246`) | `get_current_user` |
| GET | `/warnings/pet/{pet_id}` | `get_pet_warnings` (`backend/app/routes/warnings.py:262`) | `get_current_user` |
| GET | `/warnings/report/{report_id}` | `get_report_warnings` (`backend/app/routes/warnings.py:275`) | `get_current_user` |
| GET | `/warnings/{warning_id}` | `get_warning_by_id` (`backend/app/routes/warnings.py:288`) | `get_current_user` |
| GET | `/warnings/` | `get_all_warnings` (`backend/app/routes/warnings.py:305`) | `get_current_user` |
| PATCH | `/warnings/{warning_id}/acknowledge` | `acknowledge_warning` (`backend/app/routes/warnings.py:322`) | `get_current_user` |

### D.root Application-level routes and non-router surfaces

- `GET /` — `read_root`, `backend/app/main.py:1673`.
- Static upload serving and application middleware/startup tasks are additional surfaces in `backend/app/main.py`; they are not represented as role-specific page modules or router endpoint declarations.
- No active adoption router is registered. Old schema compatibility helpers do not create an adoption portal.

## E. Database model and table inventory

This catalog is extracted from the current ORM class declarations. It is **not** a database introspection result, a migration plan, or proof that every table/constraint exists in the configured database. RP24 remains unresolved.

| Model file | Declared model | Declared table | Source line |
|---|---|---|---|
| `backend/app/models/ai_job.py` | `AiJob` | `ai_jobs` | `backend/app/models/ai_job.py:10` |
| `backend/app/models/ai_vision_comparison.py` | `AiVisionComparison` | `ai_vision_comparisons` | `backend/app/models/ai_vision_comparison.py:9` |
| `backend/app/models/announcement.py` | `AnnouncementCategory` | `announcement_categories` | `backend/app/models/announcement.py:6` |
| `backend/app/models/announcement.py` | `Announcement` | `announcements` | `backend/app/models/announcement.py:15` |
| `backend/app/models/announcement.py` | `AnnouncementMedia` | `announcement_media` | `backend/app/models/announcement.py:43` |
| `backend/app/models/announcement.py` | `AnnouncementComment` | `announcement_comments` | `backend/app/models/announcement.py:56` |
| `backend/app/models/announcement.py` | `AnnouncementReaction` | `announcement_reactions` | `backend/app/models/announcement.py:72` |
| `backend/app/models/audit_log.py` | `AuditLog` | `audit_logs` | `backend/app/models/audit_log.py:5` |
| `backend/app/models/chat.py` | `ChatThread` | `chat_threads` | `backend/app/models/chat.py:7` |
| `backend/app/models/chat.py` | `ChatMessage` | `chat_messages` | `backend/app/models/chat.py:26` |
| `backend/app/models/coverage.py` | `CoverageSetting` | `coverage_settings` | `backend/app/models/coverage.py:8` |
| `backend/app/models/email_log.py` | `EmailLog` | `email_logs` | `backend/app/models/email_log.py:8` |
| `backend/app/models/landmark.py` | `Landmark` | `landmarks` | `backend/app/models/landmark.py:8` |
| `backend/app/models/notification.py` | `Notification` | `notifications` | `backend/app/models/notification.py:6` |
| `backend/app/models/notification_preference.py` | `UserNotificationPreference` | `user_notification_preferences` | `backend/app/models/notification_preference.py:6` |
| `backend/app/models/otp.py` | `OtpVerification` | `otp_verifications` | `backend/app/models/otp.py:8` |
| `backend/app/models/owner_followup.py` | `OwnerFollowUp` | `owner_followups` | `backend/app/models/owner_followup.py:13` |
| `backend/app/models/owner_followup.py` | `OwnerFollowUpContact` | `owner_followup_contacts` | `backend/app/models/owner_followup.py:66` |
| `backend/app/models/pet.py` | `Pet` | `pets` | `backend/app/models/pet.py:12` |
| `backend/app/models/pet.py` | `PetVaccination` | `pet_vaccinations` | `backend/app/models/pet.py:120` |
| `backend/app/models/pet_claim.py` | `PetClaim` | `pet_claims` | `backend/app/models/pet_claim.py:7` |
| `backend/app/models/pet_history.py` | `PetHistory` | `pet_history` | `backend/app/models/pet_history.py:11` |
| `backend/app/models/pet_owner_confirmation.py` | `PetOwnerConfirmation` | `pet_owner_confirmations` | `backend/app/models/pet_owner_confirmation.py:10` |
| `backend/app/models/pet_qr.py` | `PetQRCode` | `pet_qr_codes` | `backend/app/models/pet_qr.py:11` |
| `backend/app/models/pet_qr.py` | `PetQRScan` | `pet_qr_scans` | `backend/app/models/pet_qr.py:28` |
| `backend/app/models/push.py` | `PushSubscription` | `push_subscriptions` | `backend/app/models/push.py:10` |
| `backend/app/models/push.py` | `PushDelivery` | `push_deliveries` | `backend/app/models/push.py:28` |
| `backend/app/models/report.py` | `ReportCategory` | `report_categories` | `backend/app/models/report.py:14` |
| `backend/app/models/report.py` | `ReportStatus` | `report_status` | `backend/app/models/report.py:21` |
| `backend/app/models/report.py` | `Report` | `reports` | `backend/app/models/report.py:27` |
| `backend/app/models/report.py` | `LetterStatus` | `letter_status` | `backend/app/models/report.py:175` |
| `backend/app/models/report.py` | `EndorsementLetter` | `endorsement_letters` | `backend/app/models/report.py:181` |
| `backend/app/models/report.py` | `ReportMedia` | `report_media` | `backend/app/models/report.py:203` |
| `backend/app/models/report.py` | `Comment` | `comments` | `backend/app/models/report.py:229` |
| `backend/app/models/report.py` | `RescueStatus` | `rescue_status` | `backend/app/models/report.py:244` |
| `backend/app/models/report.py` | `Rescue` | `rescues` | `backend/app/models/report.py:251` |
| `backend/app/models/report.py` | `ReportVerification` | `report_verifications` | `backend/app/models/report.py:280` |
| `backend/app/models/report.py` | `StatusHistory` | `status_history` | `backend/app/models/report.py:296` |
| `backend/app/models/report.py` | `RescueAssignment` | `rescue_assignments` | `backend/app/models/report.py:325` |
| `backend/app/models/report.py` | `FacilityStatus` | `facility_status` | `backend/app/models/report.py:353` |
| `backend/app/models/report.py` | `HoldingAnimal` | `holding_animals` | `backend/app/models/report.py:361` |
| `backend/app/models/report.py` | `HoldingTimeline` | `holding_timeline` | `backend/app/models/report.py:431` |
| `backend/app/models/report.py` | `ReportReturn` | `report_returns` | `backend/app/models/report.py:454` |
| `backend/app/models/report_dispute.py` | `ReportDispute` | `report_disputes` | `backend/app/models/report_dispute.py:7` |
| `backend/app/models/report_match.py` | `ReportMatch` | `report_matches` | `backend/app/models/report_match.py:8` |
| `backend/app/models/revoked_token.py` | `RevokedToken` | `revoked_tokens` | `backend/app/models/revoked_token.py:4` |
| `backend/app/models/system_setting.py` | `SystemSetting` | `system_settings` | `backend/app/models/system_setting.py:7` |
| `backend/app/models/user.py` | `Role` | `roles` | `backend/app/models/user.py:7` |
| `backend/app/models/user.py` | `Position` | `positions` | `backend/app/models/user.py:12` |
| `backend/app/models/user.py` | `Barangay` | `barangays` | `backend/app/models/user.py:17` |
| `backend/app/models/user.py` | `Subdivision` | `subdivisions` | `backend/app/models/user.py:27` |
| `backend/app/models/user.py` | `User` | `users` | `backend/app/models/user.py:35` |
| `backend/app/models/warning.py` | `OwnerWarning` | `owner_warnings` | `backend/app/models/warning.py:8` |

## F. Source verification snapshot and maintenance

| Verification item | Result |
|---|---|
| Inventory checked at | 2026-10-29 14:26:32 UTC / 2026-10-29 22:26:32 Asia/Manila |
| Named frontend route declarations | 71, including shared routes, aliases, redirects, and catch-all |
| Lazy-imported routed page components | 54; source files resolved successfully |
| Page files without an independent route import | 2; listed in C.1 |
| Backend router modules with declared routes | 24 |
| Backend method/path declarations | 256, including compatibility aliases; not unique function count |
| Application-level route declarations | 1; listed separately in D.root |
| ORM model/table declarations | 53 |
| Application source files included in snapshot fingerprint | 339 Python / TypeScript / TSX files under backend/app and frontend/src |
| Source snapshot SHA-256 | `b3dbe3b69f4d3b6129aea7e8066a5d007e86a6458760dbdb9c3a5be176b34163` |
| Original reporting findings | RP01–RP30 remain in the separate reporting audit; no repairs or all-module security certification implied |
| Original runtime evidence | 49/49 frontend checks from the original audit; not re-run merely to save/update this documentation |
| Backend/API/database/browser/Android verification | Not executed in this documentation update |

### F.1 How to keep this document updated

1. After changing a role page, route, embedded workflow, backend router, model or operational setting, update its responsibility and data flow in A–B.
2. Re-extract L from `frontend/src/routes/AppRoutes.tsx`, retaining shared guards, compatibility URLs, redirects, page files without independent routes, and source references.
3. Re-extract M from router declarations and `add_api_route` aliases, and check registrations in `backend/app/main.py`. Record inline guards separately from direct dependencies; do not infer authorization from a page button.
4. Re-extract N from ORM declarations; inspect actual database metadata separately before asserting schema equivalence or proposing migrations.
5. Recheck the affected reporting findings against the new code. Record dated evidence and status changes explicitly; documentation alone must never mark a defect fixed.
6. Refresh O only after collecting the corresponding source evidence. A snapshot cannot stay current automatically after the application changes.
7. Update `docs/README.md` when the document scope/status changes and run the strict documentation audit with the installed/cached CLI. Do not install dependencies, start the application, change the database or deploy merely to refresh this record.

### F.2 Remaining evidence required

- End-to-end verification of each role module, including direct API calls outside the intended role/jurisdiction.
- Separate validation of every browser-only operational preference against its actual consumers and backend policy.
- Frontend/backend contract checks for older or mismatched API calls identified in B.3.
- Reproduction of concurrent report, claim, match, observation and merge processing in an explicitly authorized isolated environment.
- Deployed proof-media access, session/cookie settings, email/push delivery and external service configuration.
- Mobile layout, keyboard/screen-reader operation, camera/GPS permissions, offline recovery and Android behavior.
- No all-module pass/fail conclusion is assigned without that evidence; sections A–E are the complete current source inventory, while the separate `reportprocess.md` retains the scoped reporting audit.

### F.3 Separation and verification record

- The complete role inventory, shared modules, workflows, settings persistence, route catalogs, model inventory and source snapshot were separated from `reportprocess.md` into this standalone document at the user's request.
- The current source fingerprint was checked before separation across 339 application files; all 71 named frontend routes still match the inventory. This refresh does not claim new live API, database, browser or Android testing.
- The reporting audit retains all 30 findings and their evidence; no finding was implemented or marked fixed during separation.
- Both documents are indexed in `docs/README.md` and link to one another. Application source, dependencies and database state were not changed.

