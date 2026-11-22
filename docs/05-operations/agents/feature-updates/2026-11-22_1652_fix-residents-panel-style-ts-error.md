# Fix Panel Style Prop TypeScript Errors in ResidentsPage

- **Date:** 2026-11-22 16:52 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/ResidentsPage.tsx`
- **Authorization:** User request to fix the TypeScript `ts(2322)` errors on `Panel` in `ResidentsPage.tsx`.
- **Type:** Fix

## Intent

Resolve the two `Property 'style' does not exist` TypeScript errors on `Panel` in `frontend/src/admin/pages/ResidentsPage.tsx`.

## Key changes

- Replaced `style={{ animationDelay: ... }}` on the summary and table `Panel` components with Tailwind arbitrary animation-delay classes (`[animation-delay:0ms]`..`[animation-delay:140ms]`).

## Validation evidence

- `cd frontend; npx tsc -p tsconfig.app.json --noEmit; npx eslint src/admin/pages/ResidentsPage.tsx`
