# Card-only observation cases

- **Date:** 2026-11-06 12:39 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `frontend/tests/underObservation.browser.mjs`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1239_observation-card-only.md`
- **Authorization:** User explicitly requested "remove the table" on the Under Observation page.
- **Type:** Polish

## Intent

Keep observation cases in the compact card presentation across mobile and desktop.

## Key changes

- Remove the table markup, Cards/Table switcher and unused view-mode state.
- Simplify the toolbar to the observation-day filter and refresh control, retaining search and the responsive status selector.
- Preserve the card workflow actions and details navigation. No backend or business-rule changes.
- Update the browser regression and testing guide to verify card-only presentation at every tested width.

## Validation evidence

- `node frontend/node_modules/typescript/bin/tsc -b frontend`: passed.
- `OBSERVATION_TEST_URL=http://127.0.0.1:5180 node frontend/tests/underObservation.browser.mjs`: passed card-only layouts at 320, 375, 390, 430, 640, 767, 768, 1024, 1280 and 1536px; existing filters, search/reset, refresh, details, warning/referral dialogs and empty/error states passed with mocked APIs and no workflow writes.
- `git diff --check`: passed.
