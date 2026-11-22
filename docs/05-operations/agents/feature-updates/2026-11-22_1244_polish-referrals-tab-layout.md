# Feature Update: Polish External Referrals Tab Layout

- **Date:** 2026-11-22 12:44 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** User request to make the External Referrals tab look more professional, polished, and consistent with STRAY-SAFE's branding.
- **Type:** Polish

## Summary

- Replaced the plain `sa-card` outer wrapper in `CaseReferralsSection` with STRAY-SAFE's `Panel` + `Block` layout, a `Share2` section icon, a `Badge` count, and an inline `saFadeUp` animation keyframe.
- Styled the `"Refer to"` agency quick-create bar with a subtle `var(--sa-surface-2)` container and uppercase label, plus a clean dashed empty state when no referrals exist.
- Reorganized each referral card into a 3-tier hierarchy:
  1. **Header:** Monospace reference pill, organization name, status/priority/follow-up badges on the left, and `Mark Acknowledged`, `Mark Resolved`, and `View Details` on the right.
  2. **Body:** Readable referral reason, clean metadata strip (`Referred`, `Follow-up`, `Contact`, `Phone`, `Last Updated`), and `Documented Outcome` / `Latest Update` callout.
  3. **Footer:** Hairline-separated utility toolbar for `Call`, `Copy Contact`, and `Copy Referral Summary`.
