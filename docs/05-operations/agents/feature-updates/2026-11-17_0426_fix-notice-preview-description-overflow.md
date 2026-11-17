# Fix Notice Publication Preview Description Overflow

- **Date:** 2026-11-17 04:26 (UTC)
- **AI tool:** Antigravity (Google DeepMind)
- **Files changed:** `frontend/src/admin/components/NoticePreview.tsx`, `frontend/src/admin/pages/NoticeEditorPage.tsx`, `frontend/src/admin/styles/pages.css`
- **Authorization:** User report on `/community/ann-1/edit`: "on the Publication preview the descroption are going outside the card container"
- **Type:** Fix

## Intent

Prevent notice description text, long unbroken tokens, URLs, and titles from overflowing outside the "Publication preview" card container on the Notice Editor page (`/community/:id/edit`).

## Key changes

- In `frontend/src/admin/components/NoticePreview.tsx`:
  - Added `overflow-hidden break-words` and `overflowWrap: 'anywhere'`, `wordBreak: 'break-word'` to the `<article className="sa-panel sa-noticecard">` container.
  - Added `break-words`, `overflowWrap: 'anywhere'`, and `wordBreak: 'break-word'` to the description `<p>` tag, title `<h3>`, and location container, ensuring that long URLs and text wrap within card boundaries.
- In `frontend/src/admin/styles/pages.css`:
  - Updated `.sa-editor` grid definition to `grid-template-columns: minmax(0, 1fr) minmax(0, 380px);`.
  - Added `min-width: 0; max-width: 100%;` to `.sa-editor__aside`.
  - Added `min-width: 0; max-width: 100%; overflow: hidden;` to `.sa-noticecard`.
- In `frontend/src/admin/pages/NoticeEditorPage.tsx`:
  - Added `min-w-0 max-w-full` to the aside wrapper.

## Validation evidence

- Ran production build (`tsc -b && vite build`), which compiled in 1.68s with 0 errors.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`, all passed (`# tests 199`, `# pass 199`, `# fail 0`).
