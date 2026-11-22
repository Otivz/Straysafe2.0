# Pet Registry Table Scroll and Page Size 10

- **Date:** 2026-11-22 18:23 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/PetsPage.tsx`
- **Authorization:** User request to restrict vertical scrolling to the Pet Registry table and limit display to 10 pet records per page.
- **Type:** Polish

## Intent

Keep the Pet Registry header, tabs, summary cards, filter bar, pagination controls, and footer callout fixed in view on desktop while scrolling only inside the Registered Pets table, and limit pagination to 10 pet records per page.

## Key changes

- Updated `PAGE_SIZE` from `15` to `10` in `frontend/src/admin/pages/PetsPage.tsx`.
- Constrained the desktop container height (`lg:flex lg:h-[calc(100dvh-112px)] lg:flex-col lg:overflow-hidden`) when on the `registry` tab, with `lg:flex lg:min-h-0 lg:flex-1 lg:flex-col` on the panel and `lg:min-h-0 lg:flex-1 lg:overflow-y-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10` on `.sa-tablewrap`.
- Replaced `style={{ animationDelay: '140ms' }}` on the table `Panel` with Tailwind `[animation-delay:140ms]`.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/PetsPage.tsx; npx tsc --noEmit`
