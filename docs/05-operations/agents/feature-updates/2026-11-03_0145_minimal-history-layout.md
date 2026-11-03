# Minimal history report layout

- **Date:** 2026-11-03 01:45 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/components/History/HistoryReportLayout.tsx`, `frontend/src/components/History/CaseSummaryPanel.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`, `frontend/tests/historyCaseSummary.browser.mjs`, `frontend/tests/caseSummary.browser.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0145_minimal-history-layout.md`
- **Authorization:** User requested a more minimalist, easier-to-understand layout in `SubdViewHistory.tsx` and the other history screen while retaining the existing components.
- **Type:** Polish

## Intent

Make archived report details easier to scan and navigate using the existing report, summary, map, gallery, timeline, and print components.

## Key changes

- Subdivision and Barangay history details use a shared header and Summary, Report details, and Activity tabs. Tabs support arrow keys, Home, End, focus indicators, and labelled panels. Summary is selected when opening a report; inactive views are unmounted.
- Report details place the reporter, location, description, and evidence beside the existing map on wide screens and stack on phones. Evidence thumbnails are native buttons with accessible labels.
- Activity gives the existing timeline the available width, showing rescue metadata only when a rescue request exists. Removed repeated mission cards and the animated Live indicator on archived records.
- Removed the decorative Barangay mobile hero. Simplified card borders, padding, headings, labels, and letter layout.
- Shared case summaries use readable label/value rows, sentence-case headings, and light section dividers. Admin receives this shared presentation update and retains its existing management layout.
- Updated the browser checks for tab navigation and sentence-case badges. The print fallback check accepts the device date rather than requiring November 2, 2026.
- No API, database, dependency, authentication, or data-scope changes.

## Validation evidence

- `npm --prefix frontend run build`: passed TypeScript and Vite production build; existing large-chunk warning remains. Vite required execution outside the sandbox because local worker spawning was denied inside it.
- `node frontend/tests/historyCaseSummary.browser.mjs` with `HISTORY_TEST_URL=http://127.0.0.1:5174`: passed Subdivision, Barangay, and Admin at 1280 and 390 px; verifies keyboard navigation, report fields, timeline, contact-data exclusions, and no horizontal overflow. PDF checks passed for all three roles, including a failed print-log request with browser fallback. Application API responses, map services, and photos were mocked.
- Visually inspected mock-data screenshots of the phone summary and desktop report details.
- Targeted ESLint for `HistoryReportLayout.tsx` and `CaseSummaryPanel.tsx`: passed.
- `node frontend/tests/caseSummary.browser.mjs` with `CASE_SUMMARY_TEST_URL=http://127.0.0.1:5174`: did not complete; Chrome DevTools timed out on `Runtime.evaluate`. A diagnostic rerun reached optional case-event sections before the same timeout. This broader fixture suite is not recorded as passing.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`: passed the structural documentation audit.
- `git diff --check`: passed.

Browser checks use isolated profiles and synthetic records; no live backend or real sign-in was tested.
