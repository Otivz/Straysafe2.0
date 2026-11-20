# Resident-to-Administration messaging with automatic closure on case resolution

- **Date:** 2026-11-19 13:20 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/case_messaging.py`, `backend/app/services/case_messaging.py`, `backend/app/routes/case_messages.py`, `backend/app/utils/case_closure.py`, `backend/app/utils/push_categories.py`, `backend/app/main.py`, `backend/app/db_migrations/resident_messaging.py`, `backend/migrations/2026-11-19_resident_messaging.sql`, `backend/tests/test_resident_messaging.py`, `backend/tests/test_case_messaging.py`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/components/MessageAdminButton.tsx`, `frontend/src/resident/pages/messages/MessagesPage.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/src/resident/pages/reports/LostReport.tsx`, `frontend/src/resident/pages/HomePage.tsx`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/styles/resident.css`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/pages/MessagesPage.tsx`, `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/admin/layout/NotificationsDrawer.tsx`, `frontend/src/admin/AdminApp.tsx`, `docs/01-system/RESIDENT_MESSAGING.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** The developer's request in this session, "FEATURE IMPLEMENTATION: RESIDENT–ADMINISTRATION MESSAGING SYSTEM" (implement resident/administration messaging with report association, notifications, read status, role-based access and automatic conversation closure when the associated case is resolved or closed). FREEZE was OFF.
- **Type:** Feature

## Intent

Let residents and the Subdivision Administration message each other about a report or in general, and make sure a conversation tied to a report becomes read-only, on the server, the moment that report is resolved or closed.

## Key changes

- Extended the existing case conversation system (`case_message_threads`) instead of adding a new one: residents open a `direct` conversation from their own report (one open per resident and case, row-locked) or a `general` one with a subject; the Leader's Messages inbox lists the subdivision's conversations with All / Unread / Open / Closed filters, counts and search; staff can close by hand.
- Automatic closure: `close_for_report` (called by the central `before_flush` closure hook and the closing services) now records `close_trigger = case_closed`, a resident-safe reason, and one `CONVERSATION_AUTO_CLOSED` audit row per conversation; only open rows change, so repeats record nothing. The hook no longer copies the Leader's private `closure_reason` into the conversation. Reopening a case does not reopen conversations.
- Notifications: residents' messages notify the assigned officer (else the Leaders) with type `resident_message` linking to the conversation (previously `case_message` linking to the case); replies tell the resident "Subdivision Administration has replied to your message regarding Report SS-…"; an unread notification for the same conversation is refreshed instead of duplicated; bodies never carry the message text.
- Audit rows for conversation creation, every message (without its text), and closures.
- Schema: `subject`, `close_trigger`, nullable `report_id` on `case_message_threads` via an additive SQL migration and a read-only start-up check.
- Resident app: Messages screen (filters, new general conversation), "Message Subdivision Administration" on report screens, a "Conversation closed" panel (case, reason, closed date) with the composer removed. Leader app: Messages page and sidebar entry with unread badge; notification drawer opens the conversation.

## Validation evidence

- `python tests/test_resident_messaging.py` (backend): 50 checks passed.
- `python tests/test_case_messaging.py`: 105 checks passed (two assertions updated for the Leader notification now opening the conversation).
- `test_lost_found_matching` 64 passed, `test_case_closure` 12/12, `test_case_conversation` 11/11, `test_chat_isolation` 26/26, `test_push_notifications` 35/35, `test_admin_002_notifications_rbac` passed.
- `test_case_lifecycle` and `test_case_privacy_scope` fail identically on a copy with these changes reverted (pre-existing, unrelated: referrals and reporter wording).
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the changed files: clean.
- `node --test`: residentCaseMessages 6/6, adminLiveAdapters 21/21, adminLostFound 13/13, residentLostPetFlow 7/7; residentLiveAdapters 30/31 (the failing legacy case-chat `updateFromChat` assertion is unrelated to these changes).
- The SQL migration was not run against the application database.
