# QR Tag Messages: Clearer Wording on the Leader's Panel

- **Date:** 2026-11-23 09:44 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/components/PetTagBlocks.tsx`
- **Authorization:** The developer found the Leader's QR tag panel confusing ("what is resolved?") and agreed with the proposed wording ("go ahead"). They chose no answer type stored per message, so there is no database change.
- **Type:** Polish

## Intent

Make the Leader's list of QR tag messages say who each one is waiting on, and keep finished messages out of the way.

## Key changes

- New labels:
  - "Waiting for the owner" (was "Not read by the owner");
  - "Owner has seen it, no answer yet" (was "Read by the owner");
  - "Answered by the owner" (was "Resolved").
- A summary line, for example "1 waiting on the owner · 1 answered", replaces the bare count in the title.
- Messages still waiting come first. Answered ones are folded under "Earlier messages (N), already answered by the owner", with a note that the owner's answer (home, not yet, or not real) is in the case History.
- "A resident" now reads "A resident (signed in)".
- The same list is used on the Leader's pet page panel and on the missing-pet case.

## Validation evidence

- `npx tsc -b`: exit 0. ESLint on the file: no findings.
- Browser check, 6/6, on a throwaway database with a one-off scratchpad script, on the pet page and the case page:
  - the summary line;
  - "Waiting for the owner" on the new message;
  - the answered message folded and closed;
  - no old wording;
  - opening the fold shows "Answered by the owner" and the History note.
- Not checked on the real app.
