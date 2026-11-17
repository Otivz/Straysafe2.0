# Unify Complaint Map Expand and Maximize Controls

- **Date:** 2026-11-17 03:39 (UTC)
- **AI tool:** Antigravity (Google DeepMind)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `frontend/src/preview/map/ReadOnlyMap.tsx`
- **Authorization:** User request: "Remove redundancy and make i expand map and maximiz map be one"
- **Type:** Polish

## Intent

Eliminate duplicate expand/maximize buttons in the complaint location popup dialog. Previously, the dialog footer contained an "Expand map" toggle button while the map canvas had an internal "Maximize map" button, creating redundant and competing ways to enlarge the map. This change unifies the control into a single spacious modal with full-screen maximization.

## Key changes

- In `frontend/src/admin/pages/complaints/ComplaintPage.tsx`:
  - Removed redundant `isExpanded` state and unused `Minimize2` icon.
  - Sized the location map `Dialog` directly to `size="lg"` with standard preview height `height={380}` for an immediately comfortable, clear view.
  - Simplified the dialog footer to a single clean `Close` button.
- In `frontend/src/preview/map/ReadOnlyMap.tsx`:
  - Updated fullscreen portal target to `document.querySelector('dialog[open]') || document.body`, ensuring that when the map's built-in maximize button is triggered inside a modal dialog, the fullscreen map renders seamlessly within the top-layer dialog stacking context.

## Validation evidence

- Ran all 199 unit tests across `frontend/tests/*.test.mjs`, all passed with 0 failures (`# tests 199`, `# pass 199`, `# fail 0`).
- Validated TypeScript clean compilation on affected admin complaints and map components.
- Ran strict documentation audit (`npx @ghostbyte/agent-docs-kit audit documentation --strict`).
