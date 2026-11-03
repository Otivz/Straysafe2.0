# Case record printout: details left out, and a formal document layout

- **Date:** 2026-11-03 01:55 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/utils/casePrint.ts`, `frontend/src/utils/caseSummary.ts`, `frontend/src/components/History/CaseSummaryPanel.tsx`, `frontend/tests/historyCaseSummary.browser.mjs`, `docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0155_case-record-printout-redaction-and-layout.md`
- **Authorization:** the developer asked which details should not be in the history report PDF ("dont remove anything yet"). They then decided: owner and "Returned to" names stay, incident photos go, the pet photo stays. They finally answered "yes to all and make the layout in the pdf more formal and easy to understand".
- **Type:** Polish

## Intent

A printed or saved case record leaves StraySafe and can be passed on, so it should carry only what the barangay's file needs (data minimization under RA 10173). It should also read like a formal record.

## Key changes

- **Left out of the printout:**
  - comments;
  - dispute names, reasons and review notes (only the number, dates and status remain);
  - the observation's extension reason (the extension length remains);
  - the visibility section;
  - the AI photo check and the AI priority reason;
  - incident photos.
- **Kept:** owner and "Returned to" names, the pet's registered photo, and officials' remarks and notes.
- **New layout** (`casePrint.ts` now builds the document from the report instead of copying the on-screen panel):
  - a title block: report no., category, date reported, status, location;
  - numbered sections with ruled label/value tables, and warnings and disputes as tables;
  - "(AI suggestion)" notes on AI values;
  - a line listing what is not included, "Prepared by" and "Noted by" signature lines, and the privacy note;
  - the page header and footer ("Printed by name, role · date", "Page X of Y") on US Letter, as before.
- The audit-log call, the officials-only rule and the fallback when logging fails are unchanged.
- `CaseSummaryReport` gains `category_id` and `landmark` (for the title block) and drops `media` (no longer printed). The panel's print button passes the report; the panel no longer keeps a reference to its own DOM.
- The on-screen panel is unchanged. No backend change.

## Validation evidence

- `npx tsc -b` (frontend) and `npx eslint` on the changed source files passed.
- `node frontend/tests/historyCaseSummary.browser.mjs` passed. The print part (leader, staff with logging failing, admin) checks:
  - the title, record details, numbered sections, signature lines, printed-by and page rules;
  - that 13 kept items are present;
  - that comments, visibility, AI photo check, AI reason, incident photos, the extension reason, dispute names, reasons and notes, page controls and phone numbers are absent;
  - the PDF: US Letter, 2 pages, both for report 1 and for the long case.
- `node frontend/tests/caseSummary.browser.mjs` still passes.
- The generated PDF was read page by page.
- Not checked: a real printer, and printing from a phone or the Android app.
