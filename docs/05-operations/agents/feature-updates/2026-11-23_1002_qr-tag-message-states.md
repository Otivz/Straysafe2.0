# QR Tag Messages: New, Viewed, Pet Returned, Not the Pet

- **Date:** 2026-11-23 10:02 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/pet_tag.py`, `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/services/case_summaries.py`, `backend/app/services/lost_pet_lifecycle.py`, `backend/tests/test_pet_tags_alerts.py`, `frontend/src/resident/lib/petTag.ts`, `frontend/src/resident/pages/pets/PetTagScans.tsx`, `frontend/src/resident/pages/pets/PetTagScansPage.tsx`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/components/PetTagBlocks.tsx`, `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md`, `docs/README.md`
- **Authorization:** Developer: "Isnt it much better if its Mark as viewed, then after Pet Returened", then "Okay gooo" to the proposal (Viewed automatic, two owner buttons, the Leader sees what happened).
- **Type:** Polish

## Intent

One simple path for a QR tag message that both the owner and the Leader understand.

## Key changes

- **States:** New, then Viewed (automatic when the owner opens the message), then **Pet returned** (`returned`) or **Not the pet** (`dismissed`). "Done" (`resolved`) remains for a pet that was not missing and for messages closed before this change. `CLOSED_SCAN_STATUSES` lists the three closed states.
- **No database change:** `pet_tag_scans.status` is a plain text column.
- **Backend:**
  - `resolve_scans(..., status=)` sets the closed state and only closes open messages;
  - "Pet returned" (the owner's recovery, and the recovery from the Leader or the notice) closes open messages as `returned`;
  - "Not my pet / fake" (`answer: not_real`) closes as `dismissed`, removes the photo link and writes its History line as before;
  - the Dashboard counts and the phone-number cleanup treat all three closed states as closed;
  - `answer: not_yet` is still accepted for older apps.
- **Owner (Resident app):**
  - two buttons for a missing pet, **Pet returned** (with confirmation, the existing recovery) and **Not my pet / fake**, with the note "Still looking? Leave it as it is: it stays here as Viewed until (pet) is home";
  - "Not yet" was removed;
  - a pet that is not missing keeps **Mark as done** and **Not my pet / fake**;
  - labels read New, Viewed, Pet returned, Not the pet and Done;
  - the shared labels are in `resident/lib/petTag.ts`.
- **Leader:**
  - labels read "New · not seen by the owner", "Viewed by the owner", "Pet returned", "Not the pet" and "Done";
  - the summary reads like "1 new · 1 viewed · 2 closed";
  - closed messages are folded under "Earlier messages (N), closed".

## Validation evidence

- `tests/test_pet_tags_alerts.py`: 72/73. The new checks cover:
  - the closed states;
  - New, then Viewed when the owner opens the message;
  - Viewed still open on the Dashboard;
  - Pet returned stored as `returned` and leaving the Dashboard;
  - a closed message not closed again;
  - "Not real" stored as `dismissed`.

  The one failure, "a turned-off tag drops out of the list", already fails on the committed code.
- `test_pet_tags` (31/42), `test_pet_tags_public` (63/69) and `test_lost_pet_lifecycle` (KeyError) are unchanged from before.
- Frontend unit suite: 203 pass, 18 fail, the same as before.
- `npx tsc -b`: exit 0. ESLint: no findings on the changed files except the `set-state-in-effect` errors that the committed versions of `PetTagScansPage.tsx` (1) and `PetDetailsPage.tsx` (2) already have.
- Browser check, 9/9, on a throwaway database with a one-off scratchpad script:
  - the Leader sees "New · not seen by the owner";
  - the owner gets two buttons and no "Not yet", and opening the page makes the message Viewed;
  - "Not my pet / fake" closes it as Not the pet;
  - "Pet returned" closes the open message as Pet returned;
  - the Leader sees "2 closed", with Pet returned and Not the pet in the folded list.
- Not checked on the real app.
