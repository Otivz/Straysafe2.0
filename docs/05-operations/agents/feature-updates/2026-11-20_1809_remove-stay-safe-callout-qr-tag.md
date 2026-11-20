# Remove "Stay safe" Callout on Public QR Tag Page

- **Date:** 2026-11-20 18:09 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/tag/TagScanPage.tsx`
- **Authorization:** User request in chat ("On the qr maybe remove this Stay safe Keep your distance and do not chase or grab the animal. If it is frightened or aggressive, tell the subdivision guardhouse.")
- **Type:** Polish

## Intent

Remove the "Stay safe" warning callout banner from the public `/t/:token` QR tag landing page (`TagScanPage.tsx`) per user request.

## Key changes

- **`frontend/src/resident/pages/tag/TagScanPage.tsx`:** Removed the `Stay safe` amber `<Callout>` (`Keep your distance and do not chase or grab the animal. If it is frightened or aggressive, tell the subdivision guardhouse.`) and dropped the now-unused `TriangleAlert` import.

## Validation evidence

- `npm run build` (`tsc -b && vite build`) in `frontend/` -> exit code 0
- `npx eslint src/resident/pages/tag/TagScanPage.tsx` in `frontend/` -> exit code 0
