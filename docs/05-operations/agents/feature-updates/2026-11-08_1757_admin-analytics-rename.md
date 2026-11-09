# Admin preview: "Reports" page renamed "Analytics"

- **Date:** 2026-11-08 17:57 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/admin/pages/ReportsPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-08_1757_admin-analytics-rename.md`
- **Authorization:** Developer request in Claude Code: apply the recommendation of the "Admin Reports vs Analytics Investigation" and rename the Admin preview's "Reports" page to "Analytics", changing only the sidebar label and the page heading and browser title. FREEZE was OFF.
- **Type:** Polish

## Intent

In StraySafe a "report" is a resident's submission: the Resident app says "Report" and "My reports", the Admin UI says "N new reports", "Related reports" and "Reports submitted", and the legacy portals' "Resident Reports" and "Incident Reports" are the incident queues. The Admin preview page called "Reports" holds only period statistics (volume, trends, categories, outcomes, referral activity) and has a tile named "Reports received", so the name read circularly and could be mistaken for the incident list. The legacy portals and the project documents (`docs/01-system/ANALYTICS_RULES.md`, `ANALYTICS_SPECIFICATION.md`) already call this content "Analytics". This is a naming correction only.

## Key changes

Three string literals, nothing else:

- `frontend/src/admin/layout/Sidebar.tsx`: the navigation label `'Reports'` is now `'Analytics'` (same icon, position and route).
- `frontend/src/admin/pages/ReportsPage.tsx`: `usePageTitle('Reports')` is now `usePageTitle('Analytics')`, so the browser title is "Analytics · StraySafe Admin", and `<PageHeader title="Reports" …>` is now `title="Analytics"`.

## Deliberately not changed

- The route `/admin-preview/reports`, the file name `ReportsPage.tsx`, the component name and the code comment "A20 — Reports & analytics" (internal, not shown to users).
- The layout, charts, KPI tiles, filters, tables, every metric name and description (for example "Reports received" and "Most reported categories", which still count resident reports), the mock data and the `analytics()` calculations.
- The Dashboard, Cases and every other Admin and Resident screen. No new page, no new feature.
- No backend, database, dependency or `.env*` change. No commit or push.
- The earlier Admin preview record (`2026-11-08_1321_subdivision-admin-ui-preview.md`) still describes the screen as "reports", which was right when it was written. Records are permanent, so this record is the correction.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit`: no errors. `npx eslint` on the two edited files: clean. No visible `'Reports'` label or title remains in `frontend/src/admin`.
- Headless Chrome (DevTools protocol) against the dev server, no backend running, 30 checks, all passing, no page errors: the sidebar shows the same seven entries in the same order with "Analytics" sixth and highlighted; the heading is "Analytics" and the browser title is "Analytics · StraySafe Admin"; the link opens `/admin-preview/reports`, and opening that URL directly shows the same page; the description, the four date-range options, four KPI tiles, four chart cards and every metric name are still there; the date range and the Chart / Table toggle still work; the Dashboard, Cases and Settings headings are unchanged. A screenshot of the page matches the approved layout.
- Not re-run, because the change touches no logic, data or other screen: the full Admin flow scripts, the Resident suites and the production build.
