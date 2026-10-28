# Owner follow-up card: clearer layout on the leader's report page

- **Date:** 2026-10-28 06:10 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/OwnerFollowUpCard.tsx`, `docs/05-operations/agents/feature-updates/2026-10-28_0610_owner-follow-up-card-redesign.md`
- **Authorization:** the developer's request "improve the ui for http://127.0.0.1:5173/subd/reports/11" (with the card's text pasted).
- **Type:** Polish

## Intent

The card repeated "Under Observation", showed the phone number without a label, and put one reason box above five mixed buttons, so it was unclear which action used it.

## Key changes

- Header with the title and one status pill; the countdown banner no longer repeats it.
- Owner box: name, account or phone-only, and the phone as a **Call** link (`tel:`).
- Countdown: "N days left" or "Time is up: decide now", a progress bar, due date, start date and the extension reason.
- Sections with titles: Owner's response, Contact log (icon per type: phone, in person, in-app, owner update with photo, repeated incident), an "add to log" box (Enter adds).
- Decision: three equal buttons (Owner complied, Close case, Extend once); each opens its own small form with its own reason box and a confirm button; Close case picks Incident Resolved or False Alarm. Warning and escalation sit in a separate amber box that says they can be used any time and that a warning must come before escalation.
- The ended view shows the log with the same icons. Behaviour and server calls are unchanged.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the card: clean (the progress bar first read the clock during render; it now keeps the time in state, refreshed on load and save).
- Not checked in a browser.
