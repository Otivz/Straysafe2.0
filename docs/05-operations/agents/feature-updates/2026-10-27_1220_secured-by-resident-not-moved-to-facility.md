# "Secured by Resident" no longer moves the report to a holding facility

- **Date:** 2026-10-27 12:20 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/Modals/ResolveLostPetModal.tsx`, `backend/app/routes/reports.py`, `docs/05-operations/agents/feature-updates/2026-10-27_1220_secured-by-resident-not-moved-to-facility.md`
- **Authorization:** the developer's report that choosing "Secured by Resident (Awaiting Pickup)" was recorded as "Moved to Holding Facility ... Barangay San Vicente Animal Impound Facility".
- **Type:** Fix

## Intent

"Secured by Resident (Awaiting Pickup)" means a resident still holds the animal. It was being recorded as an admission to a holding facility.

## Cause

For a report not yet escalated, the status modal sent status 7 (Under Observation) with this choice. The status route treats 7 and 8 as "in a facility": with no facility given it picks the first holding facility, moves the report's pin and landmark there and writes "Animal secured in holding facility ... (Relocated from ...)". The rescue timeline shows every status 7 as "Moved to Holding Facility".

## Key changes

- Modal: "Secured by Resident" keeps the report's current status (1, 2, 15 or 16; otherwise 2 Verified) instead of sending 7. Escalated reports still keep 4 or 5, as before. The custody becomes "Secured by Resident".
- Modal: the "Secured by Resident" choice is hidden when the animal is already in a facility (status 7 or 8, a facility set, or a facility custody), because both cannot be true.
- Backend: `PATCH /reports/{id}/status` no longer picks a holding facility automatically when the custody is "Secured by Resident". An explicitly chosen facility is still honoured.
- Not changed: report #10 in the local database, which was recorded this way at 19:43 (after being placed in the Selera Homes Temporary Holding Pen at 19:25) and now shows the Barangay impound facility. Left for the developer to decide.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors; `reports.py` parses.
- Isolated backend tests (own SQLite database): `test_holding_stay_clock.py` 17/17, `test_multi_animal_split.py` 114/114, `test_case_gating.py` 20/20, `test_report_original_location.py` 5/5.
- Not covered: no automated test for the new "Secured by Resident" rule; not checked in a browser.
