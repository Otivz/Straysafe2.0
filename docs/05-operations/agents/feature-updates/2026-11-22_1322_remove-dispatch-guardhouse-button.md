# Feature Update: Remove Dispatch Guardhouse Button from Urgent Banner

- **Date:** 2026-11-22 13:22 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/case/CaseDetailPage.tsx`
- **Authorization:** User request to remove the **Dispatch Guardhouse** button from the urgent case banner.
- **Type:** Polish

## Summary

- Removed the **Dispatch Guardhouse** button, `hasGuardDispatch` badge, and unused `ShieldAlert` import from `CaseDetailPage.tsx`, keeping the **Refer to Barangay / `<Primary Agency>`** 1-click button, `Referral active` badge, and detected high-risk trigger pills.
