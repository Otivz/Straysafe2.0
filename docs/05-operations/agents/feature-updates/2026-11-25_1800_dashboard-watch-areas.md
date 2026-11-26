# Dashboard: Watch areas

- **Date:** 2026-11-25 18:00 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/lib/watchAreas.ts`, `frontend/src/admin/components/WatchAreas.tsx`, `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/src/admin/styles/case.css`, `frontend/tests/adminWatchAreas.test.mjs`, `docs/01-system/HEATMAP_RULES.md`
- **Authorization:** Developer's request in the Claude Code session ("Smart Street / Area Watchlist Alert (Dashboard)"), after a discussion of the design and "kung ano mas tingin mo better choice".
- **Type:** Feature

## Intent

Show the Leader a place where several safety, injury or nuisance reports came in within a short time, so it can be addressed before it gets worse. The case lists show one case at a time and hide the pattern.

## Key changes

- `lib/watchAreas.ts` (pure): groups the last 14 days' safety, injured and nuisance reports by how close their pins are (the existing 70 m hotspot clustering, not a street name, since a report has no street), and keeps a place with at least 3 reports from at least 2 different people and at least 1 still open. "High" at 5 reports or with an open urgent case. It leaves out missing pets, found animals, "other", duplicates, merged reports and those closed as invalid, duplicate or withdrawn, and gives the count in the 14 days before for a trend, the reports with no pin, and the case ids.
- `components/WatchAreas.tsx`: a "Watch areas" card on the Dashboard, between the key figures and "Needs your attention": up to 3 places, each with its label (the most common landmark), "N reports in 14 days from M residents", the trend, the kinds of report, how many are open or urgent, and a list of the case links; "Show on the map" goes to the dashboard map. Amber for watch and red for high, with a short staggered entrance and a soft pulse on a high place. With nothing to watch the card is not shown, and there is nothing to dismiss.
- Privacy: for the Leader only, a place and counts, never a name, a contact or what a complaint says (a place with several nuisance complaints can point at one household).
- No backend, database or new dependency. The numbers are judgement values to tune after real use.

## Validation evidence

- `node --test tests/adminWatchAreas.test.mjs`: 13 tests pass (the real module and clustering: a watch area and its counts; 3 reports from 2 people needed; one household is not a pattern; a person by account or name and number, with "+63" and "0" the same number; places 200 m apart stay separate; which kinds and which closures count; the 14-day window and future dates; all closed is not shown; high by count and by an open urgent case, listed first; the trend and that a far report does not count; the label and "Location not named"; no-pin reports; no name or text in the result; empty input).
- `npx tsc -b`: no errors. `npx eslint` on the changed files: 0 problems. `npx vite build` (temporary folder) builds.
- Not checked: the card in a running dashboard with real data.
