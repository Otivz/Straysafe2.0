# Remove Bite History and Chasing declaration checkboxes from Resident Pet form

- **Date:** 2026-10-28 13:51 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `frontend/src/pages/citizen/ResidentPet.tsx`, this record
- **Authorization:** Developer instructed to remove Bite history and Chasing fields from the resident pet registration and edit form (`http://localhost:5173/resident/pets`).
- **Type:** Polish

## Intent

Remove self-incriminating "Bite history" and "Chasing" declaration checkboxes from the citizen/resident pet registration and edit modal. Residents registering their family pets should not be prompted with punitive self-declaration checkboxes; behavioral temperament is captured cleanly via `Temperament`, while verified bite and chase incidents remain strictly tracked through community incident reports and visible in pet detail panels.

## Key changes

- In `frontend/src/pages/citizen/ResidentPet.tsx`:
  - Removed `BehaviorHistoryField` import.
  - Removed "Bite history" and "Chasing" `BehaviorHistoryField` components from the Behavior Information section, keeping `Temperament` as the sole behavior trait for residents.
  - Preserved existing declaration state during pet edit so submissions don't trigger backend 403 forbidden constraints if staff previously recorded a declaration.

## Validation evidence

- Executed `npm run build` in `frontend/`: `tsc -b` and `vite build` completed successfully with 0 errors in 2.80s.
