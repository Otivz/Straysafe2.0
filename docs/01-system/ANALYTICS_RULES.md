# Analytics rules

**Status:** Current (2026-11-06, Subdivision-only Phase 4)

This document describes what each analytics page shows, who can see it, and how every number is counted. All figures come from the database. Nothing is invented or hardcoded.

## Pages and scope

| Page | Who | Records counted |
| --- | --- | --- |
| `/subd-admin/reports` (Analytics, Leader app) | Subdivision Leader (role 2), only their subdivision | Subdivision reports, pet registry, warnings, observations and Barangay referrals |
| *(no screen)* `GET /analytics/admin` (System analytics; the legacy Admin page was removed 2026-11-10) | Admin (role 4) | Records in scope, optionally one subdivision, including earlier operations and Barangay referrals |

**There is no Barangay analytics page (removed 2026-11-02 at the developer's request).** Barangay staff (role 3) get 403 on both endpoints, and `/analytics/barangay` doesn't exist. StraySafe serves Selera Homes; the Barangay is external and has no active account. The Admin page retains metrics from earlier rescue, custody, adoption and claim records. These archive metrics are separate from the new referral log and do not mean StraySafe performs Barangay work.

API endpoints:
- `GET /analytics/subdivision`
- `GET /analytics/admin`

Both share `analytics_payload()` in `backend/app/services/analytics_service.py`.

## Counting rules

- **Incidents:** one per report submission. Merged duplicates (status 18, or `duplicate_of_report_id`) and per-animal split records are not counted separately. Rescue requests no longer exist.
- **Status groups:** every report falls in exactly one group, so the groups always add up to the incident total.

  | Group | Report statuses |
  | --- | --- |
  | Pending | 1 Reported, or no status yet |
  | Under review | 15 Disputed, 16 Under Investigation |
  | Verified | 2 Verified |
  | Referred to Barangay | 4 Referred to Barangay, historical 13 Approved by Barangay |
  | Owner observation / other in progress | 7 owner observation; historical 5 In Action, 6 Picked Up, 8 Impounded |
  | Resolved | 9 Claimed by Owner, 10 Released, 11 Incident Resolved |
  | Rejected / dismissed | 3 Rejected, 14 False Alarm |
  | Closed (deceased / not found) | 12 Deceased, 17 Cannot Be Found |

  Resolving an observation sets its report to 11 ([REPORT_STATUS_SYNC_RULES](REPORT_STATUS_SYNC_RULES.md)), so it is counted under Resolved.
- **Barangay referrals** (`referral_summary`, on both endpoints):
  - Count actual `barangay_referrals` rows once. A status 4 report, an endorsement letter or an old rescue request without a referral row is not an invented referral.
  - `referred`: referrals whose `referred_at` is inside the selected date range, including referrals of reports filed earlier. The referral date is also included when finding the all-time start date.
  - `open`: those referrals with no `final_outcome`; `closed`: those with a recorded final outcome. These describe the log's current state for referrals made in the period, not the number of closures occurring in the period.
  - `outcomes`: claimed, released, resolved, deceased and not found (`not_found`), zero-filled. Each closed referral contributes to one outcome. The counts are independent of a later manual report-status change.
  - Animal, priority, category, current report-status group and authorized subdivision filters apply through the associated report. Referral counts are per referral/case; the existing incident chart still counts root report submissions. Multiple external updates do not multiply referral counts.
  - The UI and CSV label outcomes as reported by the external Barangay and recorded by Subdivision Leaders. A reported held/impounded update never creates StraySafe custody.
  - The API filter key `endorsed` remains supported for existing bookmarks; its displayed label is Referred to Barangay. All historical status IDs and group memberships are preserved.
- **Retired (2026-11-10):** the rescue request, custody snapshot, holding intake, adoption and legacy claim counts are no longer in the analytics payload (`rescue_summary`, `custody_snapshot`, `holding_summary`, `holding_and_adoption`, `claims_summary` and the matching `kpis`). The case workflow numbers (`case_lifecycle`) and the ownership-claim counts below replace them.
- **Observations:** open now; resolved (complied) in the period; ended otherwise in the period.
- **Frequent locations:** the landmark text of reports in the period. Spacing and capitalization are normalized, and the top 8 are shown. Exact positions are on the heat map.
- **Pet registry:** current records, not archived or merged, counted with database aggregates. Vaccination counts only when the record is marked vaccinated and not expired.

## Case workflow numbers (`case_lifecycle`)

Added 2026-11-09 for the Admin Analytics page, on both endpoints, additively (every existing key is unchanged). Same filters and date window as everything above; counts one incident per root report.

- `received`: cases reported in the window. `closed`: cases closed in the window, dated by `closed_at`. A closure made before that column existed has no date unless a legacy path stamped it, so it is not counted as closed in a window.
- `resolved_share`: of the closed cases, the share whose documented outcome is a **resolution**. A closed case is not assumed resolved: `outcomes` splits the closures into resolved, unresolved and invalid, per disposition (a legacy closure is read from its legacy status); `closed_without_resolution` counts the unresolved ones.
- `median_days_to_close`: report to closure. `status_counts`: the four global statuses now, over the cases in scope. `timeline`: received and closed per bucket. `categories`: the six categories among the cases received. `reopened`: cases and events.
- `referrals`: referrals made in the window by type, organisation and status (several per case are counted each), and `open_now`. `followups`: pending, overdue and completed in the window. `claims`: submitted in the window, open now, accepted, rejected.
- Code: `backend/app/services/analytics_service.py` (`case_lifecycle_summary`); test: `backend/tests/test_case_analytics.py`.

## Filters

- **Date:** Today, This week (Monday to today), This month, This year, Last 7/30/90/180 days, All time, or Custom (inclusive). All dates use Asia/Manila.
- **Animal, priority, category and subdivision:** subdivision is available to Admins. Multiple filters combine.
- **Status:** All, Active, Closed, or any status group above.

Every KPI and chart follows the same filters. Snapshot cards (pet registry) are labelled as snapshots and ignore the date. Reset restores the default view (last 30 days).

## States and freshness

- **Loading:** skeleton cards instead of zeros.
- **Empty:** a message instead of a misleading chart.
- **Error:** the message, a **Retry** button, and earlier results for the exact same filters if available. No placeholder figures are ever shown.
- **Refresh:** results are cached for 3 minutes per filter set. The page refreshes:
  - after the user saves something;
  - when another tab signals a change;
  - when the window regains focus;
  - every 60 seconds.

## Known limits

- Average verification time is shown only from real timestamps, with N/A when absent. Durations are never estimated.
- Location statistics depend on the landmark text the reporter entered.

## Code and tests

- Backend:
  - `backend/app/services/analytics_service.py`;
  - `backend/app/routes/analytics.py`.
- Frontend:
  - `frontend/src/components/analytics/AnalyticsDashboard.tsx`, `analytics.ts`, `AnalyticsCharts.tsx`;
  - pages `AdminAnalytics.tsx` and `SubdAnalytics.tsx`.
- Tests:
  - `backend/tests/test_analytics.py` (14, unittest);
  - `backend/tests/test_analytics_accuracy.py` (41 checks, including referral counts, all five outcomes, scope/filters, old report dates, no double-counting from updates and preserved historical counts);
  - `frontend/tests/analytics.browser.mjs` with `frontend/tests/fixtures/analytics.tsx` (10 scenarios at 390 and 1280 px, including referral metrics on both pages).
