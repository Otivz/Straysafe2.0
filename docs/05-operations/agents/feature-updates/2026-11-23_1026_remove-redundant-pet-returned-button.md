# Remove Redundant "Pet Returned" Button on QR Tag Scans Page

- **Date:** 2026-11-23 10:26 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/pets/PetTagScansPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-23_1026_remove-redundant-pet-returned-button.md`
- **Authorization:** User request ("http://localhost:5173/resident-app/pets/1/scans I think there is a redundant the pet returned") with uploaded screenshot
- **Type:** Polish

## Intent

Remove the duplicate "Pet returned ({pet.name} is home)" primary button rendered below the scan card on `/resident-app/pets/:petId/scans`, since each open scan card for a lost pet already displays its own primary "Pet returned" button that triggers the same recovery confirmation sheet.

## Key changes

- **Frontend (`frontend/src/resident/pages/pets/PetTagScansPage.tsx`):**
  - Removed the redundant bottom `Pet returned ({pet.name} is home)` button block below the scan message cards, keeping the single `Pet returned` action inside the scan message card alongside `Not my pet / fake`.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`), which compiled with 0 errors.
