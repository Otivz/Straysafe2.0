# Cases Card Report Media Thumbnail Integration

- **Date:** 2026-11-17 02:20 (UTC)
- **AI tool:** Antigravity (Gemini 2.5 Pro)
- **Files changed:** `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/CasesPage.tsx`, `frontend/tests/adminLiveAdapters.test.mjs`
- **Authorization:** Explicit user request: "Then add the media upload of the report in the Cases page"
- **Type:** Feature

## Intent

Display uploaded report photos and media directly on each case card in the subdivision Admin Cases view (`/cases`). Previously, `caseFromSummary` dropped the `thumbnail_url` returned by the backend `case_summaries` service, leaving `evidence: []` and causing all cards to fall back to the generic SVG animal type icon even when photos were uploaded with the incident report.

## Key changes

1. `frontend/src/admin/live/adapters.ts`:
   - Updated `caseFromSummary`: When `s.thumbnail_url` is present, populates `evidence` with a photo evidence entry containing the thumbnail URL, plus placeholder entries for any additional report photos (`s.photo_count - 1`).
   - Updated `summaryFromDetail`: Extracts `photo_count` and `thumbnail_url` from `d.media` so cases synthesized from details also preserve the primary report photo and count.
2. `frontend/src/admin/pages/CasesPage.tsx`:
   - Enhanced `CaseCard` to render the uploaded report photo from `c.evidence`.
   - Added image load error fallback (`onError` -> `setImgFailed(true)`) so invalid/broken image URLs cleanly fall back to the animal category icon without UI breakage.
   - Added a photo count badge indicator (`+N`) on the thumbnail if multiple photos were attached to the report.
3. `frontend/tests/adminLiveAdapters.test.mjs`:
   - Updated adapter test assertion to verify that `caseFromSummary` properly maps `thumbnail_url` into `c.evidence`.

## Validation evidence

1. Frontend test suite: `node --test tests/*.test.mjs` executed cleanly.
   - Result: 192 passed, 0 failed, 0 skipped.
2. Verified type safety and clean build with TypeScript and Vite.
