# Lost pet alerts: neighbors open the alert, not the owner's private report

- **Date:** 2026-11-03 08:22 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/utils/notificationNavigation.ts`, `frontend/src/pages/citizen/ResiLostPets.tsx`, `frontend/tests/notificationNavigation.test.mjs`, `docs/05-operations/agents/feature-updates/2026-11-03_0822_lost-pet-alert-neighbor-navigation.md`
- **Authorization:** the developer reported the console errors `GET /api/reports/5 404 (Not Found)` from `ResiViewReport`.
- **Type:** Fix

## Cause

Report 5 is a private Lost Pet Report whose Neighborhood Alert (alert 2) was broadcast to three neighbors. Only the owner (and officials) may open the report, so `GET /reports/5` correctly answers 404 for a neighbor. Two links still sent neighbors there:

- **Notification routing** (`resolveNotificationDestination`, change record `2026-11-02_1812`) sent every `lost_pet_alert` and `lost_pet_sighting` notification to `/resident/reports/{report_id}`, including the neighbors' "Missing pet: … have you seen it?". When the alert lookup failed, it used the alert's id as a report number, which would open a different report.
- **The alert page's Back button** (`ResiLostPets`) went to `/resident/reports/{report_id}` for everyone. The alert view's own "Open Lost Pet Report" link was already limited to the owner and the leader.

## Key changes

- **Notification routing:** the alert's own data decides.
  - If `is_owner` or `can_manage`, it opens the Lost Pet Report, as before.
  - Otherwise (a neighbor), and whenever the alert can't be loaded, it opens `/resident/lost-pets/{alert_id}` (tracking map, Report a Sighting).
  - The alert id is never used as a report number.
- **Alert page Back:** goes to the report only for the owner or the leader; neighbors go back to where they came from, or to the resident home.
- No backend change; the 404 for neighbors is correct and stays.

## Validation evidence

- Read-only check of local data: report 5 (Private, category 6, owner user 7). `viewer_access` is `reporter` for the owner and `none` for residents 1, 2 and 6. Alert 2 is active and notified 3 residents; its notifications carry `related_id` 2 (the alert).
- `node --test frontend/tests/notificationNavigation.test.mjs`: 10/10 passed. The two existing lost-pet tests now state an owner viewer. New tests: a neighbor goes to `/resident/lost-pets/2`, and an unreachable alert, or no API client, also goes to the alert page.
- `npx tsc -b` passed. ESLint on `notificationNavigation.ts` reports the same 9 existing problems as before; `ResiLostPets.tsx` is clean.
- `lostPets.browser.mjs` (12 scenarios, against port 5173) and `lostPets.test.mjs` still pass.
- Not checked: clicking the notification as a neighbor against the live backend.
