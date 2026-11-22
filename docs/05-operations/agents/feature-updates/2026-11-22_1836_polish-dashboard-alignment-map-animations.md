# Polish Dashboard Layout, Header Alignment, Animations, and Active Cases Map

- **Date:** 2026-11-22 18:36 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/DashboardPage.tsx`
- **Authorization:** User request to organize the Dashboard, fix positioning, polish with STRAY-SAFE branding, and add animations.
- **Type:** Polish

## Intent

Align the Dashboard header actions cleanly with the greeting block, balance the left and right columns by adding an Active cases map below Needs your attention, and add staggered entrance animations and subtle KPI hover transitions.

## Key changes

- Aligned the Dashboard header with `sm:flex-row sm:items-center sm:justify-between` and a subtle bottom hairline (`border-b border-[#e7e2da] pb-4`).
- Wrapped the left column in a vertical flex stack (`flex min-w-0 flex-col gap-6`) and added the **Active cases map** (`CasesMap`) below **Needs your attention**, linking to `/cases?view=map`.
- Added `@keyframes saFadeUp` / `.sa-fade-up` entrance animations and subtle hover lift on KPI cards.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/DashboardPage.tsx; npx tsc --noEmit`
