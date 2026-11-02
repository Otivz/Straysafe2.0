# Case events on the history Case Summary panel (Phase 3)

- **Date:** 2026-11-02 13:54 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/History/CaseSummaryPanel.tsx`, `frontend/src/utils/caseSummary.ts`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`, `frontend/tests/fixtures/caseSummary.tsx`, `frontend/tests/caseSummary.browser.mjs`, `frontend/tests/historyCaseSummary.browser.mjs`, `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`, `docs/05-operations/agents/feature-updates/2026-11-02_1354_history-case-events.md`
- **Authorization:** the developer's request "phase 3", following the plan in `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`.
- **Type:** Feature

## Intent

Show the events of a case on the Subdivision and Barangay history pages: behavior an official found, the owner observation, warnings, the matched pet and its return to the owner, disputes, and merged or split reports (findings F4–F11).

## Key changes

- `CaseSummaryPanel`: six new sections, each hidden when empty:
  - **Behavior found:** verified flags and the finding text.
  - **Owner observation:** status, due or end date, extended.
  - **Warnings to the owner:** count, then the latest one's level, type, date, issuer and status.
  - **Pet and owner:** pet, breed, owner, who confirmed the match; returned to, when, how, and who confirmed the reunion.
  - **Disputes:** one card per dispute, with status, filer, pet, reason, reviewer and notes.
  - **Merged and split reports:** merged into, merged by and notes; merged reports; split from; number of animal records.
- The panel shows names only. Owner phone numbers, emails and addresses in the API data are never displayed.
- New optional `reportHref` prop: merged and split report numbers link to the same role's history page. The two history pages pass `/subd/history/:id` and `/brgy/history/:id`.
- `utils/caseSummary.ts`: types for the event data and small helpers (behaviors found, observation status names, linked pet, return method, reunion confirmer).
- Tests: the panel fixture adds an every-event case and a merged-and-split case; the page test adds report 1's observation, warning and pet and checks the merged-report link per role. Mock times now match what the API sends (history and warnings in database local time, the observation in UTC), and both tests pin the browser to Asia/Manila.
- No backend change. A backend time-zone bug was found and recorded as F18 in the plan, not fixed: the warning-path observation due date is stored in local time but sent as UTC, so it shows 8 hours late.

## Validation evidence

- `npx tsc -b` (frontend) passed; `npx eslint` on the panel, utilities and fixture passed.
- `node frontend/tests/caseSummary.browser.mjs` passed at 1280 and 390 px: every section's text, both disputes, merged and split links (`/subd/history/5`, `/4`, `/6`, `/7`), no phone or address shown, layout, no browser errors.
- `node frontend/tests/historyCaseSummary.browser.mjs` passed at 1280 and 390 px for `/subd/history/1` and `/brgy/history/1`: observation, warning and pet shown; closing and observation times agree; merged report links to `/subd/history/3` and `/brgy/history/3`; no owner phone; no browser errors. API, address lookup and map tiles mocked; no live data read or changed by the tests.
- Report 1's real follow-up and history times were read (read-only) to confirm the times the API sends.
- Not checked: the pages against the live backend with a real sign-in.
