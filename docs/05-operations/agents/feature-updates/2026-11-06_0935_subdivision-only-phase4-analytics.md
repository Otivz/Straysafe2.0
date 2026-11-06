# Subdivision-only Phase 4: referral analytics

- **Date:** 2026-11-06 09:35 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `backend/app/services/analytics_service.py`, `backend/tests/test_analytics_accuracy.py`, `frontend/src/components/analytics/analytics.ts`, `frontend/src/components/analytics/AnalyticsDashboard.tsx`, `frontend/tests/analytics.browser.mjs`, `frontend/tests/fixtures/analytics.tsx`, `docs/01-system/ANALYTICS_RULES.md`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_0935_subdivision-only-phase4-analytics.md`
- **Authorization:** Developer request to implement Phase 4 only of the Subdivision-only restructuring; no Phases 5 or 6.
- **Type:** Feature

## Intent

Count external Barangay referrals separately while retaining the earlier report-status, rescue, custody, adoption and claim metrics.

## Key changes

- Both analytics endpoints expose referral_summary: referred, open, closed and the five outcome counts. Scope and report-attribute filters apply; date filtering uses referred_at, including referrals of older incidents. Multiple external updates never duplicate counts.
- Open/closed reflects the current final outcome of referrals made in the selected period, not closure activity in that period. No status-only referrals are invented.
- Both pages and CSV show referral counts and externally reported outcomes. Historical status IDs and group memberships remain unchanged, with updated display labels and the existing endorsed filter key preserved.
- Hide empty rescue timing/sample rows and CSV entries; retain all historical counts and real zero-hour samples. Document the exact date and outcome rules.

## Validation evidence

- TypeScript build check: exit 0; git diff --check: no whitespace errors.
- test_analytics_accuracy.py: 26/26 baseline, 41/41 after (15 new checks).
- test_analytics.py: existing 14/14 pass, including valid duration samples and constant query-count checks.
- analytics.browser.mjs: 8 baseline scenarios, 10/10 after, at 390 and 1280 px, zero backend requests; covers leader/Admin referrals and counts without rescue timings.
