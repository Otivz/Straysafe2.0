# Change record: Strictly person-to-person (1-to-1) chats and automatic conversation closure on case close

- **Date:** 2026-11-12 06:07 (UTC)
- **AI tool:** Antigravity
- **Authorization:** Developer instruction ("i dont want you to create like a group chat i want just person to person chat, and what im saying regarding on open connection contact that would be on person to person who involve also the subdivision leader should always capable to contact the reporter individually, and after the case/report closed the chat bridge should automatically closed, for subdi leader to resident or resident to resident")
- **Type:** Polish

## Files changed

- `backend/app/services/case_messaging.py`
- `backend/app/services/lost_found_matching.py`
- `backend/app/services/case_lifecycle.py`
- `backend/app/services/lost_pet_lifecycle.py`
- `backend/app/utils/case_closure.py`
- `backend/app/routes/lost_found.py`
- `backend/tests/test_case_messaging.py`
- `frontend/src/admin/data/monitored.ts`
- `frontend/src/admin/pages/case/monitored/Sections.tsx`
- `frontend/src/admin/pages/case/CaseDialogs.tsx`
- `frontend/src/admin/dialogs/MatchDialogs.tsx`
- `frontend/src/admin/dialogs/ReviewDialogs.tsx`
- `frontend/src/admin/dialogs/CaseMessagesDialog.tsx`
- `frontend/src/resident/pages/reports/ConversationPage.tsx`
- `frontend/tests/adminMonitoredCase.test.mjs`
- `frontend/tests/liveLostFound.browser.mjs`
- `docs/01-system/LOST_FOUND_MATCHING.md`
- `docs/05-operations/agents/feature-updates/2026-11-12_0607_person-to-person-chat-and-auto-close.md`
- `docs/README.md`

## Summary of changes

1. **Strictly 1-to-1 Resident-to-Resident Communication Bridge (`bridge`):**
   - When the Subdivision Leader links a Lost Pet report and a Found Animal report (confirming a suggested match or linking manually), `case_messaging.open_bridge` creates a 1-to-1 conversation containing only the two residents (`owner` and `finder`), with no Subdivision Leader participant.
   - `case_messaging.access` restricts `/case-messages/{thread_id}` on `bridge` threads to the two resident members (`owner` and `finder`); staff access applies only to `direct` (Subdivision Leader ↔ resident) threads.
   - Resident replies in a `bridge` thread notify only the other resident (`owner` ↔ `finder`), not the Subdivision Leader.
   - Updated Resident `ConversationPage.tsx` and backend `_titles` so the bridge is described as a direct conversation between the owner and the finder.

2. **Individual 1-to-1 Subdivision Leader-to-Resident Contact (`direct`):**
   - Updated `peopleOf` in `frontend/src/admin/data/monitored.ts` and `LinkedReports` in `frontend/src/admin/pages/case/monitored/Sections.tsx` so the Subdivision Leader can always contact the owner, reporter, or finder of the current report and of any linked report individually (`Contact the owner`, `Contact the reporter`, `Contact the finder`), with each sent message logged to that report's Activity.
   - Removed the 3-way group-chat auto-open on match confirmation and manual linking in `CaseDialogs.tsx`.

3. **Automatic Closure of All Conversations (`direct` and `bridge`) When a Case/Report Closes:**
   - Added `case_messaging.close_for_report(db, report_id, actor_id, reason)` and invoked it in `case_lifecycle.close_case`, `case_lifecycle.withdraw_case`, `lost_pet_lifecycle.confirm_recovery`, and the central SQLAlchemy `before_flush` hook in `utils/case_closure.py` so every open `direct` (Leader ↔ resident) and `bridge` (resident ↔ resident) thread involving a closed report is automatically marked `status = "closed"` in the database with a closing system message (`can_reply = false`).

## Verification

- `backend/tests/test_case_messaging.py`: 100 checks passed
- `backend/tests/test_lost_found_matching.py`: 64 checks passed
- `npx tsc -b`, `npx vite build`, `npx eslint src/admin src/resident tests`: passed
- `node --test tests/adminMonitoredCase.test.mjs tests/residentCaseMessages.test.mjs tests/adminLostFound.test.mjs`: 32 tests passed
- `node tests/liveLostFound.browser.mjs`: 14 end-to-end browser steps passed

