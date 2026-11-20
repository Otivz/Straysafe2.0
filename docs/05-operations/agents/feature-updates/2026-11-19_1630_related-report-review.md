# Related Report Detection and Review Redesign

- **Date:** 2026-11-19 16:30 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/duplicate_detection.py`, `backend/app/routes/cases.py`, `backend/app/routes/reports.py`, `backend/app/services/analytics_service.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`, `docs/README.md`
- **Authorization:** User feature update request ("RELATED REPORT DETECTION AND REVIEW")
- **Type:** Feature

## Intent

Rename and redesign Duplicate Report Detection and Review into **Related Report Review** using conventional database and text-based attribute comparison only (without AI, computer vision, or photo similarity scoring), enforcing mandatory Species/Animal Type compatibility filtering before scoring and preserving backward-compatible database tables and API endpoints.

## Key changes

- **`backend/app/utils/duplicate_detection.py`**: Removed all photo/visual similarity scoring; enforced `animal_types_compatible` before scoring; implemented 6 configurable attribute weights (`location: 0.25`, `breed: 0.15`, `colour: 0.15`, `description: 0.20`, `date: 0.15`, `time: 0.10`) with missing-attribute weight redistribution and `Insufficient Information` classification when fewer than 2 attributes are available; added `Strongly Related`, `Potentially Related`, `Low Similarity`, and `Not Related` classifications; retained `photo_urls` as supporting evidence only.
- **`backend/app/routes/cases.py`**: Updated audit log action/notes (`RELATED_REPORT_DETECTION_RUN`) and `Not Related` wording in `list_duplicate_candidates` and `decide_duplicate_candidate`.
- **`backend/app/routes/reports.py`**: Updated `_merge_one` `StatusHistory` remarks to `Linked as Related Report to primary Case #...` and `Linked Related Report #...`.
- **`backend/app/services/analytics_service.py`**: Added `primary_reports`, `linked_reports`, and `related_reports` counters to `case_lifecycle_summary`.
- **`frontend/src/admin/live/api.ts`**: Updated `adminApi.duplicates` candidate types with `breed`, `color`, `species_status`, `location_class`, and the 6-attribute `scores` keys (`location`, `breed`, `colour`, `description`, `date`, `time`).
- **`frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`**: Redesigned the modal as **Related Report Review** with `Current Report` and `Related Report` side-by-side cards, supporting photos marked for manual review only, separate Species compatibility badge, 6-attribute breakdown bars, `Defer Review`, `Mark as Not Related`, and `Confirm Relationship & Link Reports`.
- **`frontend/src/admin/pages/case/RelatedReportsBlock.tsx`**: Updated user-facing headings, empty states, and badges (`Related reports`, `Related Report Review`, `Linked Reports`, `LINKED TO`, `Unlink`, `No potentially related reports detected.`).

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): exited with code 0.
- `.venv\Scripts\python -m py_compile backend/app/utils/duplicate_detection.py backend/app/routes/cases.py backend/app/routes/reports.py backend/app/services/analytics_service.py`: exited with code 0.
- Python unit tests against `app.utils.duplicate_detection.score_pair`: verified species mismatch exclusion (`Dog` vs `Cat`), 6-attribute scoring without `visual` key, `Strongly Related` classification, and `Insufficient Information` fallback when fewer than 2 attributes are present.
