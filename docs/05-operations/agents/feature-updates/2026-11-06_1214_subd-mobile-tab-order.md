# Subdivision mobile tab order

- **Date:** 2026-11-06 12:14 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/Navbars/SubdBottomNav.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1214_subd-mobile-tab-order.md`
- **Authorization:** User requested "Then could you arrange it for me" after moving Messages into the mobile tab bar.
- **Type:** Polish

## Intent

Arrange subdivision mobile navigation with Messages in the center and the primary case actions grouped near Dashboard.

## Key changes

- Reorder the existing tabs to Dashboard, Reports, Messages, Referrals, Pet Records.
- Preserve the same routes, active states, unread badge, shared spacing, and mobile-only visibility.

## Validation evidence

- Verified source tab order against the five expected navigation titles.
- TypeScript `transpileModule` reports no TSX syntax errors for the changed component.
- `git diff --check`: passed.
