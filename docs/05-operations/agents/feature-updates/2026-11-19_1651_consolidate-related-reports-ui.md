# Consolidate Related Reports Section on Case Details Page

- **Date:** 2026-11-19 16:51 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`, `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `docs/README.md`
- **Authorization:** User UI/UX improvement request ("CONSOLIDATE RELATED REPORTS SECTION")
- **Type:** Polish

## Intent

Eliminate the duplicate candidate headings (`Related Report Review` and `Possibly related`) on the Case Details page and present all potentially related reports under a single unified **Related Reports** section with consistent, responsive cards and no fabricated scores.

## Key changes

- **`frontend/src/admin/pages/case/RelatedReportsBlock.tsx`**:
  - Consolidated `dupCandidates` and `localSuggestions` into one deduplicated candidate list under the unified **Related Reports** section header.
  - Added the required subtitle (`"Reports with similar incident details based on location, animal information, and incident date."`) and live candidate count summary (`"N potentially related report(s) found."`).
  - Standardized all candidate cards with consistent borders, rounded corners, responsive layout, reference number, category badge, classification/score badge (with subtle amber emphasis for `Strongly Related`), location & approximate distance, date/time comparison, species/breed/colour badges (only when available), and a **Compare & Review** button opening `DuplicateReviewDialog`.
  - Added the clean empty state (`"No Related Reports Found"` / `"Other reports with similar incident details will appear here when available."`) and preserved `Linked Reports`, `Linked Cases`, `Link Reports`, and `Unlink` functionality.
- **`frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`**:
  - Guarded `Overall Similarity: {overallPct}%` with `hasComputedScores` so local suggestions without computed backend attribute scores never display a `0%` score.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified after final edit.
