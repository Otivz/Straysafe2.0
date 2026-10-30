# Restore Phase 1 incident maps while retaining adoption

- **Date:** 2026-10-30 13:37 (UTC)
- **AI tool:** Codex
- **Files changed:** `frontend/src/utils/heatmap.ts`, `frontend/src/components/MapComponent.tsx`, `frontend/src/pages/Admin/AdminHeatMap.tsx`, `frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/tests/heatmapRules.test.mjs`, `frontend/tests/phase1Maps.browser.mjs`, `frontend/tests/fixtures/phase1Maps.html`, `frontend/tests/fixtures/phase1Maps.tsx`, `docs/01-system/HEATMAP_RULES.md`, `docs/04-testing/README.md`, `docs/06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-30_1337_phase-1-incident-maps.md`
- **Authorization:** The developer asked "can you do phase 1?", referring to the restoration implementation checklist, after requiring adoption to remain and black primary actions to be orange.
- **Type:** Fix

## Intent

Restore Phase 1 heatmap and map behavior from `3bbb263` on branch `fix` at `30c5205`, preserving the earlier orange-button changes and existing adoption functionality. No branch, database, environment, dependency or deployment changes were performed.

## Key changes

- Selected only Phase 1 source hunks; left unrelated holding/owner-follow-up changes for their own phases. Centralized active/closed incident rules against the existing backend list, including Picked Up as active and existing adoption-related terminal outcomes as closed.
- Heat uses original sightings and valid root incidents, excluding merged/invalid records, split children and repeated API rows. Legacy relocated animals without original coordinates do not contribute fabricated heat points.
- Restored Admin dates, resolved-pin/lost-pet controls, real spatial hotspots, density labels and click-to-center. Added inclusive Manila custom-date boundaries and rejected reversed/invalid/future ranges. New actionable hotspot controls retain orange styling.
- Restored Subdivision historical heat with its priority filter. Barangay maps use actionable pins; removed obsolete heat toggles and misleading density-monitor wording. Corrected status fallbacks/marker handling so picked-up cases stay visible and are not labelled resolved.
- Removed dashboard click coordinates/markers, report-pin hover labels and the selection ring while keeping cards, actual location pickers, route/live markers, landmarks and holding hover cards.
- Hid resident report directions for public-only viewers in inline and expanded views, retaining owner/adopter participant directions. This is a UI change; existing server authorization remains responsible for access.
- Added focused unit and isolated real-page browser fixtures, current map rules and testing instructions. Checked all Phase 1 items with the evidence below; later restoration phases remain pending.

## Validation evidence

- `node frontend/tests/heatmapRules.test.mjs`: 16/16 passed, covering backend closure alignment, weights/origins, dates, hotspot thresholds and duplicate/split/adoption-related outcomes.
- `node frontend/tests/originalSighting.test.mjs`: 9/9 passed.
- From `frontend`: `node node_modules/eslint/bin/eslint.js src/utils/heatmap.ts tests/fixtures/phase1Maps.tsx`: passed. This is scoped lint, not a claim that all older files are lint-clean.
- `npm --prefix frontend run build`: passed (2,142 modules); the existing large-chunk warning remains. Build helpers ran under the previously established sandbox escalation needed by Vite.
- `node frontend/tests/phase1Maps.browser.mjs`: 14/14 scenarios passed at 390 and 1280 px. Covers real Admin/Subdivision/Barangay/resident pages with synthetic adapters: heat origins/counts, resolved/lost/category filters, hotspot zoom, empty data, pin cards and dismissal, expanded maps, absence of selection markers/rings and public/owner/adopter directions. Zero backend requests; external requests blocked. Initial harness summary/selector assertions were corrected before the final passing run.
- `git diff --check`: passed. Existing source line-ending convention retained on the five restored page/map files.
- Cached documentation-kit 1.3.8 `audit documentation --strict`: still fails only on the pre-existing `docs/README.md` link to missing `STRAYSAFEEE1_SYSTEM_ALIGNMENT_2026-10-26.md`. The exact latest-package command was unavailable from npm's offline cache earlier in this session; the cached CLI is the documented fallback.
- Not exercised: native Android/GPS, external map tiles/routing, live database data, or a full end-to-end adoption workflow. Adoption code was retained, its closure behavior is covered by unit tests and adopter directions by browser checks.
