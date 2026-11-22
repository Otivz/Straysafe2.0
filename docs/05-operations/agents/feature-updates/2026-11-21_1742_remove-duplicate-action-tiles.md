# Remove Duplicate Action Tiles from Case Actions Tab

- **Date:** 2026-11-21 17:42 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_1742_remove-duplicate-action-tiles.md`
- **Authorization:** Explicit developer request (`"FEATURE 2: REMOVE DUPLICATE ACTION TILES"`).
- **Type:** Polish

## Intent

Remove the redundant **Create Referral** and **Publish / View Safety Advisory** action tiles from `ActionsTab.tsx` while preserving referral creation in the case header action menu and the **Referrals** tab (`CaseReferralsSection`), and preserving community notice management in the case header action menu and the **Community notice** panel on `OverviewTab.tsx`.

## Key changes

- `frontend/src/admin/pages/case/ActionsTab.tsx`: Removed the `Create Referral` and `Publish Safety Advisory` / `View / edit Safety Advisory` tiles (and unused `Landmark`, `Megaphone`, and `advisory` lookup) from `ActionsTab`, leaving `Record Follow-up`, `Record owner coordination`, `Issue warning`, `Record compliance`, and `Add internal note`.
- `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, and `frontend/src/admin/dialogs/CoordinationDialogs.tsx`: Verified unchanged and active for creating referrals (header menu + Referrals tab) and creating/editing community notices (header menu + Overview sidebar panel).

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
