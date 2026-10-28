# Push Notifications

**Goal:** a user gets a notification on their phone or computer even when StraySafe isn't open (new report,
rescue update, possible pet match, claim decision, chat message...). Tapping it opens the right page.

Status: **Phase 1 (Web Push) implemented** (2026-10-12). Phase 2 (Android / FCM, P17) not started. Section 10
records how it was built.

---

## 1. How it works today (what we found)

| Where | Today |
|---|---|
| In-app notifications | A `notifications` row per event. About **95 places** in the backend add one with `db.add(Notification(...))`; only some go through `dispatch_notification()` (`utils/notification_dispatcher.py`). |
| Email | `dispatch_notification(..., email_data=...)` queues a branded email (`email_service.queue_email`), with a retry worker started in `main.py` (`start_email_queue_worker`). |
| Preferences | `user_notification_preferences`: `email_reports`, `email_rescues`, `email_pet_matches`, `email_claims`, `email_reminders`. Push has none. |
| Getting new notifications | The navbars **poll** `GET /notifications/me`: Resident every 8 s, Barangay every 10 s, Subdivision every 30 s. Nothing arrives while the tab is closed. |
| Service worker / web manifest | **None.** No `sw.js` and no `manifest.webmanifest`, so no Web Push and no "install app". |
| Android app | Capacitor is set up (`com.straysafe.app`, `frontend/android`). The Gradle file already applies Google Services **if** `google-services.json` exists. It doesn't, so Android push can't work yet. |
| Push libraries | None (no `pywebpush`, no `firebase-admin`, no `@capacitor/push-notifications`). |

---

## 2. The approach

### Two delivery channels, one backend

| Channel | For | Needs | Cost |
|---|---|---|---|
| **Web Push** (VAPID) | Browsers: Chrome, Edge and Firefox on desktop and Android; Safari on iPhone only when the site is added to the Home Screen (iOS 16.4+) | A service worker, a VAPID key pair (we generate it), HTTPS (localhost is fine) | Free, no outside account |
| **FCM** (Firebase Cloud Messaging) | The Capacitor Android app | A Firebase project, `google-services.json`, a service-account key, `@capacitor/push-notifications` | Free, needs a Google/Firebase account |

**Recommendation: Phase 1 is Web Push** (works for everyone using the site, no outside setup). **Phase 2 is FCM**
for the Android app, only if you'll demo or ship the APK.

### One hook, not 95 edits
Every notification already ends up as a `notifications` row. A SQLAlchemy listener does three things:
1. it collects the new `Notification` rows when they're inserted (`after_insert`);
2. after the transaction **commits** (`after_commit`), it puts one **push job** per notification in a small outbox
   table;
3. a background worker sends the queued jobs to every device of that user.

So every existing and future notification can be pushed **without editing the 95 places**, and nothing is sent for
a change that was rolled back.

### Why an outbox and a worker (not sending inside the request)
- Pushing to a slow or offline push server never slows down or breaks a staff action.
- Failed sends are retried, and dead devices are cleaned up.
- **Lesson from email:** the email retry worker has a known problem (emails stuck "Pending", never resent). The push
  worker gets its own tested retry rules (P9), and the email worker can be fixed the same way afterwards.

---

## 3. Rules

### R1. What gets pushed
- Every notification **type** belongs to a **category**:

  | Category | Types (examples) |
  |---|---|
  | Reports | `status_update`, `status_change`, `report_status`, `report_visibility`, `comment`, `report_claimed`, `report_takeover`, `report_transfer_*`, `unassigned_report_alert` |
  | Rescues | `rescue_assignment`, `alert` (rescue alerts), `holding_overdue_alert` |
  | Pet matches | `potential_match`, `pet_owner_confirmation`, `pet_owner_confirmation_result`, `wrong_identity`, `qr_recovery_request`, `reunion_photo_requested` |
  | Claims | `claim` |
  | Adoptions | `adoption_*`, `adopter_receipt_confirmed` |
  | Messages | `message`, `match_message`, `adoption_chat` |
- A type that isn't in the table is **not pushed** (it still shows in the app). New types are opt-in, so nothing
  unexpected reaches a lock screen.
- **Not pushed, ever:** `security` and `operation` (audit types), anything to an inactive or deleted account.

### R2. Preferences
- New columns on `user_notification_preferences`:
  - `push_enabled` (master switch);
  - `push_reports`, `push_rescues`, `push_pet_matches`, `push_claims`, `push_adoptions`, `push_messages`.
  - All default to **True** once the user allows push in the browser. The browser permission itself is the
    real opt-in.
- The settings pages get a "Push notifications on this device" switch plus the category switches, next to the
  existing email ones.

### R3. Privacy on the lock screen (follows report visibility rule 11)
- **Before each send, the server checks access again.** If the notification is about a report the recipient can no
  longer see (it was made Private, found false...), nothing is sent. The same check is used on the notifications
  list.
- **The push text is short and safe:** the title, plus a body of 120 characters or less. It never contains a phone
  number, email address, home address, or the reporter's or owner's name. Notification texts are already written
  this way; P4 checks the existing texts and fixes any that aren't.
- **Optional "hide details" mode** (setting `push_show_preview`, default on): if off, the lock screen shows only
  "StraySafe: you have a new update" and the details appear after opening.
- The user's email address is **never** in a push payload or sent to the push services. Only the device's push
  endpoint (Web Push) or token (FCM) is used.

### R4. Where a tap goes
- The server builds the link (`url`) from the type and `related_id`, **per role**. For example, a report notification
  goes to `/resident/reports/52` for a resident and `/subd/reports/52` for a leader.
- This copies the click handling the navbars already have, moved into one backend function
  (`notification_link(user, notification)`), so the bell and the push open the same page.
- If the target can't be opened any more, the page shows its normal "not available" message.

### R5. Devices and sign-out
- A user can have several devices; each is a row in `push_subscriptions`.
- **Signing out removes this device's subscription.** Otherwise, on a shared phone, the next person would get the
  previous user's notifications. This matters because the system has already had the "two accounts in one browser"
  problem.
- Each subscription belongs to the account that created it. If another account signs in on the same browser, the
  subscription is re-assigned to them, never shared by two accounts.
- When the push service answers 404 or 410 (the user blocked notifications or reinstalled), the subscription is
  marked revoked and isn't used again.

### R6. Not too many
- **Grouping:** pushes about the same thing share a `tag` (e.g. `report-52`, `chat-thread-14`), so a new one
  *replaces* the old one on the device instead of stacking ten.
- **Chat:** at most one push per thread per 60 seconds per recipient. Later messages update the same notification.
- **Time to live:** 24 hours. A push that couldn't be delivered in a day is dropped (the in-app list still has it).

### R7. Reading
- Tapping a push opens the page **and** marks that notification read (`PATCH /notifications/{id}/read`), the same
  as clicking it in the bell.
- The bell keeps polling as a fallback. With push on, the polling interval can be relaxed later (not part of this
  change).

---

## 4. Backend checklist

- [x] **P1. Settings and keys:**
  - `.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` contact for the push services: a
    project or admin address you choose, **not** your personal email unless you say so).
  - A one-time script `scripts/generate_vapid_keys.py` prints a new pair.
  - Phase 2: `FCM_SERVICE_ACCOUNT_FILE`.
  - Missing keys mean push is off and everything else works as now.
- [x] **P2. Tables** (`ensure_push_tables()` in `main.py`, plus `Database3.3.txt`):
  - `push_subscriptions`: `subscription_id`, `user_id` (FK), `channel` (`webpush` / `fcm`), `endpoint` (TEXT,
    unique per channel), `p256dh`, `auth` (Web Push keys), `fcm_token`, `user_agent`, `created_at`,
    `last_success_at`, `revoked_at`.
  - `push_deliveries` (the outbox): `delivery_id`, `notification_id` (FK), `subscription_id` (FK), `status`
    (`queued` / `sent` / `failed` / `skipped`), `attempts`, `next_attempt_at`, `last_error`, `sent_at`,
    `created_at`. Unique `(notification_id, subscription_id)`, so a notification is never sent twice to the same
    device.
  - New preference columns (R2).
- [x] **P3. `app/utils/push_categories.py`:** type to category (R1), `notification_link(user, n)` (R4),
  `push_text(n)` (R3, safe body and the "hide details" mode).
- [x] **P4. Notification text check:** a test runs every notification text the code can produce through the
  safe-text rules (no phone, email or address patterns, no reporter or owner names) and lists any that fail; those
  get fixed.
- [x] **P5. The hook** (`app/utils/push_hook.py`): `after_insert` on `Notification` collects ids in `session.info`;
  `after_commit` creates the `push_deliveries` rows; `after_rollback` clears them. Imported once in `main.py`.
- [x] **P6. Sender** (`app/services/push_service.py`):
  - Web Push through `pywebpush`, with payload `{title, body, url, tag, notification_id}`.
  - Phase 2: FCM through `firebase-admin`.
  - Before each send:
    - recheck that the account is active;
    - recheck the preferences;
    - recheck report access (R3, using `report_visibility.viewer_access`);
    - skip with a recorded reason if any check fails.
- [x] **P7. Worker:** `start_push_queue_worker()` in the FastAPI lifespan (like email). Every few seconds it sends
  due jobs in small batches.
  - Retry on 5xx or timeout: up to 3 tries, after 1, 5 and 15 minutes.
  - 404 or 410: revoke the subscription.
  - Older than 24 h: `failed`.
- [x] **P8. Endpoints** (`app/routes/push.py`, all signed in):
  - `GET /push/public-key` (the VAPID public key; anyone may read it).
  - `POST /push/subscribe`:
    - saves or updates this device for the signed-in user;
    - re-assigns it if another account had it;
    - accepts only the push services' https endpoints.
  - `POST /push/unsubscribe`: this device.
  - `POST /push/test`: sends "Push notifications are working" to the user's own devices; rate-limited.
  - `GET` / `PATCH /notifications/preferences`: add the push fields to the existing preferences routes.
- [x] **P9. Logout:** the logout route also revokes the device's subscription (the frontend sends its endpoint).
- [x] **P10. Chat throttle** (R6): the hook skips a `message` push if the same recipient got one for the same
  thread less than 60 s ago.

## 5. Frontend checklist

- [x] **P11. `public/sw.js` (service worker):**
  - `push`: show the notification (title, body, StraySafe icon, `tag`, `data.url`).
  - `notificationclick`: focus an open StraySafe tab or open a new one at `data.url`, then mark it read.
- [x] **P12. `public/manifest.webmanifest`:** name, icons (192 and 512 from `SSLOGO.png`), `display: standalone`,
  theme colour. Linked in `index.html`. Needed for iPhone push and "Add to Home Screen".
- [x] **P13. `src/utils/push.ts`:**
  - `registerServiceWorker()`, `pushSupported()`, `enablePush()` (asks permission, subscribes with the public key,
    sends it to `/push/subscribe`), `disablePush()`, `currentPushState()`.
  - It never asks for permission on page load.
- [x] **P14. Asking at the right moment:** a small dismissible banner after sign-in ("Get notified about your reports
  and pets even when StraySafe is closed. Turn on"). Shown once per device; "Not now" hides it for 7 days. Staff
  see "Get rescue and report alerts".
- [x] **P15. Settings:**
  - Resident (`ResidentSettings.tsx`) and staff settings: a "Push on this device" switch, the category switches,
    "Show message preview on lock screen", and "Send test notification".
  - If the browser blocked permission: a short "how to allow it" note.
- [x] **P16. Logout:** call `disablePush()` for this device before clearing the session.
- [ ] **P17. Phase 2, Android app:** `@capacitor/push-notifications`; on app start, register and send the FCM token
  to `/push/subscribe` with `channel: "fcm"`; a tap uses the same `url`. Needs `google-services.json` in
  `frontend/android/app/`.

## 6. Tests: `tests/test_push_notifications.py` (throwaway SQLite, the push service faked)

| # | Case | Expected |
|---|---|---|
| 1 | A notification is added and committed | One queued delivery per active device of that user |
| 2 | The transaction is rolled back | No delivery |
| 3 | An unknown, `security` or `operation` type | Not queued |
| 4 | Category switched off / `push_enabled` off | Skipped with a reason |
| 5 | The report became Private for that resident | Skipped (no lock-screen leak) |
| 6 | Payload | Only `title`, `body` (≤120), `url`, `tag`, `notification_id`; no email, phone or address |
| 7 | "Hide details" on | Generic text only |
| 8 | URL per role | Resident gets `/resident/...`, leader gets `/subd/...` |
| 9 | Push server returns 410 | Subscription revoked, not used again |
| 10 | 500 then 200 | Retried, then `sent`; never sent twice |
| 11 | Older than 24 h | `failed`, not sent |
| 12 | Subscribe needs sign-in; another account on the same browser | 401 / re-assigned, not shared |
| 13 | Unsubscribe / logout | That device gets nothing more |
| 14 | Five chat messages in 60 s | One push |
| 15 | Missing VAPID keys | No push, no errors, the app works as before |
| 16 | Every notification text in the code | Passes the safe-text check (P4) |

Then run the full suite (`for t in tests/test_*.py`), `tsc` and `vite build`.

**Manual tests (need a real browser or phone):**
1. Turn on push and press "Send test notification".
2. Close the tab, have another account comment on your public report, and check the push arrives and opens the
   report.
3. Sign out and check pushes stop.
4. On a phone: Chrome on Android over `npm run dev:https` (`https://192-168-254-100.sslip.io:5173`). iPhone needs
   "Add to Home Screen" first.

---

## 7. Order of work
1. P1 to P3: keys, tables and categories.
2. P5 to P7: the hook, sender and worker, plus tests 1 to 11 and 14 to 15.
3. P8 to P10: endpoints and logout, plus tests 12 and 13.
4. P4: the text check and fixes, plus test 16.
5. P11 to P16: the service worker, manifest and pages.
6. The full test run, type check, build and manual tests.
7. Phase 2 (P17), if you want the Android app to get pushes.

## 8. Decisions I need from you

1. **Channels:** Web Push now and Android (FCM) later (my recommendation), or both now? Android needs you to create a
   Firebase project and give me `google-services.json` and a service-account key.
2. **`VAPID_SUBJECT` contact:** which address should the push services see as the contact (e.g. a project
   email)? I won't use your personal email unless you say so.
3. **Lock-screen preview:** default **on** (shows the safe text, my recommendation) or **off** (generic "new update"
   until opened)?
4. **Which categories are on by default:** all (my recommendation), or only Rescues, Pet matches and Messages?
5. **Staff:** should Subdivision Leaders and Barangay Staff get pushes for **every** new report in their area, or
   only for reports assigned to them plus escalations?

## 9. Not in this change
- Reducing the polling intervals once push is on (can follow later).
- SMS.
- Fixing the email retry worker. Recommended next, using the same retry rules as P7.

## 10. As built (Phase 1)

- **Decisions used** (the section 8 recommendations):
  - previews on;
  - all categories on;
  - pushes mirror the in-app notifications each person already gets, so staff alerts follow the existing rules.
- **Contact address:** `VAPID_SUBJECT` is a placeholder (`mailto:straysafe-admin@example.com`) in `.env`. Change it
  to the project's contact address.
- **Keys:** generated into the root `.env`, which git ignores. `.env.example` has empty placeholders, and
  `backend/scripts/generate_vapid_keys.py` makes a new pair. Changing the keys means every device must turn push on
  again.
- **Library:** `pywebpush==2.0.3` (added to `backend/requirements.txt`).
- **Backend files:**
  - `app/models/push.py`
  - `app/utils/push_categories.py`
  - `app/services/push_service.py` (hook, sender, worker)
  - `app/routes/push.py`, which has `GET /push/public-key`, `POST /push/subscribe`, `POST /push/unsubscribe`,
    `GET /push/status` and `POST /push/test`
  - the push fields added to `GET` / `PUT /notifications/preferences`
  - `ensure_push_tables()` in `main.py`
- **The worker** runs every 5 seconds in the FastAPI lifespan, and stays off while the keys are missing.
- **Sign-out (P9/P16):** `clearAuthStorage()` now runs registered hooks first. The push hook unsubscribes this
  browser and tells the server, using the token being cleared, so every sign-out path is covered, including
  automatic ones. There was no separate change to the `/auth/logout` route.
- **Resuming push:** an account that turned push on in a browser gets it back silently after signing in again
  there. It's remembered per account in that browser. Another account never inherits it.
- **Frontend files:**
  - `public/sw.js`, `public/manifest.webmanifest`, `public/icons/` (made from `SSLOGO.png`)
  - `src/utils/push.ts`
  - `src/components/PushBridge.tsx`: tap navigation, marking read via `?pushNotif=ID`, the one-time "Turn on"
    banner
  - `src/components/PushSettingsCard.tsx`, in Resident, Subdivision and Barangay settings. It replaces the old
    placeholder "Browser Push Notifications" toggle in Resident settings, which did nothing.
- **Small extra:** the page title changed from "frontend" to "StraySafe" (needed for the installed app name).
- **Tap links:** `notification_link()` copies the three navbars' click handling. If a navbar's routing changes, update
  it there too.
- **Tests:** `tests/test_push_notifications.py` passes 35/35. The full suite, `tsc` and `vite build` pass.
- **Real round trip** (headless Chrome, dev site, no database writes):
  - Chrome subscribed through `fcm.googleapis.com`, and Google accepted our VAPID-signed, encrypted push (HTTP 201).
  - Showing the notification needs a real (non-headless) browser: that's manual test 1 in section 6.

