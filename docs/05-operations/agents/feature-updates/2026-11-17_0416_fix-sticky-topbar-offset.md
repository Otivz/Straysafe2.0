# Fix Sticky TopBar Gap and Content Bleed-Through on Resident Screens

- **Date:** 2026-11-17 04:16 (UTC)
- **AI tool:** Antigravity (Google DeepMind)
- **Files changed:** `frontend/src/resident/styles/resident.css`
- **Authorization:** User report with screenshot: "is this fine? the notifiaction header and the content is visible on the top of it"
- **Type:** Fix

## Intent

Fix visual defect on resident secondary screens (such as `/notifications`, `/settings`, `/reports/:id`) where page content scrolled into an empty 34px hole above the sticky header (`TopBar`).

## Root cause

`--rs-bar` was previously hardcoded in `:root` to `34px` (reserved for an optional debug preview bar). The sticky header `.rs-topbar` had `top: var(--rs-bar)`. When no preview bar was present, `.rs-topbar` was positioned 34px below the top of the viewport, creating an empty gap above the header that allowed scrolled content to visibly bleed out across the top edge.

## Key changes

- In `frontend/src/resident/styles/resident.css`:
  - Initialized `--rs-bar: 0px` in `:root` so by default all headers stick flush at `top: 0px`.
  - Added `:has(.rs-previewbar)` selectors (`:root:has(.rs-previewbar)`, `.rs-root:has(.rs-previewbar)`, `.rs-frame:has(.rs-previewbar)`) to dynamically set `--rs-bar: 34px` only when the debug preview bar is actively mounted.
  - Increased `.rs-topbar` background opacity and blur (`backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)`) so content passing behind the sticky header is cleanly frosted and never visible above it.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`), which compiled in 1.21s with 0 errors.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`, all passed (`# tests 199`, `# pass 199`, `# fail 0`).
