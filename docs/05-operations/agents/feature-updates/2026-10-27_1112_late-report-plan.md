# Plan for late reports of closed cases

- **Date:** 2026-10-27 11:12 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/LATE_REPORTS_FOR_CLOSED_CASES_PLAN.md`, `docs/06-future-proposals/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-27_1112_late-report-plan.md`
- **Authorization:** the developer's request "Add md plan for that" (after "once the report was resolved it disapears in the duplicate report").
- **Type:** Polish

## Intent

Record why a closed or impounded case disappears from duplicate detection, and a plan for linking a late report to it, before any code is changed.

## Key changes

- New proposal: the five places that hide closed cases, a separate "late report" suggestion for an open report against a case closed or impounded within 7 days, the leader's two choices, the reporter message, an optional "When did you see it?" field, tests, phases, open questions and a defense answer.
- Listed in `docs/06-future-proposals/README.md` and `docs/README.md`.
- No code was changed.

## Validation evidence

- Constants and rules quoted from `backend/app/routes/matches.py` and `backend/app/utils/case_groups.py` as of this date. The strict documentation audit result is reported in the session.
