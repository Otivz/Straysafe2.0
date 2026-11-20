# Document Report Resolution, Linking, and Merging Rules

- **Date:** 2026-11-20 10:34 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `docs/01-system/REPORT_RESOLUTION_LINKING_AND_MERGING.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_1034_report-resolution-linking-merging-doc.md`
- **Authorization:** User requested creating an `.md` reference file (`"create an md file"`) covering how each report category resolves alone, when linked, and when merged.
- **Type:** Feature

## Intent

Provide a clear system reference document (`docs/01-system/REPORT_RESOLUTION_LINKING_AND_MERGING.md`) verified against backend lifecycle/closure hooks (`case_vocab.py`, `case_lifecycle.py`, `case_closure.py`, `case_work.py`, `reports.py`) and admin dialogs (`DuplicateReviewDialog.tsx`, `RelatedReportsBlock.tsx`).

## Key changes

- **`docs/01-system/REPORT_RESOLUTION_LINKING_AND_MERGING.md`:** Documented global statuses, all 9 closure dispositions, category-by-category resolution rules for all 6 report types, Merge (`/reports/merge-group`) vs. Link (`CaseLink`) behavior including `close_linked_reports` auto-closure, and server-side closure guards (`disposition_availability`).
- **`docs/README.md`:** Indexed `01-system/REPORT_RESOLUTION_LINKING_AND_MERGING.md` and this change record.

## Validation evidence

- Verified every rule against `backend/app/utils/case_vocab.py`, `backend/app/services/case_lifecycle.py`, `backend/app/utils/case_closure.py`, `backend/app/services/case_work.py`, `backend/app/routes/reports.py`, and `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
