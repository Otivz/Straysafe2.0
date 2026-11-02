# Analytics audit, fixes and Barangay analytics

- **Date:** 2026-11-02 09:35 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/analytics_service.py`, `backend/app/routes/analytics.py`, `backend/tests/test_analytics_accuracy.py`, `frontend/src/components/analytics/analytics.ts`, `frontend/src/components/analytics/AnalyticsDashboard.tsx`, `frontend/src/pages/Barangay_Staff/BrgyAnalytics.tsx`, `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/tests/analytics.browser.mjs`, `frontend/tests/fixtures/analytics.html`, `frontend/tests/fixtures/analytics.tsx`, `docs/01-system/ANALYTICS_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE 2.0 – Complete Analytics Page Audit, Fix, and Optimization". FREEZE was OFF. Earlier instruction: no Git commits.
- **Type:** Fix

## Problems found (audit)

The existing service already excluded merged duplicates and split child records, validated date windows, used Asia/Manila boundaries and scoped leaders to their subdivision. It had no hardcoded statistics. These problems were found:

1. **No Barangay analytics.** Role 3 got 403 on both endpoints, and there was no page.
2. **No report status breakdown.** Only active, closed and resolved were reported; pending, under review, verified, endorsed and rejected were not. The status filter offered only those three.
3. **Adoptions mislabelled.** `kpis.total_adoptions` counted *approved applications* as adoptions, and the "approved" figure was used as the adoption count.
4. **Custody limited to the period.** "Still held" counted only animals admitted within the selected period, so an animal held for longer than the period disappeared from custody figures.
5. **Returned animals missed.** "Returned to owner" used only the holding status, so owner-return records and completed claims were missed. "Available for adoption" didn't exist, and nothing guaranteed returned animals were excluded from it.
6. **Rescue counts incomplete.** Rescue figures counted only completed rescues with valid timestamps, labelled as total rescues. There were no pending, active or rejected counts and no response time.
7. **Missing sections.** There were no observation figures, ownership claim figures or frequent-location view.
8. **Missing date presets.** There was no Today, This week or This month.
9. **Stale figures.** Results were cached for 3 minutes with no refresh when records changed.
10. **Registry loading.** The whole pet registry was loaded row by row to count it.
11. **No retry.** The error state had no retry inside the alert.

## Root causes and fixes

- **Status groups:** one group per report status, applied in the shared filter (`report_attributes`) and the summary (`report_summary`). The groups always add up to the total. New KPIs: pending, under review, verified, endorsed, in progress, rejected. New `status_distribution`. The status filter accepts every group.
- **`GET /analytics/barangay`:**
  - Barangay staff see their own barangay; an Admin chooses one. Residents, leaders and other barangays are refused.
  - Reports: the barangay's subdivisions AND `barangay_managed_condition()`.
  - Pets: `pet_pool_condition()`, the Barangay's own pool.
  - Warnings and observations: only on its managed cases.
  - No users, audit log, AI review or per-subdivision comparison.
- **Admin and Barangay operations:**
  - `rescue_summary`: pending, active, completed and rejected, with report-to-start time from real timestamps. Rescue requests have no creation time, so they follow the report's filing date. This limit is documented.
  - `custody_snapshot`: current, not limited to the period. It uses `owner_handover_evidence_map()`, so a returned animal is never "available for adoption".
  - `claims_summary`.
  - `successful_adoptions`: completed handovers only. `kpis.total_adoptions` is now that figure; `kpis.total_rescues` is every request.
- **All modes:** `observations`, `top_locations` (normalized landmark text), and holding "returned to owner" using the record-based evidence.
- **Pet registry:** counted with SQL aggregates (count, current vaccination and bite history per area), not row loading.
- **Frontend:**
  - Barangay mode with the Barangay sidebar, navbar and bottom navigation; route `/brgy/analytics` inside the staff-only routes; a sidebar entry.
  - Calendar presets and status-group options.
  - Operations KPI row; status, locations and observation cards; rescue and claims cards.
  - Adoption wording, and a Retry button in the error alert.
  - Auto-refresh through `useAutoRefresh`: on saves, on changes in other tabs, on focus, and every 60 s.
  - The existing theme and components are reused.

## Validation evidence

- **Backend:**
  - `tests/test_analytics.py`: 14/14 (existing, unchanged).
  - `tests/test_analytics_accuracy.py`: 34/34. It covers:
    - status groups adding up, "pending" including status-less reports, and status filters;
    - merged duplicates excluded and location normalization;
    - Barangay access refusals and managed-case-only scope;
    - the pet pool kept separate from the subdivision registry, and no admin-only sections for the Barangay;
    - rescue groups and timings;
    - custody now including older intakes, and a returned animal not available for adoption;
    - successful adoptions being handovers only;
    - claims and observations;
    - figures updating after a record changes;
    - query count independent of the number of pets.
  - Every backend test script that sets its own SQLite database ran: **101 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run.
- **Frontend:**
  - `analytics.browser.mjs` passed 10 scenarios at 390 and 1280 px, with zero backend requests, on a local Vite server on port 5175, stopped afterwards. It covers:
    - Barangay sections and scope label, with no admin-only sections and no horizontal overflow;
    - the status filter from the chart and the "This week" preset (starts Monday);
    - Subdivision and Admin modes;
    - empty states;
    - an error showing no figures, then Retry.
  - `npm run build` passed.
  - `node --test tests/*.test.mjs`: 86/86.
  - ESLint: changed files clean.
- **Not verified:** figures against the real MySQL data; an Admin "choose barangay" selector in the UI (the API supports `barangay_id`).
