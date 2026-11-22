# Breed Dropdown Filtered by Animal Type on File a Report

- **Date:** 2026-11-22 19:06 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/NewReportPage.tsx`
- **Authorization:** User request to make the Breed field a dropdown on File a report.
- **Type:** Polish

## Intent

Replace the free-text Breed input on File a report with a downward dropdown populated from the existing animal-type breed list (`getBreedsForAnimalType`).

## Key changes

- Imported `getBreedsForAnimalType` from `frontend/src/resident/data/breeds.ts` into `frontend/src/admin/pages/NewReportPage.tsx`.
- Replaced the Breed text `<Input>` with `<DropdownSelect>` listing breeds for the selected animal type plus `Unknown / Not sure`, and cleared incompatible breed selections when switching animal type.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/NewReportPage.tsx; npx tsc --noEmit`
