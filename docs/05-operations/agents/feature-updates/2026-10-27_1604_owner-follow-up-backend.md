# Owner follow-up: backend (Phase 1)

- **Date:** 2026-10-27 16:04 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/models/owner_followup.py` (new), `backend/app/models/__init__.py`, `backend/app/schemas/owner_followup.py` (new), `backend/app/routes/owner_followups.py` (new), `backend/app/utils/owner_followups.py` (new), `backend/app/utils/case_closure.py`, `backend/app/main.py`, `backend/app/tasks/unassigned_checker.py`, `backend/tests/test_owner_followups.py` (new), `Database3.3.txt`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-27_1604_owner-follow-up-backend.md`
- **Authorization:** the developer's "phase 1" (build Phase 1 of `SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`), after answering all its open questions on 2026-10-27.
- **Type:** Feature

## Intent

The subdivision holds no animals. For an animal with a suspected owner, the Subdivision Leader handling the report contacts the owner and observes for 3 days, then closes the case or escalates it. This change adds the server side; the leader screens are Phase 2.

## Key changes

- **Data:** tables `owner_followups` and `owner_followup_contacts`. The API creates them at startup (`Base.metadata.create_all`, as for every table in this project) when missing; nothing existing changes. Also added to `Database3.3.txt` so a reset keeps them. Setting `owner_followup_days` in `system_settings` (default 3 when absent, 1 to 14).
- **API** (`/owner-followups`): start (from a potential match with an owner, or an owner typed in with name and phone), list (leader: own subdivision; Barangay staff: escalated follow-ups of their barangay only; admin: all; residents: none), one report's follow-up (the suspected owner sees dates and state only), contact log, owner confirmation (in the app by an owner with an account; by the leader, with a note, for one without), close (Owner Acted needs the confirmation and goes through status 9; or Incident Resolved 11, Animal Cannot Be Found 17, False Alarm 14), settings (admin writes).
- **Rules reused, not copied:** writes need the leader handling the report (`verify_subdivision_scope`, `require_leader_claim`); closing calls the existing `update_report_status`, so the animal-record and owner-return rules apply, and a refusal leaves the follow-up open. Escalation stays the existing report escalation (letter, status 4, rescue request); the plan's separate escalate endpoint was dropped to avoid a second escalation path.
- **Ended by the report:** the existing `before_flush` hook in `case_closure.py` now also ends an open follow-up when its report closes (status `Report Closed`) or reaches status 4 (`Escalated`), from any route. A fifth status, `Report Closed`, was added for that.
- **Notifications:** the owner (with an account) is notified only after the leader starts the follow-up; one reminder a day before the due time; the leader is notified once when it is due. Nothing closes or escalates by itself. The check runs in the existing background watcher.
- The plan's Phase 1 checklist is ticked and its escalation, tables and API sections match what was built.

## Validation evidence

- New `backend/tests/test_owner_followups.py` (own SQLite database, real JWT, the real status route): 61/61 checks.
- Every isolated backend test file: 86 passed, 0 failed (14 files that do not use an isolated database were not run). A first run failed 4 files with "deque mutated during iteration": the hook loaded `owner_followups` inside the flush, which registered another listener during the flush. Fixed by importing it when `case_closure` loads; all 86 then passed.
- All routers and the background watcher import in `main.py`'s order. `app.main` itself was not started: its startup code needs MySQL, and starting it against the developer's database would create the two new tables there.
- Not done: leader screens (Phase 2), owner and Barangay views (Phase 3), browser checks.
