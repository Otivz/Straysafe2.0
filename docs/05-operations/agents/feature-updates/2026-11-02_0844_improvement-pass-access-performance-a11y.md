# Improvement pass: announcement access, holding list performance, build, accessibility

- **Date:** 2026-11-02 08:44 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:**
  - backend: `backend/app/routes/announcements.py`, `backend/app/utils/adoption_eligibility.py`, `backend/app/routes/holding.py`;
  - tests: `backend/tests/test_announcement_access.py`, `backend/tests/test_announcement_security.py`, `backend/tests/test_holding_list_queries.py`;
  - build fix: `frontend/src/components/MediaLightbox.tsx`, `frontend/src/components/Modals/AIMatchReviewModal.tsx`;
  - close-button labels: `frontend/src/components/AdminSidebar.tsx`, `frontend/src/components/AnimalRecordsPanel.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/src/components/SubdSidebar.tsx`, `frontend/src/components/PhotoCropper.tsx`, `frontend/src/components/Modals/AdoptionAgreementModal.tsx`, `frontend/src/components/Modals/AdoptionMonitoringModal.tsx`, `frontend/src/components/Modals/AdoptionStaffStageModals.tsx`, `frontend/src/components/Modals/CompleteHandoverModal.tsx`, `frontend/src/components/Modals/PetRecoveryModal.tsx`, `frontend/src/components/Modals/QRScannerModal.tsx`, `frontend/src/components/Modals/ResolveLostPetModal.tsx`, `frontend/src/components/Modals/SubdReportModal.tsx`, `frontend/src/components/Modals/WarningDetailsModal.tsx`, `frontend/src/components/PetRecords/AddPetModal.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`;
  - image alt text: `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/citizen/ReportStrayPage.tsx`, `frontend/src/pages/citizen/ResiHomePage.tsx`;
  - docs: `docs/01-system/ADOPTION_ELIGIBILITY_RULES.md`, `docs/04-testing/README.md`, `docs/README.md`.
- **Authorization:** Developer request in Claude Code: improve functionality, reliability, usability and performance across the codebase. The developer chose all four focus areas and "no commits; leave for review". FREEZE was OFF.
- **Type:** Fix

## Findings and changes

1. **Security / privacy: announcement reads were open to anyone.**
   - **Before:** `GET /announcements/subdivision/{id}` and `/announcements/barangay/{id}` needed no login and returned every status, including Draft, Archived and "Subdivision Only" posts with commenter names. `GET /announcements/feed/resident/{user_id}` returned any user's subdivision-only posts to anyone who guessed an ID.
   - **Now:**
     - the subdivision listing is for staff or Admin within scope (`verify_subdivision_scope`);
     - the barangay listing is for that barangay's staff or an Admin;
     - the resident feed is only for the resident themselves, or an Admin.
   - All three frontend callers are signed-in pages, so nothing breaks. An earlier test, `test_announcement_security.py`, deliberately asserted public reading. It now asserts the new rule. **Developer decision:** if anonymous reading of published public alerts was intended, say so; it can be offered as a separate, published-only endpoint.
2. **Performance: holding list N+1 queries.** Measured on isolated SQLite at 20 animals: `GET /holding/` made **144 queries** (about 7 per animal). It now makes **10, constant**:
   - the owner-return evidence is computed in one batch (`owner_handover_evidence_map`, same rules and reasons);
   - the database time is read once;
   - pets are loaded once.
3. **Reliability: `npm run build` failed** at the type-check step. Two unused declarations in `MediaLightbox.tsx` and `AIMatchReviewModal.tsx` (reported in earlier records) were removed. Type check and bundle now pass.
4. **Accessibility:**
   - 23 icon-only close buttons (modals, sidebars, cropper) had no accessible name; they now have `aria-label="Close"`. Only buttons that call a close handler and contain nothing but an icon were changed.
   - 8 images got `alt` text: report photos, upload previews, and an empty `alt` for the map pin avatar.

## Measured but not changed (next candidates)

- `GET /claims/` takes about 7 queries per claim (custody and adoption checks per claim): 149 at 20 claims.
- `GET /owner-followups/under-observation` takes about 13 queries per observation (warnings, endorsement, logs, media per item): 265 at 20. It also creates records during a GET.
- The report list `GET /reports/` is already constant (18 queries).
- 35 buttons remain that the heuristic scan couldn't confirm as unnamed icon-only buttons. They need a manual check.

## Validation evidence

- **Backend:**
  - `tests/test_announcement_access.py`: 16/16.
  - `tests/test_announcement_security.py`: 23/23.
  - `tests/test_holding_list_queries.py`: 11/11. The batch matches the per-animal check exactly, and the query count doesn't grow.
  - Related suites pass: adoption eligibility 29/29, holding leader view 25/25, holding privacy 23/23, stay clock 17/17, phase-2 custody 18/18.
  - Every backend test script that sets its own SQLite database ran: **100 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run.
- **Frontend:**
  - `npm --prefix frontend run build` (tsc and vite) passed.
  - `node --test tests/*.test.mjs`: 86/86.
- **Not verified:**
  - a screen reader run;
  - browser runs of the relabelled modals (attribute-only changes);
  - timings against the real MySQL data.
- **Git:** no commits, per the developer.
