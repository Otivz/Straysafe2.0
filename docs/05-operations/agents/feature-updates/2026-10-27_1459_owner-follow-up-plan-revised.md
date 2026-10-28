# Owner follow-up plan revised into a build-ready plan

- **Date:** 2026-10-27 14:59 (UTC)
- **AI tool:** Claude Code (Sonnet 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/06-future-proposals/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-27_1459_owner-follow-up-plan-revised.md`
- **Authorization:** the developer's request "for the follow up make a plan for that in an md file".
- **Type:** Polish

## Intent

The earlier plan (`2026-10-27_1423_owner-follow-up-plan`) described the idea. This revision makes it something that can be built phase by phase.

## Key changes

- Status updated: step 1 (hiding the subdivision holding place) is done; the follow-up is not built.
- Added: the states and what each ending choice does to the report, table columns, an API table with who may call each endpoint, a screens section (a separate Owner Follow-up page, since the leader's holding page is now the Barangay view), edge cases, checklist phases (0 to 4), tests, the files likely to change, and risks.
- Two rules found in the code are now in the plan: resolving or escalating a report needs the animal in Pet Records or Holding records first (`require_animal_record`), and the reports list does not yet restrict staff by subdivision, so the new endpoints must check scope on the server.
- Open questions now carry recommended defaults, marked as not decided.
- No code, database or data was changed.

## Validation evidence

- Code facts (statuses and rules in `case_review.py`, the watcher in `unassigned_checker.py`, `dispatch_notification`, router registration in `main.py`) were read from the repository on this date. The strict documentation audit result is reported in the session.
