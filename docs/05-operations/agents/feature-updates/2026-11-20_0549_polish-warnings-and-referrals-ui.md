# Polish visual design and animations for Warnings and External Referrals cards

- **Date:** 2026-11-20 05:49 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Direct user request to make the Warning & compliance observations and External Referrals sections more visually appealing with smooth animations.
- **Type:** Polish

## Intent

Enhance visual hierarchy, readability, status differentiation, and motion polish across the `Warning & compliance observations` and `External Referrals` cards on the Actions & follow-ups view.

## Key changes

- `frontend/src/admin/pages/case/ActionsTab.tsx`:
  - Styled `WarningCard` with subtle warm gradient surface, status-colored left border accent, staggered `sa-fade-up` entrance animation, hover elevation, wrapped description container (`[overflow-wrap:anywhere]`), framed observation progress block with smooth width transition, and styled compliance observation pills.
- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`:
  - Upgraded the `CaseReferralsSection` summary tiles with responsive grid spacing, subtle color-tinted active/resolved cards, hover lift transitions, and staggered `sa-fade-up` referral cards with status-colored left accents.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
