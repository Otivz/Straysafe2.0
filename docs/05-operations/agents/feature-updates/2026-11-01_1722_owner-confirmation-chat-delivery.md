# Owner Confirmation Request Chat Message Delivery

- **Date:** 2026-11-01 17:22 (UTC)
- **AI tool:** Antigravity (Gemini 2.5 Flash)
- **Files changed:** `backend/app/routes/manual_matching.py`, `backend/app/routes/pet_match_confirmations.py`, `backend/tests/test_manual_matching.py`, `frontend/src/components/Chat/ReportChatDrawer.tsx`
- **Authorization:** User explicit prompt: "if the subdivision send a confirmation request, the owner should recieve the messsage so the owner can confirm if its their pet"
- **Type:** Feature

## Intent

When subdivision staff sends a confirmation request from Manual Matching (`/subd/manual-matching`), the pet's registered owner must receive this message as an active conversation message in their chat thread and notifications, with the sighting image preview attached, and have immediate ability to confirm or reject pet ownership directly from the chat or My Pets verification card.

## Key changes

1. **`backend/app/routes/manual_matching.py`**:
   - In `send_pet_confirmation`:
     - Ensures `ReportMatch` exists for `(rep.report_id, pet.pet_id)` with `status="PENDING_VERIFICATION"` and links `creq.match_id = match.match_id`.
     - Sets `match.owner_verification_requested_at`, `owner_verification_requested_by`, and `owner_verification_note`.
     - Obtains or creates the match conversation thread (`find_match_thread` / `get_or_create_match_thread`).
     - Dispatches a `ChatMessage` from staff to the thread with the custom note (or standard prompt) and sighting photo `media_url`.
     - Adds a `match_message` notification so the owner receives a chat notification that opens the match conversation.

2. **`backend/app/routes/pet_match_confirmations.py`**:
   - In `respond`:
     - Synchronizes `ReportMatch` state (`owner_confirmation_status`, `owner_verification_answer`, and `status="NOT_A_MATCH"` if rejected).
     - Dispatches a response `ChatMessage` from the owner back to the match conversation thread with their YES/NO confirmation and optional note.

3. **`backend/tests/test_manual_matching.py`**:
   - Updated confirmation assertions to verify `ReportMatch` creation and `ChatMessage` delivery on confirmation request send.
   - All 112 checks passing.

4. **`frontend/src/components/Chat/ReportChatDrawer.tsx`**:
   - Fetches pending pet confirmations for the resident on open.
   - Renders a prominent Pet Confirmation Request card at the top of the chat thread with staff's custom message, sighting link, instant `[ ✓ Yes, It's My Pet ]` and `[ ✕ Not My Pet ]` action buttons, and a link to the side-by-side photo comparison in My Pets.
   - Updates status immediately upon answering and refetches the message thread.

## Validation evidence

- Ran `..\.venv\Scripts\python.exe tests/test_manual_matching.py` -> 112/112 tests passed.
- Ran `npx tsc --noEmit` in `frontend` -> 0 errors.
- Ran `npm run build` in `frontend` -> build passed with 0 errors.
- Ran `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` -> verified passing.
