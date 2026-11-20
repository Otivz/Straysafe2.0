# Strict Breed and Flexible Colour Matching Validation

- **Date:** 2026-11-19 21:06 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/duplicate_detection.py`, `backend/app/utils/match_scoring.py`, `backend/app/routes/matches.py`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/pages/case/RelatedReportsBlock.tsx`, `docs/README.md`
- **Authorization:** User request ("STRAY-SAFE 2.0 – Strict Breed and Flexible Colour Matching Validation")
- **Type:** Feature

## Intent

Enforce a mandatory 3-step validation sequence (1. Animal species/type, 2. Strict exact breed match after whitespace/case normalization, 3. Partial coat colour overlap via set intersection) before calculating similarity scores across Related Reports, Lost & Found matching, and Pet Registry / Possible Pet Owners matching.

## Key changes

- **`backend/app/utils/duplicate_detection.py`**:
  - Added `normalize_breed_strict`, `normalize_colours_list`, and `is_eligible_match(reported, candidate)`.
  - Updated `score_pair` to run `is_eligible_match` before computing location/description/date/time scores, immediately rejecting breed mismatches and disjoint colour sets (`eligible=False`, `combined_score=None`, `classification="Not Related"`) and classifying missing breed or colour as `"Insufficient Information"` (`eligible=False`, `combined_score=None`).
- **`backend/app/utils/match_scoring.py`**:
  - Updated `normalize_breed` and `score_breed` to enforce strict exact breed matching after trimming/lowercasing (`100` on exact match, `0` on mismatch, no fuzzy/partial/cross-breed credits).
  - Added `normalize_colours` and updated `score_coat` to require at least one common colour via `set(fa).intersection(set(fb))` (`0` when no common colour).
  - Updated `analyze` to enforce mandatory species, strict breed, and partial colour checks before computing overall scores (`classification="excluded"` on mismatch, `classification="insufficient"` when breed or colour is missing).
- **`backend/app/routes/matches.py`**:
  - Enforced `is_eligible_match(source_report, candidate)` in `calculate_match_details` before running Gemini Vision or rule-based scoring.
- **Frontend (`types.ts`, `adapters.ts`, `selectors.ts`, `RelatedReportsBlock.tsx`)**:
  - Added `breed` and `color` to `Case['animal']` and enforced strict breed and partial colour overlap in `relatedCandidates` and `registryMatches`.
  - Updated `RelatedReportsBlock.tsx` to display only backend-approved eligible candidates from `adminApi.duplicates`.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
- `.venv\Scripts\python -m py_compile backend/app/utils/duplicate_detection.py backend/app/utils/match_scoring.py backend/app/routes/matches.py`: verified.
- Automated Python unit tests verifying strict breed cases (`Aspin` vs `Aspin`, `ASPIN` vs `aspin`, `Aspin` vs `Poodle`, `Labrador` vs `Golden Retriever`), partial colour overlap (`Brown and White` vs `Brown and Black`, `Black` vs `White`, `Brown and White` vs `Black and Gray`), and missing breed/colour (`Insufficient Information`): verified (`ALL_STRICT_BREED_AND_COLOUR_TESTS_PASSED`).
