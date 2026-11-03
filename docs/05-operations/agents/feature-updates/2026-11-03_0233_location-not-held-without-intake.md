# Location Intelligence: an animal is "in a holding place" only with a recorded intake

- **Date:** 2026-11-03 02:33 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/reports.py`, `backend/app/routes/warnings.py`, `backend/tests/test_location_custody.py`, `frontend/src/utils/reportStatus.ts`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`, `frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx`, `frontend/src/pages/Admin/AdminReport.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/src/components/Modals/ResolveLostPetModal.tsx`, `frontend/tests/locationIntelligence.browser.mjs`, `docs/05-operations/agents/feature-updates/2026-11-03_0233_location-not-held-without-intake.md`
- **Authorization:** the developer's bug report ("Location Intelligence Incorrectly Displays the Barangay Holding Facility", `/resident/reports/2`), the investigation they asked for first, and their "yes" to the recommended fix (steps 1–5).
- **Type:** Fix

## Root cause

Report status 7 ("Under Observation") has two meanings: the **owner observation** that a First Warning starts (`warnings.py`), where the animal stays with its owner and has no facility or holding record, and observation **inside a holding place** (status 7 with a facility). The code read status 7 only the second way:

- `populate_location_and_facility_info` (`reports.py`) treated status 7 or 8 alone as custody. It rewrote custody to "Secured in Facility", **guessed** a facility (the subdivision's holding place, else the first holding place in the database), and moved the coordinates and landmark there. It does this for every role and for the report list, so maps and dashboards were affected too.
- The resident and leader report pages showed "Current location / Animal Secured at Holding Place" for status 7 or 8.
- Other pages read status 7 as held: the admin rabies watchdog and pipeline stage, the barangay history "impounded" count, the lost-pet modal, and the maps' "had holding history".
- The leader's status-change check counted status 7 as "already held", so a leader could set an observation case to Impounded with no holding place.

Local report 2 had status 7, custody "Sighting", no facility, no holding record and no rescue. The API returned "Secured in Facility" at "Barangay San Vicente Animal Impound Facility" with the pin moved there.

## Key changes

- **Rule:** held means recorded evidence: an open holding record, or a facility recorded on the report. A status alone never counts.
- Backend, `populate_location_and_facility_info`:
  - status 7 or 8 needs that evidence;
  - the facility comes from the report's `facility_id`;
  - the "guess a holding place" fallback now runs only for an animal with an open holding record (verified held, place not recorded);
  - a stored in-facility custody without evidence is reported as "Sighting";
  - coordinates and landmark are not moved unless the animal is held.
- Backend, `update_report_status`: the "Secured by Resident" check and the leader's "already held" check use the same evidence instead of status 7 or 8.
- Backend, `warnings.py` (F18 in the warning path): the observation due date is the warning's time converted from the database clock to UTC, plus 3 days. The owner's notification shows the time on the local clock.
- Frontend, new helpers in `utils/reportStatus.ts`:
  - `isHeldInFacility` (facility or in-facility custody; not when picked up or closed);
  - `isHoldingHistoryEntry` (Impounded, or status 7 with a recorded facility).
- Resident page:
  - the card says "Last reported sighting" when the animal isn't held;
  - it adds "Current location: with its owner during the observation period (not in a holding place)" while an owner observation is open, otherwise "Current location: not confirmed (not in a holding place)".
- Leader report page: same rule for the map.
- Barangay and leader report pages, both history pages, and the admin incidents list: the maps' "had holding history" uses `isHoldingHistoryEntry` (11 places).
- Admin incident page: the rabies watchdog and the "Observation" pipeline stage need a facility. An owner-observation case shows at "Verified".
- Barangay history: the impounded count needs a facility for status 7.
- Lost-pet modal: status 7 alone is no longer "in facility".
- Not changed: `RescueTimeline` (its facility label comes from each entry's own recorded facility, so owner-observation entries were never labelled), the warning and observation workflow (it still sets status 7), holding place pages, rescue and intake flows. No database change.

## Validation evidence

- New `backend/tests/test_location_custody.py`: 33/33 passed (SQLite). It covers:
  - first warning → status 7 with a due date 3 days ahead in UTC;
  - the observation case not held, with the pin at the sighting and a non-facility landmark, for leader and owner and in the report list;
  - a leader can't set the observation case to Impounded (403);
  - escalated, dispatched and picked up are not held;
  - impounded with a facility, status 7 with a facility, and an open holding record are held, with the pin at the facility;
  - status 8 with no record and a stale in-facility custody are not held;
  - a resolved case keeps the original sighting.
- The same test run against the original `reports.py` and `warnings.py` (a scratch copy from git) fails on the observation case exactly as reported: "Secured in Facility", the impound facility, the pin moved.
- Read-only check of local report 2 through `get_report`, resident and leader: custody "Sighting", no facility, original coordinates.
- New `frontend/tests/locationIntelligence.browser.mjs` passed at 1280 and 390 px on `/resident/reports/:id`:
  - an owner-observation case shows "Last reported sighting" and "with its owner", with no holding place;
  - an escalated case shows "not confirmed";
  - a recorded intake shows the impound facility and the original sighting.
  - All API calls were mocked.
- `historyCaseSummary.browser.mjs` still passes (10/10). `npx tsc -b` passed; ESLint problem counts on every changed page are equal to or lower than before.
- Existing backend suites: all 48 SQLite suites that touch facilities, custody, holding, warnings, observations, rescue or claims passed with no failures. Examples: `test_phase2_custody` 18/18, `test_holding_leader_barangay_view` 25/25, `test_under_observation_flow` 33/33, `test_owner_warning_rules` 81/81, `test_owner_return` 51/51, `test_multi_animal_split` 114/114, `test_report_status_sync` 33/33. Ten matching suites were not run because they don't use a throwaway SQLite database (for example `test_report_original_location.py`, `test_admin_011_warnings.py`).
- Not checked: the pages against the live backend with a real sign-in, and map pins on the dashboards in a browser.
