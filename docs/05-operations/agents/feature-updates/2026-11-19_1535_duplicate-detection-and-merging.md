# Duplicate Report Detection and Report Merging Enhancement

- **Date:** 2026-11-19 15:35 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/duplicate_detection.py`, `backend/app/schemas/report.py`, `backend/app/schemas/case.py`, `backend/app/routes/cases.py`, `backend/app/routes/reports.py`, `backend/app/services/case_summaries.py`, `backend/app/services/case_view.py`, `backend/app/services/analytics_service.py`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`, `docs/README.md`
- **Authorization:** User request for Feature Enhancement: Duplicate Report Detection and Report Merging Process
- **Type:** Feature

## Intent

Audit and upgrade STRAY-SAFE 2.0's duplicate report detection, review, controlled merging/unmerging, and analytics counting so multi-attribute candidates are scored accurately (with Animal Type as a mandatory filter), never auto-merged, reviewed side by side by authorized staff, consolidated with full record/reporter/evidence preservation, and excluded from duplicate incident counts.

## Key changes

1. **Multi-Attribute Duplicate Detection (`backend/app/utils/duplicate_detection.py`)**:
   - Enforced mandatory animal type compatibility (`animal_types_compatible`).
   - Weighted scoring: Location (25%, Haversine meters + landmark), Date & Time (20%, `seen_at` preferred over `created_at`), Description (20%, token overlap + distinctive trait boost), Photo / Visual (25%, stored `ReportMatch` score or AI visual attributes), and Other Info (10%, category, size, breed).
   - Safe missing-attribute weight redistribution and configurable classification thresholds (`High Similarity – Suggested Duplicate`, `Potential Duplicate`, `Low Similarity`, `Not a Duplicate`).
2. **Backend Review, Controlled Merge & Unmerge (`backend/app/routes/cases.py`, `backend/app/routes/reports.py`)**:
   - Added `GET /cases/{id}/duplicates` and `POST /cases/{id}/duplicates/decision` (`not_duplicate` with mandatory reason, or `defer`) with `AuditLog` + `StatusHistory` recording.
   - Enhanced `/reports/merge-group` with optional explicit `primary_report_id` selection, preserved original reporters/evidence/descriptions/history, and updated resident notification wording.
   - Enhanced `/reports/{id}/unmerge` to restore `case_status` and `closure_disposition` cleanly while preserving merge audit history.
3. **Dashboard & Analytics Counting (`backend/app/services/case_summaries.py`, `case_view.py`, `analytics_service.py`)**:
   - Excluded merged duplicate reports (`duplicate_of_report_id IS NOT NULL` / status `18`) from `case_summaries` so merged reports no longer double-count in dashboard stats or appear as active independent cases.
   - Exposed `merged_reports` and `duplicate_of_report_id` in `case_view.py`, and `unique_incidents`, `merged_duplicates`, and `submitted_reports` in `analytics_service.py`.
4. **Admin Duplicate Review & Unmerge UI (`DuplicateReviewDialog.tsx`, `RelatedReportsBlock.tsx`)**:
   - Added **Duplicate Report Review** list, side-by-side comparison dialog with attribute score bars, controlled **Merge Reports** confirmation with Primary Report selection, **Mark as Not a Duplicate** with mandatory reason, **Defer Review**, `"MERGED INTO ..."` indicators, and **Unmerge** workflow.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`) succeeded with zero errors.
- `.venv\Scripts\python -m py_compile` passed across all modified backend files.
- Automated Python tests (`DUPLICATE_DETECTION_TESTS_PASSED`) verified mandatory animal type filtering (`Dog` vs `Cat` ineligible), Haversine distance & description scoring (`0.9867`, `39.7 m`), and safe missing-attribute weight redistribution.
