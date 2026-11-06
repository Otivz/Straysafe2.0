# Subdivision mobile Messages tab

- **Date:** 2026-11-06 12:12 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/Navbars/SubdNavbar.tsx`, `frontend/src/components/Navbars/SubdBottomNav.tsx`, `frontend/src/pages/Subd_Leaders/SubdMessages.tsx`, `frontend/tests/barangayReferral.browser.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1212_subd-mobile-messages-tab.md`
- **Authorization:** User requested: "Could you put the message in the header in the tabbar?" following mobile subdivision navigation changes.
- **Type:** Polish

## Intent

Move the subdivision mobile Messages shortcut from the header to the bottom navigation so conversations are accessible alongside the other main sections.

## Key changes

- Add Messages as the fifth mobile tab, opening the existing `/subd/messages` inbox.
- Preserve live unread counts through the shared chat poller, display counts above nine as 9+, and include the full unread count in the accessible label.
- Highlight Messages and expose its current-page state when the inbox tab is active.
- Remove the former mobile header shortcut and its unused dropdown/drawer wiring. Desktop navigation remains unchanged.
- Extend the existing mocked browser regression to check tab visibility across six widths, unread badge rendering, removal of the header duplicate, inbox navigation, and active state.

## Validation evidence

- `REFERRAL_TEST_URL=http://127.0.0.1:5180 node frontend/tests/barangayReferral.browser.mjs`: passed existing referral checks and mobile report checks at 320, 390, 640, 767, 768 and 1280px; Messages tab opens the inbox, shows its unread badge and becomes active. No uncaught browser errors; all API calls mocked.
- `git diff --check`: passed.
