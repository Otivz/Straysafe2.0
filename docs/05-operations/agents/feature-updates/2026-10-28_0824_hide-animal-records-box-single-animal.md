# "Animals in this report" box hidden on one-animal reports

- **Date:** 2026-10-28 08:24 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/AnimalRecordsPanel.tsx`, `docs/05-operations/agents/feature-updates/2026-10-28_0824_hide-animal-records-box-single-animal.md`
- **Authorization:** the developer's "hide this one if the animal is only 1" and, after being told it is the only way to split a miscounted report, "Yes you can hide it".
- **Type:** Polish

## Intent

The "Animals in this report" box ("If this report actually shows more than one animal, add a record for each one", "Add records per animal") showed on every one-animal report.

## Key changes

- When the report's animal count is 1, the panel behaves like it already did for a report the user cannot split: no box, only the small "Replace photo with a close-up" button (when allowed).
- Reports with an animal count of 2 or more, and group reports, are unchanged.
- Affects every page using the panel: leader and Barangay report views, the resident report view, and the holding pages.
- Trade-off accepted by the developer: a report filed as "1 animal" whose photo shows several can no longer be split from this panel (the system stores no AI multi-animal count to detect it).

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 passed. Not checked in a browser.
