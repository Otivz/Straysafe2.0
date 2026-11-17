# Enforce Animal Type Filter on Frontend Related Candidates

- **Date:** 2026-11-17 07:41 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/data/selectors.ts`
- **Authorization:** User investigation into why SS-2026-0025 (Cat) was still showing suggestions for SS-2026-0023 (Dog)
- **Type:** Polish

## Intent

Prevent the frontend's `relatedCandidates` selector from suggesting cases with different animal types (e.g. Dog vs. Cat) under "Possibly related" on the case overview and review dialogs.

## Key changes

1. **`frontend/src/admin/data/selectors.ts`**:
   - In `relatedCandidates(cases, base, limit)`: Added an early filter `if (c.animal.type && base.animal.type && c.animal.type !== base.animal.type && c.animal.type !== 'other' && base.animal.type !== 'other') continue;`.
   - Previously, reports in the same area (+3), same category (+2), and within 14 days (+1) could reach 6 points (above the 5 point threshold) even when their animal types differed completely.

## Validation evidence

- Ran `node --test` across frontend test suite: 199 tests passed, 0 failures.
- Ran `npm --prefix frontend run build`: TypeScript compile and Vite production build passed cleanly in 1.69s.
