# Owner follow-up: UI preview on the leader's report page

- **Date:** 2026-10-28 04:17 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/OwnerFollowUpPreview.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `docs/05-operations/agents/feature-updates/2026-10-28_0417_owner-follow-up-ui-preview.md`
- **Authorization:** the developer's request "For starters let us build static UI for this 3 days observation for all who has registered there pet in the straysafe and all who has an owner then it must be in the report review in the subd".
- **Type:** New feature (UI preview only)

## Intent

Show the 3-day owner observation on the Subdivision Leader's report page so it can be seen and demonstrated before any backend exists (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md, section 7.1).

## Key changes

- New `OwnerFollowUpPreview`: a card with three states. Not started (owner name, phone, whether they have an account, "Start 3-day observation"); observing (countdown and due time, owner confirmation in the app or "Log phone confirmation" for an owner without an account, contact log, and Owner acted / Close case / Escalate to Barangay); ended (summary, reset).
- **Static:** everything is kept in the component's state. Nothing is sent to the server or saved; reloading resets it. The card is labelled "Preview · not saved". Two preview-only buttons ("Skip 1 day", "Simulate owner's app confirmation") let the due state and the confirmed state be shown in a demo.
- Shown on `SubdViewReport.tsx` when the report is linked to a registered pet with an owner (`pet_id` and `owner_id` or `owner_name`), the case is open, not with the Barangay, and the animal is not in a facility (status 7 or 8, or a facility set). Only the leader handling the report can start or act.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- Local data: no current report meets the conditions (the open reports with an owner, #6 and #10, have their animal in the Barangay facility), so the card shows on no existing report. Not checked in a browser.
