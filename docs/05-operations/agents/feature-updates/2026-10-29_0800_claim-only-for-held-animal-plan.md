# Plan: a pet claim only for an animal someone holds

- **Date:** 2026-10-29 08:00 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer, about the claim staying "Pending Review" on `/resident/reports/1/match-review` and `/subd/pet-claims`: "for me i think its wrong to leave it as it is", then "Yes" to decisions A and B.
- **Type:** Fix

## Intent

Plan the fix for a claim that can never finish: an owner filed a pet claim for a roaming dog nobody was holding, so there was nothing to hand over.

## Key changes

- New Phase 6 in the owner follow-up plan, section 9 (not built):
  - A claim is only for a held animal, which in practice means the Barangay.
  - "Held" is defined from existing data: the holding record, the facility, statuses 5 to 8, and custody.
  - For an animal nobody holds, the owner answers "It's home" or "Still missing" instead of filing a claim.
  - Decision A: an unneeded open claim is closed as `Rejected` with the reason "Not needed: the pet is home" and shown as "Closed: not needed".
  - Decision B: "Still missing" tells the leader and does not mark the pet Lost.
- Steps 6A (backend), 6B (screens) and 6C (check and documents) are listed.

## Validation evidence

- Documentation only; no code changed.
