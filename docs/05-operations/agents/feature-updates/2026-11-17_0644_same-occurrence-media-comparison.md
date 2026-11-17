# Same Occurrence Evidence Media Comparison

- **Date:** 2026-11-17 06:44 (UTC)
- **AI tool:** Antigravity (gemini-3.8-flash-high)
- **Files changed:** `backend/app/services/complaints.py`, `frontend/src/admin/complaints/api.ts`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/admin/styles/pages.css`, `docs/README.md`
- **Authorization:** User request: "in here i think adding more media could help the subdivision to compare both reports" -> "Go ahead"
- **Type:** Feature

## Intent

Enhance the **Same occurrence** decision dialog in Subdivision Leader Admin (`SameOccurrenceDialog`) to display side-by-side evidence photos and video thumbnails for both the earlier complaint candidate and the current complaint report. Leaders can now visually inspect and compare animal photos, landmarks, and gates, as well as open high-resolution previews in `MediaLightbox` with seamless comparison navigation before deciding whether to link or separate the incidents.

## Key changes

1. **Backend (`backend/app/services/complaints.py`):**
   - Extended `maybe_same` candidate dictionary in `detail()` to include `media` (`[{"id": m.media_id, "url": m.file_url, "type": (m.media_type or "").lower()}]`), `animal_type`, and GPS coordinates (`latitude`, `longitude`).
   - Included top-level `media` in `detail()` for the current complaint report.

2. **Frontend Types (`frontend/src/admin/complaints/api.ts`):**
   - Updated `ApiComplaint` to include `media?: { id: number; url: string; type: string }[]`.
   - Updated `maybe_same` typing to include candidate `media`, `animal_type`, `latitude`, and `longitude`.

3. **Frontend Comparison Dialog (`frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`):**
   - Integrated `useMediaViewer()` and `LightboxMediaItem` from `MediaLightbox`.
   - Derived `oMedia` (candidate report attachments) and `cMedia` (current report attachments).
   - Added a top comparison action bar with a `"Compare all photos (N)"` button that opens a combined lightbox sequence for rapid cross-referencing.
   - Added visual thumbnail strips under both report cards with zoom overlays, video badges, and fallback notice if no media is attached.

4. **Styles (`frontend/src/admin/styles/pages.css`):**
   - Added `.sa-cm-compare__bar`, `.sa-cm-compare__quote`, `.sa-cm-compare__media`, `.sa-cm-compare__thumbs`, `.sa-cm-thumb-btn`, and responsive lightbox triggers.

## Validation evidence

- Executed `npm --prefix frontend run build`: TypeScript (`tsc -b`) and Vite production bundle passed cleanly with 0 errors in 4.51s.
- Executed `node --test`: all 199 unit tests across 16 test suites passed with 0 failures.
