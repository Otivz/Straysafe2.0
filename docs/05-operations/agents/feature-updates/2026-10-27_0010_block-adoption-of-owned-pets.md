# Owned registered pets can no longer be put up for adoption

- **Date:** 2026-10-27 00:10 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/adoptions.py`, `docs/05-operations/agents/feature-updates/2026-10-27_0010_block-adoption-of-owned-pets.md`
- **Authorization:** the developer's report "its in the record! and also has an owner but why is it in the adoption!!! why can it be adopt" (pet Bruno, owner John Doe, user #8, listed in the adoption catalog).
- **Type:** Fix

## Intent

An animal in holding whose report is linked to a registered pet with an owner belongs back with that owner (claim and reunification), not in the public adoption catalog. Promotion only checked the holding status, so such an animal could be promoted and adopted.

## Key changes

- New helper `_owned_holding_ids`: holding animals whose report's `pet_id` points to a pet with an `owner_id`.
- `POST /adoptions/promote/{holding_id}`: refused with a clear message for those animals.
- `GET /adoptions/catalog`: those animals are hidden from the public catalog (the staff view with `include_reserved=true` still lists them, so staff can withdraw them).
- `GET /adoptions/catalog/{holding_id}`: 404, as for other unavailable animals.
- `POST /adoptions/apply`: refused with the same message.
- Registered community animals with no owner are not affected. No database change; the animal already listed (holding #3, Bruno) stays at facility status 6 until staff withdraw it, but it is no longer shown or adoptable.

## Validation evidence

- Read-only run against the local database: `_owned_holding_ids` returns `{3}` (Bruno, owner #8); the public catalog no longer contains holding #3 and its detail returns 404. Holding #2 (community animal, no owner) was already hidden because it has an approved application.
- Not checked: the promote and apply endpoints through the UI, and existing adoption applications for holding #3 (none were inspected).
