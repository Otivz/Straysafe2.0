# Collapse Lower-Scoring Possible Pet Owners Even When Zero High-Confidence Matches Exist

- **Date:** 2026-11-22 19:08 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** User request to filter out low-scoring Possible Pet Owners (< 70%) behind a collapsible toggle so 49+ candidates do not clutter the case view.
- **Type:** Fix

## Intent

Ensure lower-scoring Possible Pet Owners (< 70%) are collapsed behind the toggle by default even when there are zero high-confidence matches (>= 70%), such as in `SS-2026-0018`.

## Key changes

- Updated `canFilterLower` in `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx` from `highConfidenceCandidates.length > 0 && lowerScoringCount > 0` to `lowerScoringCount > 0`.
- Added a clear summary label when zero candidates meet the `>= 70%` threshold while keeping the `Show lower-scoring candidates (N)` toggle accessible.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/case/PossibleOwnersBlock.tsx; npx tsc --noEmit`
