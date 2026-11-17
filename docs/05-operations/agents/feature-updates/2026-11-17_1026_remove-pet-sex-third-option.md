# Remove Third "Not Sure" Option From Pet Sex Selection

- **Date:** 2026-11-17 10:26 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/pets/PetFormPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-17_1026_remove-pet-sex-third-option.md`
- **Authorization:** User request: "On the register pet, Sex (optional) remove the selection others"
- **Type:** Polish

## Intent

Remove the third `"Not sure"` (`'unknown'`) chip from the optional `Sex (optional)` `ChoiceChips` group on the Resident pet registration and edit form (`PetFormPage.tsx`), leaving only `Male` and `Female` selectable while keeping `'unknown'` as the internal default when left unselected.

## Key changes

- Updated `PetFormPage.tsx` (`Sex (optional)` `FieldGroup`) to map only `(['male', 'female'] as const)` into `ChoiceChips` options instead of all `SEX_LABEL` keys (`male`, `female`, `unknown`).
- Preserved `PetSex` (`'male' | 'female' | 'unknown'`) and adapter/database compatibility so saving a pet without selecting a sex continues to send `'Unknown'` to the backend and remains hidden on `PetDetailsPage`.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`): exited `0`, `2100` modules transformed.
- `node --test` in `frontend/`: `200/200` tests passed.
