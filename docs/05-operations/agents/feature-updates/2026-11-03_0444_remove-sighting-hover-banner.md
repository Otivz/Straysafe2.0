# Remove numbered-sighting hover banners

- **Date:** 2026-11-03 04:44 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/MapComponent.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0444_remove-sighting-hover-banner.md`
- **Authorization:** User reported that the hovered labels were unsuitable and supplied a screenshot of a clipped, uppercase sighting/location banner above a numbered pin.
- **Type:** Polish

## Intent

Keep report maps readable by removing the long hover banner from numbered neighbor-sighting pins, matching the tracking map's presentation.

## Key changes

- Exclude `Neighbor Sighting` markers from the generic hover tooltip.
- Preserve sighting numbers, colors, latest-submission rings, marker positions, and existing interactions. Other marker tooltip conditions remain unchanged.
- Preserve all pre-existing uncommitted sighting-map changes. No dependency, API, persistence, or configuration changes.

## Validation evidence

- `npm --prefix frontend run build`: TypeScript and Vite build passed; existing large-chunk warning remains.
- `node frontend/tests/locationIntelligence.browser.mjs`: passed at 1280 and 390 px, including matching report/tracking sighting numbers, colors, and rings, no horizontal overflow, and no uncaught browser errors. All API calls were mocked. This existing suite checks map regression behavior; it does not explicitly assert hover-banner absence.
- Source inspection confirms numbered neighbor sightings cannot enter the generic tooltip branch.
- `git diff --check`: passed.
- Required documentation validation: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
