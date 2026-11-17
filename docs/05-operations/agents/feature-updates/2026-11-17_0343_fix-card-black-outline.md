# Fix Dark Black Outline on Case and Complaint Cards

- **Date:** 2026-11-17 03:43 (UTC)
- **AI tool:** Antigravity (Google DeepMind)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintsPage.tsx`, `frontend/src/admin/pages/CasesPage.tsx`
- **Authorization:** User request: "remove the black outline" with screenshot of complaint card grid
- **Type:** Fix

## Intent

Resolve the harsh, solid black border (`currentColor`) on cards in the Complaints and Cases workspace views. When an item has an action requirement or urgency accent (e.g. `Needs you`, `isUrgent`, `isHigh`), the base border color class `border-[var(--sa-line)]` was conditionally omitted, causing the top, right, and bottom borders to fall back to `currentColor` (black) instead of the soft stone border token.

## Key changes

- In `frontend/src/admin/pages/complaints/ComplaintsPage.tsx`:
  - Added `border-[var(--sa-line)]` unconditionally to the card container classes so that cards always render the warm stone border on all sides.
  - Kept `border-l-4 border-l-[var(--sa-amber)]` purely for the left accent stripe without dropping the border color on the other three sides.
- In `frontend/src/admin/pages/CasesPage.tsx`:
  - Applied the same fix: added `border-[var(--sa-line)]` as the baseline border color for all cards, retaining `border-l-4` for priority accents (`var(--sa-red)` / `var(--sa-amber)`).

## Validation evidence

- Verified in Tailwind CSS that `border border-[var(--sa-line)]` sets base border color on all sides, and `border-l-4 border-l-[...]` overrides only the left edge.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`, all passed (`# tests 199`, `# pass 199`, `# fail 0`).
