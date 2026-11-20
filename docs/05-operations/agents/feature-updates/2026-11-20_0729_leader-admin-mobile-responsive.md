# Leader Admin on Phones: Overflow and Touch-Size Fixes

- **Date:** 2026-11-20 07:29 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/components/layout.tsx`, `frontend/src/admin/styles/ui.css`, `frontend/src/admin/styles/pages.css`, `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `frontend/src/admin/pages/complaints/ComplaintsPage.tsx`, `docs/README.md`
- **Authorization:** Developer: "Make sure that subdivision [admin] dashboard are also adaptable on mobile and its responsive".
- **Type:** Polish

## Intent

The Leader (subdivision admin) interface already had a phone layout: a top bar with a menu drawer, stacked cards and wrapping filters. The task was to test it at phone and tablet sizes and fix what was wrong. The live tunnel address given could not be opened from here, so everything was tested on throwaway local copies of the app.

## Database changes

None.

## What was found and fixed

- **Loading placeholder caused sideways scrolling (every page).** `PageSkeleton` draws a fixed 420 px bar, so any admin page was wider than a 360 or 390 px phone while loading. `Skeleton` now has `max-width: 100%`.
- **Warning Templates page overflowed (534 px on a 390 px phone).** Two causes:
  - The shared section header (`.sa-block__head`) never wrapped, so a title with a wide action beside it (here the All/Active/Archived filter) was squeezed into a narrow column. It now wraps, so the action drops under the title on a narrow screen and stays beside it on desktop. This applies to every page using that header.
  - The template card list had no explicit phone column, so it grew to fit the longest line. It now has a `minmax(0, 1fr)` column.
- **Tap targets were under 44 px.** One rule block in `ui.css` now applies on phones and tablets (`max-width: 1023px`) and on any touch screen (`pointer: coarse`):
  - Buttons 44 px (small buttons 40), icon buttons 44 px wide, so the menu and bell are 44 × 44 (were 36).
  - Text inputs and dropdowns 44 px tall with 16 px text, so iPhones don't zoom in when a field is tapped; a long placeholder ends with an ellipsis instead of being cut mid-word.
  - Filter tabs (`sa-seg`) 38 px, page tabs taller, menu drawer links 44 px (were 38).
  - The Cards/Table toggle on Complaints (24 px) is taller below the desktop breakpoint.
- **Desktop is unchanged.** The new sizes apply only below 1024 px or on touch screens.

## Validation evidence

- **Tests were run on throwaway local copies:** the repository's isolated test API and Vite, headless Chrome, signed in as the Leader.
  - For the detail pages and Warning Templates I ran a copy of the test API with the warning-letter and pet-tag routes added, because the standard test API lacks them.
  - At 360, 390 and 768 px: all 12 pages (Dashboard, Cases, Messages, Complaints, Community, New notice, Pet Registry, Residents, Analytics, Warning Templates, Settings, Profile) fit the screen width.
  - At 390 px, the case, pet and resident detail pages, the menu drawer and the notifications panel also fit.
  - The menu links measure 44 px, no page errors.
- **At 1280 px:** every page still fits, and the Warning Templates page was checked by screenshot: two columns, the filter beside the title, dense buttons.
- Screenshots were checked, not only measurements. An early run measured blank pages because it did not wait for rendering; that run was thrown away and the measurements repeated.
- `npx tsc -p tsconfig.app.json --noEmit` passed.
- Not caused by this change (the same on a clean copy of commit `765670d`): `adminLiveAdapters.test.mjs` fails 2 and `adminMonitoredCase.test.mjs` fails 1 (label wording such as "Phone" vs "Phone call"). ESLint reports one `set-state-in-effect` error in `WarningTemplatesPage.tsx`, which was already there.

## Remaining issues

- Small tap targets left: inline text links (case titles and reference numbers inside cards, whose card or "View" button is the larger target) and the community checkbox, which sits inside a label.
- Not tested on a real phone or in the Android app; the check used Chrome's phone emulation. Other pages, dialogs and states (the warning letter editor, the case dialogs, a long list of cases) were not covered.
- "Possible Pet Owners" shows "Not Found" in the test copy only, because that copy lacks a route.
