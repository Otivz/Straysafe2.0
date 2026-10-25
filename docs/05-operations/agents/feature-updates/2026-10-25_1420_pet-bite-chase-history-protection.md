# Pet bite and chasing history: verified only from reports, declarations kept separately

- **Date:** 2026-10-25 14:20 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/models/pet.py`, `backend/app/schemas/pet.py`, `backend/app/main.py`, `backend/app/utils/case_groups.py`, `backend/app/routes/pets.py`, `backend/scripts/split_declared_behavior.py`, `backend/tests/test_pet_behavior_history.py`, `frontend/src/components/PetRecords/BehaviorHistoryField.tsx`, `frontend/src/components/PetRecords/types.ts`, `frontend/src/components/PetRecords/AddPetModal.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/src/pages/citizen/ResidentPet.tsx`, `frontend/tests/fixtures/petBehaviorHistory.tsx`, `frontend/tests/petBehaviorHistory.browser.mjs`, `Database3.3.txt`, `docs/ERD/03A_PET_REGISTRY_HEALTH_ERD.md`, `docs/02-project/README.md`, `docs/05-operations/agents/feature-updates/2026-10-25_1420_pet-bite-chase-history-protection.md`
- **Authorization:** the developer reported that a pet owner could clear bite and chasing history by answering "No" in the pet edit form, asked for the right approach, chose Option B ("THen lets go for B"), and approved the database schema change (two new columns) that Option B required.
- **Type:** Fix

## Intent

`PUT /pets/{id}` copied every submitted field onto the pet, so an owner (or anyone allowed to edit the record) could set `has_bite_history` and `chase_behavior` to false, zero the counts, and change an Aggressive temperament. The verified recount (`refresh_pet_behavior`) also erased an owner's honest "has bitten before" answer the next time any linked report changed.

## Key changes

- **Schema:** `pets.declared_bite_history` and `pets.declared_chase_behavior` (boolean, default false), added at API startup by `ensure_pet_declared_behavior_columns` when missing. No data is changed by that step.
- **Verified history:** `has_bite_history`, `bite_incident_count`, `chase_behavior` and `chase_incident_count` are written only by `refresh_pet_behavior` (from verified incident reports with a trusted pet link). `update_pet` refuses any change to them for every role (403, "dispute that report"); unchanged values are accepted because the forms send the whole record.
- **Declarations:** registration answers (`has_bite_history`, `chase_behavior` in the create body) are stored as declarations, and verified history starts at zero. A resident can add a declaration but not remove it; staff who may edit the record (and the administrator) can.
- **Temperament:** a verified bite or aggression makes it Aggressive and locks it while the evidence exists. The recount no longer resets other temperaments to Friendly (behavior change: an owner's "Anxious" is kept).
- **Merge:** a declaration on a merged duplicate is kept on the surviving record.
- **Staff form:** the photo AI no longer ticks bite or chasing history (it cannot know an animal's past); it still suggests a temperament.
- **Forms and panel:** a shared `BehaviorHistoryField` shows verified counts read-only with a dispute note and a declaration checkbox (locked for a resident's saved declaration); the detail panel shows verified and declared separately.
- **Existing data:** `backend/scripts/split_declared_behavior.py` (dry run by default, `--apply` to save) moves answers no verified report supports into the declared columns and recounts verified history. It has **not** been applied.

## Validation evidence

- `backend/tests/test_pet_behavior_history.py`: 9 tests passed (owner, staff and admin cannot change verified history; unchanged whole-form saves pass; resident can declare but not remove; staff can remove; registration answers become declarations; recount keeps declarations and chosen temperament; verified bite locks Aggressive; script plan).
- Related suites passed: `test_pet_record_access` (16), `test_trust_rule` (22/22), `test_pet_record_duplicates` (50/50), `test_pet_identity` (64/64), `test_merge_pet_identity` (38/38), `test_claim_identity` (12), `test_identity_dispute` (28/28), `test_dispute_security` (16/16), `test_admin_011_warnings`, `test_pet_owner_confirmation` (11/11), `test_offline_pet_owner` (7/7), `test_pet_adoption_lock` (11/11), `test_pet_handover_sync` (15/15), `test_case_claims` (18/18), `test_match_cases` (28/28), `test_owner_verification` (17/17).
- Frontend: `tsc` and `vite build` passed; `petBehaviorHistory.browser.mjs` passed at 1280 and 390 px; `petPhotoAccess.browser.mjs` and `petClaimRecords.browser.mjs` still pass.
- Dry run of the script against the configured database (read-only, nothing saved): 2 pets need changes. Pet #4 has a verified chasing report but its flag was false (count 1); Pet #3 has a chasing answer with no verified report, which would become a declaration.
- Not done: running `--apply`, testing the full resident and staff forms end to end in a browser, and testing on the Android app.
