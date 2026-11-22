# Add Animal Description Fields on File a Report

- **Date:** 2026-11-22 19:01 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/NewReportPage.tsx`
- **Authorization:** User request to add description fields about the animal found on File a report.
- **Type:** Feature

## Intent

Allow Subdivision Leaders to record structured animal description details (colour/markings, breed, estimated size, and collar/condition/appearance) when filing a Found Animal or other report, and persist them via `POST /reports/`.

## Key changes

- Added optional `animalColor`, `animalBreed`, `animalSize` (`Small` | `Medium` | `Large`), and `animalCondition` state and form inputs inside the **What was reported?** section in `frontend/src/admin/pages/NewReportPage.tsx`.
- Included `animal_color`, `animal_breed`, `estimated_size`, and `condition` in the `adminApi.createReport` payload when provided.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/NewReportPage.tsx; npx tsc --noEmit`
