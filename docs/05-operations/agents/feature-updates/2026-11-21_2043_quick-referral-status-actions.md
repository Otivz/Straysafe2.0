# Quick Referral Status Actions

- **Date:** `2026-11-21 20:43 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_2043_quick-referral-status-actions.md`
- **Authorization:** User request — FEATURE 12: QUICK REFERRAL STATUS ACTIONS ("Allow the Leader to update referral statuses directly from referral cards.")
- **Type:** `Feature`

## Summary

- Inspected the referral status update workflow in `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/live/actions.ts`, and `backend/app/services/case_work.py`.
- Added quick action buttons directly on each open referral card in `CaseReferralsSection`:
  - **Mark Acknowledged** (`status: 'acknowledged'`, shown for open referrals in `pending`, `to_contact`, `sent`, `awaiting_response`, or `no_response`).
  - **Mark Resolved** (`status: 'resolved'`, shown for non-terminal open referrals).
- Reused the existing `case/updateReferral` action (`POST /cases/{id}/referrals/{referral_id}/updates`), which reloads the case detail upon completion so the referral card updates immediately and persists across page reloads.
- Preserved backend validation and transition rules (`note` >= 3 characters, `external_outcome` populated when marking a referral as `resolved`, and terminal status guards).
- Added loading spinner state (`quickBusy`), toast success/error feedback, and disabled state across quick action buttons while an update is processing to prevent duplicate requests.
