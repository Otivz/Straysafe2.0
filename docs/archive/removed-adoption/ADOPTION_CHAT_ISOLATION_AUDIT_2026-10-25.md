# Adoption chat isolation audit

- **Date:** 2026-10-25
- **Scope:** "Chat with Barangay" for adoption applicants; adoption, report and match conversations; who may read each.
- **Method:** code reading (backend and frontend) and read-only database queries (ids and counts only; no message text was read).
- **Status:** **fixed in code on 2026-10-25** (Findings 1–5). One step remains for you: running the duplicate-thread merge on the database (see the checklist). Change record: [2026-10-25_1501_chat-isolation-fixes](../../05-operations/agents/feature-updates/2026-10-25_1501_chat-isolation-fixes.md).

## Checklist

### Done (investigation, 2026-10-25)

- [x] Traced the "Chat with Barangay" button to the chat drawer in adoption mode (`MyAdoptionApplications.tsx:624`, `2011`, `2048`)
- [x] Confirmed the drawer loads the conversation by application id, not by report or reporter (`ReportChatDrawer.tsx:272`)
- [x] Checked the backend adoption chat: one thread per application, access limited to the applicant and authorized staff, thread created only on the first message under a row lock (`adoption_chat.py:100`, `135`, `557`)
- [x] Checked the other entry points: the application form (no chat), the resident navbar and inbox (open adoption chats correctly)
- [x] Checked that no other code creates or reuses an `Adoption` thread, and that the thread-type migration ran
- [x] Found the root cause of the leak: the adoption merge moves the report onto the adopter's pet, and report chat admits the owner of the linked pet (Finding 1)
- [x] Confirmed it in the database, read-only (Report #3's conversation is open to adopter user 1)
- [x] Checked the same "owner of the linked pet" rule in match chat and report visibility
- [x] Checked the browser message cache (Finding 2)
- [x] Checked report-thread creation order and found duplicate threads in the database (Finding 3)
- [x] Checked the report chat stats endpoint (Finding 4)
- [x] Mapped the six requested scenarios to current behavior
- [x] Wrote this report and indexed it in [docs/README.md](../../README.md)

### Done (fixes, 2026-10-25)

- [x] Decided: an adopter may see the original rescue report's details, never its chat. The report detail already hides the reporter's name, photo and id from everyone but the reporter (`report_visibility.py`, `if not is_reporter:`), so no change was needed there
- [x] Decided: merge the duplicate report threads; script written, dry run done (2 duplicates, both empty)
- [x] Fix 1: no report-chat, match-chat or "confirm reunited" access through a pet adopted after the report (`pet_adoption.owned_through_later_adoption`)
- [x] Fix 2: chat caches cleared at every sign-in, sign-out and ended session; a refused conversation shows nothing cached; an empty server answer replaces a stale cache. (Changed from "per-user cache key": the unread badges read the same keys, and clearing on every account switch covers the shared-device case.)
- [x] Fix 3: access checked before a report thread is created; creation under a row lock; reads use the oldest thread
- [x] Fix 4: `/chat/reports/{id}/stats` returns nothing to people who may not read the conversation
- [x] Fix 5 (found while fixing): match chat checked access after creating the thread, so any resident could become a participant (see Finding 5)
- [x] Tests: `backend/tests/test_chat_isolation.py` (18/18; 8 of them fail on the old code), `frontend/tests/chatCache.browser.mjs` (1280 and 390 px)
- [x] Change record written

### Still to do (you)

- [ ] Back up the database, then from `backend/` run `..\.venv\Scripts\python.exe scripts/merge_duplicate_chat_threads.py --apply`

## Verdict

**There is a bug, but not where the request expected.** The adoption chat itself is correctly isolated per application. The leak is in the **report chat**: when an adoption is completed, the adopter gains read and write access to the original stray report's conversation between the reporter and the barangay. Your current data has one affected case.

## Finding 1 (High): adopters can open the original reporter's conversation

**Root cause, in three steps:**

1. When an adoption is finalized, `_merge_community_record_into_adopted` (`backend/app/routes/adoptions.py:761`, calling `merge_pet_records` at line 780) merges the animal's community pet record into the adopter's new pet record.
2. `merge_pet_records` moves every report linked to the old record onto the adopter's pet (`backend/app/routes/pets.py:1476`, `move(Report, "pet_id", "reports")`). The original stray report now has `pet_id` pointing to a pet **owned by the adopter**.
3. The report-chat access check lets a resident in when they own the pet linked to the report (`backend/app/routes/chat.py:290`, inside `check_user_report_chat_access` at line 241). That rule was meant for a lost pet's real owner. After an adoption it also admits the adopter, so they can read and post in a conversation they were never part of.

**Evidence in the configured database (read-only):**

| Item | Value |
|---|---|
| Adoption application #1 | applicant: user 1; stage `Successful_Adoption`; created pet #4 |
| The animal's original report | Report #3, filed by user 8 |
| Report #3 after the adoption | `pet_id = 4`, owned by user 1 (the adopter) |
| Report #3's conversation | thread #5, 3 messages sent by users 3 (staff) and 8 (the reporter) |

User 1 therefore passes `check_user_report_chat_access(3, user 1)`. I did not call the endpoint as user 1, to avoid reading the private conversation. This conclusion rests on the code path and the data above.

**Where the adopter would see it:** any screen that opens the report chat for Report #3 (the report page reached from the adopted pet's history, for example). The resident **Messages inbox** does not list it, because it shows only reports the resident filed (`chat.py:1188-1190`). So the inbox and the "Chat with Barangay" button behave correctly, while the report pages do not.

**Same rule elsewhere (check in the same fix):**

- **Match chat:** the owner of the matched pet may read a look-alike match conversation (`chat.py:480`), and the merge also moves match suggestions to the adopter's pet. No match thread is affected in the current data (threads #1 and #2 belong to their legitimate owners), but the pattern can leak in the future.
- **Report visibility:** residents may see reports linked to pets they own (`backend/app/utils/report_visibility.py:77`, report detail at `backend/app/routes/reports.py:3146`). After an adoption, the adopter can see the original report. Whether an adopter *should* see the rescue history of their animal is a product decision. The reporter's private conversation is not that history.

**Recommended fix (not implemented):**

- In the resident branch of `check_user_report_chat_access` and the match-chat check, do not grant access through pet ownership that was **acquired by adoption**. That is, skip the grant when the pet was created by an adoption (`adoptions.created_pet_id`) whose applicant is the current user and who is not the reporter. A later lost-pet report about the adopted animal, filed after the adoption, should still give the adopter access as owner.
- Decide separately whether adopters may see the original report's details (not its chat).
- No schema change is needed.

## Finding 2 (Medium): the chat drawer can show cached messages that the server refuses

`frontend/src/components/Chat/ReportChatDrawer.tsx`:

- Messages are cached in the browser under a key made of the conversation id only (`storageKey`, line 272: `straysafe_adoption_chat_<id>`, `straysafe_report_chat_<id>`, `straysafe_match_chat_<id>`), **not** the user.
- The cache is read and shown first (line 439). If the server then refuses the request (403 or 404) or the network fails, the cached messages **stay on screen** (line 501, "fallback to local").
- If the server returns an empty list, a previous cache also stays (line 478 only sets the empty state when nothing is cached).
- Sign-out does not clear these keys (`frontend/src/utils/api.ts:204`, `clearAuthStorage`).

**Effect:** on a shared phone or computer, the next person to sign in can see another user's cached conversation for the same id, even though the server denies access. That includes opening `/adopt/applications?adoption=<someone else's id>&chat=1`.

**Recommended fix:** include the user id in the cache key, clear chat caches on sign-out, and clear the view when the server answers 403 or 404 or returns an empty list.

## Finding 3 (Medium): report threads are created before access is checked, and can be duplicated

- `GET /chat/reports/{id}/thread`, `GET` and `POST /chat/reports/{id}/messages` call `get_or_create_report_thread` **before** `check_user_report_chat_access` (`chat.py:619`, `655`, `670`; function at line 201). Any signed-in user can make the server create a conversation record for any report, even when they then get 403.
- `get_or_create_report_thread` has no lock or unique constraint. The database already holds duplicates: threads #3 and #4 are both for report 2, and #5 and #6 both for report 3. Lookups use `.first()`, so messages saved in a second thread can become invisible.

**Recommended fix:** check access first. Create the thread under a row lock, the way the adoption chat does (`adoption_chat.py:557`), or with a unique index on `(thread_type, related_id)` after merging the existing duplicates (that merge is a data change, so back up and dry-run first).

## Finding 4 (Low): report chat counts are readable by anyone signed in

`GET /chat/reports/{id}/stats` (`chat.py:777`) has no access check. It reveals the thread id, the message and unread counts, and whether the case chat is closed, for any report.

**Recommended fix:** apply `check_user_report_chat_access`, or return zeros when access is denied.

## Finding 5 (High, found while fixing): anyone could join a match chat that didn't exist yet

`GET /chat/matches/{id}/thread`, `GET` and `POST /chat/matches/{id}/messages` created the thread **before** checking access, and a new thread records its caller as `created_by`. The resident branch of `check_user_match_chat_access` admits a thread's creator. So any signed-in resident who called these endpoints for a match nobody had chatted about yet became a participant of that look-alike conversation. On the old code, `test_chat_isolation.py` reproduces it (a stranger gets 200).

**Fixed:** access is checked against the existing thread (`existing_match_thread`) before any thread is created, and the participant check copes with "no thread yet".

## Adoption chat: what already works (requested scenarios)

The adoption chat is one conversation per **application** (`ChatThread(thread_type="Adoption", related_id=adoption_id)`, `adoption_chat.py:135`). The button opens it by application id (`MyAdoptionApplications.tsx:624` and `2011`, drawer at `2048` with `threadMode="adoption"`).

| Scenario | Current behavior | Evidence |
|---|---|---|
| 1. New applicant sees an empty chat | Yes: no thread exists until the first message; the drawer shows "Adoption chat for Application #N…" | `adoption_chat.py:516-534`, drawer line 478 |
| 2. The reporter's conversation stays private | **Fixed** (was: No after an adoption completed, Finding 1) | `test_chat_isolation.py` |
| 3. Leave and return: only this application's messages | Yes on the server; the browser cache can show stale messages (Finding 2) | `adoption_chat.py:516` |
| 4. Applicant B can't see A's messages | Yes on the server (404 for anyone but the applicant and authorized staff), except through the shared-device cache (Finding 2) | `load_adoption_for_chat`, `adoption_chat.py:100` |
| 5. Repeated clicks don't duplicate | Yes: opening creates nothing; the first send creates the thread under a row lock | `adoption_chat.py:557` |
| 6. Report messaging works as before | Yes, but with Findings 3 and 4 | `chat.py` |

## Tests to add with the fix

1. An adopter cannot read or post in the original report's chat (403), and the reporter and staff still can.
2. An adopter *can* access a lost-pet report about the adopted animal that they filed after the adoption.
3. Match chat: an adopter isn't admitted through an adopted pet.
4. Report chat: a denied caller creates no thread; concurrent first messages create one thread.
5. `/chat/reports/{id}/stats` refuses unauthorized users.
6. Browser: after a sign-out and a different user signing in, no cached messages from the first user appear; a 403 or 404 clears the view.

## Open questions for the project owner

1. Should an adopter see the original rescue report's **details** (location, photos, status history)? Its private chat should stay closed either way.
2. Should the duplicate report threads (#3/#4, #5/#6) be merged into one each? That is a data change; it needs a backup and a dry run first.
