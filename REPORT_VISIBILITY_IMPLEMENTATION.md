# Report Visibility: Subdivision Leader Decides Public / Private

**Goal:** the resident no longer chooses whether a report is Public or Private. The **Subdivision Leader** decides,
and only **after verifying** the report. False and rejected reports can **never** be seen by other residents. Every
rule is enforced by the **server**, not only by the pages.

Status: **implemented** (2026-10-12). All checklist items are done; section 10 lists where the build differs from
the plan. Section 9 maps each of the 13 rules to the items that meet it.

---

## 1. How it works today (what we found)

| Where | Today | Problem |
|---|---|---|
| Resident forms (`ReportStrayPage.tsx` / `ResiHomePage.tsx` Step 8) | The resident picks Public or Private; the default is Public | The wrong person decides |
| `reports.visibility` | `enum('Public','Private') DEFAULT 'Public'` | No "not decided yet" state |
| `PATCH /reports/{id}` | The reporter can change `visibility` | |
| `GET /reports/` | Returns **every** report to **any** signed-in user | Private and false reports reach every browser |
| `GET /reports/{id}` | No visibility check | Anyone can open any report by its number |
| Home map / feed | Hides private reports **in the browser only** (`ResiHomePage.tsx:884`) | Not real protection |
| Navbar search (`ResiNavbar.tsx:105`) | Searches the full list | Private reports show in search |
| `ReportResponse` | Includes `reporter_name`, `reporter_photo`, `owner_name`, `owner_phone`, `owner_email`, `owner_address`, `comments` (commenter names), `disputes` (resident names), `merged_reports` (child reporters) | **Reporter and pet-owner personal data reaches every resident** |
| `POST /reports/{id}/comments` | **No sign-in check**; `user_id` is taken from the request body | Anyone can post as anyone, on any report |
| Chat | Already has a Barangay gate: Barangay Staff need `is_report_escalated_to_barangay()` (`chat.py:162`); residents have the B6 rule | Already correct; must stay independent of visibility |

---

## 2. Three separate systems (rule 13)

| System | Answers | Stored in | Changed by |
|---|---|---|---|
| **Status** | What is happening to the animal? | `current_status_id` | The rescue workflow |
| **Visibility** | Which *other residents* may see the report? | `visibility` + decision columns | The Subdivision Leader (or Admin), only through the visibility endpoint |
| **Messaging** | Who may talk privately about it? | `chat.py` rules (B6, Barangay escalation gate) | Unchanged by this work |

How the three are kept apart:
- **Visibility never grants chat access, and chat never reads visibility.** Making a report Public opens no
  conversation to anyone (rule 4).
- **Escalation never changes visibility** (rule 5). There is no code path from escalation to `visibility`.
- **Status can only ever *hide* a report, never publish it.** Rejected, False Alarm and Merged hide it by a read rule.
  The only stored change status ever causes is a reset to `Pending Review` when a false decision is reversed (rule 9),
  so that a person must decide again. Status never sets `Public`.

---

## 3. The new rules

### R1. Visibility values
`enum('Public','Private','Pending Review')`, default `'Pending Review'`.

| Value | Meaning |
|---|---|
| `Pending Review` | Not decided yet. **Every new report starts here**, including staff-created ones. |
| `Private` | The leader decided it stays private. |
| `Public` | The leader decided other residents may see it. Allowed **only if the report is verified**. |

Pages already check `visibility === 'Public'`, so `Pending Review` is treated as not public everywhere (safe by
default).

### R2. "Publicly visible" is calculated on every read
A report is shown to **other residents** only if all of these are true:
1. `visibility = 'Public'`
2. It is verified: `verification_status = 'verified_true'`, set by the Verify step (rule 1).
3. Its status is **not** Rejected (3), False Alarm / Dismissed (14) or Merged duplicate (18).

Resolved reports (9 Claimed, 10 Released, 11 Resolved, 12 Deceased, 17 Cannot Be Found) **stay visible** as history,
with comments read-only (rule 9).

This is one function, `is_publicly_visible(report)`, used by every endpoint. It is the single source of truth.

### R3. Who may see a non-public report (*authorized viewers*)
- **The reporter.**
- **Staff in scope:**
  - Subdivision Leader of that subdivision;
  - Barangay Staff only for escalated reports, matching the chat rule;
  - Admin.
- **An eligible pet owner**, with limited access (rule 6 and R7):
  - **Owner of the pet linked to the report, or with a staff-confirmed match:** the report page, but with the
    reporter's identity hidden.
  - **Owner with only an AI-suggested match:** **no** report page. Only the minimum match card (R7).

Anyone else gets **404 "Report not found"**, so they can't even tell the report exists.

### R4. Who decides, and when
- **Only the Subdivision Leader** of that subdivision who has claimed the case (the same rule as Verify), plus
  **Admin**.
- **Barangay Staff:** read-only. The server refuses with 403 (rule 5).
- **Residents:** they can't choose it on the form, and their edit no longer includes it.

When the decision is made:
1. **In the Verify modal**: a required "Who can see this report?" choice. Verification and the decision happen
   together.
2. **A Visibility control on the report page**, to change it later. `Public` is disabled, with a reason, when the
   report isn't verified or is in status 3, 14 or 18.
3. **Staff-created reports** (`SubdReportModal`, Barangay dashboard): the Public/Private step is **removed**. They
   start `Pending Review` and are decided at verification like any other report. This meets rule 1: Public only
   after verification.

Escalated reports: the leader may still change Private and Public on a verified report (visibility doesn't affect the
rescue). An escalated report that was never verified can only be Private or Pending, because Public needs
verification. Escalating **never** makes a report Public (rule 5).

### R5. Every decision is logged (rule 12)
- **New columns** on `reports`: `visibility_decided_by` (FK users), `visibility_decided_at`, `visibility_reason`
  (TEXT).
- **An `AuditLog` row for every change:**
  - `action = 'SET_REPORT_VISIBILITY'`
  - `old_values = {visibility}`, `new_values = {visibility}`
  - the actor, the timestamp, and `description` with the reason.
- **The reason:**
  - At Verify, it defaults to "Decided during on-site verification" plus the leader's optional note.
  - Every **later change requires a reason** (at least 5 characters).
- **System resets** (rule 9 reversal, unmerge) are logged too, with actor "System" and the cause.

### R6. Reporter privacy (rule 3)
For anyone who isn't staff in scope or the reporter themselves, the server **removes** these fields from the
response:

| Field | Becomes |
|---|---|
| `reporter_name` | `"Community Reporter"` |
| `reporter_photo`, `user_id`, reporter contact, email and address fields | `null` |
| `owner_name`, `owner_phone`, `owner_email`, `owner_address`, `owner_id` | `null`, unless the viewer **is** that owner (rule 6) |
| `disputes[]` | removed (it names residents and pets) |
| `merged_reports[]` | removed (it holds the child reporters and their evidence) |
| `comments[].user` | the reporter's own comments show as "Community Reporter"; other commenters show first name only, with no photo link to their profile |
| `history[]` remarks | kept. They are written by staff and contain no reporter contact details |
| media | kept, except photos uploaded by the pet owner as evidence |

This is done by one function, `redact_for_viewer(rep_data, viewer, report)`, called right before every report
response (list and detail).

### R7. Potential match privacy (rule 6)
- **AI-suggested match (not confirmed):** the owner sees only a **match card**:
  - the report's animal photo or photos;
  - species, colour and size;
  - **approximate area** (landmark or street name, not exact coordinates);
  - the date seen;
  - the similarity and its reasons.

  No reporter identity, no description free text (it may name people or houses), no comments, no report page.
- **Staff-confirmed or linked match:** the owner gets report page access (R3), still **without** reporter identity.
  Exact location is shown so they can help find the pet. Chat continues under the existing B6 rule.
- **The registered owner's details** are never shown to anyone else. Residents never see `owner_*` fields (R6).

### R8. Comments (rule 2)
- **Posting:**
  - The user must be **signed in**, and the commenter is **the signed-in user**; any `user_id` in the body is
    ignored.
  - Residents may comment only if the report is **publicly visible** (R2) and **open**.
  - The reporter and staff in scope may also comment on their visible report.
- **Comments are closed** (409 "Comments are closed for this report") when the status is resolved (9, 10, 11, 12,
  17), rejected (3), dismissed (14) or merged (18).
- **Reading:** comments come only inside the report response, so a viewer who can't see the report can't see its
  comments. Existing comments are **never deleted**. They stay visible to authorized viewers when a report becomes
  Private, Pending or false.
- **Comment notifications** go only to people who can still see the report (R10).

### R9. Merged and unmerged reports (rule 7)
- **Merged duplicates (18)** are never publicly visible (R2). Other residents see only the **main case**, under the
  main case's own decision.
- The duplicate's photos, comments and history are kept for authorized viewers. `merged_reports` is removed for other
  residents (R6).
- **Unmerge:** the separated report is set back to `Pending Review` (logged as a system reset), so the leader decides
  again. It may have been merged into a public case without its own review.

### R10. Notifications, search and map (rule 11)
- **Search and map markers** come from `GET /reports/`, which now returns only what the viewer may see. So private
  reports can't appear in search or on the map.
- **Notifications:**
  - New notification text about a report never includes the reporter's name, address or contact details.
  - `GET /notifications/me` and `/user/{id}`: for each report-related notification, the server checks the report
    again. If the viewer can no longer see it, the title and message are replaced with *"This report is no longer
    available."* and the link is removed. The stored row is untouched.
- **Immediate effect (rule 8):** every read uses R2 and R3. There's no caching, so a change applies on the next poll
  or refresh. If a page is open on a report that becomes hidden, its next refresh gets 404, and the page shows *"This
  report is no longer available"* instead of crashing.
- **Chat unread previews** are governed by the chat rules (rule 4), so they aren't affected. Private messages stay
  with the people allowed to see them.

### R11. False decision reversed (rule 9)
A database hook (SQLAlchemy `before_flush`) watches every status change. It covers all routes: status PATCH, the
dispute review, false-alarm and future ones.
- **When a report leaves 3 or 14 for another status:** if it was `Public`, it is set to `Pending Review` and logged.
  The leader must re-verify and decide again before it is republished.
- **Marking a report false doesn't need a stored change:** R2 hides it at once.

### R12. Existing reports (rule 10)
**No stored values are changed automatically.**
- **Taking effect without editing anything:**
  - old false and rejected reports are hidden (R2);
  - old Private reports become truly private (server enforced);
  - old **unverified** Public reports are hidden from other residents until verified (R2, rule 1);
  - old **verified** Public reports stay visible.
- Every old Public report without a leader decision (`visibility_decided_by IS NULL`) gets a
  **"Needs visibility review"** chip in the Subdivision list, so leaders review them.
- **Optional migration, only with your approval:**
  1. Back up.
  2. Dry run: list the exact reports (number, status, subdivision, current visibility).
  3. After your yes, set the open ones to `Pending Review`, with an audit log row per report.

---

## 4. Backend checklist

- [x] **V1. Migration** `ensure_report_visibility_review()` (`main.py`):
  - the new enum value;
  - `visibility_decided_by`, `visibility_decided_at` and `visibility_reason`;
  - default `'Pending Review'`;
  - update `Database3.3.txt`.
- [x] **V2. Model and schemas:**
  - The columns.
  - `ReportVerifyRequest.visibility` (required: `Public` or `Private`).
  - The new `ReportVisibilityUpdate {visibility, reason}`.
  - Response fields: `visible_to_residents`, `visibility_decided_by_name`, `visibility_decided_at`,
    `visibility_reason` (staff only), `comments_open`.
- [x] **V3. New `app/utils/report_visibility.py`:**
  - `is_publicly_visible(report)` (R2);
  - `viewer_access(user, report, db)`, which returns `staff` / `reporter` / `owner_full` / `owner_match_card` /
    `public` / `none` (R3);
  - `resident_visible_filter(user)`, the SQL version for lists;
  - `redact_for_viewer(...)` (R6);
  - `comments_open(report)` (R8);
  - `set_visibility(report, value, actor, reason, db)`, the **only** writer, which also logs (R5).
- [x] **V4. `POST /reports/`:** always store `Pending Review`, whatever is sent, for all roles.
- [x] **V5. `PATCH /reports/{id}`:** remove `visibility` from the resident fields, and reject `visibility` from staff
  too (it must go through V6).
- [x] **V6. New `PATCH /reports/{id}/visibility`:**
  - leader (scope + claim) or Admin only;
  - Barangay Staff and residents get 403;
  - Public on an unverified report or status 3/14/18 gets 409;
  - a reason is required when changing an existing decision;
  - notify the reporter.
- [x] **V7. `verify-incident`:** the required visibility, applied through `set_visibility`.
- [x] **V8. Enforce on reads:**
  - `GET /reports/`: filter by `viewer_access`, redact every item, and make `X-Total-Count` match.
  - `GET /reports/{id}`: 404 for `none` and `owner_match_card`, and redact.
  - `GET /reports/sidebar-ids`: staff only (check).
- [x] **V9. Other report-returning routes:**
  - Audit `matches.py`: `/`, `/report/{id}`, `/{match_id}`, `/{match_id}/case-preview`, `/case-review/{id}`.
  - Audit `pets.py`, `claims.py`, `report_returns.py`, `rescue.py`, `warnings.py`.
  - Owner-facing match payloads are cut down to the match card (R7). Each one is listed in the PR notes.
- [x] **V10. Comments:**
  - `POST /reports/{id}/comments` uses `get_current_user`, takes the identity from the JWT, and applies the
    visibility and `comments_open` checks;
  - add the same checks to any comment edit or delete route if one exists.
- [x] **V11. Merge, unmerge and the reversal hook:**
  - unmerge resets the separated report to `Pending Review` (R9);
  - the `before_flush` hook handles the 3/14 reversal (R11).
- [x] **V12. Notifications:**
  - redact on read (R10);
  - check that existing notification texts about reports don't include reporter details, and fix any that do.
- [x] **V13. Make sure escalation doesn't touch visibility:** a test on the escalate and approve routes (rule 5).

## 5. Frontend checklist

- [x] **V14. Resident forms:** remove Step 8 from `ReportStrayPage.tsx` and `ResiHomePage.tsx`, renumber the
  steps, and drop it from the summary and drafts. Add the note: *"Your Subdivision Leader reviews your report first
  and decides if other residents can see it. Your name and contact details are never shown to other residents."*
- [x] **V15. Staff create forms:** remove the visibility step from `SubdReportModal.tsx` and the Barangay dashboard
  quick report.
- [x] **V16. Resident report page and cards:**
  - the badge shows **Awaiting review**, **Private** or **Public**;
  - show "Community Reporter" where the name was;
  - show "This report is no longer available" on 404;
  - hide the comment box when `comments_open` is false or the report isn't public, with a reason line.
- [x] **V17. Subdivision Verify modal:** the required Public/Private choice.
- [x] **V18. Visibility panel on the Subdivision and Admin report pages:**
  - shows the current value, who decided, when and why;
  - a Change button, which asks for a reason;
  - Public is disabled with the reason.
  - Barangay: read-only text.
- [x] **V19. Subdivision report list:** chips for **"Visibility not decided"** and **"Needs visibility review"**
  (old reports, R12), plus a filter.
- [x] **V20. Owner match view:** use the match card for unconfirmed AI matches, with no "open report" link.
- [x] **V21. `ResiHomePage.tsx` filter:** remove the privacy check in the browser (the server does it now) and keep
  the closed-status filtering for the active feed.

## 6. Tests: `tests/test_report_visibility.py` (throwaway SQLite)

| # | Case | Expected |
|---|---|---|
| 1 | A resident creates a report and sends `visibility: 'Public'` | Stored `Pending Review` |
| 2 | Another resident: list / detail / comment | Missing from the list / 404 / 404 |
| 3 | The reporter: list / detail | Visible |
| 4 | A resident or Barangay Staff calls `/visibility` | 403 |
| 5 | Public on an unverified report | 409 |
| 6 | Verify with Public | The other resident sees it; audit row with old, new, actor, time, reason |
| 7 | Public, then Private (with reason) | Hidden at once from the list, detail and search; comments kept for the reporter and staff |
| 8 | A change without a reason | 422 |
| 9 | Public, then False Alarm | Hidden from other residents; the reporter still sees it |
| 10 | False Alarm reversed | Visibility is `Pending Review`, with a system audit row |
| 11 | Public on status 3/14/18 | 409 |
| 12 | Merge into a public case | The duplicate is hidden; the main case is visible; `merged_reports` is absent for residents |
| 13 | Unmerge | The separated report becomes `Pending Review` |
| 14 | A public report seen by another resident | `reporter_name` = "Community Reporter"; no photo, `user_id`, `owner_*` fields, disputes or merged reports |
| 15 | The same report seen by staff | Full data |
| 16 | An AI-suggested match owner | Match card only; report detail returns 404 |
| 17 | A staff-confirmed match owner | Report detail allowed, reporter hidden |
| 18 | Comments: anonymous / `user_id` spoofing / closed report / private report | 401 / author = JWT user / 409 / 404 |
| 19 | A Private report is escalated | It stays Private; Barangay chat access still follows the escalation gate |
| 20 | A notification for a now-hidden report | Message redacted on read |
| 21 | An old Public, unverified report (no data change) | Hidden from other residents; the row is unchanged in the database |

Then run the full suite (`for t in tests/test_*.py`), `tsc` and `vite build`.

---

## 7. Order of work
1. V1 to V3: the data and the shared rules (one module).
2. V4 to V8: the core enforcement, plus tests 1 to 11.
3. V9 to V13: matches, comments, merge, notifications, plus tests 12 to 21.
4. V14 to V21: the pages.
5. The full test run, type check and build.
6. Optional: the R12 migration dry run, for your approval.

## 8. Not in this change
- Announcement visibility (`Public / Subdivision Only / Barangay Only`) is a separate feature.
- Chat rules are only verified by tests here (rule 4); they aren't redesigned.

## 9. Your rules, and where each is met

| Rule | Met by |
|---|---|
| 1. Public requires verification | R1, R2.2, R4, V6, V7; tests 5, 6, 21 |
| 2. Comments visibility | R8, V10, V16; test 18 |
| 3. Reporter privacy | R6, V8, V16; tests 14, 15 |
| 4. Private messaging separate | Section 2, R10; test 19 |
| 5. Barangay escalation independence | Section 2, R4, V6, V13; tests 4, 19 |
| 6. Potential match privacy | R3, R7, V9, V20; tests 16, 17 |
| 7. Duplicate and merged | R2.3, R6, R9, V11; tests 12, 13 |
| 8. Public to Private | R2, R10, V8, V16; test 7 |
| 9. Resolved and false reports | R2, R8, R11; tests 9, 10, 11 |
| 10. Existing report migration | R12, V19; test 21 |
| 11. Notifications and search | R10, V12; tests 2, 20 |
| 12. Backend security and audit | V3 to V13, R5; the whole test table |
| 13. Status, visibility and messaging separate | Section 2, R11 (status can only hide, never publish) |

## 10. As built: differences from the plan, and findings

- **AI-match owner (R3, R7):** instead of a 404 plus a separate card endpoint, `GET /reports/{id}` itself returns the
  **match card** (`viewer_access: "match_owner"`). It has photos, looks, approximate area (coordinates rounded to
  about 100 m), date and status; no description, reporter, comments, history or evidence. This keeps the owner's
  match review page working. Report lists never include it, comments on it return 404, and `ResiViewReport` shows a
  compact card with "Review this possible match".
- **Resident form in `ResiHomePage.tsx`:** Step 8 keeps its number but now only explains who can see the report, so
  the other 10 steps keep their numbers. `ReportStrayPage.tsx` and `SubdReportModal.tsx` drop the step and go from
  9 steps to 8.
- **Barangay Staff and report data:** staff (roles 2 to 4) still read report details as before. The escalation gate
  for **messages** (`chat.py`) is unchanged and still applies (rule 4).
- **Extra fix found on the way:** `GET /rescue-requests/`, `/rescue-requests/report/{id}` and
  `/rescue-requests/{id}` had **no sign-in check** and returned full reports with reporter details. They now require
  a staff or Admin sign-in (only staff pages use them).
- **Also fixed:** report responses used to send the pet owner's name, the handover record (`owner_return`, which has
  the owner's ID details), owner warnings and matched-pet records to every resident. They now go only to staff and
  that owner.
- **Comments:** residents comment only on publicly visible, open reports. Staff can comment on any report in their
  scope while it's open. Other residents see commenters by first name only, and the reporter as "Community
  Reporter".
- **The Subdivision list** shows the chips "Visibility not decided" and "Needs visibility review". No separate filter
  was added.
- **Live data at the time of the change** (schema migrated, no rows edited): 22 reports were stored Public and 8
  Private, and **none** had ever been verified through the Verify step. Five Public ones are merged duplicates; the
  other 17 are closed (Claimed, Resolved, Deceased). Under rule 1 none of them is shown to other residents until it's
  verified. New reports become public only after a leader verifies them and chooses Public.
- **Claiming** a report also moves it to status 2 ("Verified / Under Review"). That does **not** count as verification;
  only the Verify step (`verification_status = verified_true`) does.
- **A rejected dispute** sets the report back to `unverified`, so it needs verifying again before it can be public.
- **Tests:** `tests/test_report_visibility.py` passes 73/73. Four older tests were updated to the new rules:
  - `test_case_gating.py` and `test_trust_rule.py` now send the required `visibility`;
  - `test_dispute_security.py` now expects a 404 for a non-public report;
  - `test_report_privacy.py` now expects the owner's name as "Registered Owner".
  The full suite passes, and so do `tsc` and `vite build`.

