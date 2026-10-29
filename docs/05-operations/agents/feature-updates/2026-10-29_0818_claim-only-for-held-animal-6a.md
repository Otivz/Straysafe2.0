# Phase 6A: a pet claim only for an animal someone holds (backend)

- **Date:** 2026-10-29 08:18 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/utils/claim_custody.py` (new), `backend/app/routes/claims.py`, `backend/app/schemas/pet_claim.py`, `backend/tests/test_claim_only_when_held.py` (new), `backend/tests/test_case_claims.py`, `backend/tests/test_claim_photos.py`, `backend/tests/test_claim_proof_reuse.py`, `backend/tests/test_multi_animal_split.py`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "Yup go for a if that is the better one" (Phase 6A; decisions A and B confirmed with "Yes").
- **Type:** Fix

## Intent

A pet claim sat in "Pending Review" for a roaming dog nobody held, with nothing to hand over. A claim is now only for an animal someone holds, which in practice means the Barangay.

## Key changes

- `animal_held(db, report)` checks the whole merged case. The animal counts as held when any of these is true: a facility is set, the report status is 5, 6, 7 or 8, the custody is a facility or holding place, or there is an open holding record.
- **Filing is refused (409) for an animal nobody holds:** `POST /claims/`, `POST /claims/{id}/evidence`, and the owner's `PATCH /claims/{id}`. The message: "Nobody is holding this pet, so no claim is needed. Tell the Subdivision Leader whether it is home or still missing." A claim already Approved, handed over or received goes on.
- **`POST /claims/custody-answer`:** the owner answers "home" or "missing", with an optional note.
  - Only the pet's owner can answer, after confirming the sighting, and only when nobody holds the animal.
  - The answer is stored as a report history entry. The handling leader is notified, and it is in the audit log.
  - The pet is not marked Lost (decision B).
- **`POST /claims/{id}/close-not-needed`:** staff in scope close an open claim on an animal nobody holds.
  - The claim becomes `Rejected` with the reason "Not needed: the pet is home" (decision A).
  - It is refused when the animal is held or the claim is already decided.
  - The owner is notified, and it is in the audit log.
- Claim responses carry `animal_held` and `closed_not_needed`, for the screens (6B).
- **Four older claim tests** (case claims, claim photos, proof reuse, multi-animal split) now give their reports the custody "In Barangay Facility". They file claims; what they check is unchanged.
- **Until 6B is built:** "Submit Pet Claim" on an animal nobody holds shows the refusal message.

## Validation evidence

- `backend/tests/test_claim_only_when_held.py`: 25 of 25. It covers: refused for a roaming dog, allowed for each held signal, evidence and resubmission refused, an approved claim goes on, the list flag, the owner's answers and their refusals, closing as not needed with the owner notified, no second close, and refused for a held animal.
- Full isolated backend suite: 82 of 82 files.
- While checking the imports, `python -c "import app.main"` was run. It ran the app's startup schema checks against the local database (`localhost`, `straysafe_db`); these are the same checks that run on every backend start ("pet_qr_scans recovery columns", "pet_claims.status ENUM values"). No rows were written by this change.
- No frontend change; not checked in a browser.
