# Feature Update: Urgent Case Auto-Draft for Guardhouse Dispatch & Barangay Referral

- **Date:** 2026-11-22 13:16 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/case/CaseDetailPage.tsx`
  - `frontend/src/admin/pages/case/dialogState.ts`
  - `frontend/src/admin/pages/case/CaseDialogs.tsx`
  - `frontend/src/admin/dialogs/ActionDialogs.tsx`
  - `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** User request to add an auto-drafted 1-click "Dispatch Guardhouse / Refer to Barangay" quick action banner at the top of urgent cases when high-risk triggers are detected.
- **Type:** Feature

## Summary

- Added `detectUrgentTriggers` and `buildUrgentDispatchSummary` in `CaseDetailPage.tsx` to surface high-risk trigger pills (`Chasing / attacking people`, `Bite or bleeding reported`, `Suspected rabies signs`, `Animal immobile / trapped`, `Currently aggressive`) directly inside the top urgent banner.
- Added **Dispatch Guardhouse** and **Refer to Barangay / `<Primary Agency>`** 1-click actions to the urgent banner, along with live status pills (`Referral active`, `Guardhouse logged`) once recorded.
- Extended `CaseDialog`, `CaseDialogs`, `FollowUpDialog`, and `ReferralDialog` with `initialTitle`, `initialNotes`, and `initialReason` so clicking either quick action opens the modal with the agency, urgent priority, and incident summary pre-filled.
