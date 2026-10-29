# Focus Potential Match Side-by-Side Review on Physical Appearance

- **Date:** 2026-10-29 02:02 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `frontend/src/components/ReportDescription.tsx`, `frontend/src/components/Modals/AIMatchReviewModal.tsx`, this record
- **Authorization:** Developer pointed out that situational custody status ("Stray sighting (not touched)") and encounter notes ("It is under the car and no onwer") clutter the side-by-side comparison section which is intended for comparing animal appearance, and instructed to update the modal accordingly.
- **Type:** Polish

## Intent

In `AIMatchReviewModal` (`/subd/reports/:id`), the side-by-side comparison table lines up attributes of the reported sighting against a candidate pet or sighting. The "Description" row previously rendered `ReportDescription` without filtering, which displayed operational incident custody (e.g., "Stray sighting (not touched)") and situational encounter observations (e.g., "It is under the car and no onwer") as if they were physical animal markings. This created cognitive clutter and asymmetric comparisons against registered pet records. The goal is to restrict the comparison grid strictly to physical appearance attributes (coat pattern, distinctive markings, physical condition) while cleanly surfacing non-appearance encounter and custody details in a separate context block.

## Key changes

- In `frontend/src/components/ReportDescription.tsx`:
  - Added optional `appearanceOnly?: boolean` prop.
  - When `appearanceOnly` is true, excluded `Custody` and freeform structured encounter notes, displaying only physical traits (`Coat pattern`, `Markings`, `Observed condition`).
  - Preserved fallback handling for unstructured legacy descriptions and default behavior when `appearanceOnly` is false.
- In `frontend/src/components/Modals/AIMatchReviewModal.tsx`:
  - Imported `parseReportDescription` from `../../utils/reportDescription`.
  - Renamed comparison table row label to `Physical Markings & Traits`.
  - Passed `appearanceOnly` and `emptyText="No markings noted."` to `<ReportDescription />` in the side-by-side table.
  - Added a dedicated, non-appearance `Encounter & Custody Context` block directly beneath the comparison table to preserve situational sighting notes and custody status without cluttering physical identity verification.

## Validation evidence

- Executed `npm run build` in `frontend/`: `tsc -b && vite build` completed successfully with 0 TypeScript/bundling errors.
