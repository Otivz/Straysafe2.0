# Warning Templates Step 1: Explicit, Compatible Template Selection

- **Date:** 2026-11-18 11:42 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/warning_letters.py`, `backend/app/routes/warning_letters.py`, `backend/app/routes/warnings.py`, `backend/app/schemas/warning.py`, `backend/app/services/complaints.py`, `backend/tests/test_warning_template_selection.py` (new), `backend/tests/_case_helpers.py`, `backend/tests/test_activity_timeline.py`, `backend/tests/test_case_lifecycle.py`, `backend/tests/test_complaint_management.py`, `backend/tests/test_owner_observation_updates.py`, `backend/tests/test_owner_warning_rules.py`, `backend/tests/test_trust_rule.py`, `backend/tests/test_under_observation_flow.py`, `frontend/src/admin/lib/warningTemplates.ts` (new), `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/tests/adminWarningTemplates.test.mjs` (new), `docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md`, `docs/README.md`
- **Authorization:** Developer approval in the Claude Code session ("Confirmed. Proceed with the implementation … Start with Step 1: Template compatibility and explicit selection. Do not implement all steps simultaneously."), with the decisions: the Leader always chooses; `is_default` is only a Suggested indicator; drafts stay out of `generated_warning_letters` (later step).
- **Type:** Fix

## Intent

Fix audit findings F-01 (wrong template for a level, silent automatic choice), F-04 (the "All warning levels" setting and description clearing not saved) and D2 (unvalidated levels).

## Key changes

- **Levels:** `normalize_warning_level()` accepts only the four tiers (`Notice`, `1st Warning`, `2nd Warning`, `Final Notice / Escalation`) or empty, which means universal. An unknown level gives 422 on create, update and DOCX import.
- **Editor save (F-04):** `update_template` uses `model_fields_set`. A level or description sent as `null` or `""` clears it (universal or no description); a field not sent stays unchanged. The frontend already sends `null`, so no editor change was needed.
- **Selection rules (F-01):** `resolve_template_for_issuance` has no automatic choice any more.
  - A missing `template_id` gives 422 ("Choose a warning letter template for this letter.").
  - An archived template gives 409; a template from another subdivision gives 404.
  - A template for a different level gives 409 ("Template 'X' is for 2nd Warning letters…").
  - A universal template fits every level. The old fallbacks (default for the level, then the general default, then any template) are removed.
- **Both issuing paths check before writing anything:** the owner warning (`routes/warnings.py`, right after the policy check) and preparing a complaint letter (`services/complaints.py`, before the summons is scheduled). A refusal leaves no warning row, no letter and the step still waiting to be prepared.
- **Frontend:**
  - The owner-warning dialog and the complaint prepare dialog no longer preselect a template. Both show a required **Letter template** picker that lists only active templates for the letter's level or all levels.
  - Each option shows its level, and the default only as "· Suggested".
  - A template that no longer fits after the level changes (by hand or by the suggested tier) counts as not chosen.
  - The complaint dialog had no picker at all before; it now has one for both letter sources, and its first option reads "Use a letter template".
  - Shared rules live in `src/admin/lib/warningTemplates.ts`.
- **Tests that issue warnings as setup** now choose the subdivision's universal template, through a new helper `universal_template_id()` in `tests/_case_helpers.py`, and include the template routes in their small test apps.

## Database changes

None.

## Validation evidence

- **New `tests/test_warning_template_selection.py`:** 28/28 checks passed. It covers levels, editor clearing, every resolution rule, both issuing paths refusing with nothing written, and universal templates working.
- **Existing tests:**
  - `test_warning_letters_and_notifications` 29/29
  - `test_complaint_management` 67
  - `test_activity_timeline` 24/24
  - `test_trust_rule` 22/22
  - `test_under_observation_flow` 33/33
  - `test_admin_011_warnings` passed
- **Already failing before this change, same failures after:**
  - `test_case_lifecycle` (IndexError), `test_owner_observation_updates` (54/55, a Barangay-staff read check) and `test_owner_warning_rules` (`KeyError 'candidates'`, Barangay-staff checks). These three were compared line by line, with identical failure lists and pass counts, against the last commit run in a temporary git worktree.
  - `test_case_notes_queue` (a thumbnail check, same message as its baseline run).
- **Frontend:** new `tests/adminWarningTemplates.test.mjs` 4/4 (`node --test`). `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the three changed frontend files reported no problems.
- **Not done:** the dialogs were not opened in a browser against the backend.

## Remaining issues (later steps)

- Required details are still enforced only through the explicit-template path (`strict_required`), and the invented address and pet fallbacks remain (Step 2, F-02, F-03).
- The complaint **Prepare** still creates the `generated_warning_letters` row and its `WARN-` reference; re-preparing keeps the old letter; the letter date is ignored (Step 3).
- DOCX formatting and swallowed errors (F-05), renderer trimming (F-08, F-09), the unique version constraint (D4).
- `POST /warning-templates/preview` now needs a `template_id` (or a version or subject and body). The template page's preview always sends one.
