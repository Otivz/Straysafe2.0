# Feature Update: Duplicate Report Alert Banner at Top of Case

- **Date:** 2026-11-22 13:33 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/case/CaseDetailPage.tsx`
  - `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`
- **Authorization:** User request to display a compact duplicate report alert banner at the top of a case when similar reports are detected.
- **Type:** Feature

## Summary

- Added a non-blocking `adminApi.duplicates` lookup in `CaseDetailPage.tsx` for open, non-merged standard cases.
- Rendered a compact warm-amber banner (`N similar report(s) detected · Top match ...`) above the workspace tabs with a 1-click **Review & Link** button.
- Added `id="related-reports"` to `RelatedReportsBlock.tsx` so clicking **Review & Link** switches to the Overview tab and scrolls directly to the **Related Reports** section.
