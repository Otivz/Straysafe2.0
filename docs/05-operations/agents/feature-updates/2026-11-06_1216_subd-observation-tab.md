# Observation shortcut in subdivision mobile navigation

- **Date:** 2026-11-06 12:16 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/Navbars/SubdBottomNav.tsx`, `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1216_subd-observation-tab.md`
- **Authorization:** User requested replacing Referrals with a module used more frequently; selected the existing Observation workflow for follow-ups and warning deadlines.
- **Type:** Polish

## Intent

Give subdivision leaders direct mobile access to ongoing observation follow-ups through the bottom navigation.

## Key changes

- Replace the mobile Referrals tab with Observation using an eye icon and the existing `/subd/under-observation` route.
- Set the Observation page's active tab and accessible current-page indicator.
- Keep Dashboard, Reports, Messages and Pet Records in their existing order. Referrals remains available in the sidebar menu. Desktop navigation is unchanged.

## Validation evidence

- Verified the five mobile navigation titles, the Observation destination, and the existing Referrals sidebar entry.
- TypeScript `transpileModule` reports no TSX syntax errors in either changed component.
- `git diff --check`: passed.
