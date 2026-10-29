# Adoption removed from the frontend (Batch 2)

- **Date:** 2026-10-28 10:09 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:**
  - Deleted: `frontend/src/components/Adoption/AdoptionCasePanel.tsx`, `frontend/src/components/Adoption/AdoptionCertificateDocument.tsx`, `frontend/src/components/Adoption/AdoptionCertificatePanel.tsx`, `frontend/src/components/Adoption/AdoptionCertificateViewer.tsx`, `frontend/src/components/Adoption/CertificateSyncBar.tsx`, `frontend/src/components/Adoption/adoptionDetails.css`, `frontend/src/components/AdoptionStageStepper.tsx`, `frontend/src/components/Modals/AdoptionAgreementModal.tsx`, `frontend/src/components/Modals/AdoptionCertificateModal.tsx`, `frontend/src/components/Modals/AdoptionMonitoringModal.tsx`, `frontend/src/components/Modals/AdoptionStaffStageModals.tsx`, `frontend/src/pages/Barangay_Staff/BrgyAdoptionTasks.tsx`, `frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx`, `frontend/src/pages/citizen/AdoptionApplyForm.tsx`, `frontend/src/pages/citizen/AdoptionCatalog.tsx`, `frontend/src/pages/citizen/AnimalJourneyMap.tsx`, `frontend/src/pages/citizen/MyAdoptionApplications.tsx`, `frontend/src/pages/citizen/VerifyAdoptionCertificate.tsx`, `frontend/src/utils/adoptionStatus.ts`, `frontend/src/utils/useAdoptionChatUnread.ts`, `frontend/tests/adoptionDetails.browser.mjs`, `frontend/tests/fixtures/adoptionDetails.tsx`, `frontend/tests/fixtures/certificateViewer.tsx`
  - Edited: `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/AdminSidebar.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/src/components/Navbars/AdminNavbar.tsx`, `frontend/src/components/Navbars/BrgyNavbar.tsx`, `frontend/src/components/Navbars/LandingPageNavbar.tsx`, `frontend/src/components/Navbars/ResiNavbar.tsx`, `frontend/src/components/Navbars/SubdNavbar.tsx`, `frontend/src/components/Chat/ReportChatDrawer.tsx`, `frontend/src/components/Chat/MessagesDropdown.tsx`, `frontend/src/utils/useUnreadMessageCount.ts`, `frontend/src/utils/chatLinks.ts`, `frontend/src/pages/Barangay_Staff/BrgyMessages.tsx`, `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`, `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`, `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `frontend/src/pages/Admin/AdminDashboard.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/src/components/PetRecords/types.ts`, `frontend/src/components/analytics/AnalyticsDashboard.tsx`, `frontend/src/components/analytics/analytics.ts`, `frontend/src/components/PushSettingsCard.tsx`, `frontend/src/components/RescueTimeline.tsx`, `frontend/src/components/AnimalRecordsPanel.tsx`, `frontend/src/components/Auth/InactivityManager.tsx`, `frontend/src/components/Auth/SessionGuard.tsx`, `frontend/src/pages/citizen/LandingPage.tsx`, `frontend/src/pages/citizen/ResiHomePage.tsx`, `frontend/src/pages/citizen/ResidentSettings.tsx`, `frontend/src/pages/citizen/ResidentsLogin.tsx`, `frontend/src/utils/caseStages.ts`, `frontend/src/utils/caseTimeline.ts`, `frontend/src/utils/dataRefresh.ts`, `frontend/src/utils/useSignedInUser.ts`, `backend/app/routes/admin.py`
  - Edited tests: `frontend/tests/chatCache.browser.mjs`, `frontend/tests/fixtures/chatCache.tsx`, `frontend/tests/petPhotoAccess.browser.mjs`, `frontend/tests/fixtures/petPhotoAccess.tsx`, `frontend/tests/dataRefresh.test.mjs`
  - Docs: `docs/06-future-proposals/REMOVE_ADOPTION_PLAN.md`, `docs/README.md`, this record
- **Authorization:** the developer: the panel did not approve adoption; "1. yes" to removing it from the whole system; "4. after the 7 days Impound is the only option also it can extend the hold whenever it wants to"; then "Lets do it remove the adoption feature".
- **Type:** Fix (scope reduction: removes a feature the panel rejected)

## Intent

Batch 2 of `REMOVE_ADOPTION_PLAN.md`: no page, menu, link, badge, chat or notification in the frontend offers or mentions adoption, and nothing calls the removed adoption endpoints.

## Key changes

- Routes: `/adopt`, `/adopt/*`, `/verify/certificate/*`, `/brgy/adoptions`, `/brgy/adoption-tasks`, `/admin/adoptions` and the adoption journey map are gone, along with their pages and components.
- Menus: the Adoptions and Adoption Tasks sidebar entries and their badge polling (`/adoption-tasks/count`, `pending_adoptions`) are removed, as are the resident "Adopt a Pet" / "My Adoption Requests" links, the landing navbar link, the landing banner and the footer link.
- Chat: the drawer's `adoption` mode, the inbox's Adoptions filter and adoption threads, and the `/chat/adoptions/threads` polling are removed. The unread-count hook is now one shared store with no adoption option.
- Holding (Barangay): the "Adopt Out" / "Promote to adoption" buttons, the catalog panel, the withdraw action and the promote modal are removed. After the stay limit the only action offered is Impound. Statuses 6 and 7 are no longer listed. The stay-limit setting is now saved as `holdingStayDays` (older saves under `adoptionGraceDays` reset to the default).
- Holding (Subdivision): the "For Adoption" tile and statuses are removed, and the transfer text now says impoundment only.
- Dashboards: the admin Adoption Overview card and Adoptions shortcut are removed. Community Impact shows "Animals Impounded" (new `impounded_count` in `GET /admin/dashboard-stats`), and the Barangay "Up for Adoption" tile is now "Impounded".
- Pet records: the adoption lock and the "Barangay adoption handover" verification method are removed.
- Analytics: the admin Adoption Applications card is replaced by the Owner warnings breakdown (already shown to other roles). The CSV export no longer has an adoption cohort.
- Notifications, push settings, case timelines and outcome labels no longer handle adoption.
- Kept on purpose: the closed-custody lists that include `'Adopted'` (they only mark a case closed), the logout cache-clear prefix `straysafe_adoption_chat_` (removes leftovers on old devices) and the unnamed-pet label `adopted pet`.
- Not built here: extending a hold. It belongs to the planned 7-day claim rule.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- `node --test tests/*.test.mjs`: 46 of 46 pass.
- ESLint on every changed file, compared with the same files at `HEAD`: no file has more problems than before (462 before, 457 after; all are pre-existing).
- Browser tests (Vite on 5173, mocked API): `chatCache` (moved to a report chat), `petPhotoAccess`, `claimEvidence`, `matchReviewLocation`, `notifications`, `petBehaviorHistory`, `petClaimRecords` all pass at 1280px and 390px.
- Not done: a manual click-through of the changed pages by the developer.
