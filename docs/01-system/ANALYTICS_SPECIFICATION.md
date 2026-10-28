# StraySafe Analytics Specification

Updated: 24 October 2026. This document describes the implemented administrator and subdivision leader dashboards.

## Improvements delivered

| Area | Improvement |
| --- | --- |
| Dashboard | Shared responsive dashboard with clearer KPI cards, scope, selected dates, update time, applied filters, dark mode, and loading states. |
| Trend graph | Interactive line and bar views; independently toggle incident, currently resolved, and high-risk series. Missing periods display zero rather than disappearing. |
| Chart access | Keyboard navigation, pointer/touch inspection, readable date labels, integer count axes, horizontal chart scrolling, and an expandable data table. |
| Categories | Category donut and legend with counts, percentages, and category filtering. Animal and priority bars also filter the dashboard. |
| Filters | Last 7/30/90/180 days, year to date, all time, inclusive custom dates, subdivision, animal, priority, case status, category, and daily/weekly/monthly grouping. |
| Filter navigation | Selections persist in the URL, support browser history, and can be reset. Invalid dates produce actionable errors. |
| Comparisons | Incident counts compare against the immediately preceding period of equal length using the same filters. All-time views do not invent a comparison period. |
| Area comparison | Administrator benchmark table includes search, sorting, incident volume bars, and subdivision drilldown. |
| Exports | Real CSV download containing the selected scope, dates, filters, summaries, and data sections. Print/PDF layout includes applied filters and removes navigation and controls. |
| Reliability | Cancel outdated requests during filter changes. Show explicit request errors, retry controls, empty states, and clearly labelled saved results for exactly matching filters. |
| Counting | Exclude merged duplicates and animal child records from incident counts. Retain animal child records in relevant operational metrics. |
| Case outcomes | Picked-up cases remain active until an authoritative closure status. Successful resolution is distinguished from all closed outcomes. |
| Registry | Include eligible ownerless registrations, exclude archived/merged pets, and exclude expired vaccination flags from the current vaccination numerator. |
| Operations | Use valid completed rescue durations, distinguish adoption approval from completed handover, and display sample sizes. |
| AI results | Replace invented accuracy defaults with actual reviewed-match counts, acceptance rate, and confirmed-match similarity. Missing rates display N/A. |
| Access and queries | Enforce leader subdivision boundaries on the server. Build area comparisons without one query per subdivision. |

## Access and routes

- Administrator (role 4): `/admin/analytics`, backed by `GET /analytics/admin`. May view all subdivisions or select one.
- Subdivision leader (role 2): `/subd/analytics`, backed by `GET /analytics/subdivision`. Requires an assigned subdivision and cannot request another subdivision.
- Residents and barangay staff (roles 1 and 3) cannot access these analytics endpoints.
- An administrator using the subdivision endpoint must supply a subdivision or have one assigned.
- Existing JWT authentication and user-scoped browser caching are reused. Analytics endpoints are read-only.

## Filters and date handling

| API parameter | Accepted values and behavior |
| --- | --- |
| `days` | 1–3,650 inclusive calendar days, ending today. Omit for all time. The UI defaults to 30 days. |
| `start_date`, `end_date` | Both required together, ISO dates; cannot combine with `days`. End must not precede start or exceed today. Custom spans are limited to 3,650 days. |
| `subdivision_id` | Positive subdivision ID; server authorization determines allowed scope. |
| `animal_type` | Dog, Cat, Other. |
| `priority` | Low, Medium, High. |
| `status` | all, active, closed, resolved. Describes the current case outcome. |
| `category_id` | Existing incident category ID. |
| `group_by` | auto, day, week, month. Auto uses daily for up to 60 days, weekly for up to 365 days, and monthly beyond that. |

All dates use Asia/Manila. A selected date range includes both days, implemented as start midnight inclusive and midnight after the end date exclusive. Weeks begin Monday. First/last weekly or monthly buckets can contain partial periods. Explicit daily grouping is limited to 366 days and weekly grouping to 2,562 days to bound chart responses. Use monthly or automatic grouping for longer histories.

All time begins at the earliest eligible incident or operational event, including warnings predating the first incident. With no history it uses today. Timeline buckets with no matching reports are retained with zero counts.

Report filters affect incident metrics and related operations through their linked reports. Warning scope follows the owner; incident-specific filters require a matching linked report. Species can match the warning's linked pet or report. Registry snapshots use subdivision and animal filters, independent of report date, priority, status, and category. Account snapshots use subdivision only. UI descriptions make snapshot scope explicit.

## Metric definitions

| Metric | Definition and time basis |
| --- | --- |
| Incidents filed | Root reports created in the selected period, excluding split animal children, duplicate links, and duplicate status 18. Counts submissions, not animal population. |
| Active / closed | Current outcomes of those incidents. Closed statuses follow `CLOSED_REPORT_STATUS_IDS` in `utils/case_closure.py`: 3, 9, 10, 11, 12, 14, 17, 18. Picked Up (6) remains active. |
| Successful resolution | Status 9, 10, or 11 divided by incident count. Other closed outcomes are not successful resolutions. |
| Trend series | Incident creation buckets, plus the subset currently successfully resolved and the high-risk subset. Resolved points do not count resolutions performed on that date. |
| High risk | High priority or a category name containing aggressive/rabies/rabid indicators. Category IDs are not assumed. |
| Previous period | Same-length date window immediately preceding the selected start; identical report filters. Percentage change is unavailable when the previous count is zero. |
| Verification time | Mean nonnegative interval from creation to verification for reports in the selected creation cohort with usable timestamps; sample size is shown. |
| Registered pets | Current unarchived, unmerged registry records. Subdivision follows owner, with registrar subdivision fallback when the owner has no subdivision. This is not registrations created during the selected period. |
| Vaccination records | Current registry vaccination flag with no expiry or an expiry that has not passed, divided by eligible registry pets. This does not assert independent clinical verification. |
| Warnings | Owner-warning records created in the selected period; grouped by violation. |
| Holding | Animals with intake dates in the selected period, including eligible child animal reports. Currently held means no discharge and custody status 1, 2, 6, or 8. This is the intake cohort still held, not total shelter occupancy. |
| Rescue duration | Administrator view: mean started-to-completed interval for completed rescue status 6, completed in the selected period, with valid timestamps; sample size shown. |
| Adoption | Applications created in the selected period. Pending, approved, and completed handovers are separate. Completed handover requires both handover confirmations. Approval rate uses approved applications / applications. |
| AI review | Suggestions created in the selected period. Reviewed means CONFIRMED_MATCH or NOT_A_MATCH; acceptance = confirmed / reviewed. Mean similarity uses confirmed suggestions. These are not measured model precision or completed reunions. |
| Accounts / audits | Administrator view: current accounts by status and area; audit events created in the selected period, scoped by actor area when an area is selected. |

Rates without a denominator and durations without valid samples are `null` and display N/A. No default accuracy percentage is fabricated. Reports without an assigned subdivision remain in system totals but have no subdivision benchmark row.

## Graphs, tables, and exports

The trend offers line/bars, series visibility, a selected-period detail strip, and a table. Arrow keys move between periods; Home/End jump to endpoints. Long timelines scroll inside the chart. Category selections, animal/priority bars, and benchmark View actions update the same filter state.

Subdivision benchmarks can be searched and sorted by incident count, active cases, resolution rate, or name. The table distinguishes current pet snapshots from incident-period outcomes.

CSV is generated locally from the currently loaded response, includes all available metric sections and filter metadata, escapes values, and guards against spreadsheet formula interpretation. Export and print are disabled while fetching. Print/PDF uses the browser print dialog with landscape styles, readable tables, visible content, and scope/date/filter context.

During a new filter request, results from another filter combination are hidden. Failed refreshes may show a matching cached response with an explicit warning and original update time. A new query without cached data shows an error and retry action. Empty data is presented explicitly rather than being confused with a request failure.

## Implementation

- `frontend/src/pages/Admin/AdminAnalytics.tsx` and `frontend/src/pages/Subd_Leaders/SubdAnalytics.tsx`: role-specific wrappers.
- `frontend/src/components/analytics/AnalyticsDashboard.tsx`: shared dashboard, filters, benchmarks, and metric cards.
- `frontend/src/components/analytics/AnalyticsCharts.tsx`: native SVG trend, category donut, and distribution bars.
- `frontend/src/components/analytics/analytics.ts`: typed response contract, URL filters, scoped requests/cache, formatting, benchmark sorting, and CSV generation.
- `frontend/src/components/analytics/analytics.css`: component, responsive, dark mode, and print styles.
- `backend/app/routes/analytics.py`: endpoint authorization and scope enforcement.
- `backend/app/services/analytics_service.py`: validated filters, cohort calculations, operational metrics, and grouped comparison data.
- `backend/tests/test_analytics.py`: isolated API regressions using in-memory SQLite and a fixed Manila clock.

No chart package or new frontend dependency was added. Each response includes filter options, scope/date/grouping metadata, generation time, comparison metadata, and relevant metric sections. Administrator responses include cross-subdivision and operational/security summaries.

## Validation

- Backend: `.venv/Scripts/python.exe -m unittest discover -s backend/tests -p test_analytics.py -v` — 14 regression tests.
- Frontend: `npx eslint src/components/analytics src/pages/Admin/AdminAnalytics.tsx src/pages/Subd_Leaders/SubdAnalytics.tsx` from `frontend`.
- Production: `npm run build` from `frontend` (TypeScript and Vite).
- Chrome smoke checks with synthetic API fixtures: role-specific rendering, filters/grouping, chart controls/table, rapid request cancellation, custom dates, empty/error/retry/cache states, CSV download, print styles, and mobile layouts. These checks do not modify production records.

## Interpretation limits

These dashboards measure recorded reports and operations. They do not estimate the actual stray population, establish causal effects of interventions, provide geographic hotspot modelling, enforce shelter capacity thresholds, or establish AI accuracy against an independently labelled evaluation set. Those features require additional definitions or data before implementation.
