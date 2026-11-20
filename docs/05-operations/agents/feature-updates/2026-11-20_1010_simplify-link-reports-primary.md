# Keep Current Case as Primary When Linking Related Reports

- **Date:** 2026-11-20 10:10 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_1010_simplify-link-reports-primary.md`
- **Authorization:** User confirmed removing the redundant primary-report radio selector from `Confirm Relationship & Link Reports` when linking from an active case (`"Okayyyy gooo"`).
- **Type:** Polish

## Intent

Eliminate the redundant two-option primary report selector in `DuplicateReviewDialog.tsx` when confirming a relationship from an open case, so the current report remains primary automatically and the callout copy separates the primary and linked report IDs cleanly.

## Key changes

- **`frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`:**
  - Kept the open case (`currentRid` / `c.id`) as `primary_report_id` automatically in `doLink`.
  - Replaced the two-option `OptionGroup` (`Select Primary Report`) with a single read-only summary card showing only the candidate report being linked (`candidate.reference`).
  - Added punctuation to the `Callout` title (`Primary incident record: ${c.id}.`) so the two report IDs no longer run together inline.
- **`docs/README.md`:** Indexed this change record.

## Validation evidence

- `npm run build` (`tsc -b && vite build`) and `npx eslint src/admin/dialogs/DuplicateReviewDialog.tsx` inside `frontend/`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
