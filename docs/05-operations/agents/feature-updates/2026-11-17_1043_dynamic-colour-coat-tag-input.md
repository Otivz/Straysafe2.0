# Dynamic Colour or Coat Tag Input & Array Storage

- **Date:** 2026-11-17 10:43 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/color_tags.py`, `backend/app/models/pet.py`, `backend/app/models/report.py`, `backend/app/schemas/pet.py`, `backend/app/schemas/report.py`, `backend/app/main.py`, `backend/app/routes/pets.py`, `backend/app/routes/reports.py`, `backend/app/utils/report_visibility.py`, `backend/app/utils/lost_pet_rules.py`, `backend/app/services/lost_found_matching.py`, `backend/app/services/case_view.py`, `backend/app/services/case_summaries.py`, `backend/tests/test_animal_color_tags.py`, `frontend/src/resident/data/colors.ts`, `frontend/src/resident/components/ColorTagInput.tsx`, `frontend/src/resident/styles/resident.css`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/data/reducer.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/pages/pets/PetFormPage.tsx`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/tests/residentLiveAdapters.test.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-17_1043_dynamic-colour-coat-tag-input.md`
- **Authorization:** User request: "Improve the Colour or Coat Field – Dynamic Tag Input"
- **Type:** Feature

## Intent

Upgrade the **Colour or Coat** field across Pet Registration / Edit and Animal Reporting so residents enter individual removable colour tags (`[White] [Tan] [Black]`) with autocomplete suggestions, custom colour support, mobile soft-keyboard support, and structured JSON array persistence in the backend database while maintaining full backwards compatibility with legacy `color_markings` / `animal_color` consumers.

## Key changes

### Backend (`backend/`)
- Added `app/utils/color_tags.py` (`normalize_color_tags`, `parse_pet_colors`, `parse_report_colors`, `apply_pet_color_payload`, `apply_report_color_payload`) to trim whitespace and deduplicate colour tags case-insensitively while syncing legacy text fields.
- Added nullable JSON columns `pets.colors` (`app/models/pet.py`) and `reports.animal_colors` (`app/models/report.py`), corresponding `PetBase`/`PetUpdate` and `ReportBase`/`ReportUpdate` schema fields, and `ensure_animal_color_array_columns()` in `app/main.py`.
- Updated `POST /pets/`, `PUT /pets/{pet_id}`, `POST /reports/`, `PATCH /reports/{report_id}`, `RESIDENT_SAFE_FIELDS` / `_MATCH_CARD_FIELDS` (`report_visibility.py`), `lost_pet_rules.py`, `lost_found_matching.py`, `case_view.py`, and `case_summaries.py` to persist, expose, and match colour arrays seamlessly.

### Frontend (`frontend/`)
- Created `resident/data/colors.ts` (`ANIMAL_COLOR_SUGGESTIONS`: `White`, `Black`, `Brown`, `Tan`, `Cream`, `Gray`, `Golden`, `Orange`, `Yellow`, `Red`, `Mixed`; tag normalization/deduplication/filtering helpers).
- Created reusable `ColorTagInput` component (`resident/components/ColorTagInput.tsx`) and STRAY-SAFE 2.0 styles in `resident/styles/resident.css` supporting Enter/comma conversion, `×` tag removal, empty-input Backspace removal, live filtered autocomplete dropdown, custom colours, and mobile `+ Add` button.
- Integrated `ColorTagInput` across `PetFormPage.tsx` (Register & Edit Pet, pre-populating saved tags on edit) and `DetailsPage.tsx` (Report an Animal), plus chip rendering on `PetDetailsPage.tsx`, `ReviewPage.tsx`, and `ReportDetailsPage.tsx`, and array round-tripping in adapters/actions.

## Validation evidence

- `python -u tests/test_animal_color_tags.py` (isolated SQLite via `_isolated_db.py`): **13/13 checks passed**.
- `python -u tests/test_warning_letters_and_notifications.py`: **29/29 checks passed**.
- `node --test` in `frontend/`: **201/201 tests passed** (including new colour tag & array adapter checks in `frontend/tests/residentLiveAdapters.test.mjs`).
- `npm --prefix frontend run build` (`tsc -b && vite build`): exited `0` (`2102` modules transformed).
- `$env:VITE_API_BASE_URL='https://api.example.com'; npm --prefix frontend run build:android`: verified Android bundle.
