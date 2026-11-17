# Video Evidence Display and Handling

- **Date:** 2026-11-17 08:34 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `backend/app/services/case_summaries.py`, `frontend/src/admin/complaints/api.ts`, `frontend/src/admin/components/MediaLightbox.tsx`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `frontend/src/admin/pages/complaints/ComplaintsPage.tsx`, `frontend/src/admin/styles/pages.css`, `frontend/src/admin/styles/ui.css`
- **Authorization:** User report that media on SS-2026-0025 was blank on the case details page because it contained a video upload rather than a photo
- **Type:** Fix

## Intent

When a complaint contains video evidence (such as `.mp4`, `.webm`, or Cloudinary video uploads) without any photo attachments, the complaint page was filtering out the videos and rendering "No photos", leaving the evidence section blank. In addition, case cards in lists were not displaying video previews with playable indicators, and lightbox elements were not properly handling mixed media types.

## Key changes

- `backend/app/services/case_summaries.py`: Updated `_rows()` so video URLs are preserved in `photos` and `thumbnail` arrays instead of only keeping images.
- `frontend/src/admin/live/adapters.ts`: Added video URL pattern detection (`.mp4`, `.webm`, `/video/upload/`) to assign `kind: 'video'` to evidence items.
- `frontend/src/admin/pages/complaints/ComplaintPage.tsx`: Built unified `mediaItems` list combining `d.media` (from `GET /complaints/{id}`) and `c.evidence`. Added video preview player with centered Play badge overlay and integrated full-screen playback in `MediaLightbox`.
- `frontend/src/admin/pages/complaints/ComplaintsPage.tsx` & `frontend/src/admin/pages/CasesPage.tsx`: Added video thumbnail support with centered Play button overlays on case and complaint cards.
- `frontend/src/admin/styles/pages.css` & `ui.css`: Added CSS styles for video thumbnail cards, play badges, and overlays.

## Validation evidence

- Executed `npm --prefix frontend run build`: TypeScript compile and Vite production build succeeded cleanly with 0 errors.
- Executed `node --test` in `frontend`: 199/199 frontend tests passed.
