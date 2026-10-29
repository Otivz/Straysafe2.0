# Owner warnings Phase 5C: leader-verified identity (backend)

- **Date:** 2026-10-29 06:23 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/matches.py`, `backend/app/utils/case_groups.py`, `backend/tests/test_leader_verified_identity.py` (new), `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "5c". For question 13 the developer chose "Photos and markings match" as the only method and a 24-hour wait.
- **Type:** Feature

## Intent

Phase 5C of the owner follow-up plan (question 9): when the owner does not answer a pet match or says it is not their pet, the Subdivision Leader handling the report can confirm the identity, so the case is not blocked.

## Key changes

- **New endpoint:** `POST /matches/{match_id}/leader-verify-identity` with `method` and `reason`.
  - Only the Subdivision Leader handling the report can use it.
  - The match must already be confirmed by staff (`CONFIRMED_MATCH`).
  - The only accepted method is "Photos and markings match", and the reason needs at least 10 characters.
  - The leader must wait 24 hours after the owner was last asked. When the owner said it is not their pet, there is no wait.
  - It is refused when the owner filed the report, the pet has no owner, or the match is already confirmed.
- **Effect:** the owner's half of the confirmation becomes `LEADER_VERIFIED`. This is a new value of the existing `owner_confirmation_status` column; there is no new column, table or migration. It counts as confirmed in `is_pet_match_fully_confirmed` and the case check in `utils/case_groups.py`.
  - The report is linked to the pet through the normal match link.
  - The method and the reason are added to the match's verification notes.
  - The report and pet histories say the leader confirmed it.
  - The owner is told and pointed to filing a dispute on the report.
  - It is in the audit log (`LEADER_VERIFY_PET_IDENTITY`).
- **The owner cannot undo it alone:** the owner's own answer is refused (409) and the message points to the formal dispute on the report.
- `require_direct_pet_link` is unchanged; it still refuses every direct link of an owned pet.
- Not changed: a leader-verified link does not count as the owner's own confirmation for ownership proof at a handover (`owner_already_on_record`).
- No frontend change. There is no button yet, and match badges show the new value as it is.

## Validation evidence

- `backend/tests/test_leader_verified_identity.py`: 21 of 21. It covers: refused for Barangay staff, a resident, or another leader; refused without a method, with another method, without a reason, before 24 hours, or before staff confirmation; not needed on the owner's own report. When allowed: linked, notes kept, owner notified, audit log written, no second confirmation, the owner cannot undo it alone, a follow-up can then start, and an owner's "no" allows it at once.
- Full isolated backend suite: 81 of 81 files.
- Not checked in a browser.
