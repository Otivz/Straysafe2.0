# Feature Update: Filter Possible Pet Owners to High-Confidence Matches by Default

- **Date:** 2026-11-22 13:25 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** User request to default Possible Pet Owners to high-confidence matches (≥ 70%) and place lower-scoring candidates behind a collapsible toggle.
- **Type:** Feature

## Summary

- Added `HIGH_CONFIDENCE_THRESHOLD = 70` and `isHighConfidenceCandidate` (retaining matches with `score >= 70`, manual matches, or active non-`identified` workflow statuses).
- Defaulted `PossibleOwnersBlock` to display only high-confidence matches when at least one exists alongside lower-scoring candidates, with a toggle bar (`Show lower-scoring candidates (N)` / `Hide lower-scoring candidates`) and automatic page reset on toggle.
- Automatically falls back to showing all candidates if none meet the 70% threshold so the list never appears empty when matches exist.
