# Seed Realistic Subdivision Animal Policies

- **Date:** 2026-11-21 02:06 (UTC)
- **AI tool:** Antigravity (Gemini 2.5 Flash)
- **Files changed:** `backend/seed_subdivision_policies.py`, `backend/seed_demo_residents_and_pets.py`, `backend/tests/test_subdivision_policies.py`
- **Authorization:** User request ("Add also a realistic policy for the subdisivsion related to the animals in the database") with reference UI modal screenshot
- **Type:** Feature

## Intent

Seed realistic, legally and operationally grounded subdivision pet policies into the database for Selera Homes (Subdivision ID 1). These policies populate the "Policy References" in Settings (`/settings`), enable issuance of official warnings under confirmed rules, and provide formal policy references for complaint management, observation periods, and offense fine escalations.

## Key changes

- **Backend Seed Script (`backend/seed_subdivision_policies.py`):**
  - Created standalone seeding script to configure confirmed subdivision animal policies under `system_settings` key `case_settings:1`.
  - Added 5 realistic, HOA-aligned rules:
    1. **Leash and Confinement Requirement (`pol-leash-confinement`):** Reference `House Rules & By-Laws Art. IV §4.1`, covers nuisance, safety, lost_pet, found_animal; 7-day observation period; ₱1,000 fine for 3rd offense; 180-day count window.
    2. **Excessive Noise and Habitual Barking (`pol-noise-nuisance`):** Reference `House Rules & By-Laws Art. IV §4.2`, covers nuisance; 7-day observation period; ₱1,000 fine for 3rd offense; 180-day count window.
    3. **Mandatory Pet Waste Clean-Up (`pol-waste-sanitation`):** Reference `House Rules & By-Laws Art. IV §4.3`, covers nuisance, other; 5-day observation period; ₱500 fine for 3rd offense; 90-day count window.
    4. **Aggressive Animal Control and Bite Protocol (`pol-aggressive-bite-control`):** Reference `House Rules & By-Laws Art. IV §4.4`, covers safety, injured; mandatory 14-day rabies observation period (aligned with RA 9482); ₱2,500 fine for 3rd offense; 365-day count window.
    5. **Subdivision Pet Registration, QR Tagging, and Rabies Vaccination (`pol-pet-registration-vaccination`):** Reference `House Rules & By-Laws Art. IV §4.5`, covers lost_pet, found_animal, nuisance, safety, other; 14-day observation period; ₱1,500 fine for 3rd offense; 180-day count window.
- **Demo Seed Integration (`backend/seed_demo_residents_and_pets.py`):**
  - Integrated `seed_policies(selera.subdivision_id)` into the main resident and pet seeding workflow so policies are automatically ensured.
- **Unit Tests (`backend/tests/test_subdivision_policies.py`):**
  - Added schema validation tests confirming all policy objects conform to `PolicyIn` and `CaseSettings`, and verify applicable policy resolution across all 6 category families.

## Validation evidence

- Executed `python backend/seed_subdivision_policies.py 1`, which successfully created and confirmed all 5 policies in MySQL database `system_settings`.
- Executed `python backend/tests/test_subdivision_policies.py` with output: `All subdivision policy tests passed successfully.`.
- Executed `python backend/tests/test_seed_demo_residents_and_pets.py` with output: `[PASS] test_seed_demo_residents_and_pets`.
