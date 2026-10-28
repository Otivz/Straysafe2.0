# Notification UI review

Implemented for Resident, Subdivision Leader, Barangay Staff and Admin.

## Issues found

- Resident lists were limited to five entries. The "View All" action only expanded the same fetched array; it did not open a separate notification history. Its expanded limit persisted across closing, so its conditional button disappeared on reopening.
- The resident drawer displayed the supplied array while its unread count used a different fallback array. On pages without supplied notifications, fetched notifications could be missing from the drawer.
- Resident pages and their navbar could both fetch notifications and submit the same mark-read request. Opening the mobile panel also automatically marked unseen items as read.
- The subdivision mobile panel was portaled outside the navbar, but the outside-click listener checked only the navbar. Tapping panel controls could therefore dismiss it.
- Staff panels remounted on every open. Fixed widths, truncated text, missing scroll constraints and limited touch targets affected smaller screens.
- Admin's notification bell had no click handler or panel. Resident desktop/tablet navbars had no notification bell.

## Changes

- Removed the resident "View All" / "View More" controls and list limits. The complete active list is available by scrolling, including the desktop home sidebar.
- Reused existing role-specific cards, filters, detail views, actions, routing and API endpoints inside a shared `NotificationPanel` shell.
- Kept panels mounted when closed to preserve their list, filter and scroll position. Reopening does not trigger a notification fetch.
- Made outside-click handling aware of both the portaled panel and its trigger. Added consistent close and Escape behavior.
- Kept "Mark All Read" visible, disabled it when there are no unread items, prevented repeated submissions while saving, and added failure feedback. Failed writes preserve unread states.
- Removed automatic marking from opening the resident drawer. Individual clicks and the explicit action update read states.
- Avoided duplicate resident fetching and read writes. Controlled empty lists remain empty instead of falling back to stale notifications. Background polling continues independently of opening/closing.
- Used viewport-bounded panels, dynamic viewport height, mobile safe-area padding, independent vertical scrolling, long-text wrapping and larger touch targets. Mobile page scrolling is restored on closing.
- Preserved staff detail navigation and prevented a second read receipt when opening the related page from an already-read detail view. Long detail messages also wrap and scroll.
- Connected Admin's bell to the existing notification API, with All/Unread filters, details, mark-read actions and report links for report notification types.
- Added the resident bell to desktop/tablet navigation while retaining the desktop home sidebar.

No notification delivery code, database schemas, backend APIs or native Capacitor configuration was changed.

## Verification

Passed `npm run build` from `frontend` (TypeScript and Vite production build).

Passed `node frontend/tests/notifications.browser.mjs` with Vite running on port 5173. The runner uses isolated headless Chrome and mocks API traffic, so it never modifies live notifications.

The browser suite covers 13 role/page/viewport combinations at 320, 390, 640, 768 and 1280 pixels, plus controlled empty notifications and the resident desktop sidebar:

- Opening and closing repeatedly; stable panel identity, controls and scroll position.
- Complete active lists with more than five notifications; archived items and chat alerts excluded from the dropdown.
- No extra fetches on reopening and one read request per action.
- Successful and failed "Mark All Read", accurate unread counts and All/Unread filters.
- Individual notification clicks, details and navigation to the related report.
- Mobile touch taps/swipes and desktop mouse clicks/wheel scrolling.
- Outside-click and Escape dismissal; restoring page scrolling.
- Long unbroken titles/messages without panel horizontal overflow.
- No uncaught browser runtime errors.

Set `NOTIFICATION_TEST_URL` to use another Vite address, or `CHROME_BIN` for a different Chrome executable.

Capacitor Android compatibility was maintained at the web-component level. A physical Android device/APK was not available for this review; native back-button behavior and device-specific safe-area rendering still need a device smoke check.
