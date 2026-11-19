# Proportional Maximizable Pet Photo on QR Tag Scan Page

- **Date:** 2026-11-19 01:26 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/tag/TagScanPage.tsx`, `frontend/src/resident/styles/resident.css`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-19_0126_tag-scan-proportional-photo-lightbox.md`
- **Authorization:** User requested displaying the pet photo on the public QR tag scan page (`/t/:token`) proportionally large without overfilling the viewport, with full-screen maximize support.
- **Type:** Polish

## Intent

Replace the cropped `88px × 88px` square thumbnail on `TagScanPage.tsx` with a proportional, un-cropped photo card (`object-fit: contain`, constrained between `160px` and `240px` height) and let finders tap the photo or corner maximize button to inspect it full-screen in `MediaLightbox`.

## Key changes

- **`frontend/src/resident/styles/resident.css`:** Added `.rs-tag-photo`, `.rs-tag-photo__trigger`, and `.rs-tag-photo__max`, plus `dialog.sa-media-lightbox` styles so the full-screen lightbox renders properly outside the admin portal.
- **`frontend/src/resident/pages/tag/TagScanPage.tsx`:** Rendered the proportional pet photo frame with a top-right maximize icon button and tap-to-zoom `MediaLightbox` overlay when `tag.photo_url` is present.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`) -> verified after edits.
- `node --test frontend/tests/*.test.mjs` -> verified after edits.
