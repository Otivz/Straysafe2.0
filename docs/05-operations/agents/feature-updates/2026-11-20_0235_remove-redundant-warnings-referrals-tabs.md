# Change record: Remove Redundant Warnings and Referrals Tabs from Case Details Page

- **Date:** 2026-11-20 02:35 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_0235_remove-redundant-warnings-referrals-tabs.md`
- **Authorization:** User request "remove the seperate page for referalls and warnings since asa action buttons naman na, noo need for seperate, redundant na . make it faster"
- **Type:** Polish

## What changed and why

1. **Case Details Tabs (`CaseDetailPage.tsx`):**
   - Removed the redundant **Warnings** and **Referrals** tabs from `CaseDetailPage.tsx` since both `CaseWarningsSection` and `CaseReferralsSection` are already integrated inside **Actions & follow-ups** (`ActionsTab.tsx`).
   - Redirected any legacy `?tab=warnings` or `?tab=referrals` query parameters to the `actions` tab.
2. **Verification:**
   - Verified TypeScript and Vite production build (`npm run build --prefix frontend`).
