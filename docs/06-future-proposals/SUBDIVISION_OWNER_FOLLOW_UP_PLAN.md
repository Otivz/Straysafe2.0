# Subdivision owner follow-up (3-day observation of a complaint about a registered pet)

- **Status:** step 1 (hide the subdivision holding place) and **Phase 1 (backend) are done** (2026-10-28; `backend/tests/test_owner_followups.py` 69/69, all 86 isolated backend test files pass). Nothing is visible in the app yet: the leader's report page still shows the static preview (`OwnerFollowUpPreview.tsx`) until Phase 2. An earlier backend was written on 2026-10-27 and removed on 2026-10-28 (change record `2026-10-28_0412_remove-owner-follow-up-code`); this one follows the complaint design below.
- **Scenario (decided and confirmed by the subdivision, 2026-10-28):** a complaint about a **registered pet that has a known owner**. The Subdivision Leader contacts the owner and checks, within 3 days, whether the owner does something about the pet. Then the leader resolves the case or escalates it to the Barangay.
- **Direction:** the follow-up lives on the leader's **report page**. No new page, route or menu entry. The Barangay holding place, and the leader's read-only Barangay Holding page, stay as they are.
- The interview facts below are as the developer reported them; they are not confirmed with the barangay or the subdivision.

## 1. Why

According to the interview, the subdivision has no holding place. When a pet that belongs to a known owner causes a problem, the leader talks to the owner and checks whether the owner acts within 3 days. The system had no way to record that: no deadline, no contact log, no owner notification. Without it, the process the interview describes is only done outside the system.

## 2. Decisions (from the developer)

| Question | Decision |
|---|---|
| Scenario (2026-10-28) | A complaint about a registered pet with a known owner: "the 3-day rule is for the subdivision checking if the owner of the pet does something about his pet" |
| Which reports | Only a report linked to a **registered pet that has an owner** (an owner account, or the owner's name and phone on the pet record). **No typed-in owner, no found-stray flow.** |
| Who holds the animal | Nobody. The pet stays with its owner; nothing is moved or placed |
| How the owner is contacted | By phone (logged by the leader) and by an in-app notification when the owner has an account |
| Length | 3 days by default; the administrator can change it (1 to 14) |
| Extension (2026-10-28) | Allowed **once**, by the leader, with a reason, for the same number of days |
| Early escalation | The leader may escalate **at any time** when the problem continues, the pet is a danger or the owner does not comply |
| After the observation | The leader decides: owner complied (resolved), close with a reason, or escalate. **Nothing is automatic** |
| Subdivision holding place | Hidden for leaders (step 1, done 2026-10-27); nothing deleted |
| What the Barangay sees | Only **escalated** follow-ups, with the full contact history |
| Owner warning at the end | **Yes (2026-10-28):** the card offers "Issue owner warning" (the existing warning form, pre-filled) before escalating; only for an owner with an account |

A classmate's review (2026-10-28) shaped the flow: the owner is informed of the complaint and asked to keep the pet confined, may send a photo or update, repeated incidents are recorded, the leader may extend once, and may escalate before the period ends. The system records the decision, remarks, evidence and date. Their label "Under Observation" is kept as the follow-up's **label only**: the report status 7 "Under Observation" means "in a holding facility" to the server and must never be set by a follow-up (4.2).

Earlier versions (2026-10-27) treated this as a found animal with a suspected owner (an owner typed in by the leader, "that's my pet", return to owner). That was replaced by the complaint scenario above.

## 3. What exists today (checked in the code)

- **Registered pet and owner:** `reports.pet_id` links a report to a pet; `pets.owner_id` is the owner account (nullable: a leader registers pets for owners with no account, and the pet then carries the owner's name and contact). The leader's report response already exposes `pet_name`, `owner_id`, `owner_name`, `owner_phone`.
- **Closing and escalating a report:** `PATCH /reports/{id}/status`. Statuses 9, 10, 11 and 4 are refused unless the animal is in Pet Records or Holding records (`require_animal_record`, `backend/app/utils/case_review.py`); a report linked to a pet (`pet_id` set) already satisfies that rule, so "Incident Resolved" (11) is allowed for these reports. A leader may update a report only until it has been escalated.
- **Escalation on the report page:** `SubdViewReport.tsx` already has the escalation dialog (endorsement letter, status 4, rescue request), opened by a handler that calls `setIsEscalateModalOpen(true)`.
- **Notifications:** `dispatch_notification` (`backend/app/utils/notification_dispatcher.py`) records an in-app notification and can send email; push exists. The frontend opens a page from a notification by its `type` in the navbars (`ResiNavbar.tsx`, `SubdNavbar.tsx`, `BrgyNavbar.tsx`), so a new type needs a mapping there.
- **Periodic checks:** `start_unassigned_reports_watcher` (`backend/app/tasks/unassigned_checker.py`) already loops every minute; a due-follow-up check follows the same pattern.
- **Owner warnings and behaviour:** `OwnerWarning` (`backend/app/models/warning.py`, `routes/warnings.py`) and the pet's verified behaviour fields (`has_bite_history`, `bite_incident_count`, `chase_behavior`, set by staff in `routes/pets.py`) exist and can be linked from a repeated incident.
- **Routers** are registered in `backend/app/main.py`; tables are created at startup by `Base.metadata.create_all`.
- **Step 1 (done):** the leader's `/subd/holding-facility` page is "Barangay Holding Place" (view only). A leader can no longer place an animal in a subdivision pen.
- **Not secured server-side yet:** `GET /reports/` returns every report to any staff account; a leader's subdivision is only a request parameter (heat map audit, finding 11). The new endpoints must check scope on the server and not rely on it.

## 4. Behaviour

### 4.1 States

```
                 start
 (complaint ───────────►  Observing  ───────── owner complied ──────►  Owner Complied    report closed as Incident Resolved (11)
  about a                 ("Under    │   ▲
  registered              Observation") └─┘ once: "Monitoring extended" (reason, +3 days)
  pet)                          │
                                ├──── leader closes with a reason ───►  Closed by Leader   report 11 or 14
                                ├──── leader escalates (any time) ───►  Escalated          report status 4
                                └──── report closed another way ─────►  Report Closed
```

A follow-up is **Observing** (shown as **"Under Observation"**) until it ends. "Due" is not a stored state: it is Observing with the due time passed. An extension keeps it Observing and moves the due time.

### 4.2 Starting

Only the leader handling the report can start a follow-up, on a report that:
- belongs to their subdivision and is claimed by them,
- is linked to a registered pet that has an owner,
- is open (not 3, 7, 8, 9, 10, 11, 12, 14, 17 or 18), has no facility, is not a merged duplicate, and is not escalated (no endorsement letter, no rescue request, not status 4, 5, 6 or 13),
- has no open follow-up already.

It records the owner as a snapshot (owner account if any, name, phone), the pet, who started it, when, and the due time (start plus the observation days, default 3). **The report's status is not changed and no facility is set** (status 7 means "in a facility" to the server and caused the wrong relocation fixed on 2026-10-27, `2026-10-27_1220_secured-by-resident-not-moved-to-facility`).

If the owner has an account, they get an in-app notification: "A complaint was reported about your pet <name> (Report #N). Please keep it safely confined and act within 3 days, until <date>. Open the report to acknowledge it and send an update." An owner without an account gets only the phone contact; the card shows the number on the pet record.

### 4.3 During the observation

- **Contact log:** each entry has when, who, how (Phone, In person, In-app, Owner update, Repeated incident) and a note; several allowed until the follow-up ends.
- **Owner acknowledgement:** an owner with an account taps "I received this and I'm acting on it" in the app. For an owner without an account, the leader logs the acknowledgement received by phone (who, when, a note). Acknowledging is **not** compliance: it only records that the owner knows.
- **Owner update:** the owner (with an account) may send a photo and a short note (for example the pet confined at home). It appears in the log as "Owner update". An owner without an account sends it to the leader, who logs it.
- **Repeated incident:** if the pet is reported again during the observation, the leader logs it ("Repeated incident", with the new report number). If it was a bite or chase, staff also record it through the pet's existing verified-behaviour fields; the follow-up only references it.
- **Reminder:** one day before the due time the owner (with an account, not yet acknowledged) gets one reminder. When the period ends the leader is notified once.
- **Countdown:** days left, or "Due" / "Overdue by N days".
- **Monitoring extended:** once per follow-up, by the leader, with a reason, for the same number of days. The owner is told the new date.
- **Early escalation:** at any time, without waiting for the due time.

### 4.4 Ending (always by the leader, never automatic; the system records decision, remarks, evidence and date)

| Choice | Needs | Effect on the report | Follow-up becomes |
|---|---|---|---|
| **Owner complied** | A reason / note (what the owner did); the owner's update or the leader's observation is the evidence | Status 11 (Incident Resolved) through the existing status route | Owner Complied |
| **Close the case** | A reason; outcome Incident Resolved (11) or False Alarm (14) | The chosen existing status | Closed by Leader |
| **Escalate to the Barangay** | The existing escalation on the report page (endorsement letter, status 4, rescue request) | Status 4 | Escalated, set automatically when the report reaches status 4 (no separate endpoint, so escalation is never duplicated) |

If the existing rules refuse a choice, the follow-up stays Observing and the leader sees the server's message.

## 5. Data and settings

- **`owner_followups`**: `followup_id`; `report_id` (FK, cascade); `pet_id` (FK, set null); `owner_user_id` (FK, nullable); `owner_name`, `owner_phone` (snapshot at start); `opened_by` (FK user), `opened_at`, `due_at`; `status` (`Observing`, `Owner Complied`, `Closed by Leader`, `Escalated`, `Report Closed`); `acknowledged_at`, `acknowledged_via` (`App` or `Phone`), `acknowledged_by` (FK), `acknowledgement_note`; `reminder_sent_at`, `due_notified_at`; `extended_at`, `extended_by` (FK), `extension_reason`; `closed_by` (FK), `closed_at`, `closing_outcome`, `closing_reason`. At most one `Observing` row per report (enforced in code and tested; MySQL has no partial unique index); at most one extension.
- **`owner_followup_contacts`**: `contact_id`, `followup_id` (FK, cascade), `contacted_by` (FK user), `contacted_at`, `method` (`Phone`, `In person`, `In-app`, `Owner update`, `Repeated incident`), `note`, `photo_url` (nullable), `related_report_id` (nullable).
- **Setting:** `owner_followup_days` in `system_settings`, default 3, 1 to 14, changed by the administrator. The setting needs no row: 3 days applies until it is changed. (The per-browser stay limit on the Barangay Holding page is separate and stays.)
- **Tables:** like every other table in this project, the API creates them at startup when they are missing: new tables only, no existing table or data is changed. They are also added to `Database3.3.txt`, so a database reset keeps them.

## 6. API (new router `backend/app/routes/owner_followups.py`, registered in `main.py`)

| Endpoint | Who | Does |
|---|---|---|
| `POST /owner-followups` (`report_id`) | The leader handling the report | Start a follow-up (4.2); notifies the owner if they have an account |
| `GET /owner-followups` (`status`, `due`) | Leader: own subdivision; Barangay staff: escalated ones of their barangay, read-only; admin: all, read-only | List |
| `GET /owner-followups/by-report/{report_id}` | Staff in scope; the owner (own, without the leader's notes) | One follow-up with its contacts |
| `POST /owner-followups/{id}/contacts` | The leader who owns it | Add a contact (not "Owner update") |
| `POST /owner-followups/{id}/acknowledge` | The owner (in the app), or the leader (logging a phone acknowledgement, note required) | Record that the owner knows |
| `POST /owner-followups/{id}/owner-update` (note, optional photo) | The owner | Add an "Owner update" |
| `POST /owner-followups/{id}/extend` (`reason`) | The leader who owns it | Extend once |
| `POST /owner-followups/{id}/close` (`outcome`: `owner_complied`, `incident_resolved`, `false_alarm`; `reason`) | The leader handling the report | End it through the existing status route |
| `GET/PUT /owner-followups/settings` | Read: staff; write: admin | The observation length (1 to 14 days) |

Every endpoint checks the caller's role and subdivision on the server. Closing calls the existing report status logic rather than copying it. Escalation is not here: it stays the existing report escalation, and the follow-up ends by itself.

## 7. Screens

### 7.1 Leader's report page: the follow-up card (`SubdViewReport.tsx`)

| Situation | What the card shows |
|---|---|
| Eligible, not started (4.2) | The pet, the owner (name, phone, account or not), a note that nobody is moved, and **"Start 3-day observation"** |
| Observing | Label **"Under Observation"**; countdown ("2 days left", or **"Due: decide now"**); owner acknowledgement state; **"Log phone acknowledgement"** for an owner without an account; the contact log with "Add contact" and the owner's updates; **"Extend once"**; the ending buttons |
| Ended | How it ended, when, by whom, the reason and the contact history; read only |

Ending buttons (Escalate is available at any time, not only when due): **Owner complied** (note), **Close case** (outcome and reason), **Escalate to the Barangay** (opens the report page's existing escalation dialog). Server refusals are shown on the card; the follow-up stays Observing.

### 7.2 Finding open follow-ups

The leader's report list (`SubdReports.tsx`) shows an **"Observing"** badge (and **"Due"** once due) on reports with an open follow-up, and a filter for them.

### 7.3 Other people

- **The owner:** the notification opens the report, which says "A complaint was reported about <pet>. The subdivision is checking until <date>" with **"I received this and I'm acting on it"** and **"Send an update"** (photo, note). The owner sees no leader notes or contacts.
- **Barangay staff:** on an escalated report's page, a read-only "Owner follow-up" section with the contact history.
- **Barangay Holding Place page:** unchanged.

## 8. Edge cases

- The owner has no account: no notification; phone contact only; the leader logs the acknowledgement and any update.
- The pet's owner changes, or the pet is claimed or removed during the observation: the leader decides; the snapshot of the original owner stays on the follow-up.
- The report is rejected, merged (18), or escalated by another path while a follow-up is open: the follow-up ends as Report Closed or Escalated.
- A group report (several animals): the follow-up is per animal record, like the rest of the system (`report_split`); a group parent never gets one.
- The leader leaves or is reassigned: the new handling leader of the subdivision continues it.
- The setting changes while follow-ups are open: open ones keep their original due time.
- Time zone: Philippine time (Asia/Manila), like the rest of the system.

## 9. Phases and checklist

**Readiness check (2026-10-28, against the code).** Confirmed: a report with `pet_id` passes the animal-record rule (`_own_animal_record`), so status 11 is allowed; the "approve first" rule only applies to Barangay staff; the owner of the linked pet may open the report (`report_visibility`, access `owner`); the report response fills `owner_id`, `owner_name`, `owner_phone` from the pet's owner; the escalation dialog opens through `openEscalation()` in `SubdViewReport.tsx`; `upload_to_cloudinary` and `read_and_validate_upload` exist; the leader's and the resident's navbars already open `/subd/reports/{id}` and `/resident/reports/{id}` for any notification with `related_id` (keep the title free of "scan" and "pet found", which the resident navbar sends elsewhere). Things to respect while building: `read_and_validate_upload` is `async`, so the owner-update endpoint must be `async`; when the follow-up's own close changes the report status, the save hook ends it first as Report Closed, so the close endpoint sets its own outcome (Owner Complied or Closed by Leader) after the status change; an owner warning needs an owner **account** (`owner_id`): the existing warning form refuses an owner without one.

**Rules for every step.** Build in the order below. After each step run `npx tsc --noEmit -p tsconfig.app.json` (frontend) and the isolated backend tests; if anything that passed before is red, **stop and fix it before the next step**. Lessons from the removed attempt: (1) never leave the frontend importing a file that does not exist: create the file first, then import it; (2) import `utils/owner_followups.py` at the **top** of `utils/case_closure.py`, not inside the save hook, because importing it there registered other hooks mid-save and failed with "deque mutated during iteration"; (3) build the frontend only after the backend tests pass; (4) write a change record per step and run the documentation audit.

### Phase 0: before any code

- [x] Branch: the developer chose to stay on `polish` (2026-10-28); no new branch. Today's work is still **uncommitted**, so the feature is built on top of it: commit before starting if a saved point to return to is wanted.
- [x] The 3-day rule is confirmed by the subdivision (developer, 2026-10-28).
- [x] Question 6 decided: reuse the existing warning (2026-10-28).
- [x] Baseline is green (2026-10-28): `tsc` clean; all 85 isolated backend test files pass.

### Phase 1: backend (nothing visible yet)

- [x] **1A Model and tables.** New `backend/app/models/owner_followup.py` with `OwnerFollowUp` and `OwnerFollowUpContact` (section 5); import them in `models/__init__.py`; add both `CREATE TABLE` blocks to `Database3.3.txt`. *Done when:* the app imports and `create_all` builds both tables in a throwaway database.
- [x] **1B Rules module.** New `backend/app/utils/owner_followups.py`: `followup_days(db)` (setting, default 3, clamp 1 to 14), `eligible_reason(report, user, db)` (4.2, returns a message when refused), `end_open_followups(session, report_id, new_status)`, `check_and_notify_due_followups()` (reminder and due notice, once each).
- [x] **1C Schemas.** New `backend/app/schemas/owner_followup.py` for start, contact, acknowledge, owner update, extend, close, settings, and the responses (the owner's response leaves out the leader's notes and contacts).
- [x] **1D Router, first half.** `routes/owner_followups.py` with `POST /owner-followups`, `GET /owner-followups`, `GET .../by-report/{report_id}`, `POST .../{id}/contacts`; role and subdivision checks on the server; register in `main.py`. The start endpoint notifies the owner (text in 4.2).
- [x] **1E Router, second half.** `POST .../{id}/acknowledge`, `POST .../{id}/owner-update` (an `async` endpoint: photo through `read_and_validate_upload` and `upload_to_cloudinary`), `POST .../{id}/extend` (once), `POST .../{id}/close` (calls the existing status route logic), `GET/PUT .../settings`.
- [x] **1F Hooks.** In `utils/case_closure.py` (import at the top): end an open follow-up when its report is closed or reaches status 4. In `tasks/unassigned_checker.py`: call `check_and_notify_due_followups` in the existing watcher loop.
- [x] **1G Tests.** New `backend/tests/test_owner_followups.py` (throwaway SQLite database, real JWT) covering every item in section 11. *Done when:* it passes and the full isolated suite is still all green.

### Phase 2: leader card (replaces the preview)

- [ ] **2A API helper.** New `frontend/src/utils/ownerFollowUp.ts`: types and one function per endpoint.
- [ ] **2B Card.** New `frontend/src/components/OwnerFollowUpCard.tsx` with the three states in 7.1, using the preview's layout (`OwnerFollowUpPreview.tsx`) and the complaint wording: "Owner complied", "Log phone acknowledgement", no typed-in owner.
- [ ] **2C Wire in.** In `SubdViewReport.tsx` replace `OwnerFollowUpPreview` with the card (same eligibility condition, now confirmed by the server), then delete `OwnerFollowUpPreview.tsx`.
- [ ] **2D Ending buttons.** Owner complied and Close call the close endpoint; Escalate calls the page's existing `openEscalation()`; **Issue owner warning** opens the page's existing warning form pre-filled (pet, report, "Free-Roaming Unleashed"), shown before escalating and only for an owner with an account; show the server's refusal message on the card.
- [ ] **2E List badge.** "Observing" / "Due" badge and filter in `SubdReports.tsx`.
- [ ] **2F Check.** `tsc` clean; try it in a browser at 360 px and desktop width on a real eligible report (open, claimed by you, linked to a pet with an owner, no facility).

### Phase 3: owner and Barangay views

- [ ] **3A Owner card.** In `ResiViewReport.tsx` (the owner's report page): the message, "I received this and I'm acting on it", "Send an update" (photo, note); no leader notes.
- [ ] **3B Notification link.** Send the notifications with `related_id` = the report number: the navbars already open the report for that. Only check it works, and that the title avoids "scan" and "pet found".
- [ ] **3C Barangay section.** In `BrgyReportView.tsx`: a read-only follow-up section with the contact history, only for escalated follow-ups.
- [ ] **3D Optional.** Analytics counts (started, ended by outcome, average days); the owner warning from question 6 if decided.

### Phase 4: documents and defense

- [ ] `docs/01-system/overview.md`, the defense plan and the presentation flow describe the follow-up and say the subdivision has no holding place.
- [ ] Manuscript wording about a subdivision holding place checked against the interview.
- [ ] A change record per step; the strict documentation audit passes; this plan's status line updated.

## 10. Open questions

| # | Question | Answer |
|---|---|---|
| 1 | Observation length, and may the leader extend it? | **3 days by default** (administrator can change it). **One extension, with a reason** (revised 2026-10-28 after a classmate's review) |
| 2 | Who confirms with the owner? | **The owner acknowledges in the app when they have an account; the leader logs a phone acknowledgement when not.** Acknowledging is not compliance: the leader decides "Owner complied" |
| 3 | Old subdivision pen records? | **Settled.** The developer deleted the "Selera Homes Temporary Holding Pen" and a landmark named "Holding Place" through the app on 2026-10-27 (audit log `DELETE_LANDMARK`); nothing broke. The Barangay facility must not be deleted. Holding records of finished animals stay as history |
| 4 | Which reports? | **Settled 2026-10-28:** a report linked to a registered pet with an owner (complaint scenario). No typed-in owner |
| 5 | What does the Barangay see? | **Option A.** Only escalated follow-ups, with their full contact history |
| 6 | If the owner does not comply, may the leader issue an owner warning from the follow-up? | **Decided 2026-10-28: yes, reusing the existing warning.** No new feature. The leader can already issue warnings from the report page (types include "Free-Roaming Unleashed"; levels Notice to Final Notice). The card shows an "Issue owner warning" button that opens that existing form pre-filled, offered **before** escalating, because a leader cannot warn once a case is escalated. Only for an owner with an account |
| 7 | Is the 3-day rule official? | **Confirmed by the subdivision** (developer, 2026-10-28) |

## 11. Tests

- A follow-up starts only for a report in the leader's subdivision, claimed by that leader, linked to a pet with an owner, open, with no facility and not escalated; it starts only once at a time; a typed-in owner is not accepted.
- Starting leaves the report's status and facility unchanged and never sets status 7.
- A resident, another subdivision's leader and an unclaimed report are refused (403/404) on every endpoint.
- Contacts are saved in order with who and when; an owner without an account causes no error and gets no notification.
- Acknowledge: the owner in the app, or the leader with a note (note required); nobody else; twice is refused.
- Owner update: only the owner; a photo is stored; other residents are refused.
- Extend: once, with a reason, by the leader; a second extension is refused; the due time moves by the set number of days and the owner is told.
- The reminder goes out once a day before due (owner with an account, not acknowledged); the leader is told once when due; nothing closes or escalates by itself.
- Close: "owner complied" and "incident resolved" give report status 11, "false alarm" gives 14, through the existing status route; a reason is required; a refused change leaves the follow-up Observing with the message.
- Escalating the report the usual way ends the follow-up as Escalated; rejecting or closing the report another way ends it as Report Closed; the leader may escalate before the due time.
- Visibility: the leader sees their subdivision's follow-ups; Barangay staff of that barangay see only escalated ones, with the history; the owner sees their own without the leader's notes; the administrator sees all.
- Changing the setting does not move the due time of open follow-ups; values outside 1 to 14 are refused; only the administrator can change it.
- The Barangay holding place, the leader's Barangay Holding page and the heat map keep working, and the whole isolated backend suite stays green.

## 12. Files likely to change

- **Backend (new):** `backend/app/models/owner_followup.py`, `backend/app/schemas/owner_followup.py`, `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/tests/test_owner_followups.py`.
- **Backend (edited):** `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/utils/case_closure.py`, `backend/app/tasks/unassigned_checker.py`, `Database3.3.txt`.
- **Frontend (new):** `frontend/src/utils/ownerFollowUp.ts`, `frontend/src/components/OwnerFollowUpCard.tsx`.
- **Frontend (edited):** `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `SubdReports.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, the three navbars (notification link). **Removed:** `OwnerFollowUpPreview.tsx`.
- **Docs:** overview, defense plan, presentation flow, this plan, change records.

## 13. Risks

- It adds two database tables and a hook on every report status change shortly before a defense. If time is short, build Phases 1 and 2 only and present Phase 3 as planned; or keep the static preview and present the whole feature as planned.
- The 3-day rule comes from an interview; confirm it (Phase 0).
- The server does not yet scope staff by subdivision on the reports list; the new endpoints must not rely on it.
- The owner photo upload reuses the existing upload helpers; test it with a real file before relying on it.

## 14. For the defense

> "The subdivision has no holding place. When a complaint is reported about a registered pet, the Subdivision Leader contacts the owner, and the system tracks a 3-day observation: the owner is notified and asked to keep the pet confined, may send a photo update, and every contact and repeated incident is logged. The leader may extend once with a reason, or escalate to the Barangay at any time if the pet is a danger. At the end the leader records that the owner complied, closes the case with a reason, or escalates it; the system records the decision, remarks, evidence and date."

Until it is built, say: the subdivision no longer holds animals in the system (done), the leader's report page shows a working preview of the 3-day observation, and saving it, the owner's side and the Barangay's view are the next phases.
