# Collapsible Map Pinpoint on Complaint Details

- **Date:** 2026-11-17 03:27 (UTC)
- **AI tool:** Antigravity (gemini-3.8-flash-high)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `docs/README.md`
- **Authorization:** User request: "https://oaks-cohen-girlfriend-brokers.trycloudflare.com/cases/SS-2026-0021 what i want maybe add a map pinpoint location that it can be hide what do you think? Go apply it"
- **Type:** Feature

## Intent

Provide an interactive, on-demand collapsible map pinpoint on complaint detail screens (such as `/cases/SS-2026-0021`) so Subdivision Leaders can quickly inspect the exact incident location within the subdivision without cluttering the screen or pushing down procedural findings.

## Key changes

- **Complaint Detail Component (`frontend/src/admin/pages/complaints/ComplaintPage.tsx`):**
  - Added `showMap` state at the top of `ComplaintPage`.
  - Added inline toggle button (`Show map pin` / `Hide map` / `View area map`) next to the observed time and area in the `SEEN` story section.
  - Rendered `LocationMapPreview` with `pin`, subdivision boundary outline, and `MapLegend` when toggled open.
  - Included fallback support for reports without recorded GPS coordinates (displays the general subdivision area map with explanatory label).

## Validation evidence

- Ran `node --test frontend/tests/adminMediaLightbox.test.mjs frontend/tests/adminLiveAdapters.test.mjs`: all 28 tests pass.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`: 199 pass, 0 fail.
- Verified strict documentation audit via `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict`.
