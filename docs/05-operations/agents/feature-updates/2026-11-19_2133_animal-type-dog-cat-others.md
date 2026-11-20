# Simplify "What kind of animal?" Field to Dog, Cat, and Others with Custom Animal Input

- **Date:** 2026-11-19 21:33 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/models/report.py`, `backend/app/utils/case_vocab.py`, `backend/app/db_migrations/case_alignment.py`, `database/migrations/2026-11-20_reports_animal_type_varchar.sql`, `frontend/src/resident/data/constants.ts`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/data/reducer.ts`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/pages/report/ReviewPage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `docs/README.md`
- **Authorization:** User request ("In the 'What kind of animal?' field, keep only Dog, Cat, Others...")
- **Type:** Feature

## Intent

Limit the **"What kind of animal?"** selector in the animal report form to **Dog**, **Cat**, and **Others**, require a manual text input when **Others** is selected (e.g., Rabbit, Bird, Turtle, Snake, Hamster), and persist and display the custom animal type in the database and across Resident and Admin report details.

## Key changes

- **Frontend Report Form & Details (`constants.ts`, `types.ts`, `reducer.ts`, `DetailsPage.tsx`, `ReviewPage.tsx`, `ReportDetailsPage.tsx`, `actions.ts`, `adapters.ts`)**:
  - Updated `ANIMAL_TYPE_IDS` to `['dog', 'cat', 'other']` with label `Others`.
  - Added `customAnimalType` to `Draft` and `Report`, and rendered a required **Specify the animal** input (`e.g. Rabbit, Bird, Turtle, Snake, Hamster`) whenever **Others** (`draft.animalType === 'other'`) is selected.
  - Sent the manually entered animal type to `POST /reports/` and displayed `customAnimalType` on `ReviewPage.tsx` and `ReportDetailsPage.tsx`.
- **Admin Case Details (`admin/data/types.ts`, `admin/live/adapters.ts`, `OverviewTab.tsx`, `DuplicateReviewDialog.tsx`)**:
  - Preserved and displayed `c.animal.customType` on the Case Overview tab and Related Report Review dialog.
- **Backend & Database (`report.py`, `case_vocab.py`, `case_alignment.py`, `database/migrations/2026-11-20_reports_animal_type_varchar.sql`)**:
  - Updated `Report.animal_type` to `String(100)` (`VARCHAR(100)` migration in `case_alignment.py`) and updated `normalize_animal_type` to accept and clean custom animal type strings.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
- `.venv\Scripts\python -m py_compile backend/app/models/report.py backend/app/utils/case_vocab.py backend/app/db_migrations/case_alignment.py`: verified.
