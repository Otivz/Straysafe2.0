# Owner follow-up Phase 2: leader card and report-list badge

- **Date:** 2026-10-28 05:31 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/utils/ownerFollowUp.ts` (new), `frontend/src/components/OwnerFollowUpCard.tsx` (new), `frontend/src/components/OwnerFollowUpPreview.tsx` (deleted), `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdReports.tsx`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-28_0531_owner-follow-up-phase-2-leader-card.md`
- **Authorization:** the developer's "Laready commeted it now for phase 2" (after committing Phase 1 as `3bbb263`).
- **Type:** New feature (approved by the developer)

## Intent

Steps 2A to 2E of the plan: the leader works the 3-day observation from the report page, saved on the server, and finds open ones in the report list.

## Key changes

- `ownerFollowUp.ts`: types and one function per endpoint, and `followUpError` for the server's message.
- `OwnerFollowUpCard`: not started (owner, phone, account, "Start 3-day observation"); Under Observation (countdown or "Due: decide now", acknowledgement or "Log phone acknowledgement" for an owner without an account, contact log with owner updates and photos, repeated incidents with a report number, Owner complied, Close case with Incident Resolved or False Alarm, Issue owner warning, Escalate to Barangay, Extend once with a reason); ended (outcome, reason, who, log). Server refusals are shown on the card.
- `SubdViewReport.tsx`: the card replaces the static preview. It shows for any report linked to a pet with an owner (so an ended or escalated follow-up keeps its history) and can start only on an open report that is not escalated, not held and not merged. "Escalate" calls the page's existing `openEscalation()`; "Issue owner warning" calls the existing `openIssueWarningModal()` (form defaults to "Free-Roaming Unleashed"), only for an owner with an account. After closing, the page reloads the report.
- `SubdReports.tsx`: "Under Observation" / "Due" badge next to the status (both layouts), and two status-filter options, from `GET /owner-followups?status=open`.
- `OwnerFollowUpPreview.tsx` deleted (kept in commit `3bbb263`).

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the two new files: clean (the first version called setState in an effect; fixed). `node --test tests/*.test.mjs`: 46 passed.
- Not checked in a browser (step 2F, the developer). The backend must be restarted once so the two tables exist.
