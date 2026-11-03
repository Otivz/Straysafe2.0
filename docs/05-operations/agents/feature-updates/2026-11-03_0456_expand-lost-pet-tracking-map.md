# Expand the lost-pet tracking map

- **Date:** 2026-11-03 04:56 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/LostPets/LostPetTrackingMap.tsx`, `frontend/tests/lostPets.browser.mjs`, `docs/01-system/LOST_PET_SIGHTING_PING.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0456_expand-lost-pet-tracking-map.md`
- **Authorization:** User requested an expanding map on `/resident/lost-pets/1`.
- **Type:** Feature

## Intent

Let residents enlarge the tracking map to inspect sightings on phones and desktop screens.

## Key changes

- Add an Expand map control to the shared lost-pet map.
- Open a native modal dialog in the browser's top layer, filling the viewport above navigation and other page content. Reuse the existing map content, markers, popups, and resize component.
- Remember the map center and zoom across expansion and closing. Enable mouse-wheel zoom in the expanded view.
- Provide Close and Escape, native modal focus containment, focus restoration to the expand control, and background scroll locking/restoration.
- Update the current-state map documentation and extend the existing mocked browser scenarios.
- Preserve prior uncommitted sighting work. No dependencies, API, database, or environment changes.

## Validation evidence

- `npm --prefix frontend run build`: TypeScript and production Vite build passed; existing large-chunk warning remains.
- `node frontend/node_modules/eslint/bin/eslint.js frontend/src/components/LostPets/LostPetTrackingMap.tsx` (executed from `frontend/` with relative paths): passed without warnings.
- `LOST_PETS_TEST_URL=http://127.0.0.1:5173 node frontend/tests/lostPets.browser.mjs`: 12 scenarios passed at 390 and 1280 px with zero backend requests. Added checks cover full-viewport map size, preserved pins, sighting popups, Close, Escape, restored inline map, scroll restoration, and keyboard focus restoration. Existing sighting submission and leader workflows also passed.
- `git diff --check`: passed.
- Required structural documentation validation: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.

Browser validation used synthetic fixtures, not live resident data. Native Android/WebView was not tested.
