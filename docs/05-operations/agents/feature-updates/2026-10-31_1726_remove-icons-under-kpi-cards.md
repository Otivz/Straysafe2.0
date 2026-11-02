# Remove Icons from Workflow Status Tabs Under KPI Cards

- **Date:** 2026-10-31 17:26 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`
- **Authorization:** User request: "remove the icons under the kpi cards @[SubdUnderObservation.tsx]"
- **Type:** Polish

## Intent

Streamline the appearance of the workflow filter tab bar located directly under the KPI cards on `/subd/under-observation` by removing the icon/emoji prefixes (`●`, `⏱️`, `⚠️`, `📜`, `🏛️`, `✓`).

## Key changes

- Removed emoji and dot indicators from the 6 workflow status tab pills (`All Cases`, `Active Observation`, `For Second Warning`, `Second Warning Issued`, `Endorsed to Barangay`, `Resolved`) under the KPI summary cards in `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`.

## Validation evidence

- Executed `npx tsc --noEmit` in `frontend/`: Exited with code 0.
- Executed `..\.venv\Scripts\python.exe tests/test_under_observation_flow.py` in `backend/`: 33 passed, 0 failed.
