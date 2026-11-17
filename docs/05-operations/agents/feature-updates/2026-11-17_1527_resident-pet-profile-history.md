# Resident Pet Profile History (Lost-Pet Reports, Warnings, and Confirmed Incidents)

- **Date:** 2026-11-17 15:27 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/routes/pets.py`, `backend/tests/test_resident_pet_history.py`, `frontend/src/resident/data/selectors.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `frontend/tests/residentLostPetFlow.test.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-17_1527_resident-pet-profile-history.md`
- **Authorization:** User approved implementing the Resident Pet Profile History feature on the current Resident Pet Profile page (`PetDetailsPage.tsx`).
- **Type:** Feature

## Intent

Give registered pet owners a clear, selective, privacy-safe History view directly on their pet's profile (`/resident-app/pets/:petId`), without surfacing unverified complaints, raw complainant links ("Linked by reporter"), reporter identities, or staff-only assessment notes.

## Key changes

- **Backend (`backend/app/routes/pets.py`):** Added owner-only `GET /pets/{pet_id}/confirmed-incidents`, requiring registered ownership (`403` otherwise), excluding lost-pet and merged/split-child reports, requiring verified incidents (`case_state.incident_is_verified`), requiring explicit Leader/match identity confirmation (`identity_decision.decided_ids` + `identity_status == "identified"`, `ReportMatch` `OWNER_CONFIRMED`, or `LeaderIdentityVerification`), enforcing `pet_link_trusted`, and applying the `became_owner_after` ownership-transfer guard. Returns sanitized `{ report_id, reference_code, category, incident_date, status, status_label, summary, has_warning_letter }` objects with zero reporter or staff-note fields.
- **Frontend (`frontend/src/resident/data/selectors.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`):** Added `petLostReports` selector, `ApiPetConfirmedIncident` + `residentApi.petConfirmedIncidents(id)`, and `PetHistorySection` in `PetDetailsPage.tsx` displaying **Lost-pet reports** (linking to `/resident-app/reports/:id`), **Warnings & notices** (`myWarningLetters` filtered by `pet_id`, linking to `/resident-app/warnings/:letterId`), and **Confirmed incidents** (sanitized read-only summary cards).
- **Tests:** Added isolated SQLite test `backend/tests/test_resident_pet_history.py` and selector test in `frontend/tests/residentLostPetFlow.test.mjs`.

## Validation evidence

- `$env:PYTHONPATH='backend'; .venv\Scripts\python.exe -u backend/tests/test_resident_pet_history.py` -> `[PASS] test_resident_pet_history` (exit code 0)
- `npm --prefix frontend run build` (`tsc -b && vite build`) -> succeeded (`dist/` built in 1.15s)
- `node --test frontend/tests/*.test.mjs` -> 202/202 tests passing (`fail 0`)
