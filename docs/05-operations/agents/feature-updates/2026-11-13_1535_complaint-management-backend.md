# Complaint management: database, report fields and the complaints API (in progress)

- **Date:** 2026-11-13 15:35 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/migrations/2026-11-13_complaint_management.sql`, `backend/app/db_migrations/complaint_management.py`, `backend/app/models/complaint.py`, `backend/app/models/report.py`, `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/schemas/case.py`, `backend/app/schemas/report.py`, `backend/app/schemas/complaint.py`, `backend/app/routes/reports.py`, `backend/app/routes/complaints.py`, `backend/app/services/complaints.py`, `backend/app/utils/complaint_rules.py`, `backend/app/utils/report_visibility.py`, `docs/03-development/implementation-reports/COMPLAINT_MANAGEMENT_HANDOFF_2026-11-13.md`, `docs/03-development/implementation-reports/COMPLAINT_MANAGEMENT_MOCKUP_2026-11-13.html`, `docs/README.md`
- **Authorization:** The developer's brief "StraySafe 2.0 — Complaint Management & Progressive Enforcement" (2026-11-13), the reviewed proposal and mockup, and the developer's "for now you may proceed with the implementation"; the developer's request to leave a continuation context so the task can be finished by another agent.
- **Type:** Feature

## Intent

Build the server side of complaint management on the existing case system: the Leader's findings on a complaint, the offense count per person and per rule, the enforcement steps the subdivision's policy asks for, owner leads, and the complainant's optional suggestion of the owner. Work is in progress; the handoff document lists what remains.

## Key changes

- **Migration (additive, run once):** `reports` gains `seen_at` and three `suspected_owner_*` columns; new tables `complaint_respondents`, `complaint_findings`, `complaint_offenses`, `enforcement_steps`, `enforcement_step_events`. The backend checks for them at start-up and refuses to start, naming the file, until they exist. Not applied to any database yet.
- **Counting:** an offense counts only for a verified incident, a confirmed rule and a person confirmed with evidence; the number is 1 + the person's earlier counted offenses under the same rule (inside the rule's optional counting window), suggested by StraySafe and confirmed by the Leader (a stale suggestion is refused). Different rules count separately; a second report of the same occurrence is linked and closed as a duplicate; a correction voids the decision without deleting it.
- **Steps:** letters (prepared, issued, delivered or not, every attempt kept), the summons (date set by the second letter, attendance only after that letter was delivered), the fine (amount read from the confirmed rule, refused without one; imposed, then paid) and the Barangay meeting (creates or reuses the case's open Barangay referral). Append-only events with retry protection.
- **Rules settings:** a policy may now hold an optional fine amount and an optional counting window; neither is assumed.
- **Report filing and privacy:** `seen_at` is stored (never in the future); the suggestion of the owner is kept on animal complaints only and returned only to the reporter and staff; the reporter gets `complaint_verified`. The complainant's timeline gets neutral lines only.
- **Continuation:** the handoff document (status, decisions, API contract, conventions, remaining work, checklist) and a copy of the approved mockup were added for whoever continues.

## Validation evidence

- The new modules import and every table (including the new ones) is created on the isolated SQLite test database.
- Not yet run: dedicated backend tests, the frontend, the docs audit, the migration on MySQL (see the handoff checklist).
