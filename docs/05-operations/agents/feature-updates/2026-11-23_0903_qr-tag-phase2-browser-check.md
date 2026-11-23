# QR Tag Phase 2: Browser Check of the Leader's Dashboard

- **Date:** 2026-11-23 09:03 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md`, `docs/README.md`
- **Authorization:** Developer asked whether phase 2 had been checked, then "Okay gooo" to running a browser check.
- **Type:** Fix (verification and documentation)

## Intent

Check phase 2 (badge and 1-hour nudge) in a real browser, not only in unit tests.

## Key changes

- One-off scripted browser run, kept in the session scratchpad and never added to the project. It uses the project's browser harness and the browser-test API on a throwaway SQLite database, adds the QR tag routes, and adds a test-only route in the one-off server that makes unopened messages 90 minutes older, so the 1-hour rule can be checked without waiting.
- The plan's phase 2 browser item is ticked, with a separate open item for a person's check on the real app. The result is logged in the manual checklist.

## Validation evidence

12/12:
- F0: no badge before a message.
- F1: "1 tag message" on the pet's row after a guest message, and no attention row.
- F5: no place or note on the Dashboard.
- F2: after 90 minutes unopened, "QR tag message (from a guest) not yet seen by the owner" under Needs your attention, with the badge still shown.
- F3: once the owner opened the messages, the row is gone and the badge stays.
- F4: once they are resolved, the badge is gone.

No application code changed in this step.
