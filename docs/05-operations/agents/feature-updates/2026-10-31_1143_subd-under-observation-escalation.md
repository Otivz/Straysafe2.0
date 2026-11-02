# Subdivision Leader Under Observation & Warning Escalation Logic

- **Date:** 2026-10-31 11:43 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/schemas/owner_followup.py`, `backend/app/routes/warnings.py`, `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/tests/test_under_observation_flow.py`, `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`
- **Authorization:** User prompt request: "STRAYSAFE — UNDER OBSERVATION & WARNING ESCALATION LOGIC"
- **Type:** Feature

## Intent

Implement the complete Subdivision Leader Under Observation module and warning escalation workflow connecting:
1. First Warning issuance as the official, server-side starting trigger for the 3-day observation countdown.
2. 3-day observation monitoring with follow-up notes and compliance checks.
3. Verified resolution requirement with authorized personnel remarks.
4. Automatic non-compliance flagging on expiration, with authorized review required before Second Warning issuance.
5. Strict gating for Barangay San Vicente endorsement, requiring an issued Second Warning and comprehensive case history forwarding.
6. 5-section UI organization (Active Observation, For Second Warning, Second Warning Issued, Endorsed to Barangay, Resolved).

## Key changes

- **`backend/app/schemas/owner_followup.py`**: Added `OwnerFollowUpResolveRequest` with mandatory verification notes, `OwnerFollowUpSecondWarningRequest`, and enriched `OwnerFollowUpOut` and `UnderObservationDashboardOut` with second warning fields, workflow section classification, verifier details, and section count metrics.
- **`backend/app/routes/warnings.py`**: Updated duplicate warning check to allow issuing higher warning levels (e.g. 2nd Warning) on the same report. Safe access to report pet attributes.
- **`backend/app/utils/owner_followups.py`**: Implemented `workflow_section` classification (`active`, `for_second_warning`, `second_warning_issued`, `endorsed`, `resolved`), server-side countdown timestamps starting strictly from First Warning issuance, and second warning metadata enrichment.
- **`backend/app/routes/owner_followups.py`**:
  - Implemented `POST /owner-followups/{followup_id}/resolve` requiring authorized verification remarks, setting report status to 11 (`Incident Resolved`), and logging audit history.
  - Implemented `POST /owner-followups/{followup_id}/issue-second-warning` to validate 3-day observation expiration, prevent duplicates, record `OwnerWarning` (2nd Warning), and log audit history.
  - Updated `POST /owner-followups/{followup_id}/endorse-barangay` to strictly enforce Second Warning prerequisite, prevent duplicate endorsements, forward full case history, and set report status to 4 (`Escalated to Barangay`).
  - Added section counts to `/under-observation` dashboard endpoint.
- **`backend/tests/test_under_observation_flow.py`**: Created comprehensive integration test suite verifying all 33 lifecycle rules and edge cases.
- **`frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`**: Updated UI to structure into 5 distinct workflow section tabs with live counts, interactive stat cards, Verified Resolution modal, Issue Second Warning modal, Endorsement to Barangay modal, and section-specific cards and table action buttons.

## Validation evidence

- Backend integration test execution (`..\.venv\Scripts\python.exe tests/test_under_observation_flow.py`): 33 checks passed, 0 failed.
- Frontend test execution (`node --test frontend/tests/phase4FollowUpRules.test.mjs`): 5 passed, 0 failed.
- Frontend TypeScript type check (`npx tsc --noEmit`): 0 errors.
