# Resident Dashboard Notification Navigation Fix

- **Date:** 2026-11-02 18:12 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/utils/notificationNavigation.ts`, `frontend/tests/notificationNavigation.test.mjs`, `frontend/src/pages/citizen/ResiHomePage.tsx`, `frontend/src/components/Navbars/ResiNavbar.tsx`, `frontend/src/pages/citizen/ResidentSettings.tsx`
- **Authorization:** User request: "Fix the notification navigation functionality in the Resident Dashboard. Main Requirement: Every notification must redirect the user to its corresponding report or notification details when clicked."
- **Type:** Fix

## Intent

Resolve navigation routing for resident notifications so that clicking any notification card or notification dropdown item dynamically directs residents to their exact corresponding report, lost pet alert report, match inquiry review / chat, pet match confirmation, claim record, or notification details modal, rather than navigating generically or failing to locate the associated record.

## Key changes

1. **Created `frontend/src/utils/notificationNavigation.ts`**:
   - Implemented `resolveNotificationDestination(notif, apiClient, cachedReports)` with comprehensive priority handling for:
     - `lost_pet_alert` and `lost_pet_sighting`: queries `/lost-pet-alerts/{alert_id}` to resolve the alert ID to its underlying `report_id`, navigating to `/resident/reports/{report_id}`.
     - `potential_match` and `match_message` / match inquiry: routes to `/resident/reports/{report_id}/match-review`, adding `?openChat=true` when a chat action or match inquiry message is present.
     - `pet_match_confirmation`: routes to `/resident/pets?confirm={requestId}` for owner-first confirmation requests.
     - Status updates and stray reports: routes directly to `/resident/reports/{report_id}`.
     - Report chat messages: routes to `/resident/reports/{report_id}?openChat=true`.
     - Observation notices, warnings/citations, claims, adoptions, and QR tag scans: routes to their dedicated resident pages (`/resident/observations`, `/resident/settings?tab=warnings`, `/resident/my-claims`, `/resident/adoptions`, `/resident/pets`).
     - General notifications without linked reports: triggers `{ type: 'modal', notification: notif }` to present full notification content in a modal dialog.
2. **Updated `frontend/src/pages/citizen/ResiHomePage.tsx`**:
   - Refactored `handleNotificationClick` to asynchronously invoke `resolveNotificationDestination`.
   - Added `selectedNotificationModal` state and rendered a StraySafe-themed Notification Details modal displaying full subject, type/category, body message, formatted timestamp, and a link to open Notification Settings.
   - Preserved card clickability across the entire card container and retained read/unread state tracking (`handleMarkNotificationRead`).
   - Fixed modal expression syntax in JSX.
3. **Updated `frontend/src/components/Navbars/ResiNavbar.tsx` and `frontend/src/pages/citizen/ResidentSettings.tsx`**:
   - Integrated `resolveNotificationDestination` to ensure consistent dynamic navigation across the top navbar notifications popover and the resident settings notification center tab.
4. **Added Automated Test Suite `frontend/tests/notificationNavigation.test.mjs`**:
   - Validated report status updates, lost pet alerts, sightings, match inquiries with chat, potential matches, owner-first confirmations, pet claims, and modal fallbacks.

## Validation evidence

1. `node --test tests/notificationNavigation.test.mjs`: All 8 notification navigation tests passed.
2. `node --test tests/lostPets.test.mjs tests/notificationNavigation.test.mjs`: All 11 tests passed.
3. `npx tsc --noEmit`: TypeScript check passed with 0 errors.
4. Live headless browser verification via Chrome DevTools Protocol against `http://localhost:5173/resident-home`:
   - Clicked "Missing pet: mochi" notification card (alert #1) -> successfully navigated to `/resident/reports/13`.
   - Clicked "Match Inquiry: Billy" notification card -> successfully navigated to `/resident/reports/11/match-review?openChat=true`.
