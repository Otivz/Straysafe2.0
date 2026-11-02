# Remove Barangay analytics

- **Date:** 2026-11-02 09:49 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/analytics.py`, `backend/app/services/analytics_service.py`, `backend/tests/test_analytics_accuracy.py`, `frontend/src/pages/Barangay_Staff/BrgyAnalytics.tsx` (deleted), `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/src/components/analytics/analytics.ts`, `frontend/src/components/analytics/AnalyticsDashboard.tsx`, `frontend/tests/analytics.browser.mjs`, `frontend/tests/fixtures/analytics.tsx`, `docs/01-system/ANALYTICS_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "remove the analytics for barangay". FREEZE was OFF. No Git commits.
- **Type:** Polish

## Change

This removes the Barangay analytics added in `2026-11-02_0935_analytics-audit-and-fix.md`:
- the `GET /analytics/barangay` endpoint, which now returns 404;
- the Barangay-only parameters of `analytics_payload()` (report and pet scope conditions, warnings limited to managed cases);
- the `/brgy/analytics` page, its route and its sidebar link;
- the dashboard's Barangay mode.

Barangay staff get 403 on the Subdivision and Admin analytics endpoints, as before that change.

The other corrections from that change are kept on the Admin and Subdivision pages:
- status groups and the status filter;
- custody now, with returned animals never "available for adoption";
- successful adoptions counted as completed handovers;
- rescue status counts, ownership claims, observations and frequent locations;
- the aggregated pet registry, calendar presets, auto-refresh and Retry.

The rescue, custody, claims and adoption sections are Admin-only again.

## Validation evidence

- **Backend:**
  - `tests/test_analytics.py`: 14/14.
  - `tests/test_analytics_accuracy.py`: 26/26. The Barangay scope checks were replaced by: the endpoint returns 404; Barangay staff are refused on the Subdivision and Admin endpoints; the rescue, custody and claims checks run through the Admin endpoint.
  - The full backend set was not rerun. Only the analytics service and router changed.
- **Frontend:**
  - `analytics.browser.mjs` passed 8 scenarios at 390 and 1280 px with zero backend requests (Admin, Subdivision, empty, error and Retry), on a local Vite server on port 5175, stopped afterwards.
  - `npm run build` passed.
  - `node --test tests/*.test.mjs`: 86/86.
  - ESLint: no findings in the analytics files. The remaining findings in `BrgySidebar.tsx` are on lines this change didn't touch.
