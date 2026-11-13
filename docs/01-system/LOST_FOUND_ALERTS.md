# Lost & Found: Community notices and notification alerts

Status: **Current**, implemented 2026-11-12/13 (not committed). Applies to Lost Pet and Found Animal reports only. Related: [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md), [LOST_FOUND_MATCHING.md](LOST_FOUND_MATCHING.md), [Firebase push setup](../05-operations/push/FIREBASE_PUSH_SETUP.md).

## Two separate things

| | Community notice | Notification alert |
|---|---|---|
| What it is | A post residents browse in Community (table `lost_pet_alerts`) | A notification to residents' phones and notification lists (table `case_alerts`) |
| Created by | A missing pet's notice: by the owner's report, at filing. A found animal's: published by the Subdivision Leader (now also from the case page) | The Subdivision Leader, from the case page |
| Text | Made from the report; the Leader may add a word | Its own title (60 characters) and message (180), drafted from the report and edited by the Leader |
| When | Once, when published (residents are notified once) | Now, at a chosen time, or repeating on a schedule that always ends |
| Effect on the other | None | **Never** creates, publishes, republishes or edits a notice. A tap only opens a screen |

## What the Leader sees (case page of a missing pet or a found animal)

- **Status card.** "Nothing needs you right now", with "Under monitoring since … · last update …", over one tile per topic: Sightings (missing pet), Linked reports, Community notice, Alerts, Barangay, and Last contact / Next check when they exist. Each tile has at most one occasional action (View or Publish notice, Send an alert or Manage, Ask for help). When something needs the Leader, the same card lists it ("Needs you") above the tiles. A private (sensitive) report has no notice tile and no alerts tile.
- **Notification alerts section** (once there is one): each alert with its state (Scheduled, Repeating, Paused, Sent or Finished, Stopped, Cancelled), its cadence and end ("Every 30 minutes · until Mochi is home (by Nov 26)"), the next send, how often it went out, its message, Pause / Resume / Edit / Stop (or Cancel before the first send) and its history (when and to how many residents).
- **Alert window**: Message (title, message, the animal's photo or not, where a tap goes), Recipients, Schedule; beside it a lock-screen preview and "What happens" (sends, to how many, on tap, first send, then, next sends, end, total). It says plainly when phone push is not set up ("In the app only: phone push is not set up yet"), using the server's `push_ready`.
- **Publish a Community notice** (found animal): the notice as residents will see it, an optional word from the Leader, and what publishing does. The finder's own words and the details that prove ownership stay private.

Every change the Leader makes writes a staff line in the case Activity ("You started a repeating alert …", "The alert … stopped by itself: the case was resolved").

## Scheduling

- **Send now**, **Schedule** (one send at a date and time), or **Repeat**: every N minutes, hours or days, or at set times each day (up to 12 times). A repeat starts now or later and ends **when the case is resolved** (with a latest end date, 14 days by default, editable, at most 60 days), **on a date**, or **after a number of sends** (1–500).
- Safeguards, not presets: sends of one alert are at least **5 minutes** apart (a typo guard); every repeat ends; more than **12 sends in the first day** is named in the window but not blocked. There are no quiet hours (the developer's decision).
- **Edit** changes future sends only; an edit never sends at once (except "Send now"). "N sends" on an edited alert counts from now. A paused alert stays paused.
- **Pause / Resume**: nothing goes out while paused; resuming continues from now, missed sends are not caught up.
- **Stop** ends it (what was sent stays in its history); before its first send it is **cancelled**. Resolving or closing the case stops every live alert of it (the closure hook in `utils/case_closure.py`), and the sender re-checks that the case is open before each send.
- Times are entered as the subdivision's local time (Philippines), like every other time in the app.

## Who receives an alert

Active residents of the case's subdivision who have not turned **Lost & found alerts** off (Resident Settings; on by default), or, for a missing pet, only the residents who reported a sighting of it. The case's own reporter and owner are always left out (they get their own updates). The window shows the count for each choice before sending.

A resident has **one row per alert** in their notification list: each send replaces the earlier row, and on a phone each send replaces the earlier notification (same tag), so repeats never pile up.

## Where a tap goes

The Community notice, its "I saw this pet" form (missing pet) or its claim form (found animal) when the notice is published; otherwise the alert itself in the resident's notifications. The server computes the link (`link` on `GET /notifications/me`, `data.url` in a push); the apps accept only paths inside the Resident app.

## Delivery and reliability

- The Operations Watcher loop (`app/tasks/unassigned_checker.py`, every 60 s) calls `case_alerts.run_due`. A send can therefore be up to about a minute after its planned time.
- **Exactly once:** each planned send is claimed by inserting a `case_alert_sends` row; the unique key (`alert_id`, `slot_at`) refuses a second claim, so two workers, a retry or a restart never send the same occurrence twice. After downtime only the latest missed send goes out; the others are counted (`skipped_before`) and never sent late.
- **Push outbox:** a committed notification queues one delivery per active device (`push_deliveries`); each delivery is claimed (`queued` → `sending`) before the network call; a claim left by a crash is marked failed after 10 minutes, never sent twice. Channels: Web Push (VAPID keys) and **FCM** for the Android app (`FCM_SERVICE_ACCOUNT_FILE`). Without either, alerts still reach the in-app list.
- Android: every message is high priority with default sound and vibration, so it rings and vibrates while the app is closed, another app is open or the screen is off. Channels (both high importance, with vibration): `straysafe_notifications` (private on a locked screen) and `straysafe_alerts` (public); they replaced `straysafe_updates` and `lost_found_alerts` (made without vibration), which the app deletes. Category `alerts` maps to the preference `push_lost_found_alerts`. Phones that kill apps in the background (some battery-saver settings) can still hold notifications back until the app is allowed to run in the background.

## Privacy and limits

- Title and message follow the public-notice rule (`utils/public_text.py`): no phone numbers, email addresses or exact addresses.
- Nothing is sent about a private (sensitive) report or a closed case; only a case's Leader (or the Administrator) can act.
- How many residents a notice or an alert reached is shown to the Subdivision Leader only: the owner's view of the notice does not carry the number, and neither the owner's "your notice is live" notification nor the report's history line states it.
- The photo goes into a phone notification only when chosen and only over https.

## What residents see

- **Notifications**: an alert has its own bell icon, reads as the Leader wrote it, says "From your Subdivision Leader", and opens its destination.
- **Settings**: the switch "Lost & found alerts". Notices stay in Community either way.
- **The owner's screen for a missing pet** (the report page): the pet and since when it is missing, one state "Under monitoring", the sightings once, "Your notice in Community", "Alerts from your Subdivision Leader" (how many went out and when the last did, from `leader_alerts`), the report's details folded, the updates, and "My pet is home".
- Related Resident clean-ups shipped with this work: Home shows the missing pet once at the top and lists only things to act on (a history line is no longer read as "Message from the subdivision"), and drops the "Report a concern" tile (the + in the bottom bar); Community is one list with tabs and one search that filters as you type; the missing-pet notice is compact (one block for the pet, one line for where and when, the map one tap away, the latest sighting); the sighting form names the pet.

## Data and migration

- `case_alerts`, `case_alert_sends` and the column `user_notification_preferences.push_lost_found_alerts` come **only** from `backend/migrations/2026-11-12_lost_found_alerts.sql` (additive, safe to run twice). The backend never creates them: at start-up `db_migrations/lost_found_alerts.require` refuses to start, naming the file, until they exist. See [DATABASE_FILES_AND_MIGRATIONS.md](../05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md).

## API (Leader of the case's subdivision, or the Administrator)

| Method and path | What it does |
|---|---|
| `GET /case-alerts/reports/{report_id}` | The case's alerts, newest first, with schedule, next sends and history (also in `GET /cases/{id}` as `alerts`) |
| `GET /case-alerts/reports/{report_id}/audience` | `all`, `helpers`, `residents`, `turned_off`, `push_ready` |
| `POST /case-alerts/reports/{report_id}` | A new alert; `client_request_id` makes a retry return the same alert |
| `PUT /case-alerts/{alert_id}` | Change a live alert (future sends only) |
| `POST /case-alerts/{alert_id}/pause`, `/resume`, `/stop` | As named |
| `POST /push/subscribe` `{channel: "fcm", token}` / `POST /push/unsubscribe` `{token}` | The Android app's device (503 while FCM is not set up) |

## Files

Backend: `app/models/case_alert.py`, `app/schemas/case_alert.py`, `app/services/case_alerts.py`, `app/routes/case_alerts.py`, `app/db_migrations/lost_found_alerts.py`, `app/services/push_service.py`, `app/routes/push.py`, `app/utils/push_categories.py`, `app/tasks/unassigned_checker.py`, `app/utils/case_closure.py`, `app/routes/notifications.py`. Leader: `src/admin/data/alertSchedule.ts`, `src/admin/data/monitored.ts` (`situationTiles`), `src/admin/pages/case/monitored/Lane.tsx`, `src/admin/pages/case/monitored/Alerts.tsx`, `src/admin/dialogs/AlertDialogs.tsx`. Resident: `src/resident/pages/reports/LostReport.tsx`, `src/resident/native/push.ts`, `src/resident/native/PushRegistration.tsx`.

## Tests

`backend/tests/test_case_alerts.py` (62 checks: separation from the notice, schedules, safeguards, exactly once, catch-up, pause/resume/edit/stop, recipients, links, closing the case, the migration check), `backend/tests/test_push_fcm.py` (20 checks, a fake Google endpoint, no credentials), `frontend/tests/adminAlertSchedule.test.mjs`, `frontend/tests/adminMonitoredCase.test.mjs`, `frontend/tests/residentLiveAdapters.test.mjs`, and the browser journeys `liveLostFound.browser.mjs` and `liveInterfaces.browser.mjs`.

## To confirm with the stakeholders

- Defaults: the 14-day latest end, the 60-day maximum, the 5-minute floor and the 12-a-day warning.
- Push on phones needs the Firebase setup (the developer's manual steps); until then alerts reach the in-app list only, and the Leader's window says so.
