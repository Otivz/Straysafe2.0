# Remove Top Review Urgent and All Cases Buttons from Dashboard Header

- **Date:** 2026-11-25 18:30 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/DashboardPage.tsx`
- **Authorization:** User request to remove the "Review urgent" and "All cases" buttons from the top header of the Dashboard.
- **Type:** Polish

## Intent

Declutter the Dashboard top greeting header by removing the "Review urgent" and "All cases" shortcut buttons while keeping the clickable KPI cards and section links below.

## Key changes

- Removed the `<div className="flex shrink-0 flex-wrap items-center gap-2">` action container containing `Review urgent` and `All cases` in `frontend/src/admin/pages/DashboardPage.tsx`.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/DashboardPage.tsx; npx tsc --noEmit`
