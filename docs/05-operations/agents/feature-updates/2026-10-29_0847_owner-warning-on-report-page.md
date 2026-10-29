# Owner warnings shown and acknowledged on the owner's report page

- **Date:** 2026-10-29 08:47 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/warnings.py`, `backend/tests/test_owner_warning_rules.py`, `frontend/src/components/OwnerFollowUpOwnerPanel.tsx`, `frontend/src/pages/citizen/ResiHomePage.tsx`, `frontend/tests/ownerWarnings.browser.mjs`, `frontend/tests/fixtures/ownerWarnings.tsx`, this record
- **Authorization:** the developer, with a screenshot of the home page "Subdivision Notice" pop-up: "I think this doesnt work like it was in the http://localhost:5173/resident/reports/2".
- **Type:** Fix

## Intent

A warning issued to an owner appeared only as a pop-up on the home page, opened from its notification. The owner's report page showed the follow-up but not the warning. The pop-up's acknowledgement checkbox was not enforced.

## Key changes

- **Owner's report page** (`OwnerFollowUpOwnerPanel.tsx`): the panel lists the warnings issued to this owner for this report under "Subdivision notices" (tier, violation, remarks, date).
  - A pending notice has the acknowledgement checkbox and an "Acknowledge notice" button that stays disabled until the box is ticked.
  - An acknowledged notice shows when it was acknowledged.
  - The panel also shows when there is a warning but no follow-up. Warnings about other reports are not shown.
- **Home page pop-up** (`ResiHomePage.tsx`): "Acknowledge Notice" is disabled until the box is ticked; before, the checkbox's `required` had no effect outside a form.
- **Privacy fix** (`routes/warnings.py`): `GET /warnings/report/{id}` and `GET /warnings/pet/{id}` returned every warning, including the owner's name and phone, to any signed-in user. A resident now gets only the warnings issued to them; staff are unchanged.
- **Noted, not changed:** `PATCH /warnings/{id}/acknowledge` also accepts staff (roles 2 to 4), so staff can mark an owner's warning acknowledged. Left as it is pending a decision.

## Validation evidence

- `backend/tests/test_owner_warning_rules.py`: 25 of 25. It now covers another resident seeing no report or pet warnings, the owner seeing their own, and the leader seeing them.
- `test_trust_rule.py` 22 of 22 and `test_admin_011_warnings.py` pass. Full isolated backend suite: 82 of 82 files.
- `frontend/tests/ownerWarnings.browser.mjs`: pass. The new owner view checks that the warning for report 2 shows (the one for another report does not), that the button is disabled until the box is ticked, and that the acknowledgement is sent and shown.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 of 46. ESLint: 93 problems before and after on the changed files (none new).
- Not checked by the developer in a browser.
