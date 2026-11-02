# Visibility, comments and AI photo check on the history Case Summary (Phase 4)

- **Date:** 2026-11-02 14:12 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/History/CaseSummaryPanel.tsx`, `frontend/src/utils/caseSummary.ts`, `frontend/tests/fixtures/caseSummary.tsx`, `frontend/tests/caseSummary.browser.mjs`, `frontend/tests/historyCaseSummary.browser.mjs`, `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`, `docs/05-operations/agents/feature-updates/2026-11-02_1412_history-visibility-comments-ai-photo.md`
- **Authorization:** the developer's request "phase 4", following the plan in `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`.
- **Type:** Feature

## Intent

Complete the archived case record on the Subdivision and Barangay history pages with the privacy decision (who could see the report and why), the case discussion, and the AI's photo check (findings F12–F14).

## Key changes

- **Visibility** section:
  - What residents see (Public, Private or Hidden, using the app's existing `visibilityBadge` wording), with its explanation.
  - Who decided, when, and the reason.
  - Why the report isn't public, and whether it still needs a leader's review.
- **AI photo check** section: result, likelihood the photo was AI-made (as a percentage), recommendation, and short text details. Raw JSON is skipped. A "for reference only; officials decide" note is shown, and the section is hidden when the photo was never checked.
- **Comments** section, full width:
  - Read-only, oldest first, with author and date; replies at any depth are indented under their thread, and blank comments are skipped.
  - Shows "Comments are closed for this case" on a closed case or when comments are off, and "No comments on this report" when there are none.
- `utils/caseSummary.ts`: comment ordering (cycle-safe), likelihood formatting and details filtering.
- The Phase 3 pet thumbnail now hides itself if the photo fails to load, instead of showing a broken image.
- No backend change; every field already came from `GET /reports/{id}`.

## Validation evidence

- `npx tsc -b` (frontend) and `npx eslint` on the changed source files passed.
- `node frontend/tests/caseSummary.browser.mjs` passed at 1280 and 390 px. It checks:
  - visibility for a private report, a public report with a decision, and a hidden false alarm;
  - the AI check as authentic, uncertain, raw JSON not shown, and not checked;
  - four comments in thread order with nested replies, the blank comment skipped, and the closed note.
- `node frontend/tests/historyCaseSummary.browser.mjs` passed for `/subd/history/1` and `/brgy/history/1` at 1280 and 390 px: visibility, AI check and a comment shown; no browser errors.
- Screenshots of both pages, including the lower half of the panel, were reviewed. All API and image requests are mocked; no live data was read or changed.
- Not checked: the pages against the live backend with a real sign-in.
