# Subdivision Leader interactive prototype (preview)

- **Date:** 2026-11-11 15:51 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/leader-prototype.html`, `frontend/src/leader-prototype/main.tsx`, `frontend/src/leader-prototype/PrototypeApp.tsx`, `frontend/src/leader-prototype/Shell.tsx`, `frontend/src/leader-prototype/TodayPage.tsx`, `frontend/src/leader-prototype/CasesPage.tsx`, `frontend/src/leader-prototype/CasePage.tsx`, `frontend/src/leader-prototype/FlowDialog.tsx`, `frontend/src/leader-prototype/parts.tsx`, `frontend/src/leader-prototype/prototype.css`, `frontend/src/leader-prototype/playbook.ts`, `frontend/src/leader-prototype/flows.ts`, `frontend/src/leader-prototype/demo.ts`, `frontend/src/leader-prototype/sampleData.ts`, `frontend/src/leader-prototype/reducer.ts`, `frontend/src/leader-prototype/PrototypeProvider.tsx`, `frontend/src/leader-prototype/prototypeContext.ts`, `frontend/src/leader-prototype/useBoard.ts`, `frontend/src/leader-prototype/kinds.ts`, `frontend/src/leader-prototype/scenarios.ts`, `frontend/src/leader-prototype/types.ts`, `frontend/src/leader-prototype/util.ts`, `frontend/tests/leaderPrototype.test.mjs`, `docs/06-future-proposals/LEADER_INTERACTIVE_PROTOTYPE_2026-11-11.md`, `docs/04-testing/README.md`, `docs/README.md` (all new except the last two, which gained index rows)
- **Authorization:** The developer's request "StraySafe 2.0 — Subdivision Leader Interactive Prototype" (2026-11-11): build a working, development-only frontend prototype of the proposed Leader experience, keep it out of the production workflow, then stop and wait for feedback.
- **Type:** Feature (preview only; not part of the product build)

## Intent

Let the developer judge the proposed Subdivision Leader experience by using it, before any production work. The prototype tests one idea: a Leader should never maintain a status, a priority or an assessment. Each case is in one stage; the stage and the clock say whose move it is; the Leader sees the one thing to do next and what happens after it; waits come back by themselves.

The request set hard boundaries, all kept: a preview, not a production implementation; the existing Leader screens are not replaced or overwritten; reachable only through a separate development-only route; sample data and simulated interactions only; no change to backend behaviour, database schemas, migrations or case lifecycle rules; nothing written to the real database; the Resident experience untouched; no commit or push; no unrelated refactoring; the database was not rebuilt or reset.

## Key changes

- A separate dev-only page, `frontend/leader-prototype.html`, with its own hash router (`/leader-prototype.html#/today`). `vite build` bundles `index.html` only, so it never ships. No existing file was edited to wire it in: `vite.config.ts`, `index.html`, `package.json`, `src/main.tsx` and everything under `src/admin`, `src/resident` and `src/preview` are unchanged.
- Three screens (Today, Cases, Case details) and guided steps for lost pet, found animal, animal complaint and injured or dangerous animal cases, on 17 invented sample cases (new, requiring attention, waiting, resolved, closed). Buttons, menus and dialogs do what the real ones would: they move the case along, open the right follow-up and enforce the product's rules where the Leader acts (registry match is only a lead; only the owner's confirmation is a recovery; "asked" is not "help is coming"; a formal warning needs a verified incident, a known owner and a first reminder; closing without a resolution is explicit and never shown as resolved).
- Simulation only: an in-memory store (also kept in this tab's `sessionStorage`), a demo clock, and a "Preview only" panel on each case that stands in for the outside world. Nothing calls a server; the page made no `/api/` requests in the browser runs.
- Reuse without change: `src/admin/components` (`Button`, `Badge`, `Dialog`, `Menu`, `Timeline`, `ToastProvider`, `toast`, `form`, `layout`), `src/admin/styles/ui.css` and `pages.css`, `src/preview/styles/tokens.css`, `src/preview/lib`, `src/index.css`. The prototype's own styles are in `prototype.css`, all prefixed `lp-`. It imports nothing that signs in or talks to a server, and a test checks that nothing in the product imports it.
- `frontend/tests/leaderPrototype.test.mjs`: 13 logic and isolation tests, loaded through Vite like the other frontend unit tests.
- `docs/06-future-proposals/LEADER_INTERACTIVE_PROTOTYPE_2026-11-11.md`: how to open it, the scenarios, the rules, how the simulation works, the limits. Index rows added to `docs/README.md` and `docs/04-testing/README.md` (a separate row; the older "8 files" frontend-unit row, already behind the real count, was left as it was).

Not done, on purpose: no production integration, no backend or database change, no migration of the existing Leader screens, no commit or push. Those wait for the developer's explicit approval of the prototype.

## Validation evidence

Run from `frontend/` (PowerShell) on 2026-11-11:

- `npx tsc -b`: exit 0. `npx vite build --outDir <scratch folder> --emptyOutDir`: built; the output has no `leader-prototype` file, and a search of every built file for `leader-prototype`, `Preview menu`, `lp-step` and `Interactive prototype` found nothing.
- `npx eslint src/leader-prototype`: no problems. `npx eslint .`: 11 errors, all in files this change did not touch (`src/main.tsx`, `src/utils/api.ts`, `src/utils/cloudinaryUpload.ts`, `src/utils/geolocationDefaults.ts`).
- `node --test tests/leaderPrototype.test.mjs`: 13 passed, 0 failed.
- Headless Chrome through the project's `tests/_liveHarness.mjs`, against `npx vite --port 5197` (stopped afterwards; the driver scripts were throwaway and are not in the repository): 15 click-through scenarios across all four kinds, 15/15 passed, including the rules that keep a button off (registry-only handover, warning before a reminder, handover without the owner's in-person confirmation, closing without the Barangay's confirmation) and skipping ahead in time. No console errors, no uncaught exceptions, no `/api/` request (the only non-local request is the Google Fonts stylesheet, as in the product's `index.html`).
- Layout at 1280, 1100, 768 and 390 px wide, checked with screenshots and a horizontal-overflow measurement: no overflow. A structural accessibility pass over every screen and dialog (names, labels, headings, duplicate ids, dialog titles, Escape to close, focus order): no problems found.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` (from the repository root): 12 failures, the same 12 as before this change (8 broken links in `docs/01-system/overview.md` and `docs/README.md` to files that no longer exist, and 4 missing agent pointer files). None involves the new document, this record or the index rows.
- `git status` after the work: only the files listed above are new or changed by this change. The other modified files in the working tree were already modified before it.

Not verified: real phones, other browsers, screen readers, contrast beyond the existing design tokens, and stakeholder review of the wording and of the sample waits (30 minutes, 2, 3 and 7 days).
