# Four Standard Warning Templates per Subdivision, and Cleanup of the Old Seeded Ones

- **Date:** 2026-11-18 12:21 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/seed_data/warning_templates.json` (new), `backend/app/services/warning_letters.py`, `backend/app/routes/warning_letters.py`, `backend/app/main.py`, `backend/scripts/clean_warning_templates.py` (new), `backend/tests/test_warning_template_seed.py` (new), `backend/tests/_case_helpers.py`, `backend/tests/test_warning_letters_and_notifications.py`, `backend/tests/test_warning_template_selection.py`, `backend/tests/test_activity_timeline.py`, `backend/tests/test_case_lifecycle.py`, `backend/tests/test_complaint_management.py`, `backend/tests/test_owner_observation_updates.py`, `backend/tests/test_owner_warning_rules.py`, `backend/tests/test_trust_rule.py`, `backend/tests/test_under_observation_flow.py`, `database_backups/warning_templates_before_cleanup_2026-11-18.sql` (new backup), `docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md`, `docs/README.md`
- **Authorization:** Developer approval in the Claude Code session: standardise on the four warning levels, remove obsolete or duplicate seeded templates, create one initial template per level; then approved the plan with: keep #7 archived, add the four templates automatically when a subdivision is created (independent sets), Claude writes the wording (no Barangay, no fines), back up before deleting.
- **Type:** Fix

## Intent

Replace the two hardcoded, lazily seeded sample templates (and their duplicates) with one standard template per level, as ordinary editable data, given to each subdivision on its own.

## Database changes (data only, no schema change)

On the local database `straysafe_subdivision`, subdivision 1 (Selera Homes), after a verified backup (`database_backups/warning_templates_before_cleanup_2026-11-18.sql`: the three warning letter tables, 8 / 9 / 3 rows matching the live counts, #7's DOCX inside, dump completed):

| Template | Result |
|---|---|
| #1 Standard Subdivision Warning Letter | **Kept**, archived. Three issued letters (WARN-2026-0001 to 0003) use its version 1; it and they are untouched. |
| #7 YOUTH FELLOWSHIP KNOW GOD, NEW ME | **Kept**, already archived (the developer's uploaded DOCX, version 1 intact). |
| #2, #3, #4, #5, #6 (seeded duplicates), #8 (the earlier sample) | **Deleted** with their own versions: none had an issued letter. |
| #9 Notice Letter, #10 First Warning Letter, #11 Second Warning Letter (with Office Summons), #12 Final Notice / Escalation Letter | **Created**: active, one per level, version 1, marked Suggested (`is_default`). |

The audit log kept all 32 earlier rows and gained 7 (1 archive, 6 deletes). No orphan versions. A second run changed nothing.

## Key changes

- **No hardcoded wording.** The four letters are in `backend/app/seed_data/warning_templates.json` (data, not code); the two `DEFAULT_*` constants are removed. The wording follows the subdivision-only scope: no Barangay steps, no fines, no invented enforcement powers; only the 2nd Warning letter has the summons lines. Leaders edit them in the existing editor (each save is a new version) or replace from DOCX.
- **No lazy seeding.** `ensure_default_templates` is gone: opening the template page or issuing a letter creates nothing, so the old samples cannot come back.
- **A new subdivision gets its own four templates automatically** (`seed_standard_templates`, run by a `Subdivision` insert hook, inside a savepoint so creating a subdivision never fails because of it). Every subdivision has its own rows (`subdivision_id` set; nothing is shared or platform-wide), so editing one never affects another.
- **Startup safety net** (`ensure_standard_warning_templates` in `main.py`): a subdivision with no template rows at all (for example created by SQL) gets the four. A subdivision with any template row, archived ones included, is never re-seeded.
- **`scripts/clean_warning_templates.py`**: dry run by default; `--apply` needs a verified backup; seeds only the subdivisions named; refuses to delete any template an issued letter uses (the whole run stops); archives, deletes, then seeds (in that order, so a removed old template does not make a level look "already there"); idempotent; one transaction; logs each archive and delete to the audit log.
- **Compatibility unchanged from Step 1:** the owner-warning flow offers all four levels; the complaint flow offers only templates for 1st Warning and 2nd Warning (plus universal ones); nothing is auto-selected, and `is_default` is only the "Suggested" mark.
- **Tests that issued warnings** now seed the standard templates and choose the one for the letter's level through `template_id_for(client, headers, level)`.

## Validation evidence

- New `test_warning_template_seed.py`: **40/40** (seed file rules, no Barangay or money wording, per-subdivision independence, editing one subdivision does not touch another, idempotency, no seeding when opening the list, safety net not recreating archived templates, level compatibility, and the script's dry run, backup check, refusal to delete a used template, idempotent apply).
- Also passing: `test_warning_template_selection` 28/28, `test_warning_letters_and_notifications` 31/31, `test_complaint_management` 67, `test_activity_timeline` 24/24, `test_trust_rule` 22/22, `test_under_observation_flow` 33/33, `test_admin_011_warnings`.
- Already failing before this work, same as before: `test_case_lifecycle` (IndexError), `test_owner_warning_rules` (`KeyError 'candidates'`), `test_owner_observation_updates` (54/55), `test_case_notes_queue`.
- The four real templates render with sample data: all can be issued, no placeholder left unresolved.
- Not done: the dialogs and template page were not opened in a browser.

## Remaining issues

- In the **owner-warning flow**, a 2nd Warning has no summons, so the letter's "Date and time" and "Place" lines are blank. The complaint flow supplies them. Step 2 (conditional placeholders) should handle this.
- Raw-SQL schema snapshot and `DATABASE_SCHEMA.md` still lack the three warning letter tables (Step 6).
- Existing subdivisions other than Selera Homes: none exist today. If one is added later by SQL, the safety net seeds it at the next backend start.
