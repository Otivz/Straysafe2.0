# Ensure Complete Visibility for Resident Bottom Tab Bar Labels

- **Date:** 2026-11-17 03:59 (UTC)
- **AI tool:** Antigravity (Google DeepMind)
- **Files changed:** `frontend/src/resident/styles/resident.css`
- **Authorization:** User request: "On the resident side the bottom tab bar the community word is not visible its bothering me i think it should be all visible or if not change the wording for it"
- **Type:** Polish

## Intent

Ensure all resident bottom navigation tab labels—specifically the 9-character label "Community" and 10-character label "My reports"—are completely and cleanly visible across all mobile device screen widths without text truncation or ellipsis.

## Key changes

- In `frontend/src/resident/styles/resident.css`:
  - Adjusted `.rs-bottomnav` horizontal padding from `4px` to `2px` to free up 4px of horizontal space across columns.
  - Added `min-width: 0;` to `.rs-nav__link` so grid children shrink correctly and do not overflow their grid tracks.
  - Adjusted `.rs-nav__link` padding from `6px 2px 5px` to `5px 1px 4px`.
  - Scaled `.rs-nav__icon` from `52px x 30px` to `44px x 28px` for a sleeker, standard mobile proportion.
  - Updated `.rs-nav__label` typography to `font-size: 11px; line-height: 14px; letter-spacing: -0.015em; white-space: nowrap; text-align: center;`, allowing "Community" (~52px wide) and "My reports" (~54px wide) to comfortably fit within 70px–74px mobile grid tracks without truncation.
  - Added a responsive media query for narrow screens (`<= 374px`) reducing label font size to `10px` and icon size to `40px x 26px` so no labels are ever clipped or hidden on compact devices.

## Validation evidence

- Ran all 199 unit tests across `frontend/tests/*.test.mjs`, all passed (`# tests 199`, `# pass 199`, `# fail 0`).
- Validated CSS calculations for 320px, 360px, 375px, and 390px viewports ensuring all 5 tab labels fit with generous margins.
