# QR Tag Phase 1: No-Notice Test and Browser Check

- **Date:** 2026-11-23 08:17 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/tests/test_pet_tags_alerts.py`, `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md`, `docs/README.md`
- **Authorization:** Developer: "do this", pointing at the two open phase 1 checklist items (the no-notice test and the browser check).
- **Type:** Fix (tests and documentation)

## Intent

Finish phase 1's checklist: a test for a pet with no open notice, and a browser check.

## Key changes

- `test_pet_tags_alerts.py`: 6 new checks. A guest and a neighbour message about a pet with no open notice are accepted, write no case history line, change no case status, are filed under no alert, and notify the owner once each.
- Browser check, run with a one-off script in the session scratchpad. It uses the project's browser harness and the browser-test API on a throwaway SQLite database, adds the QR tag routes, and links the seeded lost pet to its tag. Nothing touched the developer's database or the shared test files.
- **Finding:** while a lost notice is active, a signed-in resident of the same subdivision gets the sighting buttons, not the message form. So the phase 1 status lift rarely fires from the app; guests are the main real path. Recorded in the plan; section C of the manual checklist rewritten to match.

## Validation evidence

- `tests/test_pet_tags_alerts.py`: 38/39. The new 6 pass. The one failure, "a turned-off tag drops out of the list", fails the same way on the committed code.
- Browser check, 11/11:
  - B1: the public page shows the pet without owner details, and a guest gets the form;
  - B2 and B3: the message is sent and the owner gets one notification;
  - B4: the Leader's History shows the guest line, without place, note or phone;
  - B5: the status is unchanged;
  - B6: the message is listed on the case;
  - C1: a signed-in neighbour gets the sighting buttons, and opening the page changes nothing;
  - D: nothing is recovered or closed.
- The manual checklist has not yet been run by a person on the real app.
