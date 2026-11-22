# Referral Follow-up Tracking

- **Date:** `2026-11-21 20:27 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_2027_referral-follow-up-tracking.md`
- **Authorization:** User request — FEATURE 11: REFERRAL FOLLOW-UP TRACKING ("Improve referral monitoring by displaying follow-up dates and identifying overdue referrals.")
- **Type:** `Feature`

## Summary

- Updated `CaseReferralsSection` and `ReferralDetailsDialog` in `frontend/src/admin/dialogs/CoordinationDialogs.tsx` to display `r.followUpAt` on every referral card and detail modal where a follow-up date is set, formatted with STRAYSAFE's standard `fmtDateTime` and `dueInfo` helpers.
- Added an overdue indicator badge (`<Badge tone="red" icon={AlertTriangle}>Follow-up overdue by ...</Badge>`) and red accent border (`border-l-red-600`) when `r.followUpAt` has passed (`dueInfo(r.followUpAt, now).overdue`) and the referral is still unresolved (`!TERMINAL_REFERRAL_STATUSES.includes(r.status)`).
- Added a due-today indicator badge (`<Badge tone="amber" dot>Follow-up today, ...</Badge>`) when `r.followUpAt` falls on today's date and the referral is still unresolved.
- Ensured resolved/terminal referrals (`resolved`, `completed`, `declined`, `cancelled`) and referrals without a `followUpAt` date never display an overdue indicator.
- Preserved all existing referral statuses without introducing automatic `No Response` status changes.
- Highlighted the `Referrals` tab in `frontend/src/admin/pages/case/CaseDetailPage.tsx` with `alert` when any open referral has an overdue `followUpAt`.
