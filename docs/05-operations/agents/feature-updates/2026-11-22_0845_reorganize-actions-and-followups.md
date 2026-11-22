# Reorganize Actions and Follow-ups

- **Date:** `2026-11-22 08:45 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-22_0845_reorganize-actions-and-followups.md`
- **Authorization:** User request — FEATURE 16: REORGANIZE ACTIONS AND FOLLOW-UPS ("Make important pending tasks more visible to the Subdivision Leader.")
- **Type:** `Feature`

## Summary

- Updated `frontend/src/admin/pages/case/ActionsTab.tsx`:
  - Moved the **Follow-ups** panel above the **Response actions** tile grid so pending and overdue tasks are immediately visible.
  - Prioritized overdue follow-ups at the top of the list (followed by due-today, upcoming, and undated tasks), added pending/overdue header badges, highlighted overdue and due-today rows, and displayed exact due dates (`fmtDateTime(f.dueAt)`) alongside relative due indicators (`dueInfo`).
  - Added a collapsible **Completed follow-ups** summary below pending tasks.
  - Preserved the separate **Record Follow-up** and **Record owner coordination** tiles, **Issue warning**, **Record compliance** (active warning required), and **Add internal note**, without reintroducing removed referral or advisory tiles.
- Updated `frontend/src/admin/pages/case/OverviewTab.tsx`:
  - Added a **Recent internal notes** panel in the Overview sidebar displaying up to the 3 most recent staff-only notes (`c.notes`), with an **Add internal note** button and a link to **History** when more than 3 notes exist.
