# Owner follow-up plan: screens moved to the report page

- **Date:** 2026-10-28 04:05 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-10-28_0405_follow-up-on-report-page-plan.md`
- **Authorization:** the developer's questions "is it possible that in the report you put there the follow up?" and "can the observing put in the report view?", then "could you put it in the SUBDIVISION_OWNER_FOLLOW_UP_PLAN".
- **Type:** Feature (plan only)

## Intent

The owner follow-up is shown and handled on the leader's report page instead of a separate "Owner Follow-up" page.

## Key changes

- Section 7 (Screens) rewritten: a follow-up card on `SubdViewReport.tsx` with three states (start, observing, ended), the ending buttons, an "Observing"/"Due" badge and filter in the leader's report list, the owner's "Yes, this is my pet" on their report page, and a read-only section for Barangay staff on an escalated report.
- Phase 2 checklist and the frontend file list updated; no new page, route or menu entry.
- No code changed; the Phase 1 backend already offers `GET /owner-followups/by-report/{report_id}`.

## Validation evidence

- Documentation only. Not built.
