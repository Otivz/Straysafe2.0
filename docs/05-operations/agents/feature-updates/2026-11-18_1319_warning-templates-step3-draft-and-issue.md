# Warning Templates Step 3: Draft and Issue Separated; Letter Date Used; Prints Match the Letter

- **Date:** 2026-11-18 13:19 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/complaints.py`, `backend/app/routes/complaints.py`, `backend/app/services/warning_letters.py`, `backend/tests/test_warning_draft_issue.py` (new), `frontend/src/components/WarningLetterDocument.tsx`, `frontend/src/components/printWarningLetter.ts` (new), `frontend/src/styles/warningLetter.css`, `frontend/src/admin/complaints/api.ts`, `frontend/src/admin/complaints/letter.ts` (deleted with `git rm`), `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `docs/01-system/COMPLAINT_MANAGEMENT.md`, `docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md`, `docs/README.md`
- **Authorization:** Developer: "Step 3", under the decisions confirmed earlier: drafts stay in the step's `details`, the `generated_warning_letters` record is made only at official issue (same separation for owner warnings); a prepared draft may be printed but every page says "DRAFT — NOT OFFICIALLY ISSUED", with no official reference, no notification and nothing in the official warning history.
- **Type:** Fix

## Intent

The complaint flow made the official letter (record, `WARN-` reference, frozen text) when the Leader *prepared* it; preparing again kept the old letter; the chosen letter date was ignored. It also printed a different, hardcoded letter.

## Database changes

None (schema and data). The real database has no complaint letter that was prepared but not issued (all three are issued or delivered), so nothing needed migrating.

## Key changes

- **Prepare = draft only.** The Leader's choices (template, required action, hand-filled details, letter date, summons) are saved on the step and checked (template fits the level, supported placeholders, every needed value). No letter record, no warning reference, no notice, nothing in the warning history. Preparing again replaces the draft entirely, so nothing stale is carried over.
- **Issue = the one official letter.** The record is made from the latest draft with its official reference and frozen snapshot, dated with the **letter date the Leader chose** (`create_generated_letter(letter_date=…)`; the issued time stays the real time). The resident is then notified once. If the template was archived since preparing, issuing is refused (409) and nothing changes.
- **Earlier rules:** a step prepared before this change that already has a letter record is issued with that record, never a second one.
- **New `GET /complaints/{report_id}/steps/{step_id}/draft`:** renders a prepared letter's draft from the saved draft and the template's current version. It has no reference, writes nothing and sends nothing; a needed value that went missing shows as `[missing: …]`. It answers 409 for a letter that is not prepared, or is already issued.
- **One builder** (`_letter_args`) reads what a complaint letter is made from in the same way for prepare (check), draft and issue.
- **Printing matches the letter.** The complaint flow used to print a separate letter built in the browser (`complaints/letter.ts`, with fixed wording that mentioned a fine and a Barangay meeting) instead of the template letter, even after the official letter existed. It is removed. `printWarningLetter()` prints the same A4 `WarningLetterDocument` shown on screen, with the page's own styles:
  - **Prepared:** the dialog shows and prints the **draft**. It has a red banner on page 1 and a "DRAFT — NOT OFFICIALLY ISSUED" watermark that repeats on every printed page (verified by printing a two-page draft to PDF in headless Chrome). It shows no warning reference ("None (draft)") and offers no download.
  - **Issued:** the dialog shows and prints the frozen official letter, with its PDF and DOCX downloads.
  - "Save and print" is now "Save and print draft". The step button reads "View / print draft" before issuing.
- **Owner warning flow:** already separated (the preview makes no record; issue makes the letter and notifies). Its preview, and the template page's preview, now show the same draft marking.

## Validation evidence

- New `tests/test_warning_draft_issue.py`: **32/32**. It covers:
  - Prepare makes no record, reference, notice or history.
  - The draft is readable, dated with the letter date, writes nothing, and answers 409 when not prepared.
  - Re-preparing replaces the draft.
  - Issue makes exactly one letter, with its reference on the step, the latest letter date, the latest content and the real issued time; it notifies once and appears in the history.
  - Issuing after the template was archived is refused and changes nothing.
  - Letter 2's summons appears in the draft and in the issued letter, with its own date.
  - A legacy prepared step is issued without a second record.
- Also passing: `test_warning_required_validation` 41/41, `test_warning_template_seed` 40/40, `test_warning_template_selection` 28/28, `test_warning_letters_and_notifications` 31/31, `test_complaint_management` 67, `test_activity_timeline` 24/24, `test_trust_rule` 22/22, `test_under_observation_flow` 33/33, `test_admin_011_warnings`, frontend `adminWarningTemplates.test.mjs` 4/4.
- Already failing before this work, unchanged: `test_case_lifecycle`, `test_owner_warning_rules`, `test_owner_observation_updates` (54/55), `test_case_notes_queue`.
- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the changed frontend files reported no problems.
- Not done: the dialogs were not used end to end in a browser against the backend (the draft rendering and its print output were checked in headless Chrome).

## Remaining issues

- **Complaint module (not changed here):** a complaint can record "separate from" only one earlier complaint. With several look-alike complaints, the same-occurrence question can alternate between two of them. Found while writing the test; the test uses complaints at different places.
- Printing opens a new window after the save finishes; a strict pop-up blocker may block it (the Leader is told, and can print the draft from the step).
- Rendering consistency between the on-screen letter, PDF and DOCX (Step 4); DOCX output (Step 5); version uniqueness and schema docs (Step 6).
