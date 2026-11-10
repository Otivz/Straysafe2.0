# Final behavioral corrections before the database rebuild

- **Date:** 2026-11-10 00:50 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/utils/pet_ownership.py`, `backend/app/routes/chat.py`, `backend/app/routes/reports.py`, `backend/app/utils/pet_record_access.py`, `backend/requirements.txt`, `backend/tests/test_chat_isolation.py`, `backend/tests/test_pet_record_access.py`, `backend/tests/test_owner_verification.py`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`. `Database3.4_subdivision.sql` and its `.txt` were checked and needed no change.
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Final Behavioral Corrections Before Database Rebuild" (five corrections, no restart of the cleanup, no new audit or plan).
- **Type:** Fix

## Intent

Close the behavior gaps the legacy retirement (see [batch 2](2026-11-10_0021_legacy-retirement-batch-2.md)) left, before the database is rebuilt.

## Key changes

- **Private reporter chat (restored, generalised).** Batch 2 dropped the rule that kept an adopter out of the reporter's private conversation. It is back as `became_owner_after()` in `utils/pet_ownership.py`: an owner of a linked pet whose ownership began after the report was filed gets no access to the report conversation, the old look-alike (match) chat, or "confirm reunited" on that report. Ownership starts at the last *accepted* ownership confirmation for that account (staff assignment, approved ownership claim, return to owner), else at the pet record's creation; an owner who registered the pet themselves is the original owner. Used in `routes/chat.py` (report chat, confirmed-match path, match chat) and `routes/reports.py` (`confirm-reunited`, which had lost the same guard). The reporter, the leader of the subdivision, the assigned leader, the Admin, a participant of the thread and a report filed after the person became the owner are unchanged.
- **Staff pet-profile editing (tightened).** `record_edit_permissions` now allows staff (Subdivision Leader, Barangay) to edit a profile or photo only for an **ownerless community record** linked to an open case in their area. A pet with an owner account is the owner's (or an Admin's) to edit, whatever cases are open. Case management (status, assessment, notes, referrals, follow-ups) and evidence (report media, history) run through the report endpoints and are untouched; staff behavior-history rules and the other pet write guards (`check_pet_access`) are unchanged. A pet that gets an owner leaves staff hands.
- **SQL snapshot.** Checked, no change: no statement inserts into `chat_threads` or `chat_messages`, nothing outside comments mentions `Adoption` or `Pet_Claim`, `chat_threads.thread_type` is exactly `('Report','Direct')` with default `'Report'`, the model enum is the same pair, the code only creates those two thread types, 51 tables, the `.sql` and `.txt` are byte-identical.
- **Requirements.** `qrcode` and `types-qrcode` removed from `backend/requirements.txt`: no import or other use anywhere in `backend`, `.github`, scripts or tests, and no installed package requires them. Nothing was installed or uninstalled. Other packages that only the retired subsystems used (for example the encryption library behind the removed ID-photo module) were not touched.
- **Test folders in `%TEMP%`.** Only folders proven to come from this effort's test runs were removed (see the validation section).

## Validation evidence

Targeted only (no full sweep, no browser suite, no server, no MySQL, no rebuild):

- `test_chat_isolation` (26/26, now including: a later owner is refused on the report chat, thread details, posting, a confirmed match, the old match chat and confirm-reunited; the original owner, a self-registered owner, a report filed after ownership began and an owner assigned before the report are admitted; the reporter and leader still read it), `test_chat_governance`, `test_chat_counterpart`, `test_leader_claimed_chat`, `test_case_conversation`, `test_owner_verification` (its pet fixture now records the owner as registrant), `test_owner_return`, `test_pet_handover_sync`, `test_lost_pet_sighting_ping`, `test_manual_matching`, `test_barangay_gate`: all pass with `BARANGAY_WORKFLOWS_ENABLED=1`.
- `test_pet_record_access` (15 tests, now including: staff are refused on a resident's pet even with an open case in their area, with the owner and the Admin admitted and the ownerless community record still editable; a pet that gets an owner leaves staff hands) and `test_pet_behavior_history`: pass. Without the variable, the checks that sign in a Barangay account still fail as before.
- Import check of every app module (0 failures, 51 tables); static snapshot check described above.
- Temp cleanup manifest: direct children of `%TEMP%` only, created on or after 2026-11-09 18:31 UTC (the start of batch 2), plain directories, owned by the current Windows user (all 147 checked with `Get-Acl`), and holding only files whose names are throwaway database names that `backend/tests` create (87 names, collected from the test sources; `test.db` from `_isolated_db.py`), each `.db` with the SQLite header. Each file was removed individually and the folder removed with `rmdir`; nothing recursive, no wildcard. Result: 147 folders removed, 133.3 MB freed, 0 skipped; a re-scan finds no remaining candidate.
- **Left in place on purpose:** 4 folders from the same window that hold other content (`photos`, `images`, `tests`), 41 empty folders from the same window, and every folder created before the cutoff (earlier sessions, including batch 1's own test runs), because they are not demonstrably from this effort (1,287 older folders, about 1.5 GB, remain for the developer to decide).
