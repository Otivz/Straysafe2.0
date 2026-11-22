# Feature Update: Polish Monitored Case Page (Lost / Found Animal View)

- **Date:** 2026-11-22 12:58 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/case/monitored/Hero.tsx`
  - `frontend/src/admin/pages/case/monitored/Lane.tsx`
  - `frontend/src/admin/pages/case/monitored/Sections.tsx`
  - `frontend/src/admin/pages/case/monitored/Activity.tsx`
  - `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** User request to make the monitored case page look more professional, polished, and consistent with STRAY-SAFE's branding.
- **Type:** Polish

## Summary

- **Hero & Lane:** Added warm ivory card borders and subtle shadows (`border-[#e7e2da] shadow-xs`) to `HeroBlock` and `Lane`, plus interactive hover borders on situation tiles (`sa-mc-tile`).
- **Official Warnings:** Upgraded `OfficialWarningsPanel` in `PossibleOwnersBlock.tsx` with a `ShieldAlert` icon, `Badge` counter, and a clean dashed empty-state card.
- **Ownership & Resolve Accordions:** Framed `"Who does it belong to?"` (`Sections.tsx`) and `"Resolve this report"` (`Activity.tsx`) inside crisp bordered cards (`rounded-xl border-[#e7e2da] bg-white shadow-xs`).
- **Activity Timeline:** Wrapped `Activity` in a bordered card with a `History` brand icon and `Badge` event count.
