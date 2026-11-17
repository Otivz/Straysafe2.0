# Multi-Image Carousel Controls for Uploads and Media

- **Date:** 2026-11-17 02:50 (UTC)
- **AI tool:** Antigravity (gemini-3.8-flash-high)
- **Files changed:** `backend/app/services/case_summaries.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/resident/components/MediaPicker.tsx`, `frontend/tests/adminMediaLightbox.test.mjs`, `docs/README.md`
- **Authorization:** User request: "Then in the upload if there two or more image uploaded there should be next and previeous < image >"
- **Type:** Feature

## Intent

Provide inline `< image >` previous and next navigation controls whenever two or more images are uploaded or attached to a case, allowing users and subdivision leaders to cycle through multiple images seamlessly both in the upload form, on the Cases card thumbnails, and on the Case Details overview.

## Key changes

- **Backend (`backend/app/services/case_summaries.py`):**
  - Updated `_rows` aggregation to collect all media photos into a `photos` list (`entry["photos"].append(url)`).
  - Included `photo_urls` in each `CaseSummary` dictionary response so summary lists have access to all uploaded photos.
- **Admin API & Adapters (`frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`):**
  - Added `photo_urls?: string[]` to `ApiCaseSummary`.
  - Mapped `photo_urls` into `c.evidence` (`Photo 1`, `Photo 2`, etc.) in `caseFromSummary`.
  - Added extraction of `photo_urls` from case detail media attachments in `summaryFromDetail`.
- **Cases Card Thumbnail (`frontend/src/admin/pages/CasesPage.tsx`):**
  - Aggregated all case photo URLs from evidence, registered pet photos, and lost pet photos.
  - Added active `photoIndex` state to `CaseCard`.
  - Rendered inline `<` and `>` chevron buttons over the card thumbnail with an active index counter (`1 / N`) when 2+ photos exist.
  - Used `e.stopPropagation()` on chevron controls to prevent triggering card navigation.
  - Clicking the image thumbnail opens the full-screen lightbox at the currently active photo.
- **Case Details Overview (`frontend/src/admin/pages/case/OverviewTab.tsx`):**
  - Added `evidenceIdx` state and a featured `< image >` viewer card above the evidence grid when 2+ media photos are present.
  - Provided `<` and `>` controls with image counter and full-screen preview click handler.
- **Upload Form (`frontend/src/resident/components/MediaPicker.tsx`):**
  - Added `previewIdx` state in `MediaPicker`.
  - When 2 or more images are uploaded, displays a featured `< image >` interactive carousel preview with `<` and `>` navigation buttons, image count indicator, and filename display.
- **Unit Tests (`frontend/tests/adminMediaLightbox.test.mjs`):**
  - Added unit test verifying circular wrap-around navigation logic when cycling through multiple images.

## Validation evidence

- Ran `node --test frontend/tests/adminMediaLightbox.test.mjs frontend/tests/adminLiveAdapters.test.mjs`: all 27 unit tests pass.
- Ran entire test suite across all 12 test files: 198 tests pass, 0 failed.
- Strict documentation audit verified via `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
