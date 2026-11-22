# Remove Duplicate Keep a Safe Distance Callout on Dangerous Animal Report

- **Date:** 2026-11-22 16:50 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/report/DetailsPage.tsx`
- **Authorization:** User request to remove the redundant "Keep a safe distance" callout on the Dangerous animal report details screen only.
- **Type:** Polish

## Intent

Avoid showing two "Keep a safe distance" warnings on the Dangerous animal report details screen (`category === 'safety'`), where a top-level Safety Warning callout is already displayed, while preserving the callout on other incident report categories.

## Key changes

- Updated the photo/video field callout condition in `frontend/src/resident/pages/report/DetailsPage.tsx` from `kind === 'incident'` to `kind === 'incident' && draft.category !== 'safety'`.

## Validation evidence

- `cd frontend; npx tsc --noEmit; npx eslint src/resident/pages/report/DetailsPage.tsx`
