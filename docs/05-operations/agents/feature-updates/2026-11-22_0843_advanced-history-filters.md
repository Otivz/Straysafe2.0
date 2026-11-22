# Advanced History Filters

- **Date:** `2026-11-22 08:43 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/pages/case/HistoryTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-22_0843_advanced-history-filters.md`
- **Authorization:** User request — FEATURE 15: ADVANCED HISTORY FILTERS ("Make it easier to find specific activities in a case history.")
- **Type:** `Feature`

## Summary

- Updated `frontend/src/admin/pages/case/HistoryTab.tsx` to add:
  - **All Activities** (`all`) filter label alongside the existing **Status & priority**, **Actions**, **Assessment**, and **Notes** categories.
  - Dedicated **Referrals** (`['referral', 'referral_update']`) and **Warnings** (`['warning', 'compliance']`) filter options. (A dedicated `Messages` filter was omitted because `EventKind` in `types.ts` has no separate message event type.)
  - A **SearchInput** (`Search history by activity, actor, or change…`) that filters case history across event titles, details, actor names, and before-and-after change fields, working together with the selected category filter and the date-grouped `EventTimeline`.
  - A compact **EmptyState** with a **Clear filters** action when no matching records exist.
- Kept filtering strictly non-destructive in memory over `c.timeline` without modifying stored history records.
