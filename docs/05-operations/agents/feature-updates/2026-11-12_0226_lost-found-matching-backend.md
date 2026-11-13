# Lost & Found possible matches: backend

- **Date:** 2026-11-12 02:26 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/models/lost_found_match.py` (new), `backend/app/services/lost_found_matching.py` (new), `backend/app/routes/lost_found.py` (new), `backend/tests/test_lost_found_matching.py` (new), `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/routes/reports.py`, `backend/app/services/case_notes.py`, `backend/app/utils/push_categories.py`, `backend/tests/e2e_server.py`, `docs/01-system/LOST_FOUND_MATCHING.md` (new), `docs/01-system/DATABASE_SCHEMA.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/06-future-proposals/LEADER_INTERACTIVE_PROTOTYPE_2026-11-11.md`
- **Authorization:** The developer approved the corrected Lost & Found Leader prototype for production integration with the message "proceed" (2026-11-12), after the "Lost & Found Animal Workflow Correction" brief of 2026-11-11 that had required the prototype to be shown first. No commit, push, migration or database command was requested or run.
- **Type:** Feature

## Intent

Build, behind the approved prototype, the part of the Lost & Found workflow that needs the server: the system finds possible matches between a missing-pet report and a found-animal report in the background, in both directions, and only a Subdivision Leader's confirmation links them. Reuse what exists (case links, staff notes in the audit log, the possible-recovery conversation, the work queue, push categories) instead of building parallel systems. Change no other category, no case status and no lifecycle.

## Key changes

- **New table `lost_found_matches`** (model `LostFoundMatch`): the pair (unique), score, level, reasons, status (`pending`, `confirmed`, `rejected`, `moot`), who decided and when, and what a confirmation created. It is created by `Base.metadata.create_all` at the next backend start; nothing was run against the configured database.
- **Matching service.** `compare` scores what two reports say (kind of animal as a hard rule, colours, size, distinguishing features, collar, distance, time; weights are defaults). `suggest_for_report` checks one report against the open reports of the other kind in the same subdivision, in either direction, and tells only the Leaders. `suggest_after_filing` runs after a report is committed and **never blocks filing** (it rolls back its own work and prints a notice). `scan_subdivision` covers older reports.
- **Decisions.** `confirm` links the reports (`case_links`, type `same_animal`; nothing merged or hidden), writes one neutral history line and a staff note on each, audits it, turns the found report's other suggestions into `moot`, and tells both residents; when the lost report's notice is open it opens the existing possible-recovery conversation (owner and finder choose how to get in touch; the finder's own words are not copied). `reject` keeps the pair and tells nobody; `reopen` returns a ruled-out pair to waiting. Both reports are locked in a fixed order, so two Leaders cannot deadlock or both win.
- **Routes** (`/lost-found/matches`, `/lost-found/matches/{id}`, `.../decision`, `/lost-found/scan`): Subdivision Leader or Administrator only, scoped to the subdivision. The list puts waiting matches first.
- **Hook** in `routes/reports.py`: one call after a report is committed. **Work queue** (`case_notes.work_queue`): a `possible_matches` field. **Push categories**: `lost_found_review` and `lost_found_linked` use the pet-match category, and `lost_found_linked` opens the Resident's reports.
- A found report's title keeps place names as written (`_upper_first`, not `str.capitalize()`, which turned "Gate 2" into "gate 2").
- `backend/tests/e2e_server.py` includes the new router so the browser journeys can reach it.
- Left alone on purpose: the legacy AI matching (`report_matches`), which notifies owners when it suggests; the recovery process; case statuses and lifecycle. Documented in [LOST_FOUND_MATCHING.md](../../../01-system/LOST_FOUND_MATCHING.md), including the decisions the developer still has to confirm.

## Validation evidence

- `backend/tests/test_lost_found_matching.py`: 62 checks passed (both directions and either filing order; kind of animal; strong and possible; nobody but the Leader told before a decision; confirm, rule out, review again, moot; several found reports per lost report; closed reports; a failing check never blocks filing; scans; permissions and scope; the work queue; waiting-first ordering).
- Related backend suites, run one at a time, all passed: `test_case_notes_queue` (103), `test_lost_pet_lifecycle` (146), `test_lost_pet_registration_first` (82), `test_lost_pet_contact` (9), `test_lost_pet_sighting_ping` (50), `test_barangay_referrals` (49), `test_case_lifecycle` (160), `test_case_status_sync` (34), `test_case_privacy_scope` (59), `test_case_closure` (9), `test_active_case_requests` (17), `test_closed_case_suggestions` (14), `test_case_conversation` (11), `test_case_alignment_migrations` (61), `test_case_alignment_failure_handling` (42).
- **Failures that are not from this change** (each fails the same way on an untouched copy of the last commit): `test_case_gating` 12/19 (every failure is the refusal "Barangay accounts are no longer used", left by the legacy retirement), and, checked earlier the same way, `test_report_visibility` 80/81, `test_resident_live_api` (categories publication assertion) and `test_case_review` (`KeyError: 'can_review'`).
- The real-browser journey `frontend/tests/liveLostFound.browser.mjs` exercises these routes end to end on the real backend (see the record "Lost & Found possible matches: Leader screens").
- Documentation audit: see the Leader-screens record (the same 12 pre-existing failures, none new).
