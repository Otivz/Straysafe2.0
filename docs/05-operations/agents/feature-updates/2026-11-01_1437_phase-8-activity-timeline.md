# Phase 8: activity timelines and shared integrations

- **Date:** 2026-11-01 14:37 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/app/routes/warnings.py`, `backend/app/utils/case_closure.py`, `backend/app/routes/reports.py`, `backend/app/schemas/report.py`, `backend/app/utils/report_visibility.py`, `backend/tests/test_activity_timeline.py`, `frontend/src/utils/caseStages.ts`, `frontend/src/utils/caseTimeline.ts`, `frontend/src/components/RescueTimeline.tsx`, `frontend/tests/caseStagesObservation.test.mjs`, `docs/01-system/ACTIVITY_TIMELINE_RULES.md`, `docs/06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "okay, proceed to next step" (Phase 8 of `RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`). FREEZE was OFF.
- **Type:** Feature

## Intent

Show owner observation events on every report timeline with accurate dates. Show "Under observation until *date*" while an observation is open, and stop showing it once it ends. Keep owner names and contact details out of what other residents see. Change no shared chat, adoption, dashboard or notification code.

## Key changes

- `record_observation_event()` adds name-free **Observation started / extended / ended** entries to the report history. It is called from:
  - manual start, extension and close;
  - resolve and endorse;
  - the first-warning start and restart, replacing the old "3-day monitoring period" entry;
  - the case-closure hook, which ends the observation when the case closes, merges or escalates.
- Before this change, a manual start, an extension, a close or a closure-driven end wrote no timeline entry.
- Eight history entries in `warnings.py` and `owner_followups.py` passed `datetime.now(timezone.utc)` and sorted 8 hours early against database-clock entries. They now use the database clock. Two of them came from the Phase 6 change.
- `GET /reports/{id}` returns `observation` (open, status, UTC due date, extended, ended time, outcome) with no owner details.
- Timeline redaction for non-staff now also removes observed owners' names (including owners without an account) and any phone numbers or emails.
- Frontend:
  - `getCaseStages` / `getWhereNow` show the observation state, and keep the care step for facility bite observations and held animals.
  - `RescueTimeline` titles the observation entries.
  - `caseTimeline` never merges them with holding logs.

## Validation evidence

- `tests/test_activity_timeline.py` in `backend/`: 24/24 checks passed (isolated SQLite).
- `node --test tests/caseStagesObservation.test.mjs` in `frontend/`: 7/7. `node --test tests/*.test.mjs`: 79/79.
- These scripts exited 0, each run with `DATABASE_URL=sqlite:///:memory:` after confirming each sets up its own isolated database:
  - timeline and privacy: `test_official_reporter_timeline`, `test_pet_behavior_history`, `test_report_privacy`, `test_report_visibility`, `test_holding_privacy`;
  - observation and warnings: `test_owner_followups`, `test_under_observation_flow`, `test_owner_observation_updates`, `test_monitoring_logs`, `test_owner_warning_rules`, `test_case_closure`, `test_trust_rule`;
  - earlier phases: `test_claim_eligibility`, `test_manual_matching`, `test_lost_pet_contact`, `test_chat_isolation`, `test_case_claims`, `test_phase2_custody`;
  - adoption, handover and identity: `test_adoption_catalog_handover`, `test_adoption_single_record`, `test_pet_handover_sync`, `test_owner_return`, `test_identity_dispute`, `test_merge_pet_identity`, `test_push_notifications`.
- `npx tsc -b`: exit 0. ESLint on `caseStages.ts`, `caseTimeline.ts` and the new test file reports 33 errors, the same number as the committed versions of those files. No new lint errors.
- No command touched the local MySQL database in this change.
- Not done:
  - the source's chat routing and polling fixes (the source commit is not in this clone);
  - browser checks of long content and of the adoption and rescue timelines shown together.
