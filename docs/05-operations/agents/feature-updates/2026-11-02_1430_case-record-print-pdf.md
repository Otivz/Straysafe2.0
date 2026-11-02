# Print / Save as PDF of the case record, with an audit entry (Phase 6)

- **Date:** 2026-11-02 14:30 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/reports.py`, `backend/tests/test_report_print_log.py`, `frontend/src/utils/casePrint.ts`, `frontend/src/utils/caseSummary.ts`, `frontend/src/components/History/CaseSummaryPanel.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/tests/historyCaseSummary.browser.mjs`, `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`, `docs/05-operations/agents/feature-updates/2026-11-02_1430_case-record-print-pdf.md`
- **Authorization:** the developer's request "Phase 6: Print and PDF for barangay records". The developer earlier answered "yes" to printing being in scope, and the audit-log entry was recommended and recorded as a yes in the plan (`docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`).
- **Type:** Feature

## Intent

Let officials keep a paper or PDF copy of a case record for the barangay's files, laid out on US Letter paper, containing only what they may see, and leave a trail of who exported which record.

## Key changes

- **Backend:** new `POST /reports/{report_id}/print-log`.
  - Officials only (roles 2–4) and the same visibility check as viewing the report. Residents get 403; reports they may not see get 404.
  - It writes one `audit_logs` entry: action `EXPORT_CASE_RECORD`, type `security`, with the actor, the report and a description.
  - It returns the official's name, role and the database time. Nothing is written when a request is refused. No new table.
- **Frontend:** `utils/casePrint.ts` (`printCaseRecord`) asks for the print log first. If that fails, it still prints, using the name stored in the browser. It then prints through the existing `printHtml` hidden frame:
  - US Letter portrait, with a header and footer on every page through `@page` margin boxes (StraySafe · Barangay; case record and report number; "Printed by name (role) · date"; "Page X of Y");
  - a title block, a copy of the on-screen Case Summary (buttons removed), up to 4 of the report's own photos, and a Data Privacy Act note;
  - sections, comments and disputes kept whole across page breaks.
- `CaseSummaryPanel`: new `printable` prop adds a "Print / Save as PDF" button, which is never itself printed. All three pages (subdivision and barangay history, admin incident) turn it on.
- Two fixes found while testing the printout:
  - images in the print copy are loaded eagerly, because the lazy pet thumbnail never loads in the hidden frame and the print would wait forever;
  - the printout sets the app's `--bg-main` color to white, because the app's layered `!important` body background tinted the pages gray.

## Validation evidence

- `backend/tests/test_report_print_log.py`: 18/18 passed. It covers:
  - leader, staff and admin each get exactly one entry naming actor, report, action and type, plus the footer data;
  - a resident (the reporter) gets 403, an unknown report 404, and an anonymous request is refused, with no entry written in any of these cases;
  - another subdivision's leader gets the same answer as when viewing the report.
- `npx tsc -b` (frontend) and `npx eslint` on the changed source files passed.
- `node frontend/tests/historyCaseSummary.browser.mjs` passed. Its print part:
  - clicks the button as leader (long case: 36 comments, 5 photos), as staff with the print log returning 500, and as admin;
  - checks the printout: one log request, printed-by from the server (or the browser fallback when the log fails), Letter page rule, page counter, no button, sidebar, admin actions or map, no phone numbers, 4 photos with the evidence attachment left out, and the privacy note;
  - renders the printout with Chrome's print engine: all pages 612 × 792 pt; report 1 on 2 pages, the long case on 5.
- The generated PDFs were reviewed page by page: no blank pages, no split comments, white background.
- `node frontend/tests/caseSummary.browser.mjs` still passes.
- Not checked: printing on a real printer, printing from a phone or the Android app, and the endpoint against the live MySQL database.
