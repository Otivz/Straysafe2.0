# Remove Redundant Colour Prompts on Resident Report Details

- **Date:** 2026-11-17 12:23 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/live/actions.ts`
- **Authorization:** User request to remove redundant colour prompts on `/resident-app/report/details`
- **Type:** Polish

## Intent

Eliminate duplication between the **Colour or coat** tag input and the secondary appearance/description prompts on the resident animal report details form, and prevent duplicate plain colour tokens from being appended when `draft.looks` is merged into `animal_color`.

## Key changes

- Updated the `nuisance` appearance field in `frontend/src/resident/pages/report/DetailsPage.tsx` from `"What did it look like?"` (`"Colour, collar or markings..."`, `"e.g. Small, white, red collar"`) to `"Size, collar or markings"` (`"Size, collar, tags or distinguishing marks that help recognise it—even if you don’t know the owner."`, `"e.g. Small, red collar, notched ear"`).
- Removed the leading `"Colour, "` from `COPY.found.hint` in `frontend/src/resident/pages/report/DetailsPage.tsx`.
- Filtered out comma-separated tokens in `draft.looks` that duplicate any colour already in `draft.colors` (case-insensitive) before constructing `nuisanceColorText` in `frontend/src/resident/live/actions.ts`.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 1.58s`).
- Ran `node --test frontend/tests/*.test.mjs`: `201` tests passed, `0` failed.
