# Remove Duplicate History Heading from Case History Tab

- **Date:** 2026-11-21 17:59 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/HistoryTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_1759_remove-duplicate-history-heading.md`
- **Authorization:** Explicit developer request (`"FEATURE 4: REMOVE DUPLICATE HISTORY HEADING"`).
- **Type:** Polish

## Intent

Remove the redundant internal `"History"` heading inside `HistoryTab.tsx` that repeated the `"History"` tab label while retaining the description line, filter controls, and event timeline.

## Key changes

- `frontend/src/admin/pages/case/HistoryTab.tsx`: Removed `title="History"` from `<Block>` and rendered the existing description line (`"Every significant update, decision and status change, with who made it and when."`) directly above the history filter bar with matching spacing (`sa-small sa-text-3 mb-3.5`).

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
