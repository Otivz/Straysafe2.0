# "Holding facility" renamed to "Holding place" in the interface

- **Date:** 2026-10-27 12:34 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/adoptions.py`, `backend/app/routes/holding.py`, `backend/app/routes/landmarks.py`, `backend/app/routes/report_split.py`, `backend/app/routes/reports.py`, `backend/app/routes/rescue.py`, `backend/app/schemas/adoption.py`, `backend/app/services/email_templates.py`, `backend/app/tasks/unassigned_checker.py`, `backend/app/utils/holding_stay.py`, `backend/app/utils/report_split.py`, `backend/tests/test_adoption_catalog_handover.py`, `frontend/src/components/AdminSidebar.tsx`, `frontend/src/components/AnimalRecordsPanel.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/src/components/MapComponent.tsx`, `frontend/src/components/MapControls/ReportMarkerSheet.tsx`, `frontend/src/components/Modals/AdoptionStaffStageModals.tsx`, `frontend/src/components/Modals/CompleteHandoverModal.tsx`, `frontend/src/components/Modals/ResolveLostPetModal.tsx`, `frontend/src/components/Navbars/SubdBottomNav.tsx`, `frontend/src/components/RescueTimeline.tsx`, `frontend/src/components/SubdSidebar.tsx`, `frontend/src/pages/Admin/AdminAccountSettings.tsx`, `frontend/src/pages/Admin/AdminReport.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPersonnelManagement.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`, `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`, `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`, `frontend/src/pages/Subd_Leaders/SubdSettings.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/citizen/LandingPage.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/utils/caseStages.ts`, `frontend/src/utils/landmarkIcons.ts`, `frontend/src/utils/sighting.ts`, `docs/05-operations/agents/feature-updates/2026-10-27_1234_holding-facility-to-holding-place.md`
- **Authorization:** the developer's request "Also All Holding facilty should change into Holding place".
- **Type:** Polish

## Intent

Use "Holding place" instead of "Holding facility" everywhere users read it.

## Key changes

- 178 visible texts changed, keeping their case ("Holding Facility" → "Holding Place", "HOLDING FACILITY" → "HOLDING PLACE", plurals "Holding Places"): sidebar and bottom-nav labels, page titles, buttons, modal text, map labels, the rescue timeline ("Moved to Holding Place"), and backend messages, notifications, error details and new history and holding-timeline notes (for example "Animal Admitted to Holding Place", "Released from holding place to adopter ...").
- Text checks that find facility events in saved notes now accept both "holding facility" and "holding place" (15 places, including `facility_keywords` in `reports.py`), so records saved before this change still match.
- Not changed: code names and comments, Python docstrings, the internal map marker category `'Holding Facility'` (a key compared in code, never shown), URLs such as `/brgy/holding-facility`, database tables and columns, and names already stored in the database (landmark names, earlier history notes).
- `test_adoption_catalog_handover.py` now expects the new holding-timeline title "Released from holding place".

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 passed, 0 failed.
- Every changed backend file parses. Isolated backend tests (own SQLite database): adoption catalog handover 27/27, holding stay clock 17/17, case gating 20/20, multi-animal split 114/114, holding privacy 23/23, pet handover sync 15/15, report original location and match review location OK.
- Not checked in a browser. Project documents under `docs/` still say "holding facility".
