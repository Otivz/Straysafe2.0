# Restore Phase 3 owner follow-up backend

- **Date:** 2026-10-30 16:38 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `backend/app/models/__init__.py`, `backend/app/models/owner_followup.py`, `backend/app/schemas/owner_followup.py`, `backend/app/utils/owner_followups.py`, `backend/app/utils/case_closure.py`, `backend/app/routes/owner_followups.py`, `backend/app/tasks/unassigned_checker.py`, `backend/app/main.py`, `backend/tests/test_owner_followups.py`, `docs/01-system/OWNER_FOLLOWUP_RULES.md`, `docs/06-future-proposals/README.md`, `docs/06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-30_1638_phase-3-owner-followup.md`
- **Authorization:** Developer request "do the phase 3" following the review and evaluation of `RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`, preserving adoption and non-destructive operations.
- **Type:** Fix

## Intent

Implement Phase 3 of the restoration checklist: the backend owner follow-up (pet under observation) workflow, data models, business validation rules, endpoints, and background scheduling, without breaking adoption workflows or running destructive database resets.

## Key changes

- **Data Models:** Created `OwnerFollowUp` and `FollowUpContactLog` models in `backend/app/models/owner_followup.py`. Registered in `backend/app/models/__init__.py`.
- **Pydantic Schemas:** Defined request and response schemas in `backend/app/schemas/owner_followup.py` for start, single reasoned extension, close/complied outcomes, acknowledgements, owner updates with photo evidence, and staff contact logs.
- **Business Logic & Rules:** Implemented `backend/app/utils/owner_followups.py` with:
  - Role check (Subdivision Leader and Admin only) and subdivision boundary enforcement.
  - Rabies exclusion: rejects observations for suspected rabies cases (immediate escalation required).
  - Staff caution signals: warns staff on high priority, bite history, injury, or aggression.
  - Concurrency guard: prevents multiple concurrent active observations on the same registered pet across all reports, and prevents duplicate active observations on the same report.
  - Single reasoned extension rule: enforces exactly one extension with mandatory justification; rejects subsequent extension attempts.
  - Privacy and field redaction: private owner phone numbers, internal staff notes, and contact logs are redacted from regular citizens and unauthorized viewers.
  - Offline owner support: supports owners without user accounts by recording names, phone numbers, and addresses, and logging in-person/verbal contact logs.
- **Case Closure Sync:** Updated `backend/app/utils/case_closure.py` so that closing or escalating a report automatically ends any active observation period with a status-derived closure reason.
- **Operations Watcher & Notifications:** Integrated `check_and_notify_owner_followups` into `backend/app/tasks/unassigned_checker.py` to deliver 24-hour owner reminder notices and leader due notices without duplicate delivery. Deadline expiry does not silently close or escalate cases.
- **API Endpoints:** Mounted `owner_followups.router` in `backend/app/main.py` with full REST routes and added non-destructive `ensure_owner_followup_tables()` startup handler.
- **Documentation & Tests:** Added system rules in `docs/01-system/OWNER_FOLLOWUP_RULES.md`, updated indices and the restoration proposal checklist, and created isolated backend test suite.

## Validation evidence

- **Backend Test Suite:** `backend/tests/test_owner_followups.py` passed 40 out of 40 checks:
  - Role-based initiation, jurisdiction validation, closed/escalated/held/rabies refusal guards.
  - Staff caution signals on high-priority / aggressive cases.
  - Concurrency checks preventing duplicate observations on the same pet.
  - Offline owner contact logs and privacy redaction for regular citizens.
  - In-app and verbal owner acknowledgements.
  - Owner status updates and photo URL submissions.
  - Single extension enforcement (second extension strictly rejected with HTTP 400).
  - Complied and closure outcomes with audit reasons.
  - Automatic case closure synchronization via SQLAlchemy before_flush event.
  - Global default observation duration setting update without affecting existing observations.
  - Deduplicated due notices and reminder delivery.
- **Regression Checks:**
  - `backend/tests/test_case_closure.py`: 9/9 checks passed.
  - `backend/tests/test_phase2_custody.py`: 18/18 checks passed.
  - `backend/tests/test_match_claim_shortcut.py`: 12/12 checks passed.
- **Code & Diff Integrity:** `git diff --check` passed with no trailing whitespace or format issues.
- **Operational Safety:** No remote/production database migrations, `.env` file changes, or Git history mutations were performed.
