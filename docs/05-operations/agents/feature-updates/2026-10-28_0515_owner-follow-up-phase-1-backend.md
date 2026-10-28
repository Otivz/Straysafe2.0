# Owner follow-up Phase 1: backend (complaint about a registered pet)

- **Date:** 2026-10-28 05:15 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/models/owner_followup.py` (new), `backend/app/utils/owner_followups.py` (new), `backend/app/schemas/owner_followup.py` (new), `backend/app/routes/owner_followups.py` (new), `backend/tests/test_owner_followups.py` (new), `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/utils/case_closure.py`, `backend/app/tasks/unassigned_checker.py`, `Database3.3.txt`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-28_0515_owner-follow-up-phase-1-backend.md`
- **Authorization:** the developer answered "yes" to question 6 (reuse the existing owner warning) after asking to check the plan is ready to implement, following "ADD PHASES AND CHECKLIST SO WE CAN IMPELEMENT IT right away".
- **Type:** New feature (approved by the developer)

## Intent

Steps 1A to 1G of the plan: the server side of the 3-day observation of a complaint about a registered pet with a known owner.

## Key changes

- Tables `owner_followups` (owner snapshot, acknowledgement, one extension, closing) and `owner_followup_contacts` (Phone, In person, In-app, Owner update, Repeated incident; photo and related report). Created at startup when missing; also in `Database3.3.txt`.
- Rules (`utils/owner_followups.py`): observation length setting (default 3, 1 to 14); who may start and on which report (leader handling an open report in their subdivision, linked to a pet with an owner, not escalated, not held in a facility, not a group report, one at a time); the owner from the pet's owner account or the owner without an account on the pet record; ending on report closure or escalation; reminders and due notices.
- Router `/owner-followups` (12 routes): start, list, by report, contacts, owner update with photo (`async`), acknowledge (owner in the app, leader by phone for an owner without an account), extend once, close (owner complied or incident resolved = 11, false alarm = 14, through the existing status route), settings (administrator). Server-side role and scope checks; Barangay staff see escalated follow-ups only; the owner gets a view without the leader's notes.
- Notifications: the owner (with an account) is told of the complaint and to keep the pet confined, reminded a day before the due time, told of an extension and of the closing; the leader is told of acknowledgements, owner updates and the due time. Nothing closes or escalates by itself.
- `case_closure.py` imports the rules module at the top (not inside the save hook), avoiding the "deque mutated during iteration" error of the removed attempt.
- Report status is never changed to 7; no facility is set.

## Validation evidence

- `backend/tests/test_owner_followups.py`: 69/69 checks (throwaway SQLite database, real JWT, fake photo upload).
- All 86 isolated backend test files pass. All routers and the watcher import in `main.py`'s order.
- The local MySQL database gets the two empty tables on the next backend restart; nothing existing changes. No screen yet: the leader's report page still shows the static preview until Phase 2.
