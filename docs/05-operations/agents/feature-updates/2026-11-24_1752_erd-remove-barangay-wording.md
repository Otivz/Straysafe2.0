# Remove Barangay Wording from ERD Document

- **Date:** 2026-11-24 17:52 (UTC)
- **AI tool:** Antigravity (Claude Sonnet)
- **Files changed:** `docs/01-system/ERD_BY_MODULE.md`, `docs/README.md`
- **Authorization:** Developer request: update the ERD md file so it no longer mentions "barangay".
- **Type:** Polish

## Intent

StraySafe has no Barangay user or connection, so the ERD should not use the word.

## Key changes

- Removed the `barangays` table and every `barangay_id` column from the diagrams, and removed the "Naming change" section.
- `subdivisions` is now the top of the hierarchy. `referrals` and `referral_updates` names are kept.
- Documentation only; no code or database change.

## Validation evidence

- Searched the file for "arangay": no matches remain.
