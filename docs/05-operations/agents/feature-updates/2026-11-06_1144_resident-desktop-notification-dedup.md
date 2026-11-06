# Resident desktop notification entry point

- **Date:** 2026-11-06 11:44 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/citizen/ResiHomePage.tsx`, `frontend/tests/notifications.browser.mjs`, `docs/NOTIFICATION_UI_IMPROVEMENTS.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1144_resident-desktop-notification-dedup.md`
- **Authorization:** Developer reported duplicate notifications on /resident-home in desktop mode: the navbar and the card beside the report list.
- **Type:** Polish

## Intent

Keep one desktop notification entry point through the existing navbar bell.

## Key changes

- Remove the redundant desktop-only notification card beside resident reports; retain the announcements sidebar and existing mobile navbar access.
- Remove local error-message state used only by the removed card. The mark-all callback still propagates failures to the navbar panel, which displays retry feedback. Polling, unread data, notification actions and routing are unchanged.
- Expand the notification browser regression to cover the desktop home navbar, exactly one visible bell, no duplicate sidebar card, and retained announcements. Update the notification UI documentation.

## Validation evidence

- node frontend/node_modules/typescript/bin/tsc -b frontend: exit 0.
- notifications.browser.mjs: all 14 role/viewport cases pass, plus controlled-empty-list and desktop single-entry-point checks. Includes mobile touch scrolling, desktop scrolling, reopen behavior, failures/retry, read updates and no duplicate requests. All API responses are synthetic.
- notificationNavigation.test.mjs: 10/10 pass. git diff --check: no whitespace errors.
- Tests used a separate Vite process on port 5180; the existing app server was not reconfigured. The test-generated tracked screenshot was restored to its original clean HEAD content.
- Strict documentation audit is run after adding this record and its index link; previous baseline is 12 existing failures (8 broken links and 4 intentionally removed tool pointers).
