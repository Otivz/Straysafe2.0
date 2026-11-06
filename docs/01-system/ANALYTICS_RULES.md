# Analytics rules

**Status:** Current (2026-11-06, Subdivision-only Phase 4)

This document describes what each analytics page shows, who can see it, and how every number is counted. All figures come from the database. Nothing is invented or hardcoded.

## Pages and scope

| Page | Who | Records counted |
| --- | --- | --- |
| `/subd/analytics` (Community analytics) | Subdivision Leader (role 2), only their subdivision; an Admin chooses one | Subdivision reports, pet registry, warnings, observations and Barangay referrals |
| `/admin/analytics` (System analytics) | Admin (role 4) | Records in scope, optionally one subdivision, including earlier operations and Barangay referrals |

**There is no Barangay analytics page (removed 2026-11-02 at the developer's request).** Barangay staff (role 3) get 403 on both endpoints, and `/analytics/barangay` doesn't exist. StraySafe serves Selera Homes; the Barangay is external and has no active account. The Admin page retains metrics from earlier rescue, custody, adoption and claim records. These archive metrics are separate from the new referral log and do not mean StraySafe performs Barangay work.

API endpoints:
- `GET /analytics/subdivision`
- `GET /analytics/admin`

Both share `analytics_payload()` in `backend/app/services/analytics_service.py`.

## Counting rules

- **Incidents:** one per report submission. Merged duplicates (status 18, or `duplicate_of_report_id`) and per-animal split records are not counted separately. Reports and rescue requests are separate entities.
- **Status groups:** every report falls in exactly one group, so the groups always add up to the incident total.

  | Group | Report statuses |
  | --- | --- |
  | Pending | 1 Reported, or no status yet |
  | Under review | 15 Disputed, 16 Under Investigation |
  | Verified | 2 Verified |
  | Referred to Barangay | 4 Referred to Barangay, historical 13 Approved by Barangay |
  | Owner observation / legacy rescue or custody | Historical 5 In Action, 6 Picked Up, 8 Impounded; 7 owner observation |
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
  - The UI and CSV label outcomes as reported by the external Barangay and recorded by Subdivision Leaders. A reported held/impounded update never creates StraySafe custody or affects legacy holding/rescue counts.
  - The API filter key `endorsed` remains supported for existing bookmarks; its displayed label is Referred to Barangay. All historical status IDs and group memberships are preserved.
- **Rescue requests:**
  - Groups: Pending (1), Active (2 Approved, 4 Started, 5 Dispatched), Completed (6), Rejected (3).
  - Rescue requests have no creation timestamp, so they follow their report's filing date (the incident cohort).
  - "Report → rescue started" uses only requests with a recorded start time at or after the report time.
  - "Rescue duration" uses only completed requests with valid start and end times.
  - Hide report-to-start and start-to-completion timing rows, including their sample rows and CSV entries, when they have no valid samples. Keep the earlier request counts visible. Zero-hour durations with valid samples remain valid data.
- **Custody now** (a current snapshot, not limited to the period):
  - **In custody:** animals in treatment, healthy, for adoption or impounded, not discharged, and not returned to an owner.
  - **Available for adoption:** in custody and listed for adoption. An animal returned to its owner is never counted, using the records in [ADOPTION_ELIGIBILITY_RULES](ADOPTION_ELIGIBILITY_RULES.md): the holding status, an owner-return record, a completed claim, or returned custody.
- **Holding intakes in the period:** "returned to owner" uses the same record-based evidence, not only the holding status.
- **Adoptions:** a **successful adoption** is a completed handover (approved, and handed over by both staff and adopter). Pending and approved-only applications are reported separately and never counted as successful.
- **Ownership claims** (filed in the period, on cases in scope): submitted; approved and awaiting handover; handed over (Handover Complete or Pet Received); rejected.
- **Observations:** open now; resolved (complied) in the period; ended otherwise in the period.
- **Frequent locations:** the landmark text of reports in the period. Spacing and capitalization are normalized, and the top 8 are shown. Exact positions are on the heat map.
- **Pet registry:** current records, not archived or merged, counted with database aggregates. Vaccination counts only when the record is marked vaccinated and not expired.

## Filters

- **Date:** Today, This week (Monday to today), This month, This year, Last 7/30/90/180 days, All time, or Custom (inclusive). All dates use Asia/Manila.
- **Animal, priority, category and subdivision:** subdivision is available to Admins. Multiple filters combine.
- **Status:** All, Active, Closed, or any status group above.

Every KPI and chart follows the same filters. Snapshot cards (custody now, pet registry) are labelled as snapshots and ignore the date. Reset restores the default view (last 30 days).

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

- Rescue requests have no creation time of their own, as noted above.
- Average verification time is shown only from real timestamps, with N/A when absent. Rescue-duration statistics are hidden when there are no valid samples; they are never estimated.
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
  - `frontend/tests/analytics.browser.mjs` with `frontend/tests/fixtures/analytics.tsx` (10 scenarios at 390 and 1280 px, including referral metrics on both pages and missing rescue timings).
