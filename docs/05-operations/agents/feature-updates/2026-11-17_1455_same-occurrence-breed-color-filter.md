# Filter Same-Occurrence Candidates by Breed & Colour and Show Comparison Chips

- **Date:** 2026-11-17 14:55 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `backend/app/utils/complaint_rules.py`, `backend/app/services/complaints.py`, `backend/tests/test_same_occurrence_animal_type.py`, `frontend/src/admin/complaints/api.ts`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`
- **Authorization:** User request to prevent comparing distinct breeds (e.g., Aspin vs. German Shepherd) as the same occurrence
- **Type:** Fix

## Intent

Stop `same_occurrence_candidate()` from suggesting two animal complaints as the same occurrence when they specify conflicting breeds (such as *Aspin* vs. *German Shepherd*) or completely non-overlapping coat colours, and surface breed/colour chips on both cards inside `SameOccurrenceDialog`.

## Key changes

- Added `breeds_compatible`, `report_colors`, and `colors_compatible` in `backend/app/utils/complaint_rules.py` and applied them in `same_occurrence_candidate()` (allowing minor breed spelling tolerances while blocking mismatched breeds and zero-overlap coat colours; unspecified breed/colour remains eligible).
- Included `animal_breed`, `animal_color`, and `animal_colors` on both `ApiComplaint` and `maybe_same` in `backend/app/services/complaints.py` and `frontend/src/admin/complaints/api.ts`.
- Updated `SameOccurrenceDialog` in `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx` to normalize species capitalization (`Dog`) and display breed and colour chips on both comparison cards.
- Added breed and colour compatibility test cases in `backend/tests/test_same_occurrence_animal_type.py`.

## Validation evidence

- Ran `$env:PYTHONPATH='backend'; .venv\Scripts\python.exe backend/tests/test_same_occurrence_animal_type.py`: all 9+ checks passed.
- Ran `.venv\Scripts\python.exe -m py_compile backend/app/utils/complaint_rules.py backend/app/services/complaints.py`: exited with code `0`.
- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 2.01s`).
- Ran `node --test frontend/tests/*.test.mjs`: `201` tests passed, `0` failed.
- Note: `tests/test_complaint_management.py` was started in the background and cancelled after showing no progress for ~8 minutes without completing.
