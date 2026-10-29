# Subdivision owner follow-up (3-day observation of a complaint about a registered pet)

- **Status (2026-10-29):** built on 2026-10-28: backend (`owner_followups` tables and routes), the leader's card, the owner's panel and the Barangay's read-only section. The checklist in section 9 was not ticked as the work was done. Still to do: the developer's browser check (2F) and the documents (Phase 4). **Owner warnings:** decided in section 15; Phases 5A (backend rules), 5B (repeated report detection, backend) 5C (leader-verified identity, backend), 5D (warning per incident), 5E (banners and the identity check on screen) and 5F (follow-ups in the pet record's history) built 2026-10-29; 5G (the developer's check on a real case, and the documents) not done.
- **Earlier status (2026-10-28, outdated):** step 1 (hide the subdivision holding place) is done, and a **static UI preview** of the card exists on the leader's report page (`frontend/src/components/OwnerFollowUpPreview.tsx`, saves nothing). The real feature is **not built**. A first backend was written on 2026-10-27 and **removed on 2026-10-28** together with an unfinished frontend that pointed to files that did not exist and broke the build (change record `2026-10-28_0412_remove-owner-follow-up-code`). This plan is the rebuilt design, ready to implement from section 9.
- **Scenario (decided 2026-10-28):** a complaint about a **registered pet that has a known owner**. The Subdivision Leader contacts the owner and checks, within 3 days, whether the owner does something about the pet. Then the leader resolves the case or escalates it to the Barangay.
- **Direction:** the follow-up lives on the leader's **report page**. No new page, route or menu entry. The Barangay holding place, and the leader's read-only Barangay Holding page, stay as they are.
- The interview facts below are as the developer reported them; they are not confirmed with the barangay or the subdivision.

## 1. Why

According to the interview, the subdivision has no holding place. When a pet that belongs to a known owner causes a problem, the leader talks to the owner and checks whether the owner acts within 3 days. The system had no way to record that: no deadline, no contact log, no owner notification. Without it, the process the interview describes is only done outside the system.

## 2. Decisions (from the developer)

| Question                   | Decision                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario (2026-10-28)      | A complaint about a registered pet with a known owner: "the 3-day rule is for the subdivision checking if the owner of the pet does something about his pet"                                |
| Which reports              | Only a report linked to a **registered pet that has an owner** (an owner account, or the owner's name and phone on the pet record). **No typed-in owner, no found-stray flow.** |
| Who holds the animal       | Nobody. The pet stays with its owner; nothing is moved or placed                                                                                                                            |
| How the owner is contacted | By phone (logged by the leader) and by an in-app notification when the owner has an account                                                                                                 |
| Length                     | 3 days by default; the administrator can change it (1 to 14)                                                                                                                                |
| Extension (2026-10-28)     | Allowed **once**, by the leader, with a reason, for the same number of days                                                                                                           |
| Early escalation           | The leader may escalate **at any time** when the problem continues, the pet is a danger or the owner does not comply                                                                  |
| After the observation      | The leader decides: owner complied (resolved), close with a reason, or escalate. **Nothing is automatic**                                                                             |
| Subdivision holding place  | Hidden for leaders (step 1, done 2026-10-27); nothing deleted                                                                                                                               |
| What the Barangay sees     | Only **escalated** follow-ups, with the full contact history                                                                                                                          |
| Owner warnings (2026-10-29) | **Only the Subdivision Leader issues warnings**, all four tiers. The Barangay does not warn. One warning per verified incident (section 15) |

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

If the owner has an account, they get an in-app notification: "A complaint was reported about your pet <name></name> (Report #N). Please keep it safely confined and act within 3 days, until <date></date>. Open the report to acknowledge it and send an update." An owner without an account gets only the phone contact; the card shows the number on the pet record.

### 4.3 During the observation

- **Contact log:** each entry has when, who, how (Phone, In person, In-app, Owner update, Repeated incident) and a note; several allowed until the follow-up ends.
- **Owner acknowledgement:** an owner with an account taps "I received this and I'm acting on it" in the app. For an owner without an account, the leader logs the acknowledgement received by phone (who, when, a note). Acknowledging is **not** compliance: it only records that the owner knows.
- **Owner update:** the owner (with an account) may send a photo and a short note (for example the pet confined at home). It appears in the log as "Owner update". An owner without an account sends it to the leader, who logs it.
- **Repeated incident:** if the pet is reported again during the observation, the leader logs it ("Repeated incident", with the new report number). A verified repeat may get the next warning (section 15). If it was a bite or chase, staff also record it through the pet's existing verified-behaviour fields; the follow-up only references it.
- **Reminder:** one day before the due time the owner (with an account, not yet acknowledged) gets one reminder. When the period ends the leader is notified once.
- **Countdown:** days left, or "Due" / "Overdue by N days".
- **Monitoring extended:** once per follow-up, by the leader, with a reason, for the same number of days. The owner is told the new date.
- **Early escalation:** at any time, without waiting for the due time.

### 4.4 Ending (always by the leader, never automatic; the system records decision, remarks, evidence and date)

| Choice                             | Needs                                                                                                | Effect on the report                                            | Follow-up becomes                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Owner complied**           | A reason / note (what the owner did); the owner's update or the leader's observation is the evidence | Status 11 (Incident Resolved) through the existing status route | Owner Complied                                                                                                          |
| **Close the case**           | A reason; outcome Incident Resolved (11) or False Alarm (14)                                         | The chosen existing status                                      | Closed by Leader                                                                                                        |
| **Escalate to the Barangay** | The existing escalation on the report page (endorsement letter, status 4, rescue request)            | Status 4                                                        | Escalated, set automatically when the report reaches status 4 (no separate endpoint, so escalation is never duplicated) |

If the existing rules refuse a choice, the follow-up stays Observing and the leader sees the server's message.

## 5. Data and settings

- **`owner_followups`**: `followup_id`; `report_id` (FK, cascade); `pet_id` (FK, set null); `owner_user_id` (FK, nullable); `owner_name`, `owner_phone` (snapshot at start); `opened_by` (FK user), `opened_at`, `due_at`; `status` (`Observing`, `Owner Complied`, `Closed by Leader`, `Escalated`, `Report Closed`); `acknowledged_at`, `acknowledged_via` (`App` or `Phone`), `acknowledged_by` (FK), `acknowledgement_note`; `reminder_sent_at`, `due_notified_at`; `extended_at`, `extended_by` (FK), `extension_reason`; `closed_by` (FK), `closed_at`, `closing_outcome`, `closing_reason`. At most one `Observing` row per report (enforced in code and tested; MySQL has no partial unique index); at most one extension.
- **`owner_followup_contacts`**: `contact_id`, `followup_id` (FK, cascade), `contacted_by` (FK user), `contacted_at`, `method` (`Phone`, `In person`, `In-app`, `Owner update`, `Repeated incident`), `note`, `photo_url` (nullable), `related_report_id` (nullable).
- **Setting:** `owner_followup_days` in `system_settings`, default 3, 1 to 14, changed by the administrator. The setting needs no row: 3 days applies until it is changed. (The per-browser stay limit on the Barangay Holding page is separate and stays.)
- **Tables:** like every other table in this project, the API creates them at startup when they are missing: new tables only, no existing table or data is changed. They are also added to `Database3.3.txt`, so a database reset keeps them.

## 6. API (new router `backend/app/routes/owner_followups.py`, registered in `main.py`)

| Endpoint                                                                                                                   | Who                                                                                                         | Does                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `POST /owner-followups` (`report_id`)                                                                                  | The leader handling the report                                                                              | Start a follow-up (4.2); notifies the owner if they have an account |
| `GET /owner-followups` (`status`, `due`)                                                                             | Leader: own subdivision; Barangay staff: escalated ones of their barangay, read-only; admin: all, read-only | List                                                                |
| `GET /owner-followups/by-report/{report_id}`                                                                             | Staff in scope; the owner (own, without the leader's notes)                                                 | One follow-up with its contacts                                     |
| `POST /owner-followups/{id}/contacts`                                                                                    | The leader who owns it                                                                                      | Add a contact (not "Owner update")                                  |
| `POST /owner-followups/{id}/acknowledge`                                                                                 | The owner (in the app), or the leader (logging a phone acknowledgement, note required)                      | Record that the owner knows                                         |
| `POST /owner-followups/{id}/owner-update` (note, optional photo)                                                         | The owner                                                                                                   | Add an "Owner update"                                               |
| `POST /owner-followups/{id}/extend` (`reason`)                                                                         | The leader who owns it                                                                                      | Extend once                                                         |
| `POST /owner-followups/{id}/close` (`outcome`: `owner_complied`, `incident_resolved`, `false_alarm`; `reason`) | The leader handling the report                                                                              | End it through the existing status route                            |
| `GET/PUT /owner-followups/settings`                                                                                      | Read: staff; write: admin                                                                                   | The observation length (1 to 14 days)                               |

Every endpoint checks the caller's role and subdivision on the server. Closing calls the existing report status logic rather than copying it. Escalation is not here: it stays the existing report escalation, and the follow-up ends by itself.

## 7. Screens

### 7.1 Leader's report page: the follow-up card (`SubdViewReport.tsx`)

| Situation                   | What the card shows                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligible, not started (4.2) | The pet, the owner (name, phone, account or not), a note that nobody is moved, and **"Start 3-day observation"**                                                                                                                                                                                      |
| Observing                   | Label **"Under Observation"**; countdown ("2 days left", or **"Due: decide now"**); owner acknowledgement state; **"Log phone acknowledgement"** for an owner without an account; the contact log with "Add contact" and the owner's updates; **"Extend once"**; the ending buttons |
| Ended                       | How it ended, when, by whom, the reason and the contact history; read only                                                                                                                                                                                                                                  |

Ending buttons (Escalate is available at any time, not only when due): **Owner complied** (note), **Close case** (outcome and reason), **Escalate to the Barangay** (opens the report page's existing escalation dialog). Server refusals are shown on the card; the follow-up stays Observing.

### 7.2 Finding open follow-ups

The leader's report list (`SubdReports.tsx`) shows an **"Observing"** badge (and **"Due"** once due) on reports with an open follow-up, and a filter for them.

### 7.3 Other people

- **The owner:** the notification opens the report, which says "A complaint was reported about <pet></pet>. The subdivision is checking until <date></date>" with **"I received this and I'm acting on it"** and **"Send an update"** (photo, note). The owner sees no leader notes or contacts.
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

**Rules for every step.** Build in the order below. After each step run `npx tsc --noEmit -p tsconfig.app.json` (frontend) and the isolated backend tests; if anything that passed before is red, **stop and fix it before the next step**. Lessons from the removed attempt: (1) never leave the frontend importing a file that does not exist: create the file first, then import it; (2) import `utils/owner_followups.py` at the **top** of `utils/case_closure.py`, not inside the save hook, because importing it there registered other hooks mid-save and failed with "deque mutated during iteration"; (3) build the frontend only after the backend tests pass; (4) write a change record per step and run the documentation audit.

### Phase 0: before any code

- [ ] Put today's uncommitted work on a branch and commit it (about 250 changed files), so this feature starts from a saved baseline. The developer names the branch.
- [x] The developer confirms with the adviser or the barangay that the 3-day rule is real (confirmed by the developer 2026-10-29).
- [x] Decide section 10, question 6 (owner warning at the end): decided 2026-10-29, the leader only (section 15).
- [ ] Baseline is green: `tsc` clean; every isolated backend test file passes (85 on 2026-10-28). Note the number.

### Phase 1: backend (nothing visible yet)

- [ ] **1A Model and tables.** New `backend/app/models/owner_followup.py` with `OwnerFollowUp` and `OwnerFollowUpContact` (section 5); import them in `models/__init__.py`; add both `CREATE TABLE` blocks to `Database3.3.txt`. *Done when:* the app imports and `create_all` builds both tables in a throwaway database.
- [ ] **1B Rules module.** New `backend/app/utils/owner_followups.py`: `followup_days(db)` (setting, default 3, clamp 1 to 14), `eligible_reason(report, user, db)` (4.2, returns a message when refused), `end_open_followups(session, report_id, new_status)`, `check_and_notify_due_followups()` (reminder and due notice, once each).
- [ ] **1C Schemas.** New `backend/app/schemas/owner_followup.py` for start, contact, acknowledge, owner update, extend, close, settings, and the responses (the owner's response leaves out the leader's notes and contacts).
- [ ] **1D Router, first half.** `routes/owner_followups.py` with `POST /owner-followups`, `GET /owner-followups`, `GET .../by-report/{report_id}`, `POST .../{id}/contacts`; role and subdivision checks on the server; register in `main.py`. The start endpoint notifies the owner (text in 4.2).
- [ ] **1E Router, second half.** `POST .../{id}/acknowledge`, `POST .../{id}/owner-update` (photo through the existing upload helpers), `POST .../{id}/extend` (once), `POST .../{id}/close` (calls the existing status route logic), `GET/PUT .../settings`.
- [ ] **1F Hooks.** In `utils/case_closure.py` (import at the top): end an open follow-up when its report is closed or reaches status 4. In `tasks/unassigned_checker.py`: call `check_and_notify_due_followups` in the existing watcher loop.
- [ ] **1G Tests.** New `backend/tests/test_owner_followups.py` (throwaway SQLite database, real JWT) covering every item in section 11. *Done when:* it passes and the full isolated suite is still all green.

### Phase 2: leader card (replaces the preview)

- [ ] **2A API helper.** New `frontend/src/utils/ownerFollowUp.ts`: types and one function per endpoint.
- [ ] **2B Card.** New `frontend/src/components/OwnerFollowUpCard.tsx` with the three states in 7.1, using the preview's layout (`OwnerFollowUpPreview.tsx`) and the complaint wording: "Owner complied", "Log phone acknowledgement", no typed-in owner.
- [ ] **2C Wire in.** In `SubdViewReport.tsx` replace `OwnerFollowUpPreview` with the card (same eligibility condition, now confirmed by the server), then delete `OwnerFollowUpPreview.tsx`.
- [ ] **2D Ending buttons.** Owner complied and Close call the close endpoint; Escalate opens the existing escalation dialog (`setIsEscalateModalOpen(true)` path); show the server's refusal message on the card.
- [ ] **2E List badge.** "Observing" / "Due" badge and filter in `SubdReports.tsx`.
- [ ] **2F Check.** `tsc` clean; try it in a browser at 360 px and desktop width on a real eligible report (open, claimed by you, linked to a pet with an owner, no facility).

### Phase 3: owner and Barangay views

- [ ] **3A Owner card.** In `ResiViewReport.tsx` (the owner's report page): the message, "I received this and I'm acting on it", "Send an update" (photo, note); no leader notes.
- [ ] **3B Notification link.** Map the new notification type (for example `owner_followup`) to the report page in `ResiNavbar.tsx`, `SubdNavbar.tsx` and `BrgyNavbar.tsx`.
- [ ] **3C Barangay section.** In `BrgyReportView.tsx`: a read-only follow-up section with the contact history, only for escalated follow-ups.
- [ ] **3D Optional.** Analytics counts (started, ended by outcome, average days); the owner warning from question 6 if decided.

### Phase 4: documents and defense

- [ ] `docs/01-system/overview.md`, the defense plan and the presentation flow describe the follow-up and say the subdivision has no holding place.
- [ ] Manuscript wording about a subdivision holding place checked against the interview.
- [ ] A change record per step; the strict documentation audit passes; this plan's status line updated.

### Phase 5: owner warnings and repeated incidents (section 15; 5A to 5F built 2026-10-29; 5G not done)

**Rules:** the same as every step above. Each step ends with `tsc` clean and the full isolated backend suite green (78 files on 2026-10-29), plus a change record. No new tables or statuses.

**5.0 Before any code**

- [ ] The developer commits the current uncommitted work (adoption removal, YOLO-only pet photos, the match-to-claim shortcut and others) so Phase 5 starts from a saved baseline.
- [x] Questions 7 (the 3-day rule) and 12 (consequences, fines) confirmed by the developer 2026-10-29. Still needed for 12: the fine amounts and the ordinance to cite.
- [x] Question 13 decided 2026-10-29: only "Photos and markings match" counts; the leader waits 24 hours for the owner's answer (none when the owner said no).
- [ ] Decide whether the 7-day claim rule (for the animal the Barangay holds, question 8) is planned before or after Phase 5.

**5A Backend rules (built 2026-10-29)**

- [x] Only role 2 may issue a warning (`routes/warnings.py`); Barangay staff and administrators keep read access.
- [x] A follow-up cannot start on a Rabies Risk report (category 3); the start check says why (`start_refusal` in `utils/owner_followups.py`). The card's message is 5E.
- [x] The follow-up response carries a caution for Injured (1), Aggressive (2) or High priority, for the card's banner (`caution`, staff view only, while observing; `followup_caution`).
- [x] A second Observing follow-up for the same pet is refused on any report (409, naming the report under observation).
- [x] Tests for each item: `backend/tests/test_owner_warning_rules.py` (16 of 16). `test_owner_followups.py` now gives its later follow-ups their own pets (69 of 69). Full isolated suite: 79 of 79 files.

**5B Repeated report detection (backend built 2026-10-29)**

- [x] When a report is linked to a pet that has an Observing follow-up on another report, notify the handling leader and show that follow-up's report number in the new report's response. This applies to every path that sets `report.pet_id`: `link_confirmed_pet_match`, `POST /reports/{id}/link-pet`, the status route's `pet_id`, and creating a pet from a report. **Built** as one save hook for every path (`utils/case_closure.py`, `notify_repeated_report` in `utils/owner_followups.py`): one notice per report ("Repeated report: Report #N"), none once it is logged. The report detail gives the leader of that subdivision and the administrator `observing_followup_report_id`; the follow-up's staff view lists `unlogged_repeat_report_ids`.
- [x] The leader logs it with one click through the existing contacts endpoint ("Repeated incident" with the report number), or merges it when it is the same event. **Backend built:** a "Repeated incident" entry now needs its report (not the observed report itself), and the same report cannot be logged twice (409). The one-click button is part of the banner (5E).
- [x] Tests: a repeat notifies once; a merged duplicate does not count as a repeat. `backend/tests/test_owner_repeated_reports.py` (17 of 17); full isolated suite 80 of 80 files.

**5C Leader-verified identity (question 9; backend built 2026-10-29)**

- [x] When the owner has not answered within the agreed time, or rejected the match, the handling leader may confirm the identity with a method from question 13 and a reason. It is recorded on the match and in the audit log, and the owner is notified. The owner can still dispute it (existing dispute flow). **Built:** `POST /matches/{match_id}/leader-verify-identity` (`routes/matches.py`). It needs a staff-confirmed match (`CONFIRMED_MATCH`) and 24 hours since the owner was last asked, or the owner's "not my pet". It sets the owner's half to `LEADER_VERIFIED` (a new value of `owner_confirmation_status`, no new column or table), which counts as confirmed, and links the report. The owner is told to file a dispute on the report if it is not their pet; the owner's own answer can no longer undo it. The button is not built yet (screens).
- [x] `require_direct_pet_link` allows this one case and nothing else. **Not needed:** the link goes through the match (`link_confirmed_pet_match`), not the direct link, so `require_direct_pet_link` is unchanged and still refuses every direct link of an owned pet.
- [x] Tests: refused without a method and reason, without waiting, or for anyone but the handling leader. `backend/tests/test_leader_verified_identity.py` (21 of 21); full isolated suite 81 of 81 files.

**5D Warning form from the follow-up (built 2026-10-29)**

- [x] The form lets the leader choose the report the warning is for: the original, or a logged repeated incident. The existing duplicate check (same report, pet and violation type) then gives one warning per incident. **Built:** the card's "Owner warnings" list has one row per incident (the observed report, then each logged repeat), each with "Issue warning" while it has none. The page's form sends that report's number. The server now also refuses a leader warning on another subdivision's report, and a warning about a registered pet sent to anyone but its owner.
- [x] The description is prefilled with the observation's start and end dates and the instructions to the owner (keep the pet confined and leashed; a repeat may lead to the next warning or escalation). The leader can edit it.
- [x] The report page keeps the issue action while a logged repeat has no warning (today it turns into "View Issued Warning Details"). **Built** in the card, per incident; the page's own button still covers this report's warning.
- [x] The card lists its report's warnings (`GET /warnings/report/{report_id}`), and those of each logged repeat, while observing and after it ended.
- [x] Owner without an account: the card offers "Log verbal warning", saved as a contact entry (Phone or In person), not as an `OwnerWarning`. The note starts with "Verbal warning:".
- [x] Tests: `backend/tests/test_owner_warning_rules.py` (21 of 21: one warning per incident, the subdivision and owner refusals); `frontend/tests/ownerWarnings.browser.mjs` (the list, the prefilled form target, the verbal warning). Full isolated suite 81 of 81 files.

**5E Banners (built 2026-10-29)**

- [x] The caution banner on the card (5A), and the Rabies Risk refusal message. **Built** in `OwnerFollowUpCard.tsx`: the caution shows before the start (worked out from the category and priority) and while observing (from the server). A Rabies Risk report shows the reason and an escalation button instead of the start button.
- [x] The repeated-report banner on both reports (5B). **Built:** the observed report's card lists the reports not logged yet, each with a link and a one-click "Log as repeated incident". The new report shows `RepeatedReportBanner.tsx` ("under an owner follow-up on Report #N", with "Log on Report #N"), and says once it is logged.
- [x] Also built (5C on screen): `LeaderIdentityConfirm.tsx` in the match review pop-up, for the leader handling the report. Before 24 hours it says when the leader can confirm. After that, or when the owner said no, it offers "Confirm identity" with the method and a reason. The badges show "Leader Verified (photos and markings)", and the owner sees that the leader confirmed it and can file a dispute.
- [x] Tests: `frontend/tests/ownerWarnings.browser.mjs` at 390 and 1280 px (all API calls mocked). The other browser tests, `tsc` and the node tests pass. Not checked on a real case yet (5G).

**5F Pet record history (built 2026-10-29)**

- [x] `GET /owner-followups` takes a `pet_id` filter (staff only). The existing scoping still applies: a leader sees their subdivision, Barangay staff escalated follow-ups of their barangay, residents get 403.
- [x] A read-only "Complaints" section in `PetDetailPanel.tsx`: warnings, follow-ups and linked reports, newest first. **Built differently:** the pet record's existing "Pet History" tab already lists the warnings and linked reports newest first, so a second section would repeat them. Each owner follow-up is added to that timeline instead, for staff: the report number, status, observation dates, outcome, logged repeated incidents and the number of verbal warnings.
- [x] Tests: `backend/tests/test_owner_followups.py` (72 of 72: the filter, another subdivision, a resident refused); `frontend/tests/ownerWarnings.browser.mjs` (the follow-up entry in Pet History). Full isolated suite 81 of 81 files.

**5G Check and documents**

- [ ] The developer's browser check on a real case: match, owner confirms, observe, repeat, warn at the next tier, escalate.
- [ ] `docs/01-system/overview.md`, the defense plan and the presentation flow describe the warning rule; this plan's status line updated.

### Phase 6: a pet claim only for an animal someone holds (decided 2026-10-29; 6A and 6B built 2026-10-29, 6C not done)

**Why:** on `/resident/reports/1/match-review` the owner said "Yes, it's my pet" for a roaming dog nobody had picked up. The page went straight to *Submit Pet Claim*, so the claim sat in **Pending Review** on `/subd/pet-claims` with nothing to hand over. The claim flow (claim, approve, handover, Pet Received) assumes someone holds the animal; nothing checks it.

**Decided by the developer (2026-10-29):**

- A pet claim is only for an animal someone holds. The subdivision has no holding place, so in practice that is the Barangay after an escalation and rescue (section 10, question 8): the owner claims on `/brgy/pet-claims`.
- **Held** means any of these: a holding record (`HoldingAnimal`), `facility_id` set, report status 5 Rescue In Progress, 6 Picked Up, 7 Under Observation (holding) or 8 Impounded, or a custody value in a facility or holding place (including the leftover "In Subdivision Holding (Awaiting Barangay Pickup)"). Anything else (a sighting of a roaming dog) is not held.
- **A:** a claim already open on an animal nobody holds is closed as `Rejected` with the fixed reason "Not needed: the pet is home", and screens show it as **"Closed: not needed"**. No new claim status.
- **B:** when the owner says the pet is still missing, the leader is told and the sighting stays on the pet's record. The pet is not marked Lost. The owner can file a Lost Pet report for the full lost-pet path.

**6A Backend (built 2026-10-29)**

- [x] One helper says whether a report's animal is held (the definition above, over the whole merged case). `animal_held` in `backend/app/utils/claim_custody.py` (an open holding record has no discharge date). Claims returned by the claim routes carry `animal_held` and `closed_not_needed`.
- [x] Filing a claim (`POST /claims/` and the evidence routes) on an animal nobody holds is refused (409) with a clear message: nobody is holding the pet, so no claim is needed; tell the leader whether it is home. Also `PATCH /claims/{id}` by the owner. A claim already Approved, handed over or received goes on.
- [x] The owner's answer for an animal nobody holds: "It's home" or "Still missing", with an optional note. It is recorded in the report history and notifies the handling leader. No new table: stored on the match's owner notes and in the status history. **Built:** `POST /claims/custody-answer` (the pet's owner only, after confirming the sighting; refused when the animal is held). Stored as a report history entry ("Owner answer: the pet is home." or "... still missing.") plus the note; `owner_custody_answer` reads the latest. The match's notes are not used.
- [x] The leader closes an open claim on an animal nobody holds: status `Rejected`, reason "Not needed: the pet is home". It is refused once the animal is held. **Built:** `POST /claims/{id}/close-not-needed` (staff in scope); the owner is notified; audit log `CLOSE_CLAIM_NOT_NEEDED`.
- [x] When the animal becomes held later (escalation, rescue), the claim flow opens as today (the check is made each time).
- [x] Tests: refused when not held, allowed when held (each held signal), the owner's two answers, closing an unneeded claim, refused once held. `backend/tests/test_claim_only_when_held.py` (25 of 25). Four older claim tests now mark their reports as held. Full isolated suite 82 of 82 files.
- **Until 6B is built:** the resident's "Submit Pet Claim" on an animal nobody holds shows the server's refusal message instead of the new question.

**6B Screens (built 2026-10-29)**

- [x] Resident match review: after "Yes, it's my pet" on an animal nobody holds, there is no claim form. It asks "Nobody is holding your pet. Is it home with you?" with **Yes, it's home** and **No, still missing**. **Built:** `CustodyQuestion.tsx` in `PetMatchReview.tsx` (title "Is Your Pet Home?", optional note, the answer can be changed). An open claim already filed shows "your Subdivision Leader will close it" and the same question. A leader-verified match (`LEADER_VERIFIED`) also counts as confirmed here. The report detail now carries `animal_held` and `owner_custody_answer`.
- [x] Leader report page and claims page: show the owner's answer. "It's home" points to closing the report (Incident Resolved) or starting the owner follow-up. **Built:** a note on `/subd/reports/:id`, and in the claims panel.
- [x] `/subd/pet-claims`: a claim on an animal nobody holds shows "Nobody is holding this animal, so no handover is needed" and a **Close: not needed** button. A claim closed this way shows "Closed: not needed", not "Rejected", wherever the claim status shows. **Built:** `ClaimNotNeededPanel.tsx` on `/subd/pet-claims` and `/brgy/pet-claims`; the label through `claimStatusLabel` (list, table, details, and the resident's claim card).
- [x] Browser test: `frontend/tests/ownerWarnings.browser.mjs` (the owner's answer with a note, the staff close). The match review and claims pages are covered by `tsc` and their existing browser tests, not by a new page-level test.

**Fix found in the developer's check (2026-10-29):** report #1's claim was closed as not needed, then approved 27 seconds later. The claims page still offered Approve on a closed claim, and the status route had no custody rule. Now: approving, requesting evidence, resubmitting or handing over is refused when nobody holds the animal, unless the claim was already approved. An approved claim on an animal nobody holds can also be closed as not needed, which gives the report back the status it had before the approval. The claims page shows no review buttons on such a claim. "Held" also covers an approved claim whose report was held just before the approval (Claimed by Owner hides Picked Up until the handover).

**6C Check and documents**

- [ ] The developer's check: report #1's open claim closes as not needed; a roaming dog gives no claim form; an escalated, held dog still gets the claim and handover.
- [ ] `docs/01-system/overview.md` and the presentation flow: "a claim is only for a held animal".

## 10. Open questions

| # | Question                                                                                | Answer                                                                                                                                                                                                                                                                                              |
| - | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Observation length, and may the leader extend it?                                       | **3 days by default** (administrator can change it). **One extension, with a reason** (revised 2026-10-28 after a classmate's review)                                                                                                                                                   |
| 2 | Who confirms with the owner?                                                            | **The owner acknowledges in the app when they have an account; the leader logs a phone acknowledgement when not.** Acknowledging is not compliance: the leader decides "Owner complied"                                                                                                       |
| 3 | Old subdivision pen records?                                                            | **Settled.** The developer deleted the "Selera Homes Temporary Holding Pen" and a landmark named "Holding Place" through the app on 2026-10-27 (audit log `DELETE_LANDMARK`); nothing broke. The Barangay facility must not be deleted. Holding records of finished animals stay as history |
| 4 | Which reports?                                                                          | **Settled 2026-10-28:** a report linked to a registered pet with an owner (complaint scenario). No typed-in owner                                                                                                                                                                             |
| 5 | What does the Barangay see?                                                             | **Option A.** Only escalated follow-ups, with their full contact history                                                                                                                                                                                                                      |
| 6 | If the owner does not comply, may the leader issue an owner warning from the follow-up? | **Decided 2026-10-29:** yes, and **only the leader** issues warnings. One warning per verified incident (section 15) |
| 7 | Is the 3-day rule official? | **Decided 2026-10-29:** yes, confirmed by the developer |
| 8 | The Barangay does not warn: what does it do with an escalated case? | **Decided 2026-10-29:** the Barangay **holds the animal**. The existing path: escalation, rescue, intake in the Barangay holding place, then the claim period (the owner is known and can claim with proof); unclaimed, it is impounded, and the hold can be extended. Depends on the 7-day claim rule, which is not planned yet |
| 9 | Must the owner confirm the pet match before the leader can warn? | **Decided 2026-10-29 (recommendation recorded at the developer's request):** yes by default. When the owner does not answer or denies it, the handling leader may confirm the identity themselves with a stated method and reason (a person verifies, never the AI). Not built: today linking an owned pet without the owner's confirmation is refused (`require_direct_pet_link`). Details in question 13 |
| 10 | A report that is not "Roaming Animal" (Injured, Aggressive, Rabies Risk) or has High priority: a banner on the card, or blocked from observation? | **Decided 2026-10-29 (recommendation recorded at the developer's request):** a caution banner for Injured, Aggressive or High priority (the leader may still observe); **Rabies Risk cannot be observed** and goes to the Barangay |
| 11 | Is a warning required before the observation starts, or optional? | **Decided 2026-10-29:** optional. The observation can start with contacting the owner; the leader warns when needed |
| 12 | What are the "consequences of repeated violations" the warning names (fines, impoundment, barangay ordinance)? The warning has a fine amount field the form always sends as 0 | **Decided 2026-10-29:** yes, the warning states consequences (confirmed by the developer). **Still open:** the fine amount per tier and the ordinance to cite; until then the fine stays 0 |
| 13 | For the leader's own identity check (question 9): which methods count (QR tag scan, seen at the owner's home, matching the record's photos and markings), and how long to wait for the owner's answer first? | **Decided 2026-10-29:** only "Photos and markings match" counts. The leader waits 24 hours after the owner was asked; when the owner said it is not their pet, the leader may confirm at once |

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
- The 3-day rule comes from an interview; confirmed by the developer 2026-10-29.
- The server does not yet scope staff by subdivision on the reports list; the new endpoints must not rely on it.
- The owner photo upload reuses the existing upload helpers; test it with a real file before relying on it.

## 14. For the defense

> "The subdivision has no holding place. When a complaint is reported about a registered pet, the Subdivision Leader contacts the owner, and the system tracks a 3-day observation: the owner is notified and asked to keep the pet confined, may send a photo update, and every contact and repeated incident is logged. The leader may extend once with a reason, or escalate to the Barangay at any time if the pet is a danger. At the end the leader records that the owner complied, closes the case with a reason, or escalates it; the system records the decision, remarks, evidence and date."

Until it is built, say: the subdivision no longer holds animals in the system (done), the leader's report page shows a working preview of the 3-day observation, and saving it, the owner's side and the Barangay's view are the next phases.

## 15. Owner warnings (decided and proposed 2026-10-29; not built)

**Decided by the developer:** only the Subdivision Leader issues owner warnings, all four tiers (Notice, 1st Warning, 2nd Warning, Final Notice / Escalation). The Barangay and the administrator do not issue warnings; they see the warning history read-only. Escalating is not a warning: the leader gives the Final Notice first, then escalates. After escalation the subdivision can no longer warn (already enforced). The Barangay then **holds the animal** (section 10, question 8).

**Also decided 2026-10-29** (section 10): the owner confirms the match by default, with a leader-verified fallback (question 9); a caution banner for Injured, Aggressive or High priority and no observation for Rabies Risk (question 10); a warning is optional (question 11).

**Rule (proposed): one warning per verified incident, not per report and not per day.**

| Situation | Warn again? | What happens |
|---|---|---|
| During the observation, a new report shows the pet roaming again | Yes | The leader logs it as a repeated incident and issues the next tier on that report |
| During the observation, a new report of the same event | No | It is a duplicate: merged, no second warning |
| The observation ends with no new report | No automatic warning | The leader decides: owner complied, close, or escalate (passing days alone proves nothing) |
| After the case closed as "owner complied", the pet roams again | Yes, as a new case | A new follow-up on the new report; the tier continues, because it comes from the pet's warning history |
| The observation ends and the problem is still there | Final Notice, then escalate | The leader gives the Final Notice and escalates to the Barangay |

**What exists (checked in the code 2026-10-29):**

- `OwnerWarning` stores the owner (`user_id`, required), the pet and the report; tiers and violation types (including "Free-Roaming Unleashed" and "Nuisance / Aggressive Behavior"); an in-app notification and email; the owner's acknowledgement; history by pet, owner and report; the pet record shows it.
- The issue form suggests the next tier from the pet's earlier warnings.
- The server accepts warnings from leaders, Barangay staff and administrators, and refuses a leader once the case is escalated.
- The duplicate check refuses a second warning for the same report, pet and violation type.
- On the report page, once a report has a warning its button becomes "View Issued Warning Details". The follow-up card's "Issue owner warning" button still opens the form.
- A warning needs an owner account, so an owner known only by name and phone cannot receive one.
- Only leader pages issue warnings (`SubdViewReport.tsx`, `SubdReports.tsx`); no Barangay or administrator screen has an issue button, so "leader only" is a server change.
- Linking an owned pet to a report without the owner's confirmation is refused on every path (`require_direct_pet_link` in `utils/case_groups.py`). Staff can first send the owner a question (`request_owner_verification` in `routes/matches.py`).
- The warning and the follow-up are not linked except through the same `report_id`; the warning carries no observation dates.
- A repeated report is linked only by hand ("Repeated incident" contact entry). Nothing detects a new report about a pet under observation, and a second follow-up for the same pet can start on another report.

**Lost or just out of the house (2026-10-29):** a report is a lost-pet case only when the owner reported it lost (category 6, Lost Pet, or the `[LOST PET REPORT]` marker). A report linked to a registered pet is not a lost pet by itself: being linked only identifies the owner, and a roaming owned pet follows this owner follow-up. The resident's report page was labelling every report linked to a pet as "Lost Pet Recovery Case"; it now says "Registered Pet Case" with the real category and "Owner identified".

**Changes needed:** Phase 5 in section 9 lists the steps (none built). No new tables, statuses or modules: the warning and the follow-up already share `report_id`, and repeated incidents use the existing contact log.
