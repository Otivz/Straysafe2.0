# Warning Templates Step 4: Rendering Consistency (Nothing Silently Dropped; Screen, PDF and DOCX Agree)

- **Date:** 2026-11-18 13:31 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/warning_letters.py`, `backend/tests/test_warning_rendering.py` (new), `backend/tests/fixtures/warning_letter_blocks.json` (new), `backend/tests/test_warning_draft_issue.py`, `frontend/src/components/warningLetterBlocks.ts` (new), `frontend/src/components/WarningLetterDocument.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/resident/pages/account/WarningLetterPage.tsx`, `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `frontend/tests/warningLetterBlocks.test.mjs` (new), `docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md`, `docs/README.md`
- **Authorization:** Developer: "step 4", under the approved plan: do not automatically remove legitimate lines such as "TO:" or "Issued by:"; the on-screen preview, DOCX and PDF must contain consistent information; issued letters must never change.
- **Type:** Fix

## Intent

Fix audit findings F-08 (the renderer silently dropped "TO:", "Address:", "Date Issued:", "Issued by:" and letterhead lines from the author's text) and F-09 (three renderers that disagreed). Also: the PDF ran a paragraph's lines together (for example "Date and time: … Place: …"), and an issued letter's office header followed the office's *current* details.

## Database changes

None (schema and data). Letters issued from now on carry `render_layout: "2"` inside their existing `placeholders_json` snapshot.

## Key changes

- **One layout rule set, used everywhere.** `body_blocks()` / `is_heading()` in the backend (used by the HTML, the PDF and the generated DOCX) and `bodyBlocks()` / `isHeading()` in `frontend/src/components/warningLetterBlocks.ts` (the screen). Both are tested against the same fixture file (`backend/tests/fixtures/warning_letter_blocks.json`).
  - Every line is kept, including line breaks.
  - A heading is a known section title, a short line ending in ":", or a short title-like line such as "Office Summons" (the standard templates' headings are included).
- **Nothing silently dropped.** Letters issued from now on, drafts and previews are shown exactly as written. The author's own "TO:", "Address:" and "Issued by:" lines appear in the HTML, the PDF and the DOCX.
- **Issued letters look exactly as before.** All three letters in the database store old header, "Date Issued", "TO:" and "Issued by:" lines in their text; those lines stay hidden for letters without the new layout marker (`is_legacy_layout`, API `legacy_layout`). Verified: the PDF and DOCX text of WARN-2026-0001, 0002 and 0003 are identical before and after this change (fingerprints compared against the last commit run in a temporary worktree, read-only).
- **The PDF keeps line breaks** within a paragraph, like the screen and the DOCX.
- **The office header is the one the letter was issued with.** Address, phone and email come from the letter's snapshot (blank stays blank); only a very old letter that never stored them falls back to the office's current details.
- **Editor:** the default body for a new template no longer contains the header, "TO:" and "Issued by:" lines (the letter prints its own). The body field explains what the letter prints by itself, and a note appears when the text repeats one of those lines, so a duplicate is visible, not hidden.

## Validation evidence

- New `tests/test_warning_rendering.py`: **26/26** (the five shared layout cases; a new letter keeps the author's TO/Address/Issued-by lines and separate summons lines in HTML, PDF and DOCX; the preview keeps them; an old letter is recognised and its old lines stay hidden in PDF and DOCX, stored text untouched; the office header stays as issued after the office details change, blank stays blank, only a very old letter falls back).
- New `frontend/tests/warningLetterBlocks.test.mjs`: **6/6** on the same fixture; `adminWarningTemplates.test.mjs` 4/4.
- Also passing: `test_warning_draft_issue` 32/32, `test_warning_required_validation` 41/41, `test_warning_template_seed` 40/40, `test_warning_template_selection` 28/28, `test_warning_letters_and_notifications` 31/31, `test_complaint_management` 67, `test_activity_timeline` 24/24, `test_trust_rule` 22/22, `test_under_observation_flow` 33/33, `test_admin_011_warnings`.
- `test_warning_draft_issue` had a timing flake in its own setup (two complaints within the same second); fixed by giving each test complaint a fixed incident time (4 runs in a row passed).
- Already failing before this work, unchanged: `test_case_lifecycle`, `test_owner_warning_rules`, `test_owner_observation_updates` (54/55), `test_case_notes_queue`.
- `npx tsc -p tsconfig.app.json --noEmit` passed. ESLint: only the existing `set-state-in-effect` errors in `WarningTemplatesPage.tsx` and the resident `WarningLetterPage.tsx` remain.

## Remaining issues

- A template imported from DOCX still downloads as the author's own Word layout, while the screen and PDF use the standard layout; formatting inside the DOCX output is Step 5.
- Old templates (for example the archived #1) still contain header/TO lines; any letter issued from such a template now shows them twice, and the editor note tells the Leader. No active template has them.
