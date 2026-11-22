# Subdivision Admin dashboard visual refresh

- **Date:** 2026-11-22 16:11 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/src/admin/styles/pages.css`
- **Authorization:** Developer request in session to redesign the Subdivision Admin dashboard (header, KPI cards, "Needs your attention", "Missing and found animals", column balance, consistent cards, responsive), keeping all functionality and live data.
- **Type:** Polish

## Intent

Make the dashboard calmer and more consistent without changing what it shows or where its numbers come from.

## Key changes

- Styling moved from hardcoded hex colours and an inline `<style>` block to `sa-dash-*`, `sa-kpi*`, `sa-sec*`, `sa-ccard*`, `sa-due`, `sa-mf*` classes in `pages.css`, built only on the existing design tokens (brand orange, sand, line, red/amber).
- Header: date and subdivision eyebrow, greeting, summary sentence, actions; actions stack on phones.
- KPI cards: one size, label + icon chip, large value, hint; urgent / overdue shown by a tinted border and red value only.
- "Needs your attention": compact cards with ID chip, priority badge, category, age, title, condition, reasons; urgency is a thin left rule plus the badge, not a filled card.
- "Missing and found animals": 52 px thumbnail (photo or animal icon), ID, Missing/Found label, case status, title, reported time, "View all".
- Overdue reminders use the same card; sections share one heading component with counts; Recent activity has an empty state.
- Columns 1.55fr / 1fr above 1100 px, one column below; KPI grid 4 / 2 columns; reduced-motion respected.
- Same selectors, links and dialogs as before (no data, API or feature removed; no sample values).

## Validation evidence

- `npx tsc --noEmit -p .` and `npx eslint src/admin/pages/DashboardPage.tsx` in `frontend/`: no errors.
- Not viewed in a browser yet.
