# Module 09 — Communication & Notifications (index)

> **Source of truth:** `backend/app/models/chat.py`, `notification.py`, `notification_preference.py`, `push.py`,
> `email_log.py`, checked against the live MySQL schema. Documentation only.

## 1. Module purpose
How StraySafe 2.0 talks to its users:
- chat between residents and staff about a report, claim or adoption;
- in-app notifications;
- push notifications to phones and browsers, with per-user preferences;
- the outgoing email log.

## 2. Why this module is split
As one diagram, Module 09 has 7 tables, 80 columns and 10 relationship lines, **all of them to `users`** or inside the
module. The two halves are independent: **chat and email** don't reference notifications, and **notifications and
push** don't reference chat. Splitting gives two compact diagrams with no line crossing between them.

| Submodule | Tables defined in full | Reference entities | Lines |
|---|---|---|---|
| [09A — Chat & Email](09A_CHAT_EMAIL_ERD.md) | `chat_threads`, `chat_messages`, `email_logs` | `users` | 5 |
| [09B — Notifications & Push Delivery](09B_NOTIFICATIONS_PUSH_ERD.md) | `notifications`, `user_notification_preferences`, `push_subscriptions`, `push_deliveries` | `users` | 5 |
| **Total** | **7 tables** | | **10** (all of the module's FKs) |

## 3. Notes
- **No links to other modules except `users`.** Threads, notifications and emails refer to reports, claims and
  adoptions through polymorphic `related_id` columns (an ID plus a type), which cannot be foreign keys.
- The only model-vs-database difference is the ON DELETE rule on `notifications.user_id`. Details are in 09B.
