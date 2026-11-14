# Leader UI Filter De-cluttering and Terminology Polish

- **Date:** 2026-11-14 04:34 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/src/admin/pages/ResidentsPage.tsx`, `frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/pages/CommunityPage.tsx`, `frontend/src/admin/pages/complaints/ComplaintsPage.tsx`
- **Authorization:** User requests: "okay in leader UI, i see the almost of the pages have a fucking filter, like there are so many unneccesary filter and too many redundant, also the open HAHAH, whats the open mean HAHAHA, find a good term", "fix it like a professional UI/UX designer", "i think the problem here is there are so many filters, then some of them had a number"
- **Type:** Polish

## Intent

Streamline and de-clutter the Subdivision Leader management screens. Remove redundant filter controls, remove distracting number counters from routine filter tabs, clarify ambiguous terminology ("Open" replaced with "Active" for lifecycle status and "Review" for actionable items), and collapse multi-row filter clutter into a clean, single-row toolbar layout.

## Key changes

1. **Cases Page (`CasesPage.tsx`)**:
   - Replaced redundant 6-tab segmented bar (`[All] [Open] [Reported] [Under review] [In progress] [Closed]`) with 3 clean, text-only horizon tabs: `[Active] [Closed] [All]` (removed number badges).
   - Replaced ambiguous "Open" label with "Active" across case status views.
   - Removed redundant "Stage" and "Priority" dropdown filters from the toolbar.
   - Collapsed the entire toolbar into a single, responsive row: View tabs on the left, Search + Category + Sort on the right.
   - Total case counts remain cleanly displayed in the table footer pager without cluttering the header.

2. **Complaints Workspace (`ComplaintsPage.tsx`)**:
   - Renamed `Open` tab to `Active` and `All` tab to `All complaints` (removed counter badges).
   - Updated empty state text from "open complaints" to "active complaints".
   - Changed action buttons on "Needs You" cards from vague `Open` to actionable `Review`.

3. **Dashboard (`DashboardPage.tsx`)**:
   - Changed action button in "Needs your attention" list from `Open →` to `Review →`.

4. **Residents Registry (`ResidentsPage.tsx`)**:
   - Removed counter numbers from status tabs.
   - Suppressed status filter tabs completely when all residents are active.

5. **Pet Registry (`PetsPage.tsx`)**:
   - Removed counter numbers from animal type tabs.
   - Suppressed redundant animal type segmented tabs when all registered pets share the same animal type.

6. **Community Notices (`CommunityPage.tsx`)**:
   - Removed counter numbers from status tabs (`Published`, `Drafts`, `Archived`, `All`).
   - Fixed bug where clicking the "All" tab inadvertently cleared the URL status parameter, which caused the component to fall back to "Published" instead of showing all notices.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`) which completed with exit code 0 and zero TypeScript or bundling errors.
- Verified responsive layout and clear filter states.
