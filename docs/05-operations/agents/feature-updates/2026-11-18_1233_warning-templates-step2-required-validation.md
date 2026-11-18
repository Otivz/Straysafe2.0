# Warning Templates Step 2: One Placeholder Registry and Required-Information Checks on Every Path

- **Date:** 2026-11-18 12:33 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/warning_letters.py`, `backend/app/routes/warning_letters.py`, `backend/app/routes/warnings.py`, `backend/app/services/complaints.py`, `backend/tests/test_warning_required_validation.py` (new), `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md`, `docs/README.md`
- **Authorization:** Developer approval in the Claude Code session ("yes" to continue with Step 2) of the plan confirmed earlier: required-information validation on all issuance paths, one official registry, unknown placeholders rejected, no silent blanks.
- **Type:** Fix

## Intent

Fix audit findings F-02 (a letter could be issued with required details blank or invented), F-03 (optional office details and typos blocked issuing) and D1 (no validation when a template is saved).

## Database changes

None. (Stored templates and versions are unchanged; the standard four use only supported placeholders.)

## Key changes

- **One official registry** (`PLACEHOLDER_DEFINITIONS`, 22 placeholders), each with a class that the editor, the DOCX import, the preview and issuing all use:
  - **required** (9, always needed, whether or not the template uses them): resident name, case reference, warning level, violation description, required action, policy reference, date issued, issued by, subdivision name.
  - **conditional** (6, needed when the template uses them): resident address, pet type, incident date, observation period, summons date, summons place.
  - **optional** (6, may be blank): pet name, issuer name, issuer role, office address, phone, email. The issuer and office fields were supplied by the system but missing from the old list, which made them count as required (F-03).
  - **system** (1): the warning reference, assigned when the letter is issued.
  A test checks that the registry equals exactly the set of values the system supplies.
- **Unknown placeholders are refused** when a template is created, edited or imported from DOCX (422, naming each unknown `{{key}}` and listing the valid ones). Hand-filled values can only fill registry keys, never the warning reference.
- **Every issuing path validates**, through one shared `validate_letter_ready()` that `create_generated_letter` always runs (the old `strict_required` flag, which applied only when a template id was sent, is removed). A missing needed value, or an old template that still contains an unsupported placeholder, gives 422 with a plain message and no letter is made.
- **Checked before anything is written.** The owner-warning route and the complaint *prepare* call the same check before they write the warning, follow-up, notice, summons or step, so a refusal leaves nothing half-made.
- **Nothing is invented.** The fallbacks "Subdivision Resident" (address) and "Animal" (pet type and name) are removed. The complaint module's display text "No address recorded" is treated as no address. A letter's address and pet type are stored empty when there are none; the optional pet name reads "your pet" or "your dog".
- **Preview:** a needed value that is missing shows as `[missing: Label]` in the letter, and the letter cannot be issued; optional blanks render as nothing.
- **2nd Warning in the owner flow (gap from the previous change record):** the summons lines are now conditional, so the dialog's missing-details list asks for the summons date and place, and the Leader fills them in before issuing.
- **Screens:** the "Supported placeholders" panel shows Always needed / Needed when used / Optional / Automatic. The dialogs show an unsupported placeholder as a message to fix in the template, not as an empty input.

## Validation evidence

- New `tests/test_warning_required_validation.py`: **41/41** (registry equals what the system supplies; classes; unknown placeholders refused on create, edit and DOCX import with nothing saved; optional, conditional and required rules; preview markers; direct calls to the generator refused with no letter made; old template with a typo refused; owner flow summons and address; hand-filled keys; complaint prepare refused without changing the step).
- Also passing: `test_warning_letters_and_notifications` 31/31, `test_warning_template_selection` 28/28, `test_warning_template_seed` 40/40, `test_complaint_management` 67, `test_activity_timeline` 24/24, `test_trust_rule` 22/22, `test_under_observation_flow` 33/33, `test_admin_011_warnings`.
- Already failing before this work, unchanged: `test_case_lifecycle` (IndexError), `test_owner_warning_rules` (`KeyError 'candidates'`), `test_owner_observation_updates` (54/55), `test_case_notes_queue`.
- Frontend: `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the changed dialogs and API file reported no problems.
- Not done: the dialogs were not opened in a browser; the real database was not touched.

## Remaining issues (later steps)

- The complaint dialog still lets "Save and print" be clicked when details are missing; the server refuses it with the reason (shown in the dialog). Disabling the button is polish.
- Complaint **Prepare** still creates the official letter and `WARN-` reference, re-preparing keeps the old letter, and the chosen letter date is ignored (Step 3).
- Rendering consistency (Step 4); DOCX output and input (Step 5); version uniqueness and schema docs (Step 6).
