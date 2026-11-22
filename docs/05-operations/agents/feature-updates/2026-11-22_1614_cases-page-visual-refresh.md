# Cases page visual refresh (card grid kept)

- **Date:** 2026-11-22 16:14 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/styles/pages.css`
- **Authorization:** Developer request in session to redesign the Subdivision Admin Cases page while keeping the three-column case cards (header, statistics, Active / Closed / All tabs, search and filters, card spacing and badges, urgent emphasis, responsive 3 / 2 / 1 columns).
- **Type:** Polish

## Intent

A cleaner, consistent Cases page that keeps its card grid and every filter, sort and link.

## Key changes

- Header uses the same pattern as the dashboard (subdivision and active-case count, title, description).
- Statistics reuse the dashboard KPI cards as buttons; the one matching the current filter is marked (`aria-pressed`); urgent shows a red value and border only.
- Active / Closed / All is a segmented pill with counts; search, Category and Sort are labelled controls in one toolbar card; "Clear filters" when any filter is set; a result line ("Showing x–y of n") above the grid.
- Cards: ID chip, category and animal, priority mark on top; 84 px media (photo or video, previous / next, counter, opens the viewer); two-line title and description; status and closure badges on their own row; place, date and View in the footer. Urgent open cases get a thin red left rule and tinted border, high priority an amber rule.
- Grid 3 columns, 2 at 1180 px and below, 1 at 720 px and below; toolbar stacks on phones; reduced-motion respected. Inline `<style>` and hardcoded hex colours removed in favour of design tokens.
- Same filters (status, category, priority via URL, sort, search), pagination, navigation and media viewer as before.

## Validation evidence

- `npx tsc --noEmit -p .` and `npx eslint src/admin/pages/CasesPage.tsx` in `frontend/`: no errors.
- Not viewed in a browser yet.
