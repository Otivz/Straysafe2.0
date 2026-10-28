# Owner follow-up plan: complaint scenario and implementation checklist

- **Date:** 2026-10-28 04:35 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-28_0435_follow-up-plan-complaint-checklist.md`
- **Authorization:** the developer's statement "3 day rule are for the subd checking if the owner of the pet do something about his pet", then "ADD PHASES AND CHECKLIST SO WE CAN IMPELEMENT IT right away".
- **Type:** Feature (plan only)

## Intent

Make the plan match the confirmed scenario and give a step-by-step checklist that can be built from directly.

## Key changes

- Scenario: a complaint about a registered pet with a known owner (replaces the found-animal / suspected-owner version). No typed-in owner; "Owner complied" closes the report as Incident Resolved (11) instead of returning an animal; the owner "acknowledges" (in the app or by phone) instead of confirming "that's my pet".
- Data, API, screens, edge cases and tests rewritten for that scenario (acknowledgement, owner update with photo, one extension, escalation any time).
- Section 9 is now a numbered checklist: Phase 0 (commit baseline, confirm the 3-day rule, decide the owner-warning question, record the green test baseline), Phase 1 steps 1A to 1G (backend), Phase 2 steps 2A to 2F (leader card replacing the preview), Phase 3 steps 3A to 3D (owner, notifications, Barangay), Phase 4 (documents). Each step names its files and a "done when"; rules for every step include the lessons from the removed attempt.
- New open question 6 (owner warning from the follow-up) and 7 (is the 3-day rule official).
- Checked in the code: a report with `pet_id` already satisfies the animal-record rule, so status 11 is allowed; the escalation dialog exists on `SubdViewReport.tsx`; notification types are mapped to pages in the navbars.

## Validation evidence

- Documentation only. The static preview card was not changed and still uses the earlier wording (step 2B replaces it).
