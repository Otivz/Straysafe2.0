# Restrict Resident Warning Letter Downloads to PDF Only

- **Date:** 2026-11-17 13:48 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `frontend/src/resident/pages/account/WarningLetterPage.tsx`, `frontend/src/resident/pages/account/WarningsPage.tsx`
- **Authorization:** User request to make resident warning letter downloads PDF-only
- **Type:** Polish

## Intent

Provide residents with a single official PDF download option for warning letters (removing editable DOCX downloads from the resident portal while keeping DOCX export available to subdivision administrators/leaders).

## Key changes

- Removed the `Download DOCX` button from `frontend/src/resident/pages/account/WarningLetterPage.tsx` (keeping `Download PDF` and any attached file link if uploaded by staff).
- Removed the `DOCX` button and updated callout copy in `frontend/src/resident/pages/account/WarningsPage.tsx` to reference PDF downloads only.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 1.52s`).
- Ran `node --test frontend/tests/*.test.mjs`: `201` tests passed, `0` failed.
