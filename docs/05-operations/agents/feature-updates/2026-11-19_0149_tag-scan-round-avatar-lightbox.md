# Round Pet Avatar with Maximize Lightbox on QR Tag Scan Page

- **Date:** 2026-11-19 01:49 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/tag/TagScanPage.tsx`, `frontend/src/resident/styles/resident.css`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-19_0149_tag-scan-round-avatar-lightbox.md`
- **Authorization:** User chose the round circle beside the pet's name layout for the QR tag scan page photo.
- **Type:** Polish

## Intent

Eliminate empty side margins on portrait/letterboxed pet photos on `/t/:token` by displaying a larger circular pet avatar beside the pet's name and details, with tap-to-maximize and a corner expand badge opening `MediaLightbox`.

## Key changes

- **`frontend/src/resident/styles/resident.css`:** Replaced `.rs-tag-photo*` with `.rs-tag-avatar__wrap`, `.rs-tag-avatar` (`clamp(108px, 28vw, 132px)`, `border-radius: 50%`), and `.rs-tag-avatar__max` corner maximize button.
- **`frontend/src/resident/pages/tag/TagScanPage.tsx`:** Placed the circular avatar beside the pet's name, species/breed, and subdivision inside `.rs-pethero` while keeping `MediaLightbox` openable by tapping the avatar or maximize button.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`) -> verified after edits.
- `node --test frontend/tests/*.test.mjs` -> verified after edits.
