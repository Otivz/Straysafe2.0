# Owner follow-up: classmate's review taken in (plan and UI preview)

- **Date:** 2026-10-28 04:22 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `frontend/src/components/OwnerFollowUpPreview.tsx`, `docs/05-operations/agents/feature-updates/2026-10-28_0422_follow-up-classmate-review.md`
- **Authorization:** the developer shared a classmate's suggested flow ("my classmate suggest this review first") and answered "extension is alright" to the question whether to allow one extension with a reason.
- **Type:** Polish (plan and UI preview only)

## Intent

Bring the plan and the preview in line with the classmate's flow (receive and validate, follow up, evaluate and resolve or escalate), where it fits the system.

## Key changes

- Plan: one extension allowed, with a reason (revises the 2026-10-27 "no extension" answer); the leader may escalate at any time when the problem continues or the animal is a danger; the owner is asked to keep the pet confined; the owner may send a photo or update; repeated incidents are logged and bites or chases go to the pet's behaviour history; "Under Observation" is the follow-up's label only, never report status 7 (which means "in a holding facility" to the server). States diagram, data (extension columns, contact types, photo, related report), screens, tests and the defense wording updated.
- Preview card: "Under Observation" label, the confine instruction, "Extend once" with a reason, contact types "Owner update" and "Repeated incident", a simulated owner photo update, and escalation available at any time. Still static: nothing saved.
- Open: whether the follow-up covers a found animal with a suspected owner, a complaint about a known owner's pet, or both.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. Not checked in a browser.
