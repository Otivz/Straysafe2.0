# QR Tag Messages: the Owner Answers (Phase 3)

- **Date:** 2026-11-23 09:13 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/pet_tags.py`, `backend/app/services/pet_tags.py`, `backend/tests/test_pet_tags_alerts.py`, `frontend/src/resident/pages/pets/PetTagScansPage.tsx`, `frontend/src/resident/pages/pets/PetTagScans.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/data/reducer.ts`, `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md`, `docs/README.md`
- **Authorization:** Developer: "phase 3".
- **Type:** Feature (phase 3 of the approved plan)

## Intent

Let the owner answer each QR tag message in one tap, and let the Leader see why a message was cleared.

## Key changes

- **Backend:** the existing resolve requests (`POST /pets/{id}/tag/scans/{scan_id}/resolve` and `/scans/resolve`) accept an optional `answer`, `not_yet` or `not_real`:
  - it resolves the message(s), then `record_owner_answer` writes a neutral line on the pet's open missing-pet case: "The owner checked a QR tag message: the pet is not home yet." or "The owner said a QR tag message was not about their pet." (or "2 QR tag messages ... were");
  - there is no status change and no recovery;
  - it is ignored when `recovered` is true;
  - no line is written when the pet has no open notice or the case is closed;
  - an unknown value is refused (422);
  - older apps that send no answer work as before.
- **"Yes, home":** the existing `recovered: true` path (the owner's recovery) is unchanged.
- **Resident app:**
  - on the "Someone found (pet)" page, a missing pet's message shows "Did this bring (pet) home?" with **Yes, (pet) is home** (confirm, then the existing recovery), **Not yet, still looking** and **This isn't real / not my pet**;
  - a pet that is not missing shows **Mark as done** and **This isn't real / not my pet**;
  - the earlier two-choice sheet was replaced;
  - messages from guests read "A guest (not signed in)", here and on the pet profile;
  - a guest message without a phone number says the guest cannot be contacted through StraySafe.
- **Decision recorded:** "Not yet" also clears the message, so it leaves the Leader's Dashboard; the case line keeps the record.

## Validation evidence

- `tests/test_pet_tags_alerts.py`: 10 new checks pass:
  - "Not yet" resolves, writes its line, recovers nothing and clears the Dashboard counts;
  - "This isn't real" resolves and writes its line, and the pet stays Lost;
  - answering several at once writes one counted line;
  - an unknown answer is refused;
  - the Leader cannot answer, and the message stays open;
  - a pet with no notice writes no line.

  57/58 overall; the one failure, "a turned-off tag drops out of the list", already fails on the committed code. The test now moves earlier messages out of the existing 10-per-hour window first.
- **Browser check, 14/14,** on a throwaway database with the browser-test API and a one-off scratchpad server:
  - the guest label and the no-phone note;
  - the three buttons;
  - "Not yet" clears the message and writes the line, without closing the case;
  - "This isn't real" clears the message and writes its line;
  - "Yes, home" closes the case as recovered, sets Mochi to Active and clears every message.
- Unchanged by this phase:
  - frontend unit suite at 203 pass and 18 fail, the same as before;
  - `test_pet_tags` at 31/42 and `test_pet_tags_public` at 63/69, both failing as before (tags made permanent).
- `npx tsc -b`: exit 0.
- ESLint: the one error in `PetTagScansPage.tsx` (`set-state-in-effect`, line 70) is in its existing loading effect, which this change did not touch.
- Not yet checked by a person on the real app.
