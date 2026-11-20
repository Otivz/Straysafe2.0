# Standardize Record Follow-up Action Tile Label

- **Date:** 2026-11-19 19:08 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`, `docs/README.md`
- **Authorization:** User request ("instead od coordinate to guard / security make it \"Record Follow-up\"")
- **Type:** Polish

## Intent

Use the consistent **Record Follow-up** label and completed-activity subtitle on the Case Details **Actions & follow-ups** tab across all case categories instead of category-specific guard/security labels.

## Key changes

- **`frontend/src/admin/pages/case/ActionsTab.tsx`**:
  - Updated the follow-up `ActionTile` title to `Record Follow-up` and subtitle to `Document a completed follow-up activity on this case`.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
