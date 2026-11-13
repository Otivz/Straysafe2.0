# Resident app: lost & found alerts, the owner's one screen, a shorter Home, Community and notice

- **Date:** 2026-11-12 18:04 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/resident/data/types.ts`, `frontend/src/resident/data/selectors.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/LiveDataProvider.tsx`, `frontend/src/resident/components/icons.ts`, `frontend/src/resident/components/Cards.tsx`, `frontend/src/resident/pages/HomePage.tsx`, `frontend/src/resident/pages/account/NotificationsPage.tsx`, `frontend/src/resident/pages/account/SettingsPage.tsx`, `frontend/src/resident/pages/community/CommunityPage.tsx`, `frontend/src/resident/pages/community/LostNotice.tsx`, `frontend/src/resident/pages/community/SightingPage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/src/resident/pages/reports/LostReport.tsx` (new), `frontend/src/resident/styles/resident.css`, `frontend/src/admin/live/api.ts` (the notification `link` and the new preference flag, shared by both apps), `backend/app/services/lost_pet_lifecycle.py` (notification and history wording), `backend/app/utils/notification_dispatcher.py`, `backend/app/routes/reports.py`, `frontend/tests/residentLiveAdapters.test.mjs`, `frontend/tests/liveInterfaces.browser.mjs`, `frontend/tests/liveLostFound.browser.mjs`, `docs/01-system/LOST_PET_LIFECYCLE.md`
- **Authorization:** The developer's request to include the Resident app in the mockup ("the report, the sightings, and mostly the community, and some the redundant thing there in resident"), the reviewed mockup listing each change, and "okay lets proceed with the implementation". Nothing was committed or pushed.
- **Type:** Feature

## Intent

Residents receive the Leader's alerts as their own kind of notification and can turn them off; the redundancies found by looking at the real screens are removed, as approved.

## Key changes

- **Notifications:** a `case_alert` row has its own bell icon, says "From your Subdivision Leader" and opens the server's link (only paths inside the app). **Settings:** the switch "Lost & found alerts" (`push_lost_found_alerts`).
- **The owner's one screen for a missing pet** (`LostReport.tsx`, used by the report page): the pet and since when it is missing, one state "Under monitoring" (no status ladder), possible recoveries pointed to the notice, the sightings once (with "Show on map"), "Your notice in Community" (how many neighbours were notified), "Alerts from your Subdivision Leader" (how many and the last), the report's details folded with its one map, the updates without the sighting lines already listed, "My pet is home". A found animal's report shows "Under monitoring" instead of the ladder.
- **Home:** the missing pet once at the top ("Mochi is missing · 2 sightings, the latest …"); "Needs your attention" lists only things to act on (a line the system recorded is no longer read as "Message from the subdivision": history lines are now `info` or `sighting`); the "Report a concern" tile is gone (the + in the bottom bar); "Your other reports"; "In your community" shows neighbours' notices only.
- **Community:** tabs (Lost pets · Found animals · Advisories, each with its count) and one search box that filters as you type, with "See all" / "Search all" leading to the server-searched directory; cards lead with the photo and the pet's name; a one-line privacy note.
- **Lost-pet notice:** photo, name and looks in one block; where and when in one line with the general-area map one tap away; the latest sighting and "See all"; the safety advice in one line; the two neighbour actions unchanged. **Sighting form:** "I saw this pet", the questions name the pet ("When did you see Mochi?"), a one-line privacy note.
- **Wording:** "Someone saw Mochi" instead of "New Lost Pet Sighting!"; places read "near Gate 2" / "behind the chapel" (never "near Near …"), also in the notice broadcast; "published to 1 resident"; the history line "Your notice went out to N neighbours"; a found report's confirmation names its reference (SS-…).

## Validation evidence

- Looked at 17 photographed Resident screens (owner and neighbour) on the isolated stack, with a Leader alert sent. Fixed after looking: sighting lines repeated under Updates, their info icon, and "1 residents".
- Frontend unit tests 192 of 192 (new: an alert notification and its link; the switch round-trip). `liveInterfaces.browser.mjs`: 60 of 60 after updating its Community, card, sighting-form and notification steps (a neighbour's step now opens Mochi's card by its title: the old "contains Lost dog" click had reached an older notice). `liveLostFound.browser.mjs`: 14 of 14 (Home is recognised by the subdivision name: "Needs your attention" now appears only when something is to be done).
