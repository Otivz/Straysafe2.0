# Chat isolation: adopters, match chats, thread creation and the browser cache

- **Date:** 2026-10-25 15:01 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/utils/pet_adoption.py`, `backend/app/routes/chat.py`, `backend/app/routes/reports.py`, `backend/scripts/merge_duplicate_chat_threads.py`, `backend/tests/test_chat_isolation.py`, `frontend/src/utils/api.ts`, `frontend/src/components/Chat/ReportChatDrawer.tsx`, `frontend/tests/fixtures/chatCache.tsx`, `frontend/tests/chatCache.browser.mjs`, `docs/03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-25_1501_chat-isolation-fixes.md`
- **Authorization:** the developer's "go" (2026-10-25) to the recommended fixes for the open items of `docs/03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md`, including both recommended decisions (adopters see report details but never its chat; merge duplicate report threads through a dry-run script).
- **Type:** Fix

## Intent

Close the conversation leaks found in the audit: an adopter could read and post in the original stray report's conversation; any resident could join a match chat not started yet; refused or stale conversations could still show from the browser cache; report threads were created before the access check and could be duplicated; report chat counts were visible to anyone signed in.

## Key changes

- `owned_through_later_adoption` (`backend/app/utils/pet_adoption.py`): true when the user owns the pet only through an adoption whose pet record was created after the report or match. Used in the resident branch of report-chat and match-chat access and in "confirm reunited". A report filed after the adoption is unaffected.
- Report chat (`chat.py`): access is checked before a thread is created; a new thread is created under a row lock on the report; reads use the oldest thread (`find_report_thread`); `/chat/reports/{id}/stats` returns nothing to people who may not read the conversation.
- Match chat (`chat.py`): access is checked against the existing thread (`existing_match_thread`) before one is created. Before, the new thread named its caller as creator, which passed the participant check.
- Browser (`api.ts`, `ReportChatDrawer.tsx`): `clearAuthStorage` removes cached report, match and adoption conversations; a 403 or 404 drops the cache, shows "You don't have access to this conversation" and blocks sending; an empty server answer replaces a stale cache with the welcome note.
- `backend/scripts/merge_duplicate_chat_threads.py`: moves messages of duplicate Report or Direct threads into the oldest one, then removes the empty duplicates. Dry run by default; **not applied**.
- No schema change.

## Validation evidence

- `backend/tests/test_chat_isolation.py`: 18/18. Against the previous `chat.py` (scratch copy), 8 of the 18 fail, including the adopter reading the reporter's conversation (200) and a stranger joining a match chat (200).
- Existing suites passed: `test_chat_governance` 43/43, `test_adoption_chat` 102/102, `test_case_conversation` 11/11, `test_chat_counterpart` 4/4, `test_leader_claimed_chat` 13/13, `test_owner_verification` 17/17, `test_qr_limit_and_chat_thumb` 6/6, `test_report_visibility` 76/76, `test_case_claims` 18/18, `test_claim_identity` (12), `test_merge_pet_identity` 38/38, `test_pet_adoption_lock` 11/11, `test_adoption_single_record` 8/8, `test_pet_handover_sync` 15/15, `test_owner_return` 51/51, `test_trust_rule` 22/22, `test_pet_behavior_history` (9).
- Frontend: `tsc` and `vite build` passed; `chatCache.browser.mjs` passed at 1280 and 390 px; `notifications`, `matchReviewLocation`, `claimEvidence` and `petBehaviorHistory` browser checks and the four `.test.mjs` suites still pass.
- Dry run of the merge script on the configured database (nothing saved): 2 duplicates (report 2: threads 3 and 4; report 3: threads 5 and 6), both duplicates with 0 messages.
- Not done: applying the merge script; concurrency of the row lock was not exercised (SQLite ignores it); no test on the Android app.
