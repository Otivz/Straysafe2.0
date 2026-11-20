# Injured / Sick Animal Reporting Workflow

- **Date:** 2026-11-19 11:44 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/injured_rules.py`, `backend/app/schemas/report.py`, `backend/app/schemas/case.py`, `backend/app/utils/notification_dispatcher.py`, `backend/app/routes/reports.py`, `backend/app/services/case_lifecycle.py`, `backend/app/services/case_summaries.py`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/data/reducer.ts`, `frontend/src/resident/data/constants.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/dialogs/ClosureDialogs.tsx`, `docs/README.md`
- **Authorization:** User request for Feature Implementation: Injured / Sick Animal Reporting Workflow
- **Type:** Feature

## Intent

Implement an end-to-end specialized **Injured / Sick Animal Reporting Workflow** in STRAY-SAFE 2.0 covering resident reporting (multi-select condition assessment, required mobility check, safety warning), backend-authoritative automatic URGENT priority when an animal cannot move, high-priority leader notifications, Attention Queue prominence, specialized clinical/welfare assessment with auditable priority adjustment, veterinary/barangay/guardhouse response coordination, and mandatory Animal Welfare Outcome documentation on case closure.

## Key changes

### Backend
1. **`backend/app/utils/injured_rules.py`**: Added condition/mobility/welfare outcome vocabularies, formatting & parsing helpers for `Report.condition`, and `is_unable_to_move()` evaluation.
2. **`backend/app/schemas/report.py` & `backend/app/routes/reports.py`**:
   - Accepted `injured_conditions`, `injured_other_detail`, and `can_move` in `ReportCreate`.
   - Enforced backend automatic urgent priority (`priority_level='High'`, `urgency_level='immediate'`, `urgency_note`) when `category == 'injured'` and `can_move == 'No'`, ignoring frontend priority overrides.
   - Logged `StatusHistory` and `AuditLog` (`AUTO_URGENT_PRIORITY`) entries on creation.
3. **`backend/app/utils/notification_dispatcher.py`**: Added `notify_leader_urgent_injured` with idempotency keys to alert subdivision leaders of immobile injured animal reports.
4. **`backend/app/schemas/case.py`, `backend/app/services/case_lifecycle.py`, `backend/app/services/case_summaries.py`**:
   - Added `InjuredAssessmentIn`, `priority_override`, and `priority_change_reason` to `AssessmentIn`, requiring a reason when lowering an automatically prioritized Urgent report and preserving the original auto-priority note.
   - Added `welfare_outcome`, `final_animal_condition`, `assistance_provided`, and `referral_outcome` to `CloseIn`, requiring welfare outcome documentation before closing an injured case.
   - Included `urgency_note` in `case_summaries` so the dashboard Attention Queue displays urgency reasons immediately.

### Frontend
1. **Resident (`DetailsPage.tsx`, `ReviewPage.tsx`, `constants.ts`, `types.ts`, `reducer.ts`, `actions.ts`, `adapters.ts`)**:
   - Added prominent safety reminder, multi-select observed conditions (with custom Other field), required `"Can the animal move?"` check, and automatic urgency notice when `No` is selected.
2. **Admin (`DashboardPage.tsx`, `selectors.ts`, `AssessmentTab.tsx`, `ActionsTab.tsx`, `ClosureDialogs.tsx`)**:
   - Added dark red `URGENT` badge, condition summary, and `"Urgent · Animal unable to move"` reason in the Attention Queue.
   - Added reported condition summary, 7-field clinical/welfare assessment inputs, official priority selector with mandatory adjustment reason, injured response coordination shortcuts, and mandatory Animal Welfare Outcome fields in `CloseCaseDialog`.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`) succeeded with zero errors.
- `.venv\Scripts\python -m py_compile` passed across all modified backend files.
- Python unit assertions for `injured_rules`, `priority_of`, `ReportCreate`, `AssessmentIn`, and `CloseIn` schemas passed (`INJURED_WORKFLOW_TESTS_PASSED`).
