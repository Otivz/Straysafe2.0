# Lost & Found: in-app case messaging, manual linking & unlinking, Barangay-only assistance, and Resident Home communication bridge

- **Date:** 2026-11-12 05:44 (UTC)
- **AI tool:** Antigravity (completing interrupted Claude Code implementation)
- **Files changed:** `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `backend/app/db_migrations/case_alignment.py`, `backend/app/main.py`, `backend/app/models/__init__.py`, `backend/app/models/case_messaging.py`, `backend/app/routes/case_messages.py`, `backend/app/routes/lost_found.py`, `backend/app/services/case_messaging.py`, `backend/app/services/case_notes.py`, `backend/app/services/case_work.py`, `backend/app/services/lost_found_matching.py`, `backend/app/services/lost_pet_lifecycle.py`, `backend/app/utils/push_categories.py`, `backend/tests/test_case_messaging.py`, `backend/tests/test_lost_found_matching.py`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/data/monitored.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/dialogs/CaseMessagesDialog.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/dialogs/MatchDialogs.tsx`, `frontend/src/admin/dialogs/ReviewDialogs.tsx`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/CaseDialogs.tsx`, `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `frontend/src/admin/pages/case/dialogState.ts`, `frontend/src/admin/pages/case/monitored/Activity.tsx`, `frontend/src/admin/pages/case/monitored/Hero.tsx`, `frontend/src/admin/pages/case/monitored/Sections.tsx`, `frontend/src/admin/styles/pages.css`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/data/context.ts`, `frontend/src/resident/data/selectors.ts`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/lib/useCaseConversation.ts`, `frontend/src/resident/live/LiveDataProvider.tsx`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/HomePage.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/tests/_lostFoundScenario.mjs`, `frontend/tests/adminLiveAdapters.test.mjs`, `frontend/tests/adminLostFound.test.mjs`, `frontend/tests/adminMonitoredCase.test.mjs`, `frontend/tests/demoLostFound.mjs`, `frontend/tests/liveInterfaces.browser.mjs`, `frontend/tests/liveLostFound.browser.mjs`, `frontend/tests/residentCaseMessages.test.mjs`, `frontend/tests/residentLiveAdapters.test.mjs`, `docs/01-system/CASE_WORKFLOW_BACKEND.md`, `docs/01-system/DATABASE_SCHEMA.md`, `docs/01-system/LOST_FOUND_MATCHING.md`, `docs/04-testing/README.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** Developer instruction on 2026-11-12: replace "Log a contact" in the owner/people section with "Contact the owner" (or reporter/finder) opening an in-app message conversation that logs each Subdivision Leader action to Activity; add manual linking and unlinking of Lost & Found reports; restrict external referrals to Barangay assistance only; and open a communication bridge among the involved residents and Leader as soon as a report is linked, surfacing it in the Resident app's Home screen under "Needs your attention".
- **Type:** Feature

## Intent

Complete the four Lost & Found coordination and communication requirements across the backend, Subdivision Leader interface, and Resident app:

1. **Direct Leader–resident messaging from the people card:** Replace manual contact logging in the Hero people block of Lost Pet and Found Animal pages with `"Contact the owner"` / `"Contact the reporter"` / `"Contact the finder"`. Opening it launches an in-app thread (`direct`) where every message sent by the Subdivision Leader automatically writes a `CaseContactLog` (`method="message"`) and a `StatusHistory` line on the report so the case Activity updates itself.
2. **Manual linking and unlinking of Lost & Found reports:** Allow the Subdivision Leader to link any open Lost Pet and Found Animal reports in the subdivision (`Link a report` / `POST /lost-found/links`) even without a prior system suggestion, and to unlink linked reports (`Unlink` / `POST /lost-found/matches/{match_id}/unlink`) with a recorded reason while keeping both reports and message history intact (read-only after unlink).
3. **Barangay assistance only:** Restrict new external referrals (`POST /cases/{report_id}/referrals` and `ReferralDialog`) to `org_type="barangay"`, deriving the Barangay name from the subdivision's configured Barangay. Historical non-Barangay referral records remain visible as read-only history.
4. **Communication bridge on link & Resident Home "Needs your attention":** Confirming a suggested match or manually linking a Lost Pet and Found Animal report immediately opens a three-party `bridge` conversation (owner, finder, and Subdivision Leader), notifies both residents (`lost_found_bridge`), opens the conversation dialog for the Leader, and surfaces the open conversation with unread count at the top of `"Needs your attention"` on the Resident Home screen (`/resident-app/home` -> `/resident-app/conversations/:conversationId`).

## Key changes

- **Database & backend (`case_messaging.py`, `lost_found_matching.py`, `case_work.py`):**
  - Added three additive tables (`case_message_threads`, `case_message_members`, `case_messages`) to `backend/app/models/case_messaging.py`, `backend/app/db_migrations/case_alignment.py`, `Database3.4_subdivision.sql`, and `Database3.4_subdivision.txt`.
  - Implemented `open_direct`, `open_bridge`, `close_bridges`, `send`, `mark_read`, `threads_for_report`, and `threads_of_user` in `backend/app/services/case_messaging.py`, plus resident/staff endpoints in `backend/app/routes/case_messages.py` and Leader thread/link/unlink endpoints in `backend/app/routes/lost_found.py`.
  - Enforced privacy on resident views (residents see first names only and never receive another resident's phone number, email, or home address; notification bodies use `"Open the conversation to read the new message."` so message text is never leaked in push/notification previews).
  - Enforced `data.org_type == "barangay"` in `create_referral` (`backend/app/services/case_work.py`), rejecting other organization types with `422`.
- **Subdivision Leader interface (`Hero.tsx`, `Sections.tsx`, `CaseMessagesDialog.tsx`, `CoordinationDialogs.tsx`, `ActionsTab.tsx`):**
  - Replaced `"Log a contact"` in `Hero.tsx` with `"Contact the owner"` / `"Contact the reporter"` / `"Contact the finder"`, opening `CaseMessagesDialog`.
  - Deduplicated in-flight thread-open requests in `CaseMessagesDialog.tsx` (`pendingOpen` ref keyed by target) so React `<StrictMode>` double-mounts in development do not issue concurrent `POST` requests.
  - Added `"Link a report"`, `"Open conversation"`, and `"Unlink"` in `LinkedReports` (`Sections.tsx`), and restricted `ReferralDialog` / `ActionsTab.tsx` to `"Ask the Barangay for help"`.
- **Resident interface (`HomePage.tsx`, `ConversationPage.tsx`, `ReportDetailsPage.tsx`, `selectors.ts`):**
  - Added `conversationAttention` selector and updated `HomePage.tsx` so open, replyable conversations with `unread > 0` appear in `"Needs your attention"` and read/closed conversations appear under `"Recent conversations"`.
  - Added `/resident-app/conversations/:conversationId` (`ConversationPage.tsx`) and a `"Conversations"` section on `ReportDetailsPage.tsx`.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`): passed (0 errors).
- `eslint src/admin src/resident tests`: passed (0 errors).
- Frontend unit tests (`frontend/tests/*.test.mjs`, including `residentCaseMessages.test.mjs`, `adminMonitoredCase.test.mjs`, `adminLostFound.test.mjs`): all passed.
- Isolated backend test suites:
  - `backend/tests/test_case_messaging.py`: 97/97 checks passed.
  - `backend/tests/test_lost_found_matching.py`: 64/64 checks passed.
  - `backend/tests/test_barangay_referrals.py` (49/49), `test_case_lifecycle.py`, `test_case_closure.py`, `test_lost_pet_lifecycle.py` (146/146), `test_lost_pet_registration_first.py` (82/82): all passed.
- End-to-end headless browser suites against isolated SQLite backend:
  - `frontend/tests/liveLostFound.browser.mjs`: 14/14 steps passed.
  - `frontend/tests/liveInterfaces.browser.mjs`: 60/60 steps passed.
- Not done: nothing was committed or pushed, and the configured MySQL database was not touched.
