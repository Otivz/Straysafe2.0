# Remove referral KPI summary cards from External Referrals section

- **Date:** 2026-11-20 06:15 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Direct user request to remove the 3 KPI cards (Total Referrals, Active / In Progress, Resolved) from External Referrals.
- **Type:** Polish

## Intent

Keep the External Referrals panel concise by removing the three KPI summary cards above the referral list.

## Key changes

- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`:
  - Removed the `Total Referrals`, `Active / In Progress`, and `Resolved` KPI card grid and unused `activeCount`/`resolvedCount` variables from `CaseReferralsSection`.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
