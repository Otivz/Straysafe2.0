# Complaint management: search the person responsible instead of one long list

- **Date:** 2026-11-14 03:27 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/admin/styles/pages.css`, `docs/README.md`
- **Authorization:** The developer's report that the Person dropdown in "Who is responsible?" "might cause trouble if the residents are more than a thousand", and their go-ahead to improve it.
- **Type:** Polish

## Intent

Let the Leader find the person responsible in a subdivision with thousands of residents without scrolling one long dropdown.

## Key changes

- "Someone already on record" now shows a search box: typing part of a name, block or lot lists the best 8 matches among the residents and the households on record (every word must match; Enter takes the first). It says how many more match and asks to keep typing, or that nobody matches and suggests recording a new household.
- The chosen person shows as a card with **Change**. "It's …" on a lead still fills it in.
- The search runs in the browser over the resident directory the Leader app already loads (`GET /users/` returns the whole subdivision, uncapped), so it stays instant with thousands of residents; no server change.

## Validation evidence

- `npx tsc -b` and eslint clean.
- Photographed on the isolated stack (`frontend/tests/_liveHarness.mjs`): typing a letter lists the matching resident; choosing one shows the card with Change.
