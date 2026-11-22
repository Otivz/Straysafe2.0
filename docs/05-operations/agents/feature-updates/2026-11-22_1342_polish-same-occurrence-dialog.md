# Feature Update: Polish Same Occurrence Comparison Dialog

- **Date:** 2026-11-22 13:42 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`
- **Authorization:** User request to make the Same Occurrence comparison modal look more professional, polished, and consistent with STRAY-SAFE's branding.
- **Type:** Polish

## Summary

- Refactored the side-by-side comparison cards in `SameOccurrenceDialog` into a unified data-driven layout with warm ivory gradients (`from-white to-[#fcfaf6] border-[#e7e2da]`), distinct left accent borders (`border-l-stone-400` vs `border-l-[var(--sa-brand)]`), monospace reference pills, and `Badge` role tags (`Earlier complaint` / `This complaint`).
- Replaced the green dot chips with clean rounded attribute pills and added `Clock`, `MapPin`, and `User` icons for metadata alignment, plus safe wrapping (`break-words [overflow-wrap:anywhere]`) on report quotes.
- Styled the top **Compare all photos** bar and separated **Your decision** with a clean hairline divider.
