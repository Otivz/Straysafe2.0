# Feature Update: Polish Community Notices Page with Summary Strip & Animations

- **Date:** 2026-11-23 00:19 (UTC+8 / 2026-11-22 16:19 UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/CommunityPage.tsx`
- **Authorization:** User request to polish the Community page with STRAY-SAFE branding and entrance animations.
- **Type:** Polish

## Summary

- Added a 4-card interactive summary strip (**Published**, **Drafts**, **Archived**, **All notices**) with warm-ivory gradients, icon badges, and staggered `sa-fade-up` animations.
- Framed the filter/search bar in a warm-ivory container (`border-[#e7e2da] bg-[#faf7f2]/85`).
- Upgraded notice rows into structured cards with photo thumbnails (or terracotta icon fallback), status/type badges, monospace case ID pills, metadata icons (`MapPin`, `Calendar`, `Camera`), hover elevation, and staggered `sa-fade-up` animations.
