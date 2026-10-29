# Owner warnings in the follow-up plan: leader only (decision and proposal)

- **Date:** 2026-10-29 04:07 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/README.md`, this record (no code change)
- **Authorization:** the developer: "the leader only give the warning", then "yes." to adding the leader-only rule to the workflow in the plan and leaving the Barangay's action as an open question. Earlier the developer said "dont implement anything yet".
- **Type:** Polish (documentation)

## Intent

Record the developer's decision that only the Subdivision Leader issues owner warnings, and the proposed warning workflow for a repeatedly roaming owned dog, in the owner follow-up plan. Nothing is built.

## Key changes

- New section 15: the decision (leader only, all four tiers; the Barangay and the administrator do not warn; the leader gives the Final Notice, then escalates). It also covers the proposed rule (one warning per verified incident, during or after the observation), what exists in the code today, and the changes needed (none built, no new tables or statuses).
- Section 2: the "Owner warning at the end" row is now decided. Section 10: question 6 is decided, and new open questions 8 to 11 were added (what the Barangay does with an escalated case, owner confirmation before warning, non-roaming reports, warning required or optional). Section 4.3 and the Phase 0 checklist point to section 15.
- Status line: notes that the follow-up was built on 2026-10-28 (the old "not built" line is kept and marked outdated); the section 9 checkboxes were left as they were.
- `docs/README.md`: the plan's row mentions the warning decision.

## Validation evidence

- The facts in section 15 were read from `backend/app/routes/warnings.py`, `backend/app/models/warning.py`, `backend/app/routes/owner_followups.py`, `backend/app/utils/owner_followups.py`, `backend/app/routes/matches.py` and `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx` on 2026-10-29.
- Not checked: whether a Barangay or administrator screen has a warning button.
