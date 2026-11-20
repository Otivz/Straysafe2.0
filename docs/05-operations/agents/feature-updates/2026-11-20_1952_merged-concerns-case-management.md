# Consolidated Case Management for Merged Injured and Dangerous Animal Reports

- **Date:** 2026-11-20 19:52 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/main.py`, `backend/app/models/__init__.py`, `backend/app/models/case_concern.py`, `backend/app/routes/cases.py`, `backend/app/routes/reports.py`, `backend/app/schemas/case.py`, `backend/app/services/case_concerns.py`, `backend/app/services/case_lifecycle.py`, `backend/app/services/case_view.py`, `backend/tests/test_merged_concerns_case_management.py`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/data/constants.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/dialogs/ClosureDialogs.tsx`, `frontend/src/admin/dialogs/ConcernResolutionDialog.tsx`, `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/ConcernsSection.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`
- **Authorization:** User request in chat ("Implement Proper Case Management for Merged Injured Animal and Dangerous Animal Reports")
- **Type:** Feature

## Intent

When an Injured Animal report and a Dangerous Animal (`safety`) report are merged into one master case, each concern must retain its own independent assessment and resolution status so resolving one concern does not prematurely close the master case while other concerns remain active, and all merged report details remain preserved and accessible.

## Key changes

- **Independent Concern Model & Lifecycle (`backend/app/models/case_concern.py`, `backend/app/services/case_concerns.py`, `backend/app/main.py`):** Added the `case_concerns` table and `case_concerns` service (`sync_concerns_on_merge`, `detach_concern_on_unmerge`, `concerns_for_case`, `unresolved_concerns`, `update_concern`), automatically initialized at startup and backfilled for merged cases.
- **Endpoints & Closure Guards (`backend/app/routes/cases.py`, `backend/app/routes/reports.py`, `backend/app/schemas/case.py`, `backend/app/services/case_lifecycle.py`):**
  - Added `PUT /cases/{report_id}/concerns/{concern_id}` to update or resolve individual concerns independently (enforcing Animal Welfare Outcome for `injured` and Dangerous Animal Outcome + `threat_ongoing != "Yes"` for `safety`) without auto-closing the master case.
  - Updated `disposition_availability` and `close_case` so consolidated master cases cannot close prematurely (for non-invalid/duplicate/withdrawn dispositions) until all associated concerns reach `resolved` or `not_applicable`, while preserving pre-merge status restoration on unmerge.
- **Full Merged Report Preservation (`backend/app/services/case_view.py`, `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`):** Enriched `merged_reports` with original report ID, category, original status before merge, description, condition, landmark & GPS coordinates, reporter contact details, submission timestamps, `Merged into Case #CASE-ID` label, and clickable original media gallery; renamed the section from `Linked Reports` to `Merged Reports`.
- **Consolidated Concerns UI & Closure Dialog (`frontend/src/admin/pages/case/ConcernsSection.tsx`, `frontend/src/admin/dialogs/ConcernResolutionDialog.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/dialogs/ClosureDialogs.tsx`, `frontend/src/admin/data/selectors.ts`):** Added the **Consolidated Concerns** panel displaying independent per-concern badges and resolution modals, and pre-filled/guarded `CloseCaseDialog` when unresolved concerns remain.
- **Tests (`backend/tests/test_merged_concerns_case_management.py`):** Verified isolated end-to-end merging, independent concern resolution, premature closure blocking, `threat_ongoing` validation, preserved fields/media, and unmerge restoration.

## Validation evidence

- `python tests\test_merged_concerns_case_management.py` in `backend/`
- `python -m py_compile` on touched backend modules
- `npm run build` (`tsc -b && vite build`) in `frontend/`
- `npx eslint` on new/edited frontend files
