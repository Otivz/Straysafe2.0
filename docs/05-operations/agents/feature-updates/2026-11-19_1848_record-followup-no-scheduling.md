# Remove Scheduling from Record Follow-up Modal

- **Date:** 2026-11-19 18:48 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/case_vocab.py`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/data/constants.ts`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/live/adapters.ts`, `docs/README.md`
- **Authorization:** User feature update request ("Update Record Follow-up – Remove Scheduling Functionality")
- **Type:** Polish

## Intent

Convert the Subdivision Admin's **Record follow-up** modal from a scheduling/completed hybrid form into a dedicated completed-activity documentation form with automatic submission timestamping and Activity Timeline + History integration.

## Key changes

- **`backend/app/utils/case_vocab.py`**, **`frontend/src/admin/data/types.ts`**, **`frontend/src/admin/data/constants.ts`**:
  - Added `coordination_update` (`Coordination Update`), `rescue_update` (`Rescue Update`), and `welfare_check` (`Welfare Check`) alongside `follow_up` (`Follow-up`) in `FOLLOWUP_KINDS` and `FOLLOWUP_MANUAL_KINDS`, while preserving legacy kind labels for historical records.
- **`frontend/src/admin/dialogs/ActionDialogs.tsx`**:
  - Removed `"Schedule for later"`, `"Already done"`, the `Due` datetime-local input, and `"Schedule follow-up"` button from `FollowUpDialog` (`mode === 'follow_up'`).
  - Replaced them with **Type**, **What Happened** (required), **Details** (optional), **Date and Time** (automatically recorded upon submission), and **Save Follow-up** button submitting `doneNow: true, dueAt: null`.
- **`frontend/src/admin/pages/case/ActionsTab.tsx`**, **`frontend/src/admin/live/adapters.ts`**:
  - Updated `actionTimeline` and `caseFromDetail` so every saved follow-up entry displays its activity type, `Completed` status, description, details, administrator's name, and submission date/time in both the **Activity timeline** and **History** tab.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
- `.venv\Scripts\python -m py_compile backend/app/utils/case_vocab.py`: verified.
