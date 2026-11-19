# Closed Report Footer Returns to Home

- **Date:** 2026-11-19 01:10 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/reports/LostReport.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-19_0110_closed-report-return-home-button.md`
- **Authorization:** User requested replacing the `"Report something new"` footer action on closed resident reports with `"Return to Home"`.
- **Type:** Polish

## Intent

When a resident finishes or views a closed report (such as confirming a missing pet is home), offer `"Return to Home"` (`/resident-app/home`) as the primary footer action instead of prompting `"Report something new"`.

## Key changes

- **`frontend/src/resident/pages/reports/LostReport.tsx`:** Changed the closed-report footer `<LinkButton>` from `Report something new` (`/report`) to `Return to Home` (`/home`).
- **`frontend/src/resident/pages/reports/ReportDetailsPage.tsx`:** Applied the same change for closed non-lost resident reports.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`) -> verified after edits.
- `node --test frontend/tests/*.test.mjs` -> verified after edits.
