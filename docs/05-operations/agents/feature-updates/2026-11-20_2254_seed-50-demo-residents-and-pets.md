# Seed 50 Selera Homes Demo Resident Accounts with Registered Pets

- **Date:** 2026-11-20 22:54 (UTC)
- **AI tool:** Antigravity (Gemini 4 Argon)
- **Files changed:** `backend/seed_demo_residents_and_pets.py`, `backend/tests/test_seed_demo_residents_and_pets.py`, `docs/05-operations/agents/feature-updates/2026-11-20_2254_seed-50-demo-residents-and-pets.md`
- **Authorization:** User request to seed 50 existing resident accounts in Selera Homes, each with at least one registered pet, active QR tag, and hashed password
- **Type:** Feature

## Intent

Populate STRAY-SAFE 2.0 with 50 realistic fictional Filipino resident accounts in Selera Homes and 65 registered pets (every resident owning 1–2 pets across a wide variety of dog and cat breeds), complete with active QR identification tags (`PetTag`), vaccination dates, color tags, and valid bcrypt password hashes, using an idempotent seed script.

## Key changes

- **`backend/seed_demo_residents_and_pets.py`**:
  - Defined 50 fictional Filipino resident accounts (`@selerahomes.demo`) assigned to `Selera Homes` with formatted `"Block X Lot Y, <StreetName> Street"` addresses (compatible with `splitAddress` in the Admin Residents table), unique 11-digit PH mobile numbers (`09172100101`–`09172100150`), GPS coordinates within Selera Homes, `UserNotificationPreference` records, and bcrypt-hashed passwords passing `enforce_password_policy`.
  - Defined 65 registered pets (45 Dogs across 19 breeds and 20 Cats across 10 breeds) linked to the 50 residents (35 one-pet households and 15 two-pet households, ensuring every resident has at least 1 pet), with structured color tags (`apply_pet_color_payload`), birth dates, ages, weights, sizes, distinguishing markings, vaccination dates/expiries, emergency contacts, permanent `SS-XXXX` reference codes, and active `PetTag` QR tokens (`pet_tag_service.ensure_active_tag`).
  - Made the script idempotent so re-running it updates/skips existing demo records without creating duplicates or modifying real user accounts.
- **`backend/tests/test_seed_demo_residents_and_pets.py`**:
  - Added an isolated test suite verifying first-run creation (50 residents, 65 pets, 65 QR tags), second-run idempotency (0 duplicates), password hashing (`verify_password`), >= 1 pet per resident, and visibility through `/users/`, `/pets/subdivision/{id}`, and `/pets/`.

## Validation evidence

- `python tests/test_seed_demo_residents_and_pets.py` (`[PASS] test_seed_demo_residents_and_pets`, exit code 0)
- `python backend/seed_demo_residents_and_pets.py` against local MySQL (`[SEED COMPLETE] Subdivision: Selera Homes (#1) — Demo Residents: 50 total (50 created), Registered Pets: 65 total (65 created), Active QR Tags: 65 ensured`, exit code 0)
