# Show Pet Status (Including Lost) Across Resident and Admin Pet Profiles

- **Date:** 2026-11-20 11:13 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `frontend/src/resident/pages/pets/PetsPage.tsx`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/pages/PetDetailsPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_1113_pet-lost-status-display.md`
- **Authorization:** User requested displaying the pet's status when it is lost (`"Also add status in the pet if its lost"`).
- **Type:** Polish

## Intent

Ensure a pet's current status (especially `Lost`) is immediately visible on both the Resident Pet Profile / My Pets list and the Admin Pet Registry / Pet Details screens.

## Key changes

- **`frontend/src/resident/pages/pets/PetDetailsPage.tsx`:** Added a status `Pill` (`Lost` in amber, `Deceased` in neutral, or `Active` in sage) in the hero header and a `Status` row inside the `About` details section, checking both `activeLostReport` and `pet.status === 'Lost'`.
- **`frontend/src/resident/pages/pets/PetsPage.tsx`:** Standardized the `My pets` list indicator to show the `Lost` pill whenever `activeLostReport` or `p.status === 'Lost'` is true.
- **`frontend/src/admin/data/types.ts` & `frontend/src/admin/live/adapters.ts`:** Added `status?: string` to Admin `Pet` and mapped `p.status` in `petFromApi`.
- **`frontend/src/admin/pages/PetsPage.tsx` & `frontend/src/admin/pages/PetDetailsPage.tsx`:** Rendered a `Lost` badge in the Pet Registry table and displayed the pet's status badge in the Admin Pet Details header and `Pet information` key-value list.
- **`docs/README.md`:** Indexed this change record.

## Validation evidence

- `npm run build` (`tsc -b && vite build`) and targeted `npx eslint` on modified files inside `frontend/`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
