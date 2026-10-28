# Owner follow-up plan: all open questions answered

- **Date:** 2026-10-27 15:38 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-10-27_1538_owner-follow-up-decisions.md`
- **Authorization:** the developer's answers "1 no" (no extension) and "ok" to the two suggestions for questions 2 and 3 (app confirmation for an owner with an account, the leader's logged phone confirmation for one without; a potential match or a typed-in owner, picked by the leader before anyone is notified), after answering 3 days as default and option A earlier the same day.
- **Type:** Polish

## Intent

Finish Phase 0 of the plan: every open question has an answer, so the feature can be built from it.

## Key changes

- Section 10 now lists the five answers. Only one item remains outside the plan: confirming with the adviser or barangay that the 3-day rule is real.
- Starting a follow-up: the leader picks the owner, from a potential match or by typing a name and phone; no notification before that.
- Observation: owner confirmation in the app, or the leader's logged phone confirmation; the leader always confirms the pickup; no extension.
- "Owner acted" requires the owner's confirmation. The data gained `owner_confirmed_at`, `owner_confirmed_via` and `owner_confirmation_note`; the API gained `POST /owner-followups/{id}/owner-confirmation` and the start request accepts a chosen match or a typed-in owner.
- New tests listed for these rules; Phase 0 checklist item ticked.
- No code or data was changed.

## Validation evidence

- Documentation only. The strict documentation audit result is reported in the session.
