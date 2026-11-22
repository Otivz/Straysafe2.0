# Feature Update: Overdue & Due-Today Referral and Follow-up Notifications

- **Date:** 2026-11-22 13:39 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/data/selectors.ts`
  - `frontend/src/admin/pages/DashboardPage.tsx`
  - `frontend/src/admin/layout/NotificationsDrawer.tsx`
- **Authorization:** User request to surface overdue and due-today external referrals and follow-ups on the Dashboard and Notification Bell drawer.
- **Type:** Feature

## Summary

- **`selectors.ts`:** Added `dueReferralItems(cases, now)` to detect open referrals with overdue or due-today `followUpAt` dates, included them in `attentionItems`, and added `referralsDue` + `overdueTotal` to `dashboardCounts`.
- **`DashboardPage.tsx`:** Updated the 4th summary stat card to show combined due/overdue follow-ups and referrals, and added a dedicated **Overdue & due today** section with 1-click links to `?tab=referrals` or `?tab=actions`.
- **`NotificationsDrawer.tsx`:** Added a live **Overdue & due today** reminder section at the top of the Notification Bell drawer so admins can jump straight to any overdue/due-today referral or follow-up from any page.
