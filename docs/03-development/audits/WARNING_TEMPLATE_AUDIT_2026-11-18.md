# Warning Template Module: Process and Implementation Audit

- **Date:** 2026-11-18
- **Scope:** warning letter templates, template versions, DOCX import and export, placeholders, template selection, and the issued-letter snapshots, from the editor to the resident's copy.
- **Type:** audit only. Nothing in the code, database or configuration was changed.
- **Decisions given by the developer for this audit:**
  1. The 4th tier keeps its name **"Final Notice / Escalation"** (your brief says "Final Warning"; this is noted, not reported as a defect).
  2. **The Leader always chooses the template.** There should be no automatic or silent template choice.
  3. **Missing required details must block issuing**, always.

## Fix progress

| Step | Findings | Status |
|---|---|---|
| 1. Template compatibility and explicit selection | F-01, F-04, D2 | **Done** 2026-11-18 ([change record](../../05-operations/agents/feature-updates/2026-11-18_1142_warning-templates-step1-explicit-selection.md)) |
| 1b. Four standard templates per subdivision, cleanup of old seeded ones | seeding, duplicates, Barangay wording in the seed text (E9, part) | **Done** 2026-11-18 ([change record](../../05-operations/agents/feature-updates/2026-11-18_1221_warning-templates-four-standard-per-subdivision.md)) |
| 2. Required information validation (one registry, all paths) | F-02, F-03, D1 | **Done** 2026-11-18 ([change record](../../05-operations/agents/feature-updates/2026-11-18_1233_warning-templates-step2-required-validation.md)) |
| 3. Draft and issue separation (complaint and owner flows), letter date | prepare/issue, re-prepare, letter date | Not started |
| 4. Rendering consistency | F-08, F-09 | Not started |
| 5. DOCX output and input | F-05, E1, E2 | Not started |
| 6. Version uniqueness, schema docs | D4, D8 | Not started |
| 7. Barangay wording, remaining permissions, tests | E3 to E5, E9 | Not started |

## How this was checked

| Method | What it covered |
|---|---|
| **Code read** | `backend/app/routes/warning_letters.py`, `services/warning_letters.py`, `models/warning_letter.py`, `routes/warnings.py`, `services/complaints.py`, `utils/warning_rules.py`, and the frontend template page and both issuing dialogs. |
| **Probe (run)** | The service's pure functions were run with crafted inputs and a hand-built DOCX (no database, nothing written). Findings marked **[verified]** come from this. |
| **Existing test** | `backend/tests/test_warning_letters_and_notifications.py` (24 checks, a script, not pytest) was read to see what is already covered. |

**Not verified:** behaviour against the live database, a DOCX saved by real Microsoft Word, the PDF's visual layout, and the screens in a browser. Findings that depend on those are marked **[read only]**.

---

## A. Current workflow

1. **Template list** (`/warning-templates`, `GET /warning-templates`): lists the subdivision's templates. If the subdivision has none, two are created on first view (`ensure_default_templates`): a general **Standard Subdivision Warning Letter** (default) and a **Second Warning & Office Summons Notice** (level "2nd Warning", not default).
2. **Create or edit** (`POST /warning-templates`, `PUT /warning-templates/{id}`): subject and body text with `{{placeholder}}` tokens. Every save creates a new **immutable version** (`warning_letter_template_versions`); the template row points at the current version. Roles 2 (Leader) and 4 (Admin) can write.
3. **DOCX import** (`POST /warning-templates/import-docx`, max 5 MB): reads text from the header, body and footer, stores the original file bytes on the version, and detects placeholders. Importing into an existing template adds a version.
4. **Levels:** `warning_level` on a template is optional free text. Empty means "all levels".
5. **Default, archive, activate:** one default per (subdivision, level). Archiving the default requires another active template to exist.
6. **Preview** (`POST /warning-templates/preview`): fills a template with sample data, or with a real case's owner, pet and policy. It returns the rendered text and `missing_fields` / `can_issue`.
7. **Issuing**, two paths, both end in `create_generated_letter`:
   - **Owner warning** (`routes/warnings.py`): the Leader picks a level (Notice, 1st, 2nd, Final Notice / Escalation), a policy and a template.
   - **Complaint letter** (`services/complaints.py`): letters 1 and 2 only (1st Warning, 2nd Warning). The letter is created when the Leader *prepares* it.
8. **Snapshot** (`generated_warning_letters`): the rendered subject, body and HTML, the placeholder values, the template and version ids, and the template name are stored. Later template edits do not touch it.
9. **Delivery and access:** the resident is notified; the resident reads and downloads **only their own** letters; opening the letter records `viewed_at`. Download is PDF (generated in Python from the stored text) or DOCX (the original DOCX with values filled in, or a generated plain layout).

---

## B. Correct implementations

| # | What works | Evidence |
|---|---|---|
| B1 | Versions are append-only and every edit makes a new one, with `created_by` and `created_at`. | `update_template`, `import_docx_template`; the history dialog shows who and when. |
| B2 | An issued letter is a snapshot (rendered text, values, template name, version number). Editing or archiving a template does not change issued letters. | `create_generated_letter` stores `rendered_*` and `placeholders_json`. |
| B3 | An **archived template cannot be used to issue** a letter, whether chosen by id or automatically. | `resolve_template_for_issuance` returns 409. |
| B4 | With **no active template**, issuing fails with a clear message instead of using nothing. | `resolve_template_for_issuance` returns 409. |
| B5 | Placeholders work in **both subject and body**, and the **same placeholder can appear several times**. | **[verified]** |
| B6 | Split Word runs (`{{resident_` in one run, `name}}` in the next) are recognised on import and export. | **[verified]** and an existing test. |
| B7 | Preview marks missing required details (`can_issue = false`), and the issuing dialogs disable the button then. | `render_preview`; `ActionDialogs.tsx:270`. |
| B8 | Residents can only open their own letters; a Leader opening a letter does not mark it viewed. | `_authorize_letter_read`, `mark_letter_viewed`, existing tests. |
| B9 | Letter HTML is escaped, and the app never injects stored HTML into the page. | `render_html_document` uses `html.escape`; no `dangerouslySetInnerHTML` for letters. |
| B10 | Template changes are written to the audit log. | `log_activity` on create, update, import, default, status. |
| B11 | Issuing an owner warning needs a verified incident, a confirmed owner and a confirmed policy. No fine is invented. | `utils/warning_rules.py`. |

---

## C. Incorrect implementations

### F-01 · The wrong template can be chosen for a level (Critical)

- **Feature:** template selection when issuing.
- **Current behaviour [read only]:**
  - The issuing dialogs choose a template **for the Leader** on open: the default for the level, else the general default, else the first one (`ActionDialogs.tsx:173-179`, `ComplaintDialogs.tsx:662-668`).
  - The seeded **Second Warning & Office Summons Notice** is not a default, so the general default wins even for a 2nd Warning. The letter then never mentions the summons the complaint step recorded.
  - In `ActionDialogs.tsx` this runs once on open. If the suggested level then changes, or the Leader changes the level, the template stays as first chosen.
  - On the server, an explicit `template_id` is accepted **for any level**, and with no id the fallback is `candidates[0]`, an arbitrary active template, even one meant for another level (`services/warning_letters.py:805-813`).
- **Expected:** per your decision, the Leader chooses on purpose. A template made for another level must not be used silently.
- **Why it matters:** an official 2nd Warning can be issued on the standard letter, without the summons, with no sign anything is wrong.
- **Recommended correction:**
  - Remove the automatic preselection and the server's arbitrary fallback; require an explicit `template_id` (otherwise return 422).
  - In the dropdown, show each template's level, and show a clear warning when it differs from the letter's level.
  - On the server, reject a template whose `warning_level` is set and different from the letter's level (or require an explicit confirmation flag).
  - Re-validate when the level changes.
- **Files:** `ActionDialogs.tsx`, `ComplaintDialogs.tsx`, `services/warning_letters.py` (`resolve_template_for_issuance`), `routes/warnings.py`, `services/complaints.py`.

### F-02 · A letter can be issued with required details blank or invented (High)

- **Current behaviour [read only]:** required details are enforced only when a template was picked (`strict_required = template_id is not None`, `routes/warnings.py`, `services/complaints.py`). With no template, and in the complaint `issue` step that creates a letter late, the letter is issued with blanks. The code also fills `resident_address` with the report's landmark or "Subdivision Resident", and pet name and type with "Animal" (`create_generated_letter`).
- **Expected:** block issuing whenever a required detail is missing, with no invented text.
- **Why it matters:** an official letter can go out saying "Applicable policy: " or addressed to "Subdivision Resident".
- **Recommended correction:** always enforce required details; remove the invented fallbacks (let the Leader fill the value in the dialog); keep the check on the server, not only in the button state.
- **Files:** `services/warning_letters.py` (`create_generated_letter`), `routes/warnings.py`, `services/complaints.py`.

### F-03 · Optional office details and unknown placeholders block issuing [verified] (High)

- **Current behaviour:** `detect_missing_fields` treats any placeholder that is not in the 17 listed definitions as **required**. So `{{subdivision_phone}}`, `{{subdivision_email}}`, `{{subdivision_address}}`, `{{issuer_name}}`, `{{issuer_role}}` (all supplied by the system, but not listed) make a letter unissuable when the office has no phone or email. A typo such as `{{resident_nme}}` also blocks, with the message "Missing resident_nme".
- **Expected:** optional office details should not block; a typo should be caught **when the template is saved**, in plain words.
- **Recommended correction:** list every supported placeholder in `PLACEHOLDER_DEFINITIONS` with its required flag; reject or flag unknown keys on save and on DOCX import; word the issuing message with the label, not the key.
- **Files:** `services/warning_letters.py` (`PLACEHOLDER_DEFINITIONS`, `detect_missing_fields`), `routes/warning_letters.py` (create, update, import).

### F-04 · Choosing "All warning levels" or clearing the description does nothing (High)

- **Current behaviour [read only]:** the editor sends `warning_level: null` and `description: null` for an empty choice, but `update_template` treats `None` as "no change" (`if body.warning_level is not None`). A template cannot be moved back to "All warning levels", and a description cannot be cleared.
- **Expected:** the saved template matches what the form shows.
- **Recommended correction:** send an explicit empty string, or distinguish "not provided" from "set to none" (`model_fields_set`).
- **Files:** `WarningTemplatesPage.tsx` (submit), `routes/warning_letters.py` (`update_template`).

### F-05 · The DOCX download can contain raw `{{placeholders}}`, and loses formatting (High)

- **Current behaviour:**
  - If the placeholder replacement fails for a part of the file, the error is swallowed (`except Exception: pass`, `render_letter_docx`), and a document with literal `{{resident_name}}` is downloaded.
  - **[verified]** when a paragraph contains a placeholder, the whole paragraph takes the **first run's formatting**: a bold "Dear " followed by a plain `{{resident_name}}` became one bold sentence.
  - **[verified]** a multi-line value (the violation description) is written into one text element, so Word shows the line breaks as spaces.
- **Expected:** a failure is reported, and the layout of the Leader's DOCX is kept.
- **Recommended correction:** do not swallow the error (return 500 with a message, or fall back visibly); replace placeholder text run by run, keeping each run's formatting; write line breaks as `<w:br/>`.
- **Files:** `services/warning_letters.py` (`render_letter_docx`, `_replace_placeholders_in_xml_bytes`).

### F-06 · A default can be set on an archived template, and the only default can be turned off (Medium)

- **Current behaviour [read only]:** `update_template` accepts `is_default = true` on an archived template (siblings are cleared only when it is active), so the archived template shows a "Default" badge while another default exists. `is_default = false` on the only default is accepted, leaving no default. The archive guard counts **any** active template in the subdivision, not one for the same level.
- **Expected:** a default is always active, and there is one per level.
- **Recommended correction:** reject `is_default` on an archived template; make the archive guard per level. **Open decision:** since the Leader always chooses, decide whether "default" still has a purpose (for example only a "suggested" label) or should be removed.
- **Files:** `routes/warning_letters.py` (`update_template`, `set_template_status`, `_clear_sibling_defaults`).

### F-07 · An archived template can still be edited (Medium)

- **Current behaviour [read only]:** `update_template` and DOCX import work on an archived template and create new versions; the edit dialog is hidden for archived cards only since the 2026-11-18 page change, but the API still allows it.
- **Expected:** activate first, then edit.
- **Recommended correction:** return 409 for edit and import on an archived template.
- **Files:** `routes/warning_letters.py`.

### F-08 · The renderer silently drops parts of the Leader's template (Medium)

- **Current behaviour [verified]:** `_strip_legacy_chrome` removes paragraphs that start with "Date Issued:", "Warning Reference:", "Case Reference:", "TO:" or "Address:", an "Issued by:" block of four lines or fewer, and a first line ending "Office of the Subdivision Leader". The preview, the stored HTML and the PDF drop them (the system adds its own header, recipient and signature). The DOCX of an imported template keeps them. The default editor body even contains such lines.
- **Why it matters:** what the Leader writes is not always what the resident receives, and the preview, the PDF and the DOCX can disagree.
- **Recommended correction:** stop removing text silently; either keep the Leader's text, or show which lines the system will replace and why.
- **Files:** `services/warning_letters.py` (`_strip_legacy_chrome`, `render_html_document`, `render_letter_pdf`, `_build_minimal_docx`).

### F-09 · Three renderings of the same letter (Medium)

- **Current behaviour [read only]:** the on-screen letter (`WarningLetterDocument.tsx`), the PDF (a hand-written PDF writer) and the DOCX (the source file, or a generated plain layout) are three separate renderers. For an imported DOCX the PDF and the screen use the flattened text, so logos, tables and layout appear only in the DOCX. An editor-created version has no source file, so its DOCX is the generic layout.
- **Recommended correction:** decide which output is official; at least show "PDF and screen use a simplified layout" on imported templates, or convert the DOCX to PDF for imported templates.
- **Files:** `services/warning_letters.py`, `frontend/src/components/WarningLetterDocument.tsx`.

---

## D. Missing implementations

| # | Missing | Why it matters | Where |
|---|---|---|---|
| D1 | **Save-time validation of a template:** unknown placeholders, missing required placeholders (for example `{{policy_reference}}`, `{{required_action}}`), empty subject. | Problems appear only when someone tries to issue (see F-03). | `routes/warning_letters.py`, editor |
| D2 | **Level values are not validated.** `warning_level` is free text (max 50). The API accepts "foo", which then matches no level. | A typo silently disables a template for its level. | `routes/warning_letters.py` (`TemplateCreateIn`, `TemplateUpdateIn`, `import_docx`) |
| D3 | **Restore an old version.** The History dialog only previews; to go back, the Leader must copy the text into a new version. | Slows recovery from a bad edit. | `WarningTemplatesPage.tsx`, new endpoint |
| D4 | **A unique constraint on (template_id, version_number).** The next number is "latest + 1". | Two simultaneous saves could produce the same number. | `models/warning_letter.py` |
| D5 | **Preview with the Leader's real data in the editor.** The editor's live preview uses fixed sample data; only the list's Preview offers "test with a real case" (first 30 cases). | The Leader cannot try the exact letter for a case while editing. | `WarningTemplatesPage.tsx` |
| D6 | **A list of the placeholders' data sources** shown to the Leader (which come from the case, the resident, the policy, the office). | Leaders cannot tell which blanks they must fill in. | editor |
| D7 | **Tests:** see section E's test row. | The business rules above are unprotected. | `backend/tests/` |
| D8 | **Database documentation:** `warning_letter_templates`, `warning_letter_template_versions` and `generated_warning_letters` are in neither `Database3.4_subdivision.sql` nor `DATABASE_SCHEMA.md` (they are created by the app's `create_all`). | A rebuild from the SQL snapshot would not have them. | `docs/01-system/DATABASE_SCHEMA.md`, SQL snapshot |
| D9 | **Formatting in the editor** (bold, lists, alignment). The editor is plain text. | Leaders who want formatting must use DOCX import. | editor |

---

## E. Potential bugs and risks

| # | Scenario | Effect | Priority |
|---|---|---|---|
| E1 | **DOCX import flattens the document [verified].** Header text goes first in the body and footer text last; table cells become separate paragraphs; images are not previewed; the subject is a guess from the first five paragraphs containing "subject", "warning" or "notice". | The imported template's text and preview look different from the Word file. The DOCX download still has the original layout, so the preview and the download differ. | Medium |
| E2 | **DOCX parsing accepts a DOCTYPE with entities [verified]** and sets no limit on the *decompressed* size (only the 5 MB upload). | A crafted file can use a lot of memory (Leaders only, but still a risk). | Medium |
| E3 | **Permissions on templates with no subdivision.** `_check_template_scope` lets a Leader (role 2) edit, archive or set default on a template whose `subdivision_id` is empty (an Admin-created, platform-wide template) when they know the id. | One Leader's change can affect every subdivision that uses it. | Medium |
| E4 | **Retired role 3 (Barangay Staff) still has access** to read templates and letters (`_staff_subdivision(write=False)`, `_authorize_letter_read`), and `routes/warnings.py` still has role-3 branches. The overview says role 3 has no sign-in. | Dead access paths in a subdivision-only product. | Low |
| E5 | **`_authorize_letter_read` falls through.** For a staff user, a letter with no subdivision and no report is readable by any staff account. `retry-notification` skips the scope check when the letter has no subdivision. | Possible read of another subdivision's letter (only for old or unlinked letters). | Medium |
| E6 | **Listing templates writes to the database** (the seeding runs and commits inside `GET /warning-templates`), including for read-only roles. | Surprising writes; unrelated to the page's purpose. | Low |
| E7 | **Rendered subject can exceed 255 characters.** `rendered_subject` is `String(255)`; a subject template using `{{policy_reference}}` (up to 200 characters) or `{{violation_description}}` can overflow. | The insert may fail or truncate when issuing (not tested). | Medium |
| E8 | **`incident_date` falls back to the current time** when no report is attached. | A letter could state today as the incident date. | Low |
| E9 | **Wrong default seed text.** The seeded 2nd Warning letter says "…further escalation **to the Barangay**", and the 2nd Warning history remark says "Eligible for **Barangay Endorsement**" (`routes/warnings.py:275`). The standard seed's description says "Final Warning" while the level is "Final Notice / Escalation". | Brings a Barangay step into a subdivision letter, which your brief says not to do. | Medium |
| E10 | **Two parallel letter flows.** Owner warnings use four levels; complaint letters use only 1st and 2nd Warning. Notice and Final Notice are never used by the complaint flow. | Two processes issue "warning letters" with different level rules. **Open decision:** is that intended? | Medium |
| E11 | **Version history deleted with the template or subdivision** (`ON DELETE CASCADE`). The letter keeps its rendered text, but an imported-DOCX letter then downloads as the generic layout. | Loses the original layout of old letters (no delete endpoint exists today). | Low |
| E12 | **The complaint flow invents a default required action** ("Comply with subdivision rules and prevent recurrence.") when the policy has no summary. | A generic instruction on an official letter; not a policy the subdivision wrote. | Low |

---

## F. Recommended improvements

1. **Make template choice explicit** (F-01, with decision 2): required `template_id`, level shown in the picker, mismatch warning, server-side level check, no automatic pick.
2. **Always block incomplete letters** (F-02, with decision 3), on the server, and remove the invented fallbacks.
3. **Validate templates when they are saved** (F-03, D1, D2): known placeholders only, required placeholders present, a valid level, plain-language messages. Keep the new placeholder editor, but show unknown keys as errors (they are amber boxes today) and mark required placeholders.
4. **Fix the editor/API mismatches** (F-04, F-06, F-07): clearing level or description, defaults only on active templates, no edits to archived templates.
5. **Harden DOCX output** (F-05): no swallowed errors, per-run replacement, real line breaks. **Harden DOCX input** (E1, E2): reject a DOCTYPE and cap the decompressed size.
6. **Stop silently trimming template text** (F-08) and **decide the official output** (F-09).
7. **Tighten permissions** (E3, E4, E5): no Leader edits to platform-wide templates; drop role-3 paths; always scope-check a letter.
8. **Remove Barangay wording** from the seeds and history remarks (E9). Per your decision, keep "Final Notice / Escalation" and fix only the seed description.
9. **Add tests** for the rules in this report, and **document the three tables** (D7, D8).

---

## G. Priority classification

| Priority | ID | Finding |
|---|---|---|
| **Critical** | F-01 | The wrong template can be chosen for a level (a 2nd Warning goes out on the standard letter, without the summons) |
| **High** | F-02 | A letter can be issued with required details blank or invented |
| **High** | F-03 | Optional office details and typo'd placeholders block issuing |
| **High** | F-04 | "All warning levels" and clearing the description do nothing |
| **High** | F-05 | The DOCX download can contain raw placeholders, and loses formatting |
| **Medium** | F-06 | A default on an archived template; the only default can be turned off |
| **Medium** | F-07 | An archived template can still be edited |
| **Medium** | F-08 | The renderer silently drops parts of the Leader's text |
| **Medium** | F-09 | Three renderings of the same letter disagree |
| **Medium** | D1, D2, D4, D7 | No save-time validation, no level validation, no unique version number, missing tests |
| **Medium** | E1, E2, E3, E5, E7, E9, E10 | DOCX import flattening and parser limits, platform-wide template permissions, letter-read fall-through, long subject, Barangay wording, two parallel flows |
| **Low** | D3, D5, D6, D8, D9 | No restore, no real-data live preview, no data-source guide, schema docs, no formatting in the editor |
| **Low** | E4, E6, E8, E11, E12 | Retired role 3, writes on list, incident date fallback, deleted history, invented action text |

**Business-rule questions from your brief, answered:**

| Question | Answer |
|---|---|
| Can an incorrect template be selected for a level? | **Yes.** Nothing checks the level on the server (F-01). |
| Can an archived template still be used? | **No** for issuing (B3). It can still be edited (F-07) and can be flagged default (F-06). |
| What if no default exists? | The server takes **any** active template (F-01), the UI takes the first one in the list. |
| Can several templates be active for one level? | **Yes**, by design; one default per level is enforced on "set default" only (F-06). |
| Are templates linked to policies and cases? | The policy and case are filled in at issuing (`policy_reference`, `case_reference`). A template itself has no link to a policy, which is fine; the letter snapshot stores `policy_id`, `report_id` and the template version. |
| Are incomplete or invalid templates prevented? | **No**, not when saved (D1). Problems show only at issuing, and only when a template id was sent (F-02). |
| Are resident and pet details retrieved correctly? | Yes, with fallbacks that invent text (F-02). A pet is matched automatically only when the owner has exactly one pet of that species. |
| Are missing values handled? | Preview: they become blank and `can_issue` turns false. Issuing: enforced only with a template id (F-02). |

---

## Open decisions for you

1. **"Default" template:** with "the Leader always chooses", should the default flag be removed, or kept as a "suggested" label only? (F-06)
2. **Two letter flows:** should Notice and Final Notice / Escalation also be available in the complaint flow, or is it intentionally limited to 1st and 2nd Warning? (E10)
3. **Which output is official:** the PDF, or the DOCX? (F-09)
4. **Level mismatch:** should the server refuse a template of another level, or only warn and let the Leader confirm? (F-01)
