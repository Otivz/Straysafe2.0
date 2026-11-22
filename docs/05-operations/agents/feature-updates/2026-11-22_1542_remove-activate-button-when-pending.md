# Feature Update: Remove Activate Account Button for Pending Residents

- **Date:** 2026-11-22 15:42 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/ResidentDetailsPage.tsx`
- **Authorization:** User request to remove the **Activate account** button when a resident's status is `pending`.
- **Type:** Polish

## Summary

- Removed the **Activate account** action from `ACTIONS.pending` in `ResidentDetailsPage.tsx` (keeping **Suspend account**), and removed the unused `UserCheck` icon import.
