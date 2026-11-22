# Feature Update: Polish Resident Welcome Page and Prioritize Sign In CTA

- **Date:** 2026-11-22 14:45 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/resident/pages/auth/WelcomePage.tsx`
- **Authorization:** User request to polish the Resident Welcome page and place **Sign in** above **Create an account**.
- **Type:** Polish

## Summary

- Moved **Sign in** (`variant="primary"`) above **Create an account** so returning and pre-registered residents have the primary action first.
- Added a **Resident Portal** pill badge in the header, styled the 3 feature items as warm-ivory cards (`from-white to-[#fcfaf6] border-[#e7e2da]`) with terracotta icon badges, and placed the account activation hint inside a clean `bg-[#faf7f2]` callout strip with staggered `rs-fade-up` entrance animations.
