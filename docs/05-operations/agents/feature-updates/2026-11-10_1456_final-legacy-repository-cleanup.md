# Final legacy repository cleanup: the old StraySafe application retired

- **Date:** 2026-11-10 14:56 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** see "Key changes" (every modified or created file is named there) and the appendix at the end (every removed file). Nothing was staged, committed or pushed; no `.env` file, database, MySQL account or Android project file was touched.
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Final Legacy Repository Cleanup" (sent twice; the first copy was interrupted). Its boundaries: the 51-table database and the canonical Database 3.4 snapshots are not touched; no MySQL, `.env`, password or account change; no migration; no new feature; no UI redesign; no architecture rewrite; no dependency installation; no commit or push; no APK build; no server or tunnel started; no planning phase.
- **Type:** Fix

## Intent

Make StraySafe 2.0 the only application in the repository. Until now the web build still served the old portals (landing page, `/login`, `/staff/login`, `/resident/*`, `/subd/*`, `/admin/*`) as its default, and the two new interfaces (`/resident-app`, `/subd-admin`) ran beside them, one of them only when a build flag was set. After this change the two new interfaces are the only screens, always mounted, and the old addresses lead to them.

## Key changes

**Routing and entry (`frontend/src/main.tsx`, new `frontend/src/live/Redirect.tsx`).** `/resident-app` and `/subd-admin` are always mounted (no `VITE_NEW_UI` switch, no development-only roots). `/login`, `/resident-home`, `/resident/*` lead to the Resident app; `/staff/login`, `/staff/*`, `/subd/*`, `/subd-messages` to the Leader app (query string and hash kept); every other address (including `/` and `/admin/*`) leads to the Resident app. The Android build is unchanged in shape: Resident app only, the Leader app is folded out of the bundle, the catch-all leads to the Resident app. The shared API client's Leader and Resident session rules are unchanged.

**Removed: the legacy applications (240 source files, about 45 MB).** The legacy router and shell (`App.tsx`, `routes/AppRoutes.tsx`), the legacy Resident, Subdivision Leader and System Administrator pages (`pages/citizen`, `pages/Subd_Leaders`, `pages/Admin`, `pages/BarangayExternal`, landing and sign-in pages), the old navbars, sidebars, modals, notification panel, map and chat components, `ThemeContext`/`ToastContext`, the session guards and idle manager, the web-push client (`PushBridge`, `PushSettingsCard`, `utils/push.ts`), the install-app button and helper, the old server-settings screen and its saved-address override, 45 legacy-only utilities, the facility/Barangay-HQ map cache, and the Vite template leftovers (the 30 MB and 7 MB GIFs, `react.svg`, `App.css`, an unused Tailwind v3 config).

**Removed: the mock-data previews.** The preview roots (`AdminRoot`, `ResidentRoot`), the preview gateways, the seed data and sample office, the preview data providers, the preview bar and its simulation tools, the preview flags, the preview-only slots of the screens (sample sign-in, "no email is sent" notes, sample street lists, `useIsPreview` and mode branches in about 20 screens), the simulation actions of the Resident reducer (which now holds only the draft and the read marks), and the whole Admin reducer (its `AdminAction` type moved to `frontend/src/admin/data/actions.ts`). The preview and legacy styles (`.sa-previewbar`, the two dev-note boxes) went with them; `.rs-previewbar` stays because the Android debug build's backend bar uses it.

**Kept and adjusted (modified files).** `frontend/src/index.css` was cut from 668 lines to the global rules the two interfaces use (Tailwind, body colours, scrollbars, map-marker and focus rules); `frontend/src/live/config.ts`, `admin/config.ts`, `resident/config.ts`, `admin/mode.ts`, `resident/mode.ts`, `admin/AdminLiveRoot.tsx`, `resident/ResidentLiveRoot.tsx`, `admin/AdminApp.tsx`, `resident/ResidentApp.tsx` (the live apps no longer reset a dark theme that no longer exists); both auth providers and gateway contracts (`mode` and the preview variants removed); `utils/api.ts`, `utils/inactivity.ts`, `utils/coverageArea.ts`, `utils/passwordPolicy.ts`, `utils/uploadValidation.ts`, `preview/geo.ts` (stale preview wording and sample-point helpers removed; the shared geography module keeps its name `src/preview/`, a leftover noted below); and stale comments in about 25 files. `frontend/public/manifest.webmanifest` no longer advertises rescues; seven legacy-only files and the web-push service worker left `frontend/public/`.

**Dependencies (no installation).** `leaflet-routing-machine`, `@types/leaflet-routing-machine`, `leaflet.heat`, `@types/leaflet.heat` and `autoprefixer` were removed from `frontend/package.json` and from `frontend/package-lock.json` (10 lock entries; the two `@types/leaflet*` entries became dev-only). The lockfile was pruned by a script that first proved it reproduces npm's own dependency flags on the existing lockfile (354 entries, 0 mismatches); `npm ci` accepts the result (root dependencies equal, every locked version satisfies its range). `frontend/node_modules` still holds the removed packages until the next `npm ci`.

**Tests.** 37 frontend test files and the 19 fixture files that mounted legacy components were removed (14 unit and 23 browser runners). Kept: `liveInterfaces.browser.mjs` with `_liveHarness.mjs`, and the 8 unit files of the live interfaces and the Android build inputs. `backend/tests/` was not reduced; three backend tests changed only their expected link strings (below).

**Backend (no endpoint removed).** (1) Links the backend builds into the frontend now name the 2.0 screens: the account-invite sign-in link (`routes/users.py`: `/resident-app/login`, `/subd-admin/login`, none for roles without an interface), every e-mail call-to-action and the notification-settings link (`services/email_templates.py`), and the tap target of a push (`utils/push_categories.py`: Resident app pets, community notices, reports; Leader app cases, pets, community). (2) The Barangay escalation notification (the e-mail template `render_brgy_escalated_report_email` and its block in the legacy status route `routes/reports.py`, with the two imports it left unused) was removed: the Barangay has no accounts. (3) The unused `escalated_to_barangay` helper (`utils/case_review.py`) and `backend/scratch/` (three stray scripts, one auditing routers that no longer exist) were removed. (4) `backend/tests/test_admin_invite.py`, `test_manual_matching.py` and `test_push_notifications.py` expect the new link strings.

**Documentation.** Updated to the new reality: `docs/01-system/NEW_INTERFACES_INTEGRATION.md` (rewritten "how the screens run"), `docs/05-operations/CUTOVER_READINESS.md` (marked historical, with the three superseded sections flagged), `docs/05-operations/ANDROID_RESIDENT_APP.md`, `docs/01-system/overview.md`, `CASE_WORKFLOW_BACKEND.md`, `ANALYTICS_RULES.md`, `MANUAL_REPORT_MATCHING.md`, `OWNER_FOLLOWUP_RULES.md`, `LOST_PET_SIGHTING_PING.md`, `HEATMAP_RULES.md` (its link to the removed `heatmap.ts` was broken by this change and is now a note), `docs/04-testing/README.md`, `ANALYTICS_SPECIFICATION.md`, `PUSH_NOTIFICATION_IMPLEMENTATION.md`, `setup.md` and the index `docs/README.md` (five rows updated, one row added). Older change records, audits and plans are history and were not edited.

## Decisions and consequences the developer should know

- **The System Administrator (role 4) has no screen.** The legacy Admin portal was part of the old application and the brief keeps only two destinations. The Administrator role, its backend endpoints and `seed_admin.py --admin` remain; a role-4 sign-in at either interface is refused.
- **Legacy functions with no 2.0 screen were retired on purpose**, as `CUTOVER_READINESS.md` blocker 2 required a decision: owner observation updates and the Under Observation pages, lost-pet match review, manual matching and the hazard-alert page, removed pet records, endorsement archive, the Subdivision Messages page, the legacy pet-record and settings pages, web push opt-in, the install-app button and the saved-server screen. Their backend endpoints are all still registered (below).
- **Backend endpoints retired: none.** Of the 296 routes (26 routers), 96 are called by the 2.0 frontend and 200 are not. Those 200 belong to capabilities the brief lists as preserved (matching and manual matching, owner follow-ups, warnings, referrals, chat, notifications and their archive, pet registry management, the Administrator's endpoints, analytics, push) or are covered by existing retirement tests as intentional (Barangay HQ reference pin kept for the Administrator, the refused Barangay provisioning, the announcement feed for the Administrator). Removing them is a product decision, not a clean-up; the groups are listed in the final report.
- **Web push** has no client any more (service worker, opt-in card). The backend endpoints and the 2.0 notification preferences remain; there is no 2.0 opt-in screen (that gap existed before).
- **Old links lead to a front page, not to the item.** E-mails and notifications sent before this change carry legacy paths: `/subd/*` and `/staff/*` lead to the Leader app, `/resident/*` and `/login` to the Resident app, and paths that never matched a legacy route (the old e-mails' `/citizen/...`, `/subdivision/...`, `/barangay/...`) fall to the Resident app. New e-mails and pushes carry 2.0 paths.
- **`frontend/src/preview/`** now only holds code both interfaces share (reporting-area helpers, formatters, map components, design tokens). Renaming it would touch about 100 imports, so the name was left.

## Validation evidence

- **Frontend, static.** `npx tsc -b` exit 0. Every one of the 185 remaining files under `frontend/src` is reachable from `main.tsx`; no relative import is unresolved. `npx eslint src/main.tsx src/live src/admin src/resident src/preview` exit 0 (before this change `main.tsx` was also clean). The 12 remaining ESLint errors in `src/utils` (`any`, one empty block) were there before.
- **Frontend, bundles** (three `vite build` runs to a scratch folder, not the real `dist`, no APK): web build 2,058 modules with `AdminLiveRoot` and `ResidentLiveRoot` chunks and nothing else; `--mode android-debug` with `ResidentLiveRoot` and `ConnectionPage`; `--mode android` with `ResidentLiveRoot` only. No file of any bundle contains a preview storage key, a sample account, a simulation tool or a legacy page name. (The android builds were given a throwaway HTTPS address, as CI does; the repository `.env` holds an `http://` address, which the build guard correctly refuses.)
- **Frontend, unit tests:** `node --test tests/*.test.mjs` 90 of 90. The browser journey was not run (it starts servers; the brief forbids it).
- **Android inputs:** `capacitor.config.ts`, `android/`, the workflow, `scripts/androidApiUrl.ts`, `utils/devBackend.ts`, `resident/devConnection/*` and `android/app/src/debug/AndroidManifest.xml` are present and unchanged; `build:android`, `build:android:debug` and `cap:sync` scripts and the three Capacitor packages are still in `package.json`.
- **Backend, static:** 276 files (`app`, `scripts`, `tests`, `scratch` removed, `check_db.py`) checked for broken `app.*` imports: 0 problems. All 140 `app` modules are reachable from `app.main` or `app.ai_worker`.
- **Backend, route registration without MySQL:** the 26 routers `app.main` includes were imported on the isolated throwaway SQLite database (never `app.main`, never MySQL) and the generated OpenAPI table has 295 method-and-path pairs, no duplicates, identical to the static decorator table (the 296th route is `GET /` inline in `main.py`). Nothing was removed from it.
- **Backend tests** (each script on its own throwaway SQLite file): in default mode `test_push_notifications`, `test_admin_invite`, `test_email_notifications`, `test_activity_timeline`, `test_report_status_sync`, `test_case_status_sync`, `test_resident_live_api` and `test_case_lifecycle` pass. `test_manual_matching`, `test_admin_003_admin_create_user`, `test_owner_warning_rules`, `test_case_review` and `test_false_alarm_auth` fail in default mode because they assert behavior of the retired Barangay accounts (403 "can no longer be provisioned", missing keys in refused responses); with `BARANGAY_WORKFLOWS_ENABLED=1`, the mode they were written for, all five pass (145/145, the admin-create script, 81/81, 24/24, 17/17), so the failures are the existing gate, not this change.
- **Documentation audit** (`npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`): the same 12 failures as before this change (8 broken links to the ERD, DFD and audit documents that do not exist, and 4 missing agent pointer files). The first run during this work also found one new broken link caused by the removal of `frontend/src/utils/heatmap.ts` (in `HEATMAP_RULES.md`); it was fixed, and the links to this record resolve now that it exists.
- **Not done, by instruction:** no server, tunnel, browser suite or APK build; no database, `.env` or account change; nothing staged, committed or pushed. The one denied action: removing the 21 throwaway test folders this run left in `%TEMP%` (16 MB; each holds one SQLite file) was refused by the permission system as a sweep of a shared folder, so they remain for the developer.

## Appendix: removed files

Source under `frontend/src/` (240):

```text
App.css
App.tsx
admin/AdminRoot.tsx
admin/auth/previewGateway.ts
admin/data/DataProvider.tsx
admin/data/reducer.ts
admin/data/seed.ts
admin/layout/PreviewBar.tsx
assets/dog_and_cat_running.gif
assets/dog_and_cat_running.webp
assets/hero.png
assets/react.svg
assets/straysafe_dog_running.gif
assets/straysafe_running_cat.gif
assets/straysafe_running_cat.webp
assets/vite.svg
components/AIPotentialMatchesList.tsx
components/AISuggestionPanel.tsx
components/ActivityPhotos.tsx
components/AdminSidebar.tsx
components/AiImageVerificationBadge.tsx
components/AnimalRecordsPanel.tsx
components/Auth/InactivityManager.tsx
components/Auth/SessionGuard.tsx
components/Button.tsx
components/CameraCapture.tsx
components/Cards/SummaryCard.tsx
components/CasePetBadge.tsx
components/CaseStageStepper.tsx
components/Chat/MessagesDrawer.tsx
components/Chat/MessagesDropdown.tsx
components/Chat/ReportChatBadge.tsx
components/Chat/ReportChatDrawer.tsx
components/CustomRadio.tsx
components/DataTable.tsx
components/DisputeMatchHistory.tsx
components/Dropdown.tsx
components/ErrorBoundary.tsx
components/GoogleSignInButton.tsx
components/GroupAISummary.tsx
components/HeatmapLayer.tsx
components/HeldPetOffer.tsx
components/History/CaseSummaryPanel.tsx
components/History/HistoryReportLayout.tsx
components/IdentityDisputePanel.tsx
components/InheritedIdentityNotice.tsx
components/InstallAppButton.tsx
components/LeaderIdentityConfirm.tsx
components/LostPets/LatestSightingBlock.tsx
components/LostPets/LostPetAlertSummary.tsx
components/LostPets/LostPetAlertView.tsx
components/LostPets/LostPetDashboardSection.tsx
components/LostPets/LostPetTrackingMap.tsx
components/LostPets/PinLocationInfo.tsx
components/LostPets/SpottedHereForm.tsx
components/LostPets/sightingMarkers.ts
components/LostPets/usePlaceNames.ts
components/LostPets/useReportSightings.ts
components/ManualMatching/ManualComparisonCards.tsx
components/ManualMatching/ManualMatchingWorkspace.tsx
components/MapComponent.tsx
components/MapControls/ReportMarkerSheet.tsx
components/MapControls/ReturnToSeleraButton.tsx
components/MediaLightbox.tsx
components/MergedSightingsReview.tsx
components/Modals/AIMatchReviewModal.tsx
components/Modals/CancelReportModal.tsx
components/Modals/CaseDetailsModal.tsx
components/Modals/ConfirmationModal.tsx
components/Modals/ForgotPasswordModal.tsx
components/Modals/MergeReportModal.tsx
components/Modals/NoticeModal.tsx
components/Modals/RejectTransferModal.tsx
components/Modals/ResolveLostPetModal.tsx
components/Modals/SubdReportModal.tsx
components/Modals/SuccessModal.tsx
components/Modals/TakeoverReportModal.tsx
components/Modals/TransferReportModal.tsx
components/Modals/UnmergeReportModal.tsx
components/Modals/WarningDetailsModal.tsx
components/Navbars/AdminNavbar.tsx
components/Navbars/LandingPageNavbar.tsx
components/Navbars/ResiMobileNav.tsx
components/Navbars/ResiNavbar.tsx
components/Navbars/SubdBottomNav.tsx
components/Navbars/SubdNavbar.tsx
components/NeedsReviewSightings.tsx
components/Notifications/AdminNotificationMenu.tsx
components/Notifications/NotificationPanel.tsx
components/Notifications/ToastContainer.tsx
components/Notifications/notificationPanel.css
components/OwnerCaseSightingCard.tsx
components/OwnerFollowUpCard.tsx
components/OwnerFollowUpOwnerPanel.tsx
components/OwnerObservationCard.tsx
components/OwnerObservationUpdateModal.tsx
components/OwnerReturnPicker.tsx
components/OwnerVerificationBlocks.tsx
components/PasswordRequirements.tsx
components/PendingOwnershipRequests.tsx
components/PetMatchConfirmationRequests.tsx
components/PetPhotoGuard.tsx
components/PetRecordRequestsForResident.tsx
components/PetRecordReviewPanel.tsx
components/PetRecords/AddPetModal.tsx
components/PetRecords/BehaviorHistoryField.tsx
components/PetRecords/MergePetRecord.tsx
components/PetRecords/PetDetailPanel.tsx
components/PetRecords/PetFollowUpSummary.tsx
components/PetRecords/PetTable.tsx
components/PetRecords/StatCard.tsx
components/PetRecords/types.ts
components/PhoneInput.tsx
components/PhotoCropper.tsx
components/ProtectedRoute.tsx
components/PushBridge.tsx
components/PushSettingsCard.tsx
components/Referral/BarangayReferralCard.tsx
components/RelativeTimestamp.tsx
components/RepeatedReportBanner.tsx
components/ReplaceAnimalPhotoButton.tsx
components/ReportDescription.tsx
components/ReportVisibilityPanel.tsx
components/ReportWarningNotices.tsx
components/RescueTimeline.tsx
components/RoleThemeSync.tsx
components/RoutingControl.tsx
components/SectionJumpNav.tsx
components/SeparateIncidentOverride.tsx
components/ServerSettings.tsx
components/Shared/MediaPreview.tsx
components/Shared/StatusBadge.tsx
components/StraySafeLoading.tsx
components/SubdOwnerUpdatesSection.tsx
components/SubdSidebar.tsx
components/analytics/AnalyticsCharts.tsx
components/analytics/AnalyticsDashboard.tsx
components/analytics/analytics.css
components/analytics/analytics.ts
components/icon.tsx
context/ThemeContext.tsx
context/ToastContext.tsx
pages/Admin/AdminAccountSettings.tsx
pages/Admin/AdminAnalytics.tsx
pages/Admin/AdminDashboard.tsx
pages/Admin/AdminHeatMap.tsx
pages/Admin/AdminLogin.tsx
pages/Admin/AdminLogs.tsx
pages/Admin/AdminPetManagement.tsx
pages/Admin/AdminReport.tsx
pages/Admin/AdminReportView.tsx
pages/Admin/AdminUserManagement.tsx
pages/Admin/AdminWarnings.tsx
pages/Admin/PetRecords.tsx
pages/BarangayExternal.tsx
pages/Subd_Leaders/CommunityStaffLogin.tsx
pages/Subd_Leaders/EndorsementArch.tsx
pages/Subd_Leaders/SubdAnalytics.tsx
pages/Subd_Leaders/SubdDashboard.tsx
pages/Subd_Leaders/SubdHazardAlert.tsx
pages/Subd_Leaders/SubdHistoryReport.tsx
pages/Subd_Leaders/SubdLostPetAlerts.tsx
pages/Subd_Leaders/SubdManualMatching.tsx
pages/Subd_Leaders/SubdMessages.tsx
pages/Subd_Leaders/SubdPetRecords.tsx
pages/Subd_Leaders/SubdProfile.tsx
pages/Subd_Leaders/SubdRemovedPetRecords.tsx
pages/Subd_Leaders/SubdReports.tsx
pages/Subd_Leaders/SubdSettings.tsx
pages/Subd_Leaders/SubdUnderObservation.tsx
pages/Subd_Leaders/SubdViewHistory.tsx
pages/Subd_Leaders/SubdViewReport.tsx
pages/citizen/LandingPage.tsx
pages/citizen/NoLongerAvailable.tsx
pages/citizen/PetMatchReview.tsx
pages/citizen/ReportStrayPage.tsx
pages/citizen/ResiHomePage.tsx
pages/citizen/ResiLostPets.tsx
pages/citizen/ResiObservations.tsx
pages/citizen/ResiProfile.tsx
pages/citizen/ResiViewReport.tsx
pages/citizen/ResidentPet.tsx
pages/citizen/ResidentSettings.tsx
pages/citizen/ResidentsLogin.tsx
preview/lib/previewFlags.ts
resident/ResidentRoot.tsx
resident/auth/previewGateway.ts
resident/data/DataProvider.tsx
resident/data/sampleOffice.ts
resident/data/seed.ts
routes/AppRoutes.tsx
tailwind.config.js
utils/animalPhoto.ts
utils/avatar.ts
utils/cache.ts
utils/casePrint.ts
utils/caseStages.ts
utils/caseSummary.ts
utils/caseTimeline.ts
utils/chatLinks.ts
utils/chatUtils.ts
utils/claimEvidence.ts
utils/cloudinaryImage.ts
utils/exportUtils.ts
utils/geocode.ts
utils/heatmap.ts
utils/iconCache.ts
utils/imageCompress.ts
utils/incidents.ts
utils/landmarkIcons.ts
utils/linkify.tsx
utils/liveNavigation.ts
utils/lostPets.ts
utils/manualMatchFields.ts
utils/monitoringLogs.ts
utils/notificationNavigation.ts
utils/originalSighting.ts
utils/ownerFollowUp.ts
utils/ownerFollowUpTime.ts
utils/ownerObservationUpdates.ts
utils/ownerObservationUpdatesApi.ts
utils/personnelAvailability.ts
utils/petAge.ts
utils/petClaimLink.ts
utils/petName.ts
utils/phone.ts
utils/placeName.ts
utils/push.ts
utils/pwaInstall.ts
utils/reportCondition.ts
utils/reportDescription.ts
utils/reportStatus.ts
utils/reportVisibility.ts
utils/serverAddress.ts
utils/sighting.ts
utils/useAutoRefresh.ts
utils/useCachedState.ts
utils/useSignedInUser.ts
utils/useUnreadMessageCount.ts
utils/visibleInterval.ts
```

Tests and fixtures under `frontend/tests/` (56):

```text
adminArchive.browser.mjs
adminRetirementPhase1.browser.mjs
adminSubdRetirementPhase2.browser.mjs
analytics.browser.mjs
barangayReferral.browser.mjs
barangayRetired.browser.mjs
caseStagesObservation.test.mjs
caseSummary.browser.mjs
chatCache.browser.mjs
claimEvidence.browser.mjs
claimEvidence.test.mjs
fixtures/analytics.html
fixtures/analytics.tsx
fixtures/caseSummary.tsx
fixtures/chatCache.tsx
fixtures/lostPets.html
fixtures/lostPets.tsx
fixtures/matchReview.tsx
fixtures/notifications.tsx
fixtures/petBehaviorHistory.tsx
fixtures/petClaimRecords.tsx
fixtures/petPhotoAccess.tsx
fixtures/phase1Maps.html
fixtures/phase1Maps.tsx
fixtures/phase5Pets.html
fixtures/phase5Pets.tsx
fixtures/phase6to8.html
fixtures/phase6to8.tsx
fixtures/retirementPhase2.html
fixtures/retirementPhase2.tsx
heatmapRules.test.mjs
historyCaseSummary.browser.mjs
locationIntelligence.browser.mjs
lostPets.browser.mjs
lostPets.test.mjs
manualMatchFields.test.mjs
matchReviewLocation.browser.mjs
monitoringLogs.test.mjs
notificationNavigation.test.mjs
notifications.browser.mjs
originalSighting.test.mjs
ownerObservationUpdates.test.mjs
personnelAvailability.test.mjs
petBehaviorHistory.browser.mjs
petClaimRecords.browser.mjs
petPhotoAccess.browser.mjs
petRegistrationRules.test.mjs
phase1Maps.browser.mjs
phase4FollowUpRules.test.mjs
phase5Pets.browser.mjs
phase6to8.browser.mjs
placeName.test.mjs
reportStatus.test.mjs
residentOwnerPrivacy.browser.mjs
residentRetired.browser.mjs
underObservation.browser.mjs
```

Under `frontend/public/` (8):

```text
assets/dog_and_cat_running.webp
assets/straysafe_dog_running.gif
assets/straysafe_running_cat.webp
icons.svg
icons/badge-96.png
leaflet.routing.icons.png
routing-icon.png
sw.js
```

Under `backend/` (3):

```text
scratch/audit_rescue_holding.py
scratch/audit_routes.py
scratch/test_remove_pet.py
```
