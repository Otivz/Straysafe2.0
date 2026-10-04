# Adoption Tasks, Interviewer Assignment, Catalog & Certificate — Audit

**Date:** 2026-10-03 · **Scope:** `/brgy/adoptions`, `/brgy/messages` (adoption chats), `/adopt` catalog, adoption certificate, monitoring stage
**Method:** code read of `backend/app/routes/adoptions.py`, `adoption_chat.py`, `models/report.py`, `schemas/adoption.py`, `AdoptionStaffStageModals.tsx`, `AdoptionCertificateDocument.tsx`; **read-only** queries and in-process GET calls against the live `straysafe_db`.
**Builds on:** `ADOPTION_AUTHORITY_AND_CASE_OWNERSHIP_AUDIT.md` (case owner + assignment model, decisions D1–D6). Nothing in this audit changes code; `Database3.3.txt` was updated to the target schema (section 8).

---

## 1. Summary

| # | Reported issue | Verdict | Root cause |
|---|---|---|---|
| 1 | "Assigned Barangay Interviewer" reverts to the person who approved | **Confirmed bug** | The modal sends a free-text `interviewer_name`; the backend ignores it and stores `interviewer_id = current_user` (`adoptions.py:2233`, again at evaluate `:2292`). The UI then shows the stored user. Same pattern for home visit (`assigned_personnel` → only written into notes, `inspector_id = current_user` at `:2380/:2446`) and monitoring (`monitoring_personnel` free text). |
| 2 | Adoption messages not opening in the chat | **Not reproducible on current code** | Live DB is migrated (`thread_type` includes `Adoption`, thread #18 for application #12 has 3 messages). In-process calls with the live data return 200 for Head Officer (user 4), staff (user 8) and the applicant (user 1) on list/messages/thread. Most likely the backend had not been restarted after `/chat/adoptions/threads` + `/inbox-item` were added (the frontend silently treats a 404 as "no conversations"). Re-test after restart; see 3.2 for the remaining UX gap. |
| 3 | Who handles the adoption process | **Gap (by design today)** | There is no case owner. Every stage overwrites its own "actor" column with whoever clicked. The model from the previous audit (claim → case owner → task assignments) is still not implemented. |
| 4 | Adoption Tasks page with accept → perform flow | **New feature** | Requires the assignment table, accept/decline states, and per-task "assessor = assignee" enforcement (section 5). |
| 5 | Approved pet still visible on `/adopt` | **Confirmed bug** | Catalog = `facility_status == 6` only (`adoptions.py:619-631`). Status 7 is set only by `_finalize_adoption_if_ready` (both handover confirmations). Live: animal **8** (application #12 *Approved/Certificate*) and animal **9** (application #13 *Successful*) are still "For Adoption". The apply endpoint already refuses a second applicant (`:1223`), so users see a pet they cannot adopt. |
| 6 | Certificate — what is missing | **Several gaps** | Section 6. Highlights: no way to verify the QR, hard-coded real names as fallbacks, invented animal facts, signatory re-derived at render time, certificate issued before handover and never revoked. |
| 7 | Monitoring assignment + staff assessment | **New feature** | Monitoring logs (Day 7/14/30) exist but nobody is assigned; staff visits store free-text personnel and pack the assessment into `review_notes`. |

**Additional integrity finding (high):** application **#13** is `Successful_Adoption` / `post_monitoring_status=Completed` although `is_handed_over = 0` (adopter never confirmed). `mark_adoption_successful_final` does not require the handover to be finalized, so **no pet record was created (`created_pet_id` NULL) and the animal is still listed for adoption.**

---

## 2. Evidence (live, read-only)

| Application | Status / stage | Animal | facility_status | Handover (staff / adopter) | Pet created |
|---|---|---|---|---|---|
| #12 | Approved / Certificate | 8 | **6 (For Adoption)** | 0 / 0 | — |
| #13 | Approved / **Successful_Adoption** | 9 | **6 (For Adoption)** | 1 / **0** | **NULL** |
| #8, #11 | Approved / Successful | 4, 6 | 7 | 1 / 1 | yes |

Barangay staff in barangay 1: Kyla Bianca Frias (Head Officer, user 4), Samuel Rayne Yu (8), Emmet Granger (9), Eron Gueverra Geronimo (12); Richard Mendez (6) is Inactive. All 9 decided applications record `reviewer_role = 'Barangay Head Officer'` (user 4) — consistent with "the approver did everything".

Schema evidence: `adoption_interviews`, `adoption_home_visits`, `adoption_monitoring_logs` have **no columns** for most assessment answers the modals collect (questions discussed, applicant responses, residence condition, hazards, animal/living condition, …). They are concatenated into `interview_notes` / `checklist_notes` / `review_notes` text (`adoptions.py:2305`, `:2455`, `:3337`), so "View Assessment" can only show a text blob.

---

## 3. Findings in detail

### 3.1 Interviewer / inspector / monitoring personnel (issue 1)

- `AdoptionInterviewScheduleRequest` has `interviewer_name: Optional[str]` but **no user id**; the select in `AdoptionStaffStageModals.tsx:440-455` uses `value={person.name}`.
- Backend: `iv.interviewer_id = current_user.user_id` on schedule **and** on evaluate, so even if the right person was picked, whoever records the result becomes "the interviewer".
- Home visit: `assigned_personnel` is only appended to the notes string; `inspector_id = current_user`.
- Monitoring: `monitoring_personnel` free text; the log's `reviewed_by = current_user`.
- Consequence: no way to know or enforce who was supposed to do the task; any barangay staff member can record any assessment.

### 3.2 Adoption chat (issue 2)

- Backend and data verified working (summary table). Frontend entry points that exist today: Barangay → *Chat* button on `/brgy/adoptions`, navbar **Messages** icon, `/brgy/messages` → *Adoptions* tab; Resident → *Chat with Barangay*, navbar **Messages** icon.
- **UX gap (by design, worth changing):** adoption-chat notifications have a 💬 title, and both navbars intentionally hide 💬 notifications from the **bell** (`isMessageNotif`). Users who look in the bell see nothing. Recommendation: keep them out of the bell list but make the Messages icon badge prominent, or show them in the bell with an "Open chat" action.
- Frontend treats a failing `/chat/adoptions/threads` as an empty list; a visible "Couldn't load adoption conversations" state would have made the stale-backend case obvious.

### 3.3 Catalog visibility (issue 5)

- Catalog and detail endpoints do not look at adoptions at all.
- Approval does not change the animal; only full handover (both confirmations) sets status 7.
- The "successful" endpoint can complete a case without that handover (the #13 case), leaving the animal listed forever.

### 3.4 Monitoring (issue 7)

- Day 7/14/30 logs are generated when monitoring starts (`adoptions.py:588-600`). The adopter submits; staff "review" each log (decision endpoint, Head Officer/Admin since Phase A).
- Staff visits (`/monitoring/record`) create a log with free-text personnel and the assessment packed into notes.
- No assignment, no due-date ownership, no "assessment required before Day-30 approval" rule.

---

## 4. Recommended workflow (what the new feature does)

```
Head Officer claims application  ──►  becomes CASE OWNER (responsible for the whole process)
            │
            ├─ assigns task (user id, never free text): Interview | Home_Visit | Monitoring | (Verification | Handover)
            │        status: Assigned ──► Accepted ──► In_Progress ──► Completed
            │                    └──► Declined (reason) ──► owner reassigns
            │
            └─ assignee sees it on  /brgy/adoption-tasks  ("My Adoption Tasks")
                     Interview  : view schedule · (re)schedule · Conduct & Record Interview (same modal as today)
                     Home Visit : Reschedule Home Visit · Record Assessment · View Assessment
                     Monitoring : per milestone (Day 7/14/30 or staff visit) · Record Assessment · View Assessment
```

Rules (enforced on the backend):

1. **Only the case owner or Admin** creates, reassigns or cancels assignments. Target must be active, role 3, same barangay, not the applicant (server-validated).
2. **One active assignment per task** per application (per milestone for Monitoring), enforced under a row lock.
3. **Only the assignee records the assessment** for an assigned task (previous audit D5). The owner/Admin may record only when the task is unassigned, or with an override reason (audited).
4. The stage **decision** (proceed to review, approve, certificate, monitoring, successful) stays with the case owner / Head Officer / Admin (Phase A rule).
5. Accepting a task never changes the adoption stage; recording an assessment completes the task and notifies the owner.
6. Reject / cancel / complete closes open assignments (`Cancelled` / `Completed`), as in section 5.7 of the previous audit.

New notification types: `adoption_task_assigned`, `adoption_task_accepted`, `adoption_task_declined`, `adoption_task_completed`, `adoption_task_reassigned`.

---

## 5. Answers to "how will we implement monitoring assignment"

- When the case enters **Monitoring**, the owner assigns **one Monitoring task** to a staff member (covers Day 7, 14, 30). Optionally a milestone-specific assignment (`monitoring_log_id` set) for a one-off visit.
- For every milestone the assignee must submit a **staff assessment** (animal condition, health, living condition, food & water, shelter, vaccination, result, notes, photos). Stored in structured columns on `adoption_monitoring_logs` (section 8).
- The Head Officer's milestone review (Approve / Needs correction / Escalate) is allowed only after the assigned staff assessment exists; Day-30 approval requires all three.
- Overdue milestones show on the assignee's task page and notify the owner.

---

## 6. Certificate — what is missing

| # | Gap | Impact | Fix |
|---|---|---|---|
| C1 | **QR cannot be verified.** It encodes `STRAYSAFE-CERT|no|id|hash16` text; there is no public verify endpoint/page. | Certificate cannot be authenticated. | `GET /certificates/verify/{certificate_number}?h=…` (public, minimal data: valid/revoked, pet name, adopter initials, barangay, date) + QR encodes that URL. |
| C2 | **Hard-coded real names as fallbacks:** frontend shows `EMMANUEL VITO CRUZ` (adopter) and `KYLA BIANCA FRIAS` (captain) when fields are empty; backend default captain "Kyla Bianca Frias". | A certificate can display a real person who is not the party. | Remove; show "—" / block issuing when required data is missing. |
| C3 | **Invented animal facts:** sex "Male", age "Adult", type "Dog", breed "Mixed Breed" defaults; `holding_animals` has no sex/age columns. | Legal document states unverified facts. | Add `sex`, `estimated_age` to `holding_animals` (captured at intake/catalog promotion); show "Not recorded" instead of guessing. |
| C4 | **Signatory and names re-derived at render time.** If the Head Officer changes, every old certificate shows the new captain. | Historical certificates change. | Snapshot signatory id/name/position + adopter/animal/barangay at issue (`snapshot` JSON). |
| C5 | **Municipality/province hard-coded** ("Santa Maria", "Bulacan"); code looks for a `location` column that does not exist, ignoring `barangays.city` ("Santa Maria, Bulacan"). | Wrong for any other barangay. | Parse `city` or add columns; snapshot at issue. |
| C6 | **Issued before ownership transfer and never revoked.** Issued at the Certificate stage (before handover); #13 has a certificate although handover was never confirmed; no status. | Valid-looking certificate for an adoption that never completed. | `certificate_status` (Valid / Revoked) + revoke on cancel/return; verify page shows status. Decide D-CERT (section 7) whether issuing waits for handover. |
| C7 | **Created in 4 places**, including the GET endpoint (a read that writes). | Inconsistent numbers/hashes; side effects on view. | One `issue_certificate()` service; GET never creates. |
| C8 | `pdf_url` is just the API path; no stored PDF; signature image always empty. | No immutable copy; blank signature line. | Optional: render and store PDF at issue; signature image per signatory (decision). |

---

## 7. Decisions needed (recommended defaults)

| ID | Question | Default |
|---|---|---|
| T1 | Who schedules the interview/home visit: the owner at assignment, or the assignee after accepting? | **Either.** Owner may pre-fill a schedule; after accepting, the assignee can (re)schedule. Rescheduling notifies the adopter and owner and keeps a reason/count. |
| T2 | Can an assignee decline? | **Yes, with a reason**; the owner is notified and must reassign. |
| T3 | Must assignments be accepted before the assignee can act? | **Yes** (`Assigned` → `Accepted`). Auto-reminder after 24 h. |
| T4 | Monitoring: one assignment for the whole period or per milestone? | **One per period**, per-milestone override allowed. |
| T5 | Catalog: hide on *Approved* or only after handover? | **Hide as soon as an application is Approved** (reserved); show again automatically if that approval is cancelled/rejected. No new facility status needed. |
| T6 | Fix existing data: #13 (successful without adopter confirmation) and animal 8/9 visibility. | Hide 8 and 9 now via T5; for #13 ask the Head Officer to confirm the handover with the adopter, then finalize (creates the pet record). Block `successful/proceed` unless handover is finalized. |
| D-CERT | Issue the certificate before or after handover? | **After handover is finalized** (ownership actually transferred); before that, show a "Pending handover" draft only. |
| D2 (prev.) | Can non-head staff see applications they are not assigned to? | **Only assigned ones** (ID and address are sensitive). |

---

## 8. Database changes (applied to `Database3.3.txt`)

`Database3.3.txt` was out of date with the live database. It was updated in two parts:

**A. Synced to the live schema (already exists in `straysafe_db`):**
- Added the 6 adoption tables that were missing: `adoption_verifications`, `adoption_interviews`, `adoption_home_visits`, `adoption_certificates`, `adoption_monitoring_logs`, `adoption_timeline_logs`.
- `adoptions`: added the 18 lifecycle/handover/certificate columns that the live DB has (`current_stage`, `application_stage_status`, `agreement_*`, `certificate_*`, `handover_*`, `post_monitoring_status`, `adoption_completed_at`, `resident_handover_confirmed*`).
- `chat_threads.thread_type` now includes `'Adoption'`, plus index `idx_chat_threads_type_related`.
- Indexes present live but missing in the file: `audit_logs.idx_audit_type_created`, `owner_warnings.idx_report_pet_violation` / `idx_warnings_user_status`, `pets.idx_pets_owner_status`.
- Kept the file's stricter definitions where the live tables were auto-created by SQLAlchemy (`pet_history`, `pet_qr_scans`, `system_settings`).

**B. New, for the features in this audit (NOT yet in the live DB — added by the migration when the feature is implemented):**
- `adoptions`: `case_owner_id`, `case_owner_assigned_at`, `case_owner_assigned_by`.
- New `adoption_assignments` (task type incl. **Monitoring**, statuses incl. **Accepted / Declined**, `monitoring_log_id`, schedule, accept/decline/complete timestamps).
- New `adoption_ownership_history`.
- `adoption_interviews`: `assignment_id`, `evaluated_by`, structured result fields.
- `adoption_home_visits`: `assignment_id`, `evaluated_by`, reschedule tracking, structured assessment fields.
- `adoption_monitoring_logs`: `entry_type`, `assignment_id`, `assessed_by`, `assessed_at`, structured staff-assessment fields.
- `adoption_certificates`: `certificate_status`, revoke fields, signatory snapshot, `snapshot` JSON.
- `holding_animals`: `sex`, `estimated_age`.

All B-items are nullable/defaulted so existing rows and the current code keep working.

---

## 9. Implementation roadmap (after decisions)

| ID | Priority | Work | Done when |
|---|---|---|---|
| ADO-T0 | **P0** | Catalog hides reserved animals (T5); `successful/proceed` requires finalized handover; data fix for #13/animals 8–9 (T6) | Approved pet disappears from `/adopt`; cannot complete without handover |
| ADO-T1 | P0 | Migration (section 8-B) via `ensure_*` in `main.py`, idempotent; back-fill existing interviewers/inspectors as `Completed` assignments | Fresh + live DB match `Database3.3.txt` |
| ADO-T2 | P1 | Claim / case owner (previous audit ADO-B) | Every open case has an owner |
| ADO-T3 | P1 | Assignment API: create / reassign / cancel (owner/Admin), accept / decline (assignee); server-side target validation; notifications | Interviewer picked = interviewer stored (fixes issue 1) |
| ADO-T4 | P1 | `/brgy/adoption-tasks` page: tabs *New / Accepted / Completed*; task cards open the existing Interview / Home-Visit / Monitoring modals in the right mode | Tanod accepts → conducts & records interview |
| ADO-T5 | P1 | Assessor = assignee enforcement on interview/home-visit/monitoring record endpoints; structured assessment storage; View Assessment | Non-assignee gets 403 |
| ADO-T6 | P1 | Monitoring assignment + required staff assessment per milestone before review | Day-30 approval blocked without assessments |
| ADO-T7 | P2 | Certificate fixes C1–C8 (verify page, snapshot, status/revoke, remove fake fallbacks) | QR verifies; old certificates unchanged after HO change |
| ADO-T8 | P2 | Chat: notify owner + current assignee; bell/Messages UX (3.2) | Assignee gets adoption chat messages for their task |

Tests to add with the implementation: assignment authority matrix (owner/assignee/other staff/other barangay/leader/applicant), accept/decline state machine, one-active-assignment race, assessor enforcement, catalog visibility across approve/cancel/reject, success-requires-handover, certificate verify (valid/revoked/tampered hash).

---

## 10. Implementation status (2026-10-03, defaults T1–T6, D-CERT, D2 accepted)

| ID | Status | Notes |
|---|---|---|
| ADO-T0 | Done | Catalog hides animals with an Approved application (`include_reserved=true` for staff, "Reserved" badge); detail/apply return 404/400; monitoring + successful require a two-way handover (409). Animals 8 and 9 are hidden automatically. #13 data not modified — Head Officer to confirm the handover with the adopter. |
| ADO-T1 | Done | `ensure_adoption_tasks_schema()` (idempotent, rehearsed twice on a structure-only copy; matches `Database3.3.txt`). Already applied to the live DB by the dev server reload. |
| ADO-T2 | Done | `POST /adoptions/{id}/claim`, `/transfer`; first decision or assignment by the Head Officer auto-claims; decisions require owner or Admin. |
| ADO-T3 | Done | `POST /adoptions/{id}/assignments`, `GET /assignable-staff`, `/adoption-tasks/mine|count|{id}/accept|decline|cancel`. Scheduling forms assign by **user id** (fixes issue 1). |
| ADO-T4 | Done | `/brgy/adoption-tasks` page + sidebar badge; Case Handling panel in the application details. |
| ADO-T5 | Done | Assessor = accepted assignee (owner/Admin only with an audited override reason); structured interview/home-visit fields; an assignee's Fail/Unsuccessful/Not Suitable is a recommendation — the owner decides (notified). |
| ADO-T6 | Done | Monitoring task; staff visit stores a structured assessment; Successful blocked until the assigned monitor has assessed. |
| ADO-T7 | Done | Issue-time snapshot + signatory; immutable number/hash/date; QR → `/verify/certificate/{no}?h=`; public verify (Valid / Pending_Handover / Revoked / Tampered / Not_Found); revoked on reject/cancel; client-side fabricated certificates and hard-coded names removed. |
| ADO-T8 | Done | Adopter chat messages notify case owner + current assignees; non-head staff see only assigned cases' chats. |
| D2 | Done | Non-head staff see/act only on assigned cases (lists, dossier, ID view, chat). |

Tests: `test_adoption_tasks.py` 58, `test_adoption_authority.py` 216, `test_adoption_chat.py` 102, `test_adoption_catalog_handover.py` 17, `test_adoption_certificate.py` 20; browser E2E 24/24.

Known, not changed: adoption schedule times are stored as UTC without a zone marker and displayed as local time (shifted by the UTC offset) on the existing Adoptions page and the new Tasks page alike; certificate `pdf_url` still points to the API (no stored PDF).
