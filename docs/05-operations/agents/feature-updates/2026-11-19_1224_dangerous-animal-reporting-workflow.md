# Dangerous Animal Reporting Workflow

- **Date:** 2026-11-19 12:24 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/dangerous_rules.py`, `backend/app/schemas/report.py`, `backend/app/schemas/case.py`, `backend/app/utils/notification_dispatcher.py`, `backend/app/routes/reports.py`, `backend/app/services/case_lifecycle.py`, `frontend/src/resident/data/constants.ts`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/data/reducer.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/src/admin/pages/NoticeEditorPage.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/dialogs/ClosureDialogs.tsx`, `docs/README.md`
- **Authorization:** User request for Feature Implementation: Dangerous Animal Reporting Workflow
- **Type:** Feature

## Intent

Implement a specialized **Dangerous Animal Reporting Workflow** (`safety` category family) for STRAY-SAFE 2.0 covering resident reporting (multi-select dangerous behaviors, conditional bite/attack incident details with medical warning, conditional suspected rabies warning signs, current aggression/location checks, safety warning), backend-authoritative safety risk prioritization (`URGENT` / `HIGH` / `Moderate`), idempotent Subdivision Leader notifications, Attention Queue prominence, specialized safety risk assessment with auditable priority adjustment, security & external authority coordination, **Publish Safety Advisory** integration, and mandatory Dangerous Animal Incident Outcome resolution checks.

## Key changes

### Backend
1. **`backend/app/utils/dangerous_rules.py`**: Added behavior/rabies/closure vocabularies, `format_dangerous_condition`, backend-authoritative `evaluate_dangerous_priority`, and `format_dangerous_assessment_summary`.
2. **`backend/app/schemas/report.py` & `backend/app/routes/reports.py`**:
   - Accepted `dangerous_behaviors`, `dangerous_other_detail`, `current_danger`, `still_in_location`, `bite_details`, `rabies_symptoms`, and `movement_direction` in `ReportCreate`.
   - Enforced backend safety priority rules (actual bite, attempted bite/attack, chasing people, suspected rabies with active danger -> `urgent`; aggressive/roaming/repeated -> `high`; calm -> `normal`) and logged `StatusHistory` + `AuditLog` (`AUTO_SAFETY_PRIORITY`).
3. **`backend/app/utils/notification_dispatcher.py`**: Added `notify_leader_dangerous_animal` with idempotency keys and urgent safety alert messaging.
4. **`backend/app/schemas/case.py` & `backend/app/services/case_lifecycle.py`**:
   - Added `DangerousAssessmentIn` to `AssessmentIn`, required `priority_change_reason` when adjusting safety priority, and preserved original automatic priority notes.
   - Added `dangerous_outcome`, `security_actions_performed`, `advisory_status`, and `threat_ongoing` to `CloseIn`, blocking resolved closures when `threat_ongoing == "Yes"`.

### Frontend
1. **Resident (`DetailsPage.tsx`, `ReviewPage.tsx`, `constants.ts`, `types.ts`, `reducer.ts`, `actions.ts`, `adapters.ts`)**:
   - Added dangerous behavior chips, conditional Bite & Attack Incident details + medical attention callout, conditional Suspected Rabies warning signs + professional evaluation warning, current danger & location checks, roaming direction, and safety warning.
2. **Admin (`DashboardPage.tsx`, `selectors.ts`, `AssessmentTab.tsx`, `ActionsTab.tsx`, `NoticeEditorPage.tsx`, `ClosureDialogs.tsx`)**:
   - Added `URGENT` (red) and `HIGH` (amber) badges and safety behavior/urgency reasons to the Attention Queue.
   - Added 8-field Safety Risk Assessment and official priority adjustment with mandatory reason in `AssessmentTab.tsx`.
   - Added **Coordinate security / guardhouse**, **Coordinate External Authority**, and **Publish Safety Advisory** quick actions in `ActionsTab.tsx` with pre-filled advisory template in `NoticeEditorPage.tsx`.
   - Added mandatory **Dangerous Animal Incident Outcome** and ongoing-threat guard in `CloseCaseDialog`.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`) succeeded with zero errors.
- `.venv\Scripts\python -m py_compile` passed across all modified backend files.
- Automated Python tests for `evaluate_dangerous_priority`, `format_dangerous_condition`, `ReportCreate`, `AssessmentIn`, and `CloseIn` passed (`DANGEROUS_WORKFLOW_TESTS_PASSED`).
