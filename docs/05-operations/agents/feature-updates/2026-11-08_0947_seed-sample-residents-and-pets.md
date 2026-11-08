# Seed Sample Resident Accounts and Registered Pets

- **Date:** 2026-11-08 09:47 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/scripts/seed_sample_residents.py`
- **Authorization:** User explicit request: "Please insert 10 sample user accounts, and make sure that each account has at least one registered pet with an actual profile picture."
- **Type:** Feature

## Intent

Populate 10 realistic, diverse resident accounts with registered pets (dogs and cats across multiple distinct breeds) having verified, permanent Cloudinary profile pictures and auto-generated QR code tokens for development, testing, and UI demonstration.

## Key changes

- Created `backend/scripts/seed_sample_residents.py`:
  - Inserts exactly 10 resident accounts (Citizens, Role ID 1) linked to Selera Homes (Subdivision ID 1, Barangay ID 1) with realistic addresses and coordinates.
  - Links each resident account to a unique registered pet (Golden Retriever, Siamese, German Shepherd, Beagle, Persian, Labrador Retriever, Siberian Husky, British Shorthair, Boxer, Bengal).
  - Uploads verified, authentic breed photos directly to Cloudinary under `pets/` using the project's upload preset, ensuring permanent hosting with 0 broken images and full thumbnail support.
  - Generates secure `PetQRCode` tokens and permanent reference codes (`SS-0005` to `SS-0014`) for all 10 pets.
  - Skips duplicate accounts or existing pet records to avoid data conflicts.

## Validation evidence

- Executed `python backend/scripts/seed_sample_residents.py`:
  - Successfully created 10 resident accounts (User IDs 24 to 33).
  - Uploaded 10 high-resolution pet photos to Cloudinary.
  - Successfully generated 10 Pet records (Pet IDs 5 to 14) with QR tokens.
- Audited with `backend/scripts/inspect_users.py`: All 10 resident accounts confirmed active in the database.

