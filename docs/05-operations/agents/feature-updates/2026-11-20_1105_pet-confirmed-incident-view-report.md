# Add "View report" Summary Sheet on Resident Pet Profile Confirmed Incidents

- **Date:** 2026-11-20 11:05 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/routes/pets.py`, `backend/tests/test_resident_pet_history.py`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_1105_pet-confirmed-incident-view-report.md`
- **Authorization:** User requested adding a `View report` summary view for confirmed incident reports shown on a pet's profile (`"OKay goooo then add a view report where whe whole summary of the report will be shown"`).
- **Type:** Feature

## Intent

Let pet owners inspect the full sanitized summary of any verified incident report confirmed for their pet directly from `PetDetailsPage.tsx` without exposing reporter identity, raw reporter descriptions, or internal staff notes.

## Key changes

- **`backend/app/routes/pets.py`:** Enriched `GET /pets/{pet_id}/confirmed-incidents` with sanitized summary fields (`reported_at`, `verified_at`, `closed_at`, `location_area`, `animal_summary`, `condition`, `verified_findings`, `outcome_group`, `outcome_label`, non-sensitive `photos`, owner-addressed `warning_letters`, and chronological `milestones`) while preserving strict redaction of reporter PII, raw description text, and internal staff remarks.
- **`backend/tests/test_resident_pet_history.py`:** Added assertions for the new sanitized summary fields and verified `Private reporter text` remains excluded from the payload.
- **`frontend/src/resident/live/api.ts` & `frontend/src/resident/pages/pets/PetDetailsPage.tsx`:** Typed the enriched fields on `ApiPetConfirmedIncident`, added a `View report` button to each `Confirmed incidents` card, and rendered a full summary `Sheet` displaying status/outcome, incident details, non-sensitive photos, progress milestones, and links to associated warning letters.
- **`docs/README.md`:** Indexed this change record.

## Validation evidence

- `backend/tests/test_resident_pet_history.py`
- `npm run build` (`tsc -b && vite build`) and `npx eslint src/resident/live/api.ts src/resident/pages/pets/PetDetailsPage.tsx` inside `frontend/`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
