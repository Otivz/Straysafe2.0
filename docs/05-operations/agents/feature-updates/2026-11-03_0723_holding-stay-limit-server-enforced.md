# Holding stay limit stored and enforced on the server, with an audited early override

- **Date:** 2026-11-03 07:23 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/utils/holding_stay.py`, `backend/app/routes/holding.py`, `backend/app/routes/adoptions.py`, `backend/app/schemas/holding.py`, `backend/app/schemas/adoption.py`, `backend/app/tasks/unassigned_checker.py`, `backend/tests/test_holding_stay_limit.py`, `backend/tests/test_adoption_eligibility.py`, `frontend/src/utils/useStayLimit.ts`, `frontend/src/utils/useCachedState.ts`, `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`, `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/tests/holdingStayLimit.browser.mjs`, `docs/01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0723_holding-stay-limit-server-enforced.md`
- **Authorization:** the developer asked whether an animal can be adopted or impounded before its stay limit expires. They then approved the recommended fix (store the limit on the server as one Barangay setting set by the Head Officer or Admin, enforce it server-side for promote, impound and statuses 6/7, an audited early override with a reason, and a lock note on the page). Their answers: "whatever the brgy says how many days", "One value", "yes" (applies to animals already held).
- **Type:** Fix

## Problem

The stay limit lived only in each staff member's browser and started at 0 days.

- `PATCH /holding/{id}` never checked it for Impounded (8), For Adoption (6) or Adopted (7).
- `POST /adoptions/promote/{id}` checked it against the number the browser sent, which was 0 when nothing was sent.

Regular staff could therefore adopt or impound an animal at any time.

## Key changes

- **Backend:**
  - `holding_stay.py`:
    - one stored limit (`system_settings` `holding_stay_limit_days`; default 7, range 0–90);
    - `stay_progress`;
    - `require_stay_limit`: refuses regular staff before the limit (409, with the available date); the Head Officer or an Administrator needs a reason of 5+ characters (400 otherwise); the early action is audited as `EARLY_STAY_LIMIT_OVERRIDE` in the caller's transaction.
  - `GET /holding/stay-limit` (staff and admin) and `PUT /holding/stay-limit` (Head Officer or Admin; audited as `UPDATE_HOLDING_STAY_LIMIT`).
  - Enforcement:
    - `PATCH /holding/{id}` to 6, 7 or 8 (not when moving on from For Adoption), with the reason added to the timeline note;
    - `POST /adoptions/promote/{id}`, where the browser's `min_stay_days` is now ignored.
  - `GET /holding/metrics` and the overdue reminder task use the stored limit; the `impound_days` parameter is ignored.
- **Frontend:**
  - `useStayLimit` (one shared request) and `stayLock`.
  - Barangay Settings: the stay-limit field reads and saves the server value. Only the Head Officer or an Administrator can edit it; a note says who last set it.
  - Holding Facility:
    - the limit is shown read-only, with a "Change in Settings" link for those allowed;
    - a "N of M days held · available on <date>" lock note for regular staff;
    - the early impound checkbox is replaced by a required reason box;
    - early promotion needs a reason, and the Promote button stays disabled until one is given;
    - the reason is sent to the server.
  - The dashboard and sidebar use the stored value. Every browser-stored copy (`holding_impound_stay_duration`) is removed.
- **`useCachedState` fix** (found while testing): in development, React's StrictMode runs state updaters twice. The helper remembered its first run and made the second return the old value, so a Barangay page opened with an empty cache (Holding Facility and others) stayed empty until refreshed. It now compares only with the previous state. Production builds were not affected.
- `test_adoption_eligibility.py` sets the Barangay's limit to 0 in its setup. The suite tests owner-return eligibility on freshly admitted animals; the stay limit has its own test.

## Validation evidence

- New `backend/tests/test_holding_stay_limit.py`: 32/32 passed (SQLite). It covers:
  - the default of 7, who may read and edit, the 0–90 range, and the audited change;
  - regular staff refused before the limit for impound, statuses 6 and 7, and promote, even when the browser sends 0 days or a reason;
  - the Head Officer or Admin refused without a reason or with a blank one, and allowed with one, with an audit entry and a timeline note;
  - allowed after the limit with no override recorded;
  - moving on from For Adoption not blocked again;
  - a leader refused;
  - metrics using the stored limit;
  - a limit of 0 means no waiting.
- Backend suites on SQLite all pass: 30 suites covering holding, adoption, claims, custody, owner return, location and print log. `test_adoption_eligibility` passes 29/29 after its setup line. Four related suites that don't use a throwaway SQLite database were not run.
- `npx tsc -b` passed. ESLint on the changed pages is equal or lower than before: Holding Facility 26→25, Settings 14, Dashboard 46, Sidebar 4. The new and changed utilities are clean.
- New `frontend/tests/holdingStayLimit.browser.mjs` passed. It checks:
  - staff see "2 of 7 days held · available on <date>", with an old browser value of 0 ignored, and no early Promote button;
  - the Head Officer's promote is disabled until a reason is typed, and the reason is sent while `min_stay_days` is not;
  - Settings is read-only for staff, showing the server value, and the Head Officer's change sends `PUT /holding/stay-limit`.
  - No browser errors; all API calls mocked.
- Other browser tests:
  - still passing: `historyCaseSummary`, `locationIntelligence`, `caseSummary`, and `claimFees` (14 scenarios, run against port 5173);
  - failing, and failing identically with the original `useCachedState`, so already broken and not changed here:
    - `petClaimRecords` ("reading 'observations'");
    - `phase2Holding` (the lost-pet dashboard section's "reading 'requested_alerts'" with that fixture).
- Not checked: the live backend and database with real sign-ins. The setting is created on first save; until then the default of 7 applies.
