# Adoption lifecycle stages fit without sideways scrolling

- **Date:** 2026-10-25 13:54 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/AdoptionStageStepper.tsx`, `frontend/tests/adoptionDetails.browser.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-25_1354_lifecycle-no-sideways-scroll.md`
- **Authorization:** User's follow-up request: “also i dont like the adoption lifecycle stages scroling in the sside,” in the context of the Barangay adoption details redesign.
- **Type:** Polish

## Intent

Remove sideways scrolling from the adoption details lifecycle at tablet and desktop widths as well as on phones. The preceding redesign used stage cards on phones but still displayed a minimum-width horizontal track on larger screens.

## Key changes

- The adoption details page's responsive lifecycle now uses wrapping stage cards at every width: two columns on phones, three from 640 px, and six from 1280 px.
- The horizontal track is not rendered for this responsive presentation.
- Completed/current/pending/rejected/cancelled presentation continues to use the existing stage calculations. No workflow, status transition, API, or database changes.
- Extended the existing browser regression to require all six lifecycle cards to be visible, their container to fit, and no horizontally scrolling lifecycle track at every tested width.

## Validation evidence

- `node frontend/tests/adoptionDetails.browser.mjs`: passed at 320, 375, 390, 430, 768, and 1280 px, including the new lifecycle checks and the existing assignment/certificate/navigation regressions. All APIs were mocked.
- `npm --prefix frontend run build`: TypeScript and Vite passed; existing large-bundle warnings remain.
- `git diff --check`: passed.
- Documentation audit command: `npx --yes @ghostbyte/agent-docs-kit@latest audit documentation --strict`.

Physical Android/device testing remains unverified. Next manual check: open Process & Assignments in `/brgy/adoptions` and confirm all six stages are readable without swiping sideways.
