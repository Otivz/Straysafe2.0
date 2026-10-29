# Remove weight annotations in Register New Pet size label

- **Date:** 2026-10-28 11:53 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `frontend/src/pages/citizen/ResidentPet.tsx`, `frontend/src/components/PetRecords/AddPetModal.tsx`, this record
- **Authorization:** Developer request: "(< 10kg) remove this one in the Register New Pet", confirmed removing all weight annotations (`< 10kg`, `10-25kg`, `> 25kg`) from the size indicators.
- **Type:** Polish

## Intent

Remove weight annotations from the Pet Size label in the Register New Pet modals across citizen and administrative flows, displaying only the selected size category name (`Small`, `Medium`, `Large`).

## Key changes

- In `frontend/src/pages/citizen/ResidentPet.tsx`: Updated the secondary label alongside `Pet Size *` to render `{formData.sizeCategory || 'Medium'}` instead of appending weight ranges (`Small (< 10kg)`, `Medium (10-25kg)`, `Large (> 25kg)`).
- In `frontend/src/components/PetRecords/AddPetModal.tsx`: Updated the secondary label alongside `Pet Size *` to render `{sizeCategory || 'Medium'}` instead of appending weight ranges.

## Validation evidence

- Code diff inspection confirms exact targeted replacement without regressions to neighboring fields.
- ESLint check run on both modified files.
