# Route Go Back Button to Resident Dashboard

- **Date:** 2026-11-02 17:08 (UTC)
- **AI tool:** Antigravity (Gemini 2.5)
- **Files changed:** `frontend/src/pages/citizen/ResiViewReport.tsx`
- **Authorization:** User request: "if i click the go back button it should go back to the dashboard @[c:\Users\user\Straysafe2.0\frontend\src\pages\citizen\ResiViewReport.tsx]"
- **Type:** Polish

## Intent

On the citizen Report View page (`ResiViewReport.tsx`), the "Go Back" button previously relied on `window.history.length > 1 ? navigate(-1) : navigate('/resident-home')`. This occasionally caused users to navigate back into prior transient states or unintended browser history entries rather than returning directly to their main resident dashboard. The goal was to ensure clicking "Go Back" consistently navigates to the resident dashboard (`/resident-home`).

## Key changes

- In `frontend/src/pages/citizen/ResiViewReport.tsx`, updated `handleBack` to navigate directly to `/resident-home`.

## Validation evidence

- Ran `npx tsc --noEmit` in `frontend` (exited code 0, 0 errors).
- Ran strict documentation audit: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` (passed).
