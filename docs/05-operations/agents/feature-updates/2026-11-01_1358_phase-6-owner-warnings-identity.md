# Phase 6: owner warnings, repeated incidents and leader identity verification

- **Date:** 2026-11-01 13:58 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/owner_followup.py`, `backend/app/models/leader_identity.py`, `backend/app/models/__init__.py`, `backend/app/utils/warning_rules.py`, `backend/app/utils/owner_followups.py`, `backend/app/utils/leader_identity.py`, `backend/app/utils/owner_returns.py`, `backend/app/utils/push_categories.py`, `backend/app/routes/warnings.py`, `backend/app/routes/owner_followups.py`, `backend/app/routes/leader_identity.py`, `backend/app/routes/matches.py`, `backend/app/main.py`, `backend/tests/test_owner_warning_rules.py`, `frontend/src/components/RepeatedReportBanner.tsx`, `frontend/src/components/LeaderIdentityConfirm.tsx`, `frontend/src/components/ReportWarningNotices.tsx`, `frontend/src/components/PetRecords/PetFollowUpSummary.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/citizen/ResidentPet.tsx`, `frontend/src/pages/citizen/ResiHomePage.tsx`, `docs/01-system/OWNER_WARNING_RULES.md`, `docs/06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "follow the logic of phase 6" (Phase 6 of `RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`). FREEZE was OFF.
- **Type:** Feature

## Intent

Implement Phase 6 of the restore plan: leader-only owner warnings, repeated incidents, verbal warnings for owners without accounts, scoped warning reads and acknowledgement, a staff pet-history summary, and leader identity verification. The source commit `ed80fa5` is not in this clone, so the work follows the checklist and the current code.

## Key changes

- **Warnings:**
  - Issuance is leader-only, for the handling leader in their own subdivision, to the registered pet's actual owner account.
  - One warning per incident, pet, violation and tier, never going back to a lower tier.
  - New endpoints: `GET /warnings/suggestion` (tier from history, instructions, comply-by date) and `GET /warnings/followup/{id}/incidents`.
  - Reads are scoped: residents see only their own notices, staff only their area.
  - Acknowledgement is owner-only, needs `confirmed: true`, and is idempotent.
- **Follow-ups:**
  - New `POST /{id}/verbal-warning` saves a contact entry for owners without an account.
  - The second warning is leader-only and no longer issues a warning to user #1 for owners without an account.
  - New repeat-incident endpoints and the `followup_repeated_incidents` table. Repeat detection excludes merged duplicates and logged incidents and alerts the leader once (periodic check and pet-link hook).
  - New staff-only `GET /pet/{id}/summary`.
- **Leader identity verification:**
  - New `leader_identity_verifications` table and `/leader-identity` endpoints.
  - Allowed after an owner rejection or 24 hours without an answer, for the handling leader, with a documented method and reason.
  - Excludes owner-first Manual Matching pairs, pending disputes and conflicts.
  - Links the report and notifies the owner, who can dispute. It is never handover proof (`owner_already_on_record`).
- **Bug fixes found while testing:**
  - A first warning on a logged repeat report used to open a second observation for the same pet.
  - The residents' acknowledgement checkbox was not enforced.
- **Frontend:**
  - Repeat banner with incidents and a verbal-warning form, and the leader identity panel, on the Subdivision report view.
  - Owner notices with checkbox acknowledgement on the resident report view.
  - Enforced checkbox on the My Pets and home warning modals.
  - Server-suggested tier and prefilled, editable remarks in the leader's warning form.
  - Staff summary in the pet history.

## Validation evidence

- `..\.venv\Scripts\python.exe tests/test_owner_warning_rules.py` in `backend/`: 81/81 checks passed (isolated SQLite).
- These scripts exited 0: `test_under_observation_flow`, `test_owner_observation_updates`, `test_owner_followups`, `test_monitoring_logs`, `test_trust_rule`, `test_admin_011_warnings`, `test_manual_matching`, `test_match_cases`, `test_matches_gaps`, `test_case_claims`, `test_identity_dispute`, `test_match_claim_shortcut`, `test_push_notifications`, `test_merge_pet_identity`, `test_case_review`.
- `npx tsc -b` in `frontend/`: exit 0. `npx eslint` on the four new frontend components: exit 0.
- Database note: an import check (`python -c "import app.main"`) and `test_admin_011_warnings` both ran the app's startup against the local development database (`localhost/straysafe_db`, from `.env`). Startup is non-destructive: it creates missing tables and columns. It created the new tables from this and earlier Manual Matching work. `test_admin_011_warnings` only read data. No data was deleted or changed.
- Not done: the new panels were not checked in a browser, and no native-device checks were run.
