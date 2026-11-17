# Animal Type Filtering for Same Occurrence Detection

- **Date:** 2026-11-17 07:33 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/utils/complaint_rules.py`, `backend/tests/test_same_occurrence_animal_type.py`
- **Authorization:** Explicit user request to prevent reports with differing or missing animal types from being suggested as same occurrence candidates
- **Type:** Feature

## Intent

Prevent reports with different animal types (e.g. Dog vs. Cat, Dog vs. Bird) or missing/unknown animal types from being suggested as duplicate/same-occurrence candidates in StraySafe 2.0 complaint management.

## Key changes

1. **`backend/app/utils/complaint_rules.py`**:
   - Added `valid_animal_type(value: Optional[str]) -> Optional[str]` helper to validate and normalize animal type labels while filtering out null, blank, `"Unknown"`, `"none"`, and `"n/a"`.
   - Updated `same_occurrence_candidate(report: Report, others: Sequence[Report], linked_ids: Iterable[int], separate_from: Optional[int]) -> Optional[Report]` to check `valid_animal_type(report.animal_type)` and `valid_animal_type(other.animal_type)` early in the evaluation loop, ensuring non-matching or invalid animal types are skipped before evaluating timestamp ordering, time threshold (`SAME_OCCURRENCE_HOURS`), or spatial proximity (`same_place`).
2. **`backend/tests/test_same_occurrence_animal_type.py`**:
   - Created standalone unit test suite testing all matrix scenarios: Dog vs. Dog, Cat vs. Cat, Dog vs. Cat, Dog vs. Bird, Missing vs. Missing, None vs. Dog, Dog vs. None, Unknown vs. Unknown, differing locations, and outside time thresholds.

## Validation evidence

- Ran `backend/tests/test_same_occurrence_animal_type.py`: All 7 core test scenarios plus normalization edge cases passed with 0 errors.
- Ran `node --test` across frontend test suite: 199 tests passing, 0 failures.
- Ran `npm --prefix frontend run build`: TypeScript compile and Vite production build succeeded cleanly.
