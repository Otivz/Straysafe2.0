# Warning Templates Step 5: Word (DOCX) Output and Import

- **Date:** 2026-11-18 13:39 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/warning_letters.py`, `backend/app/routes/warning_letters.py`, `backend/tests/test_warning_docx.py` (new), `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md`, `docs/README.md`
- **Authorization:** Developer: "yeah" to Step 5 with the recommendations: refuse imports with DOCTYPE/ENTITY or oversized content; refuse a download that would still contain an unfilled `{{placeholder}}`; show import notes.
- **Type:** Fix

## Intent

Fix audit findings F-05 (DOCX formatting lost, line breaks lost, errors swallowed) and E1/E2 (import flattened the document; unsafe XML and unbounded unpacking).

## A more serious problem found and fixed

The old code rewrote each Word XML part with Python's ElementTree. That renames namespace prefixes and drops declarations it thinks are unused. Real Word files depend on them: `mc:Ignorable="w14 wp14 …"` names prefixes that must stay declared. Every DOCX downloaded from a template imported from a real Word file was therefore produced with broken namespaces, the kind of damage Word reports as "unreadable content". Checked read-only on the real Word file stored for template #7: the old code would keep 9 of its 38 namespace declarations and break `mc:Ignorable`; the new code keeps all 38 and leaves the markup unchanged. The earlier tests missed this because they used hand-built files without these namespaces.

## Database changes

None. Stored templates, versions and issued letters are unchanged.

## Key changes

- **Filling placeholders edits only the text inside `<w:t>`, in place.** The XML is never re-serialised, so every other byte of the Word file (namespaces, styles, tables, pictures, sections) stays exactly as Word wrote it.
  - A placeholder Word split across runs is joined, and its value goes into the run where it starts. Each run keeps its own formatting (a bold "Dear " stays bold; the name is not).
  - A value with line breaks becomes real `<w:br/>` line breaks, and `&`, `<` and `>` are escaped.
  - Body, tables, headers, footers, footnotes and endnotes are filled.
- **Nothing is swallowed.** A part that cannot be filled gives a 500 with the reason instead of a half-filled file. A file that would still contain an unfilled `{{placeholder}}` (for example an old template with a key the system does not supply) is refused with 422, naming it and pointing to the PDF.
- **Import safety** (`_read_docx_parts`, also applied again to a stored file before a letter is made from it): it must be a real ZIP, with at most 2,000 entries. Each part is read with a hard 20 MB limit and the total with 60 MB, so a zip bomb cannot exhaust memory. Any DOCTYPE or ENTITY declaration, in any part, is refused with a plain message.
- **Import reads the structure.**
  - The body comes from `document.xml` in reading order, with a table as one "cell | cell" line per row and content controls followed.
  - The header and footer are kept apart: the Word download keeps them, and the screen and PDF use the standard letterhead. Their placeholders are still detected and validated, so an unsupported one in the header is refused by name.
  - The import answer carries `import_notes`: where the subject came from, and whether the file has tables, pictures or header/footer text that the on-screen preview and PDF do not show.
- **Screen:** after "Import DOCX" or "Replace from DOCX", the templates page shows those notes in a dismissible box.

## Validation evidence

- New `tests/test_warning_docx.py`: **28/28**. It covers:
  - The markup outside the text is byte-for-byte unchanged; namespaces and `mc:Ignorable` are kept.
  - Bold and italic runs keep their formatting, split placeholders are filled, and line breaks and `&` come out right.
  - Table, header and footer are filled; pictures and styles are byte-identical; every part is still present and well-formed.
  - An unfilled placeholder gives 422; a damaged part gives 500.
  - DOCTYPE and ENTITY declarations (also in another part), an oversized part, too many parts and a non-ZIP file are refused.
  - The header and footer are kept apart, but their placeholders are known; tables become row lines.
  - The notes reach the screen, the original file is stored as uploaded, and an unsupported header placeholder is refused with nothing imported.
- Real file, read-only: template #7's Word file passes the new import checks; filling it keeps the markup and all 38 namespace declarations (the old code would keep 9).
- Also passing: `test_warning_rendering` 26/26, `test_warning_draft_issue` 32/32, `test_warning_required_validation` 41/41, `test_warning_template_seed` 40/40, `test_warning_template_selection` 28/28, `test_warning_letters_and_notifications` 31/31 (including the existing split-run DOCX check), `test_complaint_management` 67, `test_activity_timeline` 24/24, `test_trust_rule` 22/22, `test_under_observation_flow` 33/33, `test_admin_011_warnings`; frontend 10/10.
- Already failing before this work, unchanged: `test_case_lifecycle`, `test_owner_warning_rules`, `test_owner_observation_updates` (54/55), `test_case_notes_queue`.
- `npx tsc -p tsconfig.app.json --noEmit` passed. ESLint: only the existing `set-state-in-effect` error in `WarningTemplatesPage.tsx`.
- Not done: a generated file was not opened in Microsoft Word itself. The well-formedness and namespace checks are what Word's "unreadable content" check depends on, but Word was not run.

## Remaining issues

- The fill assumes Word's standard `w:` prefix for the main namespace (Word always writes it). A file with an unusual prefix would not have its placeholders filled, and is then refused at download (422) rather than produced wrong.
- Text in text boxes, footnotes and endnotes is filled in the download but not shown in the import preview.
- Version uniqueness and schema docs (Step 6); remaining permissions and wording (Step 7).
