# Adoption Workflow — Barangay Authority, Case Ownership & Assignment Audit

**Date:** 2026-10-03 · **Branch:** `adoption_proces`
**Method:** Static trace of `backend/app/routes/adoptions.py`, models, schemas and the Barangay/Resident UI, plus **read-only** queries against the live database.
**Code changes made:** none. This document is the audit and the recommended model; implementation waits for the decisions in section 6.

Labels: **CONFIRMED** (traced in code or data) · **RECOMMENDATION** · **OK** (already correct).

---

## 1. Executive summary

1. **There is no adoption "case owner" anywhere in the system.** No column, no table, no claim action. The word "claim" in the adoption code only refers to the adopter physically claiming the pet.
2. **Everything an assignment *should* be is either "whoever clicked last" or free text.** The interviewer, home-visit inspector and verifier are set to the **logged-in user at the moment of the action**. The assignee names chosen in the UI are **discarded** by the backend (interviewer) or stored as plain text (handover, home visit).
3. **The Head-Officer-only approval rule exists only in the frontend.** The backend lets **any Barangay staff in the barangay** approve, reject, verify and run the interview, and lets **any staff or leader from any barangay** issue certificates, schedule/complete handover and review monitoring.
4. **Approval does not create responsibility.** `reviewed_by` is written, but nothing reads it for authorization, and it is overwritten by the next approval step.
5. **Live data hides all of this.** One person (the Barangay Captain / Head Officer) performed all 36 staff actions across all 5 active applications. The four Tanods performed none. The design gaps only appear the moment a second staff member is involved.
6. **The building blocks to fix it already exist in this codebase:** the Report module has a `claim` / `take-over` / `transfer` pattern and the Rescue module has a proper `RescueAssignment` table.

---

## 2. Answers to the required audit questions

| # | Question | Answer | Status |
|---|---|---|---|
| 1 | Which Barangay role can **claim** an adoption? | **None.** Adoption claiming does not exist. The only "higher authority" in the data model is `users.is_head_officer = 1` on a role-3 account (currently the Barangay Captain, one per barangay). Job titles in `positions` (Tanod, Secretary, Barangay Staff, Animal Rescuer…) are free labels and are used for no authorization (their only effect is picking the Captain's name on the certificate, see 3.6). | CONFIRMED |
| 2 | Which role can **assign an interviewer**? | **Nobody can.** `schedule_adoption_interview` / `evaluate_adoption_interview` set `interviewer_id = current_user.user_id` (adoptions.py:2181, 2241). The UI dropdown value `interviewer_name` is accepted by the schema (schemas/adoption.py:254) and **never stored**. | CONFIRMED |
| 3 | Which role can **approve** the adoption request? | **UI:** Head Officer or Admin (`isHeadOfficer`, BrgyAdoptions.tsx:197). **Backend:** any role-3 staff in the application's barangay, or Admin, via `_can_manage_adoption` (adoptions.py:104) on Stage-1 approve (L1991), final approve `PUT /review` (L1357) / `POST /approve` (L2534), and `review/submit` (L2473). Error text and docstrings claim "Head Officer only" but the code does not check it. | CONFIRMED |
| 4 | Does the approving staff member automatically become the case owner? | **No.** `reviewed_by` / `reviewer_role` are recorded (L1387, L2016) but (a) no authorization reads them, (b) they are **overwritten** by the later approval step, (c) `reviewer_role` has a bug: `"Admin" if role_id == 1` (L2017; should be 4). | CONFIRMED |
| 5 | Can the (would-be) owner monitor the adoption through the whole workflow? | There is no owner, so **everyone with staff access can**, and the wrong people can too: `GET /monitoring/dashboard` filters only role 3, so **Subdivision Leaders see every barangay's monitoring cases** (L3354–3375); monitoring review (L3099) and `monitoring/proceed` have **no role or barangay check**. | CONFIRMED |
| 6 | Can another staff member take over an adoption? | **No takeover mechanism exists.** In practice there is nothing to take over: any role-3 in the barangay can already act on stages 1–5, and any staff/leader anywhere can act on stages 7–9. | CONFIRMED |
| 7 | If takeover is allowed, who may perform it? | Not defined today. **Recommended:** the barangay's Head Officer or Admin only, with a mandatory reason and an audit entry (section 5.4). | RECOMMENDATION |
| 8 | Can an interviewer approve, or only do the interview? | **Nothing separates them.** Any role-3 who can call the interview endpoints can also call the approval endpoints; the interviewer is just whoever last submitted. | CONFIRMED |
| 9 | Can lower-level Barangay staff access or modify applications they are not assigned to? | **Yes.** All role-3 staff in the barangay can list every application (L1295, L1943), open the **government ID** (`secure-id-view`, L1841, via `_can_manage_adoption`), and act on stages 1–5. Staff/leaders of **other barangays** can act on stages 6–9 (see 3.2). | CONFIRMED |
| 10 | Are the rules enforced by the backend and database, or only the frontend? | Only the **Stage-1 Approve/Reject buttons** are restricted (frontend). The backend enforces barangay scope on some endpoints and nothing about seniority. The database has **no** constraint, FK or column representing ownership or assignment. | CONFIRMED |
| 11 | Can the database separately track case owner, interviewer and task assignments? | **No.** It has per-stage "who last performed it" columns (`interviewer_id`, `inspector_id`, `verified_by`, `reviewed_by`, `issued_by`, `staff_handover_by`) plus one free-text `handover_assigned_staff`. No owner column, no assignment table, no reassignment history. | CONFIRMED |
| 12 | What should happen to the assigned staff if the case is reassigned, rejected, cancelled or completed? | Not defined today. **Recommended rules are in section 5.7.** | RECOMMENDATION |

---

## 3. Current-state findings

### 3.1 Role hierarchy as implemented

| Role | Adoption authority today |
|---|---|
| Resident (1) | Own applications only (apply, cancel, sign agreement, confirm handover, submit check-ins). **OK** |
| Subdivision Leader (2) | Blocked from list/pipeline/promote. **But** can schedule/evaluate **home visits** for any application, issue certificates, run handover and review monitoring (no jurisdiction check), and sees all barangays on the monitoring dashboard. |
| Barangay Staff (3), non-head | Treated as full adoption managers within their barangay. |
| Head Officer (role 3 + `is_head_officer`) | Same backend power as other role-3; extra power only in the UI (Approve/Reject buttons) and ID-purge (**the one correctly enforced rule**, L1905–1920). |
| Admin (4) | Everything. |

Data: positions seeded are `President, Secretary, Barangay Staff, Tanod, Animal Rescuer, Barangay Captain`. `is_head_officer` is the only flag used. "One head per barangay" is a convention kept by `POST /users/barangay/{id}/assign-head`, **not** a database constraint.

### 3.2 Backend authorization by endpoint group (CONFIRMED)

| Group | Endpoints | Who the backend lets in |
|---|---|---|
| **A. Barangay-scoped manager check** (`_can_manage_adoption`: any role-3 whose barangay matches, **or passes when the report has no subdivision**, or Admin) | promote, `PUT /review`, `POST /approve`, Stage-1 `application/approve`, `verify`, `interview/schedule`, `interview/evaluate`, `review/submit`, `secure-id-view` | **Every** staff member in the barangay. Seniority is never checked. |
| **B. Role list only (2,3,4), no jurisdiction** | `home-visit/schedule`, `home-visit/evaluate`, `upload-home-visit-photos` | Leaders and staff of **any** barangay |
| **C. Staff-or-admin dependency only** | `certificate/proceed`, `certificate/send`, `handover/proceed`, `handover/schedule`, `handover/complete`, `staff-confirm-handover`, `monitoring/{log}/review`, `monitoring/proceed`, `successful/proceed` | Leaders and staff of **any** barangay |
| **D. Correctly restricted** | `purge-expired-ids` (head officer/admin), `cancel` (applicant/admin), resident endpoints (`get_current_resident` / ownership) | OK |

Frontend: only the Approve/Reject buttons (BrgyAdoptions.tsx, `isHeadOfficer`) and an informational "Staff View Mode" banner. None of the stage modals check seniority.

### 3.3 "Who is responsible" fields: what they really mean

| Field | Written at | Real meaning | Problem |
|---|---|---|---|
| `adoptions.reviewed_by`, `reviewer_role` | L2016 (Stage-1 approve), L1387 (final approve) | Last person to approve | Two different approvals share one field; second overwrites first; `reviewer_role` bug (L2017) |
| `adoption_interviews.interviewer_id` | L2181 (schedule), L2241 (evaluate) | **Last person to click** schedule/evaluate | Not an assignment; dropdown choice (`interviewer_name`) ignored; assessment can be attributed to the wrong person |
| `adoption_home_visits.inspector_id` | L2331, L2399 | Last person to schedule/evaluate | Same; `assigned_personnel` is only pasted into the notes text (L2338) |
| `adoption_verifications.verified_by` | L2025 (Stage-1 approve auto-fills), L2104 | Last actor | Stage-1 approve **fabricates** a "Matched / not blacklisted" verification under the approver's name |
| `adoption_certificates.issued_by` | L2610, L2701, L2752 | `reviewed_by` or whoever opened the page | Falls back to whoever triggers it |
| `adoptions.staff_handover_by` | L1584, L2974 | Who clicked "complete handover" | OK as a "performed by" |
| `adoptions.handover_assigned_staff` | L2878 | **Free text** (`req.assigned_staff or current_user.name`) | Not a user reference; cannot be validated or used for permission |
| `adoption_monitoring_logs.reviewed_by` | L3121 | Who reviewed a check-in | No owner link |

So these columns answer **"who last did it"**, never **"who is responsible"** or **"who was assigned"**. Case ownership, assigned interviewer and other task assignees are currently **conflated into "last actor"**.

### 3.4 Live data evidence (read-only)

| Finding | Data |
|---|---|
| Staff in the system | 1 Head Officer (Barangay Captain, id 4), 4 non-head Tanods (ids 6, 8, 9, 12), 1 Subdivision Leader, 1 Admin |
| Who acted on adoptions | Timeline log: **36 staff actions on 5 applications, all by user 4**. Residents account for the other 10 actions. The Tanods performed **zero** |
| Interviewer on all 3 interviews | user 4 (the approver), consistent with "last actor", not with assignment |
| Home-visit inspector (apps 8, 11) | user 4 |
| `handover_assigned_staff` | the text "Kyla Bianca Frias" |
| Owner/assignee columns on `adoptions` | the only match is `handover_assigned_staff` (free text) |
| Assignment tables | none (`adoption_*` tables: certificates, home_visits, interviews, monitoring_logs, timeline_logs, verifications) |

Interpretation: the system works today only because **one person does everything**. The first time a Tanod is asked to interview, the interviewer record, permissions and notifications will all behave incorrectly.

### 3.5 Patterns already in the codebase that should be reused

| Pattern | Where | Reuse for |
|---|---|---|
| Atomic claim with `with_for_update()`, `claimed_at`, 409 if already claimed | `POST /reports/{id}/claim` (reports.py) | Adoption claim |
| Takeover with reason and inactivity rule; transfer request/accept/reject/cancel | `/reports/{id}/take-over`, `/transfer/*` | Adoption reassignment |
| Assignment table with `assignment_status`, `assigned_by`, `remarks` | `RescueAssignment` | Adoption task assignments |
| Typed audit trail | `adoption_timeline_logs` + `log_activity` | Ownership/assignment history |

### 3.6 Other relevant findings

- **Government ID need-to-know:** any role-3 in the barangay can view any applicant's ID through `secure-id-view` (audited, but not limited to the case owner or assigned verifier).
- **`_can_manage_adoption` fails open** when the report has no subdivision (adoptions.py:113–116: the barangay check only runs `if report.subdivision`), so any role-3 passes.
- **New-application notification** goes to `User.role_id==3, is_head_officer==True ... .first()`, i.e. the first head officer in the **whole system**, not the owning barangay (L1240–1243).
- **Certificate signatory is not barangay-scoped either.** The certificate builder picks the first role-3 user who is a Head Officer **or has position 6 (Barangay Captain)** across the whole system (adoptions.py:325–330). In a multi-barangay deployment a certificate could show another barangay's Captain. This is the only place the `positions` table influences adoption behaviour, and it is display-only. The certificate signatory should be the **case owner** (or the owning barangay's Head Officer).
- **The adoption chat I just built** derives who to notify from these same "last actor" columns plus the barangay's head officers. It is correct today, but it should move to the owner/assignee model once that exists (section 5.9).

---

## 4. Already correct (no action)

- Residents can only act on their own application.
- Cancel is limited to the applicant or Admin.
- ID retention purge is limited to Head Officer or Admin.
- Subdivision Leaders are blocked from the application list and pipeline.
- Barangay scoping on the staff application list (`GET /applications`) and the pipeline.
- Timeline logging on every stage action (`adoption_timeline_logs`).

---

## 5. Recommended authority hierarchy and assignment model

### 5.1 Principles

1. **Separate three concepts:** *case ownership* (one accountable person), *task assignment* (who does a specific task), and *performed by* (audit of who actually did it). Today they are one thing.
2. **The backend decides.** Authority comes from the logged-in user, the application record, and assignment rows. Request bodies may only name a *target* user for an assignment, which is validated server-side.
3. **Least privilege on personal data.** Government ID, home address and interview notes are visible only to the case owner, an assignee of a relevant task, and Admin.
4. **Ownership is stable across stages**, and every change is recorded.

### 5.2 Authority levels

| Level | Who | Authority |
|---|---|---|
| **Case Authority** | **Barangay Head Officer** (role 3 + `is_head_officer`) of the application's barangay | Claim, own, approve (Stage 1 acceptance and Stage 6 final), assign tasks, reassign/take over, issue certificate, schedule/complete handover, review monitoring, close case |
| **Oversight** | Admin (role 4) | Same as Case Authority across barangays, **every override requires a reason and is audited** |
| **Task Staff** | Other role-3 staff (Tanod, Secretary, Staff, Animal Rescuer…) | Only the tasks **assigned to them** (e.g. conduct interview, perform home visit, verify documents) and only on those applications. Cannot claim, approve, reassign, or view other applications |
| **Subdivision Leader** | role 2 | No adoption authority (consistent with the current list/pipeline rule) |
| **Applicant** | Resident | Own application only (unchanged) |

### 5.3 Action authority matrix (recommended)

| Action | Case Owner (Head Officer) | Assigned task staff | Other staff | Admin |
|---|:---:|:---:|:---:|:---:|
| View application / dossier | ✅ | ✅ (assigned apps) | ❌ | ✅ |
| View government ID | ✅ | ✅ (assigned **Verification**) | ❌ | ✅ |
| **Claim** | ✅ (Head Officer only) | ❌ | ❌ | ✅ |
| Stage-1 acceptance / **final approval** | ✅ **(must be the owner)** | ❌ | ❌ | ✅ (override + reason) |
| **Assign / change** interviewer & other task staff | ✅ | ❌ | ❌ | ✅ |
| Schedule interview | ✅ | ✅ (own assignment) | ❌ | ✅ |
| **Submit interview evaluation** | ✅ | ✅ **only the assigned interviewer** | ❌ | ✅ |
| Verification, home-visit evaluation | ✅ | ✅ (own assignment) | ❌ | ✅ |
| Review submit, certificate issue/send | ✅ | ❌ | ❌ | ✅ |
| Handover schedule/complete | ✅ | ✅ (if assigned Handover) | ❌ | ✅ |
| Monitoring review / mark successful | ✅ | ❌ | ❌ | ✅ |
| **Take over / reassign owner** | ✅ (Head Officer of that barangay) | ❌ | ❌ | ✅ |
| Cancel | Applicant, Admin | | | |

Hard rules: a staff member can **never** act on their own application (conflict of interest); the interviewer **cannot** approve unless they are also the Head Officer; assignment targets must be **active role-3 staff of the same barangay**.

### 5.4 Case ownership lifecycle

1. **Claim:** Head Officer (or Admin) claims an unowned application. Atomic and idempotent, using the same `with_for_update` pattern as report claims; a second claimer gets 409. The claimer becomes the **Case Owner**.
2. **Approval ties to ownership:** the person who approves must be the owner. If the application is still unclaimed, the first approval by a Head Officer **auto-claims** it, which satisfies your rule that *the approver becomes the responsible staff member*. The final approval must come from the owner (or Admin).
3. **Owner remains responsible through every stage** (Application → … → Monitoring → Completed). Stage endpoints check the actor against the owner or an assignment.
4. **Transfer / takeover:** only the barangay's Head Officer or Admin, with a required reason; the previous owner and the adopter are notified; old and new owner are written to the ownership history.
5. **Release:** if the owner is deactivated, loses Head Officer status, or leaves the barangay, the case becomes **"Needs owner"** and is flagged to the new Head Officer or Admin. It is never silently orphaned.

### 5.5 Assignment model

An application can have several task assignments; the interviewer is just one task type:

`Verification`, `Interview`, `Home_Visit`, `Handover`, plus optional `Other`.
Only the owner (or Admin) creates or changes them. The assignee is a **user id**, never free text.

### 5.6 Data model (proposed, nothing created yet)

```sql
-- 1. Case ownership on the existing table
ALTER TABLE adoptions
  ADD COLUMN case_owner_id INT NULL,
  ADD COLUMN case_owner_assigned_at DATETIME NULL,
  ADD COLUMN case_owner_assigned_by INT NULL,
  ADD CONSTRAINT fk_adoptions_owner FOREIGN KEY (case_owner_id) REFERENCES users(user_id) ON DELETE SET NULL,
  ADD INDEX idx_adoptions_owner (case_owner_id);

-- 2. Task assignments (mirrors RescueAssignment)
CREATE TABLE adoption_assignments (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  adoption_id   INT NOT NULL,
  task_type     ENUM('Verification','Interview','Home_Visit','Handover','Other') NOT NULL,
  assigned_to   INT NOT NULL,
  assigned_by   INT NOT NULL,
  status        ENUM('Assigned','In_Progress','Completed','Cancelled','Reassigned') NOT NULL DEFAULT 'Assigned',
  due_at        DATETIME NULL,
  assigned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME NULL,
  remarks       TEXT NULL,
  FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(user_id),
  FOREIGN KEY (assigned_by) REFERENCES users(user_id),
  INDEX idx_assign_adoption_task (adoption_id, task_type, status),
  INDEX idx_assign_user_status (assigned_to, status)
);

-- 3. Ownership history (immutable)
CREATE TABLE adoption_ownership_history (
  history_id   INT AUTO_INCREMENT PRIMARY KEY,
  adoption_id  INT NOT NULL,
  from_user_id INT NULL,
  to_user_id   INT NULL,
  action       ENUM('Claimed','Auto_Claimed_On_Approval','Transferred','Takeover','Released','Auto_Released') NOT NULL,
  reason       TEXT NULL,
  performed_by INT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
  INDEX idx_own_hist_adoption (adoption_id, created_at)
);
```

Existing per-stage columns keep their meaning as **"performed by"**, which is how they behave today. Add `evaluated_by` to the interview and home-visit records so assignee and evaluator can differ. The free-text `handover_assigned_staff` becomes derived from the assignment (kept read-only for old rows).

"One active assignment per task per application" is enforced in the service layer under a row lock (MySQL has no partial unique index), backed by the composite index above.

### 5.7 What happens to assignments on each outcome

| Event | Case owner | Open task assignments | Other effects |
|---|---|---|---|
| **Reassigned / takeover** | Changes to the new owner; old owner kept in history | Stay with their assignees unless the old owner was the assignee; those are marked `Reassigned` and the new owner is prompted | Notify old owner, new owner, adopter; audit |
| **Rejected** | **Kept as historical owner** (not cleared) | All `Assigned` / `In_Progress` → `Cancelled` | Assignees notified; chat becomes read-only; history preserved |
| **Cancelled** (by applicant/Admin) | Kept as historical owner | All open → `Cancelled` | Same |
| **Completed** (Successful) | Kept; case closed under that owner | Remaining open → `Completed`/closed | Chat read-only; case archived |
| **Owner leaves / demoted / deactivated** | Case becomes **"Needs owner"** | Unchanged | Head Officer/Admin notified; cannot progress until reassigned |
| **Head Officer changed** (`assign-head`) | Active cases are flagged to the **new** Head Officer for explicit transfer (no silent auto-transfer) | Unchanged | Audited |

### 5.8 Backend enforcement design

- One authority module (for example `app/services/adoption_authority.py`) producing a capability set for `(user, adoption)`: `is_owner`, `is_case_authority`, `assigned_tasks`, `is_admin`. Every adoption endpoint declares what it requires, so there is **one** place to audit.
- `_can_manage_adoption` is replaced by it and must **fail closed** when the barangay cannot be resolved.
- Assignment endpoints accept only `target_user_id`. The server validates: target is active, role 3, same barangay, not the applicant, and the case is not closed.
- Ownership and assignment changes run in one transaction with a row lock, and write both the history table and `log_activity`.
- The database enforces what it can (FKs, indexes); the rest is enforced in the service layer under locks. The frontend only mirrors the rules for display.

### 5.9 Knock-on effects to handle

- **Adoption chat (just built):** replace the "last actor" recipient guesswork with *owner + assigned interviewer (while the interview is open) + Head Officer fallback*. The access rule can stay barangay-wide for Head Officer/Admin and become owner/assignee-only for task staff.
- **Notifications:** "new application" should go to the owning barangay's Head Officer (fixes the system-wide `.first()`), "claimed", "assigned to you" and "reassigned" are new types.
- **Frontend:** "Claim" button, "Case Owner" badge, "Assign interviewer / staff" with a real staff picker (user ids), "My assigned tasks" filter for task staff, and hiding actions the user cannot perform (display only).

### 5.10 Migration and back-fill

| Item | Rule |
|---|---|
| `case_owner_id` | Set from `reviewed_by` where it is a Head Officer/Admin; otherwise NULL ("Needs owner") |
| Live data | All 9 applications have `reviewed_by = 4` (the Head Officer), so every approved case back-fills cleanly; the cancelled one has none |
| Past interviewers / inspectors / verifiers | Back-fill `adoption_assignments` as `Completed` from `interviewer_id`, `inspector_id`, `verified_by` so history is preserved |
| Free-text handover staff | Leave as read-only legacy text |

---

## 6. Decisions needed before implementation (with recommended defaults)

| # | Decision | Recommended default | Why it matters |
|---|---|---|---|
| D1 | Who is the "higher authority" allowed to claim? | The barangay's **Head Officer** (role 3 + `is_head_officer`) and Admin. | Today that is the Barangay Captain only. Do Secretary/President positions ever need this? If yes we need a second flag (for example `can_claim_adoptions`) instead of reusing `is_head_officer`. |
| D2 | Can non-head staff see applications they are **not** assigned to? | **No.** Only assigned applications (government ID and home address are sensitive). | Changes the Barangay list for the 4 Tanods from "everything" to "my tasks". |
| D3 | Which approval makes someone the owner: Stage-1 acceptance or the final Stage-6 approval? | **Claim sets the owner; first Head-Officer approval auto-claims if unclaimed; final approval must come from the owner.** | Keeps your rule ("approver is responsible") without two competing owners. |
| D4 | When the Head Officer changes, do cases auto-transfer? | **No.** Flag to the new Head Officer for explicit transfer. | Avoids silent responsibility changes. |
| D5 | Should the interviewer be able to submit the evaluation only for their own assignment? | **Yes** (owner and Admin can also submit). | Prevents any staff member from scoring an interview they were not assigned. |
| D6 | Should Admin acts on adoption cases require a typed reason? | **Yes** for override actions (claim-for, approve, takeover). | Keeps Admin power auditable. |

---

## 7. Implementation roadmap (after your decisions)

| ID | Priority | Task | Depends on | Verification |
|---|---|---|---|---|
| ADO-A1 | P0 | Close the unscoped endpoints (groups B and C): add barangay scope and drop role 2 from adoption actions; make `_can_manage_adoption` fail closed | none | Test matrix: leader and other-barangay staff get 403/404 on every stage endpoint |
| ADO-A2 | P0 | Enforce Head-Officer/Admin on Stage-1 approve, final approve, review submit, promote-early in the **backend** | none | Non-head staff gets 403 on approval endpoints |
| ADO-A3 | P1 | Stop `secure-id-view` for staff who are not owner/assigned verifier (after ADO-B/C) | ADO-B1, ADO-C1 | Non-assigned staff cannot open an ID; access still audited |
| ADO-B1 | P1 | Migration: `case_owner_*` columns, `adoption_ownership_history`, back-fill | D1–D4 | Fresh DB and live DB match; all 9 existing cases owned |
| ADO-B2 | P1 | `POST /adoptions/{id}/claim` (atomic, 409 on race), auto-claim on first Head-Officer approval | ADO-B1 | Two simultaneous claims → one wins; non-head gets 403 |
| ADO-B3 | P1 | Authority module + owner checks on every stage endpoint | ADO-B2 | Per-endpoint role × ownership matrix test |
| ADO-C1 | P1 | `adoption_assignments` table + `POST/PATCH /adoptions/{id}/assignments` with server-side target validation | ADO-B1 | Invalid targets (other barangay, role 2, applicant, inactive) rejected |
| ADO-C2 | P1 | Interview/home-visit/verification endpoints require owner or own assignment; add `evaluated_by`; stop overwriting `interviewer_id` | ADO-C1 | Interviewer cannot approve; unassigned staff cannot evaluate; dossier shows the assigned interviewer |
| ADO-D1 | P2 | Transfer/takeover endpoint with reason, notifications and history | ADO-B2 | Only Head Officer/Admin; history row written |
| ADO-D2 | P2 | Lifecycle rules (section 5.7) for reject, cancel, complete and owner loss; "Needs owner" flag | ADO-C1, ADO-D1 | State-transition tests |
| ADO-E1 | P2 | Fix `reviewer_role` mapping bug (L2017) and stop Stage-1 approve fabricating a verification record | none | Admin approval stored as Admin; no verification row without a real check |
| ADO-F1 | P2 | Notifications to the owning barangay's Head Officer; new "claimed / assigned / reassigned" types; certificate signatory taken from the case owner / owning barangay (not the first Captain system-wide) | ADO-B2 | Other-barangay head officer not notified; certificate shows the owner's name |
| ADO-F2 | P2 | Re-base adoption-chat recipients and task-staff chat access on owner + assignees | ADO-C1 | Existing chat test-suite plus new recipient cases |
| ADO-G1 | P2 | Frontend: Claim button, Case Owner badge, staff picker, "My tasks" filter, hide forbidden actions | ADO-B2, ADO-C1 | Browser test with Head Officer and Tanod accounts |
| ADO-H1 | P1 | Full automated test suite (section 8) | all | CI green |

ADO-A1 and ADO-A2 do not depend on any schema change and close the most serious gaps first. They can ship before the ownership model.

---

## 8. Test plan (to be written with the implementation)

1. **Authority matrix:** for each adoption endpoint × {resident-applicant, other resident, Tanod same barangay, Tanod other barangay, Head Officer same barangay, Head Officer other barangay, Subdivision Leader, Admin} assert the exact allowed/denied outcome.
2. **Claim:** only Head Officer/Admin; race condition yields one owner; non-head gets 403; cannot claim own application.
3. **Approval ↔ ownership:** unclaimed + Head Officer approval auto-claims; final approval by a non-owner is rejected.
4. **Interviewer separation:** assigned interviewer can submit only their own evaluation; cannot approve; unassigned staff cannot evaluate; the dossier reports the assigned interviewer.
5. **Assignment validation:** target must be active role-3, same barangay, not the applicant; request-body ids cannot set owner or bypass assignment.
6. **Takeover/reassign:** Head Officer/Admin only; reason required; history written; adopter notified.
7. **Lifecycle:** reject/cancel/complete close assignments and keep historical owner; owner demotion produces "Needs owner".
8. **Privacy:** government ID is visible only to owner, assigned verifier and Admin; each view audited.
9. **Regression:** existing adoption flows and the adoption-chat suite still pass.

---

## 9. Not changed by this audit

No application code, database schema or data was modified. The only artifacts are this document and the read-only evidence queries (kept outside the repository).
