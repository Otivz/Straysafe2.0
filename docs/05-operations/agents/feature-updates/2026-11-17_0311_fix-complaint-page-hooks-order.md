# Fix React Hooks Order Violation in ComplaintPage

- **Date:** 2026-11-17 03:11 (UTC)
- **AI tool:** Antigravity (gemini-3.8-flash-high)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `docs/README.md`
- **Authorization:** User error report: "ComplaintPage.tsx:77 React has detected a change in the order of Hooks called by ComplaintPage... when i click the view on all the reports in cases and complaint its reload slowly and also its blank"
- **Type:** Fix

## Intent

Resolve React Hooks order violation and runtime crash in `ComplaintPage.tsx` where hook calls (`useMediaViewer`, `useState`) were invoked after early returns (`if (!d) return <PageSkeleton />`), causing unhandled React exceptions and blank screens when viewing complaint cases such as `/cases/SS-2026-0018`.

## Key changes

- **Complaint Page Component (`frontend/src/admin/pages/complaints/ComplaintPage.tsx`):**
  - Moved `useMediaViewer()` and `const [photoIdx, setPhotoIdx] = useState(0)` to the top of the component body before any early returns or conditional statements.
  - Ensured hook execution order is strictly constant across initial loading, skeleton, and loaded states.
  - Removed duplicate hook invocations after the early return.

## Validation evidence

- Verified hook order execution statically and ensured zero conditional hook calls.
- Ran `node --test frontend/tests/adminMediaLightbox.test.mjs frontend/tests/adminLiveAdapters.test.mjs`: all 28 tests pass.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`: 199 pass, 0 fail.
