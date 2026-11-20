# Resident-to-Administration messaging

Status: Current (2026-11-19). Code: `backend/app/services/case_messaging.py`, `backend/app/routes/case_messages.py`, `backend/app/utils/case_closure.py`; Resident app `frontend/src/resident/pages/messages/MessagesPage.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/src/resident/components/MessageAdminButton.tsx`; Subdivision Leader app `frontend/src/admin/pages/MessagesPage.tsx`. Tests: `backend/tests/test_resident_messaging.py`, `backend/tests/test_case_messaging.py`.

## What it is

Residents and the Subdivision Administration (the Subdivision Leaders of the resident's subdivision, and the Administrator) write to each other in conversations. It is built on the existing case conversation tables (`case_message_threads`, `case_message_members`, `case_messages`), the same ones used for the Leader's "Contact the owner" and the lost/found bridge ([LOST_FOUND_MATCHING.md](LOST_FOUND_MATCHING.md)). No new messaging system or table was added.

| Kind | Opened by | About | Who reads and writes |
| --- | --- | --- | --- |
| `direct` | the resident from their own report ("Message Subdivision Administration"), or the Leader from the case | one report | the resident, and the Leaders of the report's subdivision (and the Administrator) |
| `general` | the resident, from Messages, with a subject and a first message | no report | the resident, and the Leaders of the resident's subdivision (and the Administrator) |
| `bridge` | the Leader linking a lost and a found report | two reports | the owner and the finder (unchanged) |

## Rules

- **One conversation per case.** Asking to message the administration from a report returns the OPEN `direct` conversation the resident already has for it (including one the Leader opened), otherwise opens one. The report row is locked while this happens, so two taps open one conversation.
- **Only your own report.** A resident can open a conversation only from a report they filed, or (for a lost pet) the report of their own missing pet. Anything else answers 404.
- **Statuses.** A conversation is `open` or `closed`. A closed conversation is read-only for everyone; its messages stay.
- **Automatic closure (the main rule).** When a report is resolved or closed (any closed legacy status, or `case_status = closed`), every open conversation tied to it is closed in the same database transaction. It is done centrally by the `before_flush` hook in `utils/case_closure.py` (and by the closing services directly), so every closing path is covered. Each closed conversation gets `status = closed`, `closed_at`, `closed_by` (the person who closed the case, or empty for the system), `close_trigger = case_closed`, a resident-safe `close_reason` ("This conversation has been closed because the associated case has been resolved."), a system line in the conversation, and one `CONVERSATION_AUTO_CLOSED` audit row (previous and new status, report, reason, trigger, triggering event, who). The Leader's private closure notes never reach the conversation.
- **Idempotent.** Only open rows change, so a repeated status update records no second closure.
- **General conversations** are never closed by a case. Staff may close any conversation by hand (`close_trigger = manual`, audited as `CONVERSATION_CLOSED`); residents cannot.
- **Enforced on the server.** Sending to a closed conversation, or to one whose report is closed, is refused with 409 whatever the client does.
- **Reopening.** Reopening a case does not reopen its conversations. The resident can open a new conversation on the reopened case; the closed one and its history stay.
- **Assigned cases.** On a report assigned to one officer, only that officer (or the Administrator) can reply; the notification goes to that officer.
- **Limit.** A resident can have at most 5 open general conversations at a time.

## Notifications

| Event | Who | Type, link | Title |
| --- | --- | --- | --- |
| A resident writes | the assigned officer, else the Leaders already in the conversation, else all active Leaders of the subdivision | `resident_message`, related id = conversation, opens `/messages/{id}` | "New message received from a resident regarding Report SS-2026-0017." (no report: "New message received from a resident.") |
| The administration replies in a conversation the resident started | the resident | `case_message`, opens `/conversations/{id}` | "Subdivision Administration has replied to your message regarding Report SS-2026-0017." |
| The Leader writes in a conversation the Leader started | the resident | `case_message` | "Message from your Subdivision Leader" (unchanged) |
| Staff close a conversation by hand | the resident | `case_message` | "Your conversation was closed" |

The notification body never contains the message text ("Open the conversation to read the new message."). While a person's notification for a conversation is still unread, a new message refreshes it instead of adding another. Push delivery follows the existing `push_messages` preference (`utils/push_categories.py`). Before 2026-11-19 the Leader's notification of a resident's reply was `case_message` with the report id and opened the case; it now opens the conversation, which links to the case.

## Read and unread

Each member's `last_read_message_id` marks how far they have read. Leaders who have not joined a conversation share the furthest Leader read mark. The unread counts drive the resident's Messages list and Home, the Leader's inbox and the sidebar badge (`GET /case-messages/unread-count`, conversations with unread messages among open ones). Screens refresh every 10 seconds while visible (no WebSocket exists in the project).

## API

| Method and path | Who | What |
| --- | --- | --- |
| `GET /case-messages` | resident | my conversations, newest first |
| `POST /case-messages/reports/{report_id}` | resident | open (or return the open) conversation about my report |
| `POST /case-messages/general` | resident | `{subject, body, client_request_id}`: a general conversation with its first message |
| `GET /case-messages/inbox?status=all\|unread\|open\|closed&q=` | Leader, Administrator | inbox with counts; search by subject, reference (`SS-2026-0017` or `17`), category or resident name |
| `GET /case-messages/{id}` | members, staff of the subdivision | the conversation with its messages |
| `POST /case-messages/{id}/messages` | members, staff | write (409 when closed) |
| `POST /case-messages/{id}/read` | members, staff | mark read |
| `POST /case-messages/{id}/close` | Leader, Administrator | `{reason}`: close by hand |
| `GET /case-messages/unread-count` | anyone signed in | unread conversations and messages |

Conversation summaries carry `subject`, `report_ref`, `report_category`, `case_status` ("Resolved" or "Closed" for a closed case), `closed_at`, `close_trigger` and `started_by_resident`. Staff see residents' full names; residents see the Leader as "Subdivision Leader".

## Audit

`CONVERSATION_CREATED`, `CASE_MESSAGE_SENT` (both sides; the audit row never holds the message text), `CONVERSATION_AUTO_CLOSED`, `CONVERSATION_CLOSED` (manual or a removed lost/found link). A conversation started from a report also adds a neutral line to the report timeline. A Leader's message on a report is still written into the case contact log. Messages are never edited or deleted.

## Schema

`backend/migrations/2026-11-19_resident_messaging.sql` (additive, idempotent): `case_message_threads.subject VARCHAR(160) NULL`, `case_message_threads.close_trigger VARCHAR(20) NULL`, and `case_message_threads.report_id` made nullable for general conversations. It also fills `close_trigger` for conversations closed earlier. The same idempotent change is also made at start-up by the case alignment step (`app/db_migrations/case_alignment.py`, `ensure_case_message_thread_columns`), so an existing local database is brought up to date by starting the backend; the SQL file stays available for applying it by hand. Afterwards the backend checks the result (`app/db_migrations/resident_messaging.py`) and refuses to start, naming the file, if anything is still missing.

## Ownership verification conversations

Since 2026-11-20 a Leader can open a `direct` conversation with a registered pet's owner about a report that is not theirs ([POSSIBLE_OWNER_VERIFICATION.md](POSSIBLE_OWNER_VERIFICATION.md)). The owner is a member in the role `pet_owner` ("Possible owner") with no report of their own, so the conversation never opens the report for them. Its subject is "Ownership verification: Report SS-…", it appears in the Messages inbox like the others, it closes with its case, and `GET /case-messages/{id}` adds `verification` (the Yes/No card for the owner, the status for staff).

## Limits

- No real-time push into an open screen: polling every 10 seconds (30 seconds for the sidebar badge).
- Text only (no attachments) in these conversations.
- The inbox builds each conversation summary separately; fine for one subdivision, not tuned for thousands of conversations.
- No authorized "reopen conversation" action: a closed conversation stays closed by design.
