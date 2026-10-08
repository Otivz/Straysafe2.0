# StraySafe 2.0: Owner Confirmation, Report Merging and Case Notifications (Audit and Revised Plan)

**Goal:** one confirmed pet identity per consolidated case, one primary owner conversation, no unnecessary repeated confirmations, and owner notifications for new sightings.
**Status:** plan for review. **Nothing has been implemented yet.** The one-time sync was only **dry-run** (section 8): it ran inside a transaction that was rolled back, so nothing was saved.
**Part B** (end of this document) covers incorrect-sighting disputes and wrong-merge corrections, including a **security fix for the existing dispute endpoints**.
**Builds on:** [MERGE_PET_CONFIRMATION_AUDIT.md](MERGE_PET_CONFIRMATION_AUDIT.md), already implemented: merged reports inherit the case's confirmed pet, same-pet suggestions become `COVERED_BY_CASE`, and the panel shows "Confirmed via Report #N".

---

## 1. Four different things the system must keep apart

| | What it is | Who | When | Changes the identity? |
|---|---|---|---|---|
| **Owner Confirmation** | The owner says "this is my pet" | Owner | **Once per case**, for the first report | Yes, together with staff verification |
| **Staff Verification** | Staff decide a new sighting is the same animal and **merge** it | Subdivision Leader / authorized staff | For every later report | Yes: the merge shares the case's identity |
| **Owner Notification** | "A new verified sighting of Boyet was added" | System → owner | After each verified merge (and for Lost pets, when a possible sighting appears) | **No** (information only) |
| **Optional Owner Re-verification** | Staff ask the owner to help identify an uncertain sighting | Staff → owner → staff | Only when staff choose to | **No**: staff still make the final merge decision |

Today these blur together: the AI scan sends a **confirmation request** for every new report, which is really a job for staff verification and owner notification.

---

## 2. Current behavior (findings, live data read-only)

**Case #1** = Report #1 (main), #13 (merged 12:46 PM), #15 (merged 2:51 PM).

| Match | Report | Status | Owner answer | Note |
|---|---|---|---|---|
| #4 | #1 | `CONFIRMED_MATCH` | `OWNER_CONFIRMED` | Fully confirmed 2:35 PM |
| #12 | #13 | `AI_SUGGESTED` | `PENDING` | Merged before the merge fix, never synced |
| #15 | #15 | `AI_SUGGESTED` | `PENDING` | Same |

**The owner was asked again:** *"Look-Alike Pet Sighting Detected (Report #15)… please confirm"* at **2:50 PM**, after Boyet was already fully confirmed at 2:35 PM and 38 seconds before the leader merged Report #15. Report #13 got the same request at 12:40 PM.

**Conversation:** one look-alike thread (#1), tied to **match #12 (Report #13)**. Chats are keyed by match, so another report's suggestion would open another thread.

### Root causes

| # | Cause | Where |
|---|---|---|
| R1 | The AI scan sends the owner a **confirmation request** as soon as a report is filed, before staff have seen it, even when the pet is already confirmed in an **active** case. | `routes/matches.py`, scan (owner notification ≈ line 823) |
| R2 | Nothing stops staff from confirming that pet on the new report *instead of* merging it, which would give one pet two active cases and two confirmations. | `utils/case_groups.py` (identity lock), `verify_match` |
| R3 | Look-alike conversations are keyed by **match**, not by pet + case. | `routes/chat.py`, match thread `related_id = match_id` |
| R4 | A verified merge sends the owner nothing, so the last message they saw is the old "please confirm". | `resync_case_pet_identity` (no notification) |
| R5 | Reports merged before the merge fix were never synced. | data |
| R6 | There's no way for staff to ask the owner to *help* without restarting a full confirmation. | missing feature |

---

## 3. Revised workflow (the six scenarios)

### Scenario 1: first report (initial identity confirmation), *unchanged*
AI suggests Boyet → the owner gets **one** confirmation request → the owner confirms → the Leader confirms → identity confirmed for Case #1.

### Scenario 2: another report of the same confirmed pet
1. The scan sees that Boyet is the **confirmed identity of an active case** (Case #1, not resolved) and that Report #13 isn't in it.
2. **No owner confirmation request.** The suggestion is marked *"Boyet is already confirmed in active Case #1 (Report #1)"*, and a Report #13 ↔ Case #1 duplicate suggestion is created, so staff can merge in one step.
3. Staff are informed: the Leader handling Case #1 gets *"Possible new sighting of Boyet (Report #13): review and merge into Case #1"*.
4. The Leader verifies the sighting and **merges** it (staff decision; never automatic).
5. Report #13 inherits the confirmed identity (merge fix). The owner gets **one informational notification**:
   **"A new verified sighting of Boyet (Report #13) has been added to the existing case. No additional confirmation is required."**

### Scenario 3: staff are unsure
1. In the review window, staff use **Request Owner Verification**, an optional action that also needs a short note.
2. The owner gets the new sighting's photo and details **inside the case's existing conversation**, plus a notification, and answers **Yes / No / Unsure**.
3. The answer is **evidence for staff**, not a decision. The report stays unconfirmed and is not merged. Staff review the answer and decide: merge (Yes), mark as a different animal (No), or keep investigating (Unsure).
4. Only **one open request per report** at a time. A repeat press while one is open does nothing.

### Scenario 4: one conversation per active case
- One primary owner conversation per **pet + case**: the earliest existing thread with that owner about that pet among the case's reports. It's created only if none exists.
- Every verified merge posts an informational message there: *"New verified sighting: Report #13 was added to this case."*
- Re-verification requests (Scenario 3) are posted there too.
- Existing threads, messages, timestamps and participants are **kept**. Any extra thread stays readable, with a note: *"This conversation continues in the Case #1 conversation."*
- Duplicate protection: one notification and one message per event (keyed by case + report + event type).

### Scenario 5: Boyet is registered as Lost
- When the scan finds a possible sighting, the owner **is told right away**, clearly marked unverified: *"Possible new sighting of Boyet (Report #20), not yet verified by staff. No action needed. We'll update you once it's checked."*
- **No confirmation request.** Staff can still use Request Owner Verification (Scenario 3).
- After a verified merge, the owner gets the confirmed update (Scenario 2, step 5).

### Scenario 6: resolved cases and separate incidents
- If Boyet's earlier case is **resolved or closed**, a new report is a **new incident**: the normal Scenario 1 flow applies, and the old confirmation stays in history.
- If Boyet's case is **active** but staff decide the new report is a **genuinely separate incident**, they can **override** with a required written reason. The report then goes through the normal Scenario 1 flow as its own case, and the override is logged (`OVERRIDE_SEPARATE_INCIDENT`).

---

## 4. Safeguards

| Safeguard | How |
|---|---|
| AI never establishes identity | Identity comes only from (a) staff + owner confirmation, or (b) a **staff** merge into a confirmed case |
| No automatic merges | The scan only **suggests** the merge; a person merges |
| No duplicate confirmation requests | The scan skips the request when the pet has an active confirmed case. Covered and via-case rows can't be confirmed or answered again (409). One open re-verification per report. |
| No conflicting identities combined | A different pet is identity-locked; merging two confirmed pets is refused for staff review (existing) |
| Original records kept | Confirmations are never copied or edited; inherited links point at the original match; old threads are kept |
| Unmerge restores independence | Inherited link removed, covered suggestions reopened, chat no longer resolves to the case thread. A report's **own** confirmation stays (existing for links and covered rows; chat part new). |
| Overrides are traceable | Override and re-verification each need a written reason; both are written to the audit log |
| Consistency | One source of truth (`case_confirmed_match` over the case's reports) for the panel, the review window, the owner's page, notifications and chats |

---

## 5. Affected components

| Layer | Component | Change |
|---|---|---|
| Database | `report_matches` | New: `owner_verification_requested_at`, `owner_verification_requested_by`, `owner_verification_note`, `owner_verification_answer` (`YES` / `NO` / `UNSURE`), `owner_verification_answered_at`; `case_hint_report_id` ("pet already confirmed in Case #N") |
| Database | `reports` | New: `separate_incident_reason`, `separate_incident_by` (override) |
| Database | `chat_threads` | New: `case_root_report_id` (which case a match conversation belongs to) |
| Backend | `utils/case_groups.py` | `active_confirmed_case_for_pet()`; extend the identity lock (outside the active case → "merge into Case #N", unless overridden); owner notification + chat message on inherit (deduplicated) |
| Backend | `routes/matches.py` | Scan: skip the owner request when there's an active confirmed case, add the case hint and duplicate suggestion, inform the case's leader; Lost-pet unverified notice. New endpoints: `POST /matches/{id}/request-owner-verification`, `POST /matches/{id}/owner-verification` (Yes/No/Unsure), `POST /reports/{id}/separate-incident` (override) |
| Backend | `routes/chat.py` | `case_thread_for_match()`: every match-chat endpoint resolves to the case's primary thread; "continues in…" note on extra threads |
| Frontend | `AIPotentialMatchesList.tsx`, `AIMatchReviewModal.tsx` | Case hint ("already confirmed in Case #1, merge"); **Request Owner Verification** button and owner-answer display; override dialog; your exact "already confirmed… no additional owner confirmation is required" wording |
| Frontend | `PetMatchReview.tsx` (owner) | Covered / via-case → "already confirmed through Report #1"; re-verification Yes/No/Unsure card; unverified Lost-pet sighting card |
| Frontend | Chat drawer | System messages for new sightings and verification requests |

---

## 6. Phases (duplicate prevention first)

| Phase | Scope | Fixes | Size |
|---|---|---|---|
| **0** | **Backup**, then the one-time sync of Case #1 (section 8), after you approve | R5: the "Review Match" you see today | ✅ **Done.** Backup `Desktop\StraySafe_Backups\backup_straysafe_db_20261008_1903.sql` (complete, 57 tables). Sync applied to Case #1 only: Reports #13 and #15 inherited Boyet from Match #4; suggestions #12 and #15 → `COVERED_BY_CASE`. #12 had been staff-confirmed again in the meantime (owner pending); it is now covered as well, with its reviewer and time kept, so the owner isn't asked twice. Logged as `ONE_TIME_CASE_PET_SYNC`. |
| **1** | Scan: no owner request when the pet has an active confirmed case; case hint + duplicate suggestion; tell the case's leader. Identity lock: confirm outside the active case → "merge into Case #N" | R1, R2: **duplicate confirmation requests** | Small–Medium  ✅ **Done:** `active_case_for_pet()` (open case confirmed as the pet, or staff-confirmed and waiting for the owner). Scan: the suggestion is still created, but **no owner confirmation request**; a "same animal as Case #N" duplicate suggestion is added for a one-step merge, the case's leader is told, and it's logged (`OWNER_REQUEST_SKIPPED_CASE_CONFIRMED`). For a **Lost** pet the owner gets the *unverified* "possible new sighting… no action needed" notice (part of Phase 5). Identity lock: confirming the pet outside its active case → 409 "merge into Case #N". A resolved case → a new incident (normal flow). Tested in `test_active_case_requests.py` (17/17). |
| **2** | Verified merge → owner informational notification (exact wording) + message in the case conversation, deduplicated | R4 | Small  ✅ **Done** (with Part B2): one "new verified sighting… no additional confirmation is required" notice per merged report, deduplicated. |
| **3** | One conversation per pet + case; "continues in…" on extra threads | R3 | Medium  ✅ **Done:** `find_match_thread()` / `case_conversation()`: every report of a case opens the case's earliest conversation about that pet (send, read, stats and thread endpoints all use it). New verified sightings are posted there once. An existing duplicate keeps its history, gets "This conversation continues in the Case #N conversation" and is closed to new messages. After an unmerge the report gets its own conversation again. Tested in `test_case_conversation.py` (11/11). |
| **4** | Request Owner Verification (Yes/No/Unsure) inside the case conversation; staff decide | R6 | Medium  ✅ **Done:** staff on a pending suggestion for an owned pet can **Request owner verification** (reason required, one open request). It is posted with the sighting photo in the case conversation, and the owner is notified once. The owner answers **Yes / No / Unsure** (optional note, once) on the sighting page. The answer is recorded with the time, posted in the conversation and sent to the staff member who asked. It is evidence only: nothing is confirmed or merged by it. `POST /matches/{id}/request-owner-verification`, `POST /matches/{id}/owner-verification`. Tested in `test_owner_verification.py` (17/17). |
| **4b** | One pet claim per merged case | Duplicate claims after a merge (claims #1 and #2, both Boyet) | Small  ✅ **Done:** on merge (and on every case resync), same-pet claims of the case's reports are combined into one. The case keeps the furthest-along claim, or the earliest if tied. The other claim is set to `Merged` with `merged_into_claim_id`, its proof and markings are copied over and a note is added. Nothing is deleted. A claim filed from any report of the case updates the case's claim, and a new one is filed on the case's first report. Claim lists hide merged claims and show the case's reports. Opening an old claim (or acting on it) goes to the case's claim. Unmerging reopens the separated claim with its earlier status. Tested in `test_case_claims.py` (18/18). |
| **5** | Lost-pet unverified sighting notice; separate-incident override with reason; resolved case = new incident (tests) | Scenarios 5–6 | Small–Medium  ✅ **Done:** the Lost-pet notice was added with Phase 1. **Mark as separate incident** appears in the review window when a suggestion is locked by the pet's active case. `POST /reports/{id}/separate-incident`: case handler or Admin only, reason required (at least 10 characters), only on a report that isn't merged into a case and only when something is actually locked. It records the reason, who and when on the report, plus a status history note, and is logged as `OVERRIDE_SEPARATE_INCIDENT`. The "same animal as Case #N" duplicate suggestion is answered as not a match, and the owner gets the usual look-alike notice once. Nothing is confirmed by it: staff then confirm as usual and the owner is asked. A resolved case never locks a new report. Tested in `test_separate_incident.py` (17/17). |

Each phase is tested and usable on its own, and nothing in a later phase is needed for an earlier one to work.

---

## 7. Regression tests

| # | Area | Scenario | Expected |
|---|---|---|---|
| T1 | Notifications | Boyet confirmed in active Case #1; new Report #20; scan finds Boyet | **No** owner confirmation request; suggestion shows the Case #1 hint; Report #20 ↔ Case #1 duplicate suggestion exists; case leader informed |
| T2 | Lock | Staff try to confirm Boyet on Report #20 | 409 "merge into Case #1"; no owner notification |
| T3 | Merge | Staff merge #20 into Case #1 | Inherits Boyet; suggestion covered; owner gets **exactly one** "new verified sighting… no additional confirmation is required" |
| T4 | Duplicates | Merge two more reports; run the sync twice | One notification per report, none repeated; no confirmation requests |
| T5 | Conversation | Owner opens chat from #13's and #15's suggestions | Same thread; new-sighting messages present; history and participants unchanged |
| T6 | Re-verification | Staff request owner verification on #20 (with note) | One request in the case conversation + notification; a second press doesn't duplicate it; report stays unconfirmed and unmerged |
| T7 | Re-verification | Owner answers Yes / No / Unsure | Answer recorded with time; nothing merged or confirmed automatically; staff still decide |
| T8 | Re-verification | Owner tries to answer someone else's request | 403 |
| T9 | Lost pet | Boyet marked Lost; new possible sighting | Owner gets the **unverified** notice, no confirmation request |
| T10 | Resolved | Case #1 resolved; new report finds Boyet | Normal Scenario 1 flow (owner asked once for the new case); old confirmation kept |
| T11 | Override | Separate incident with reason | Allowed; report follows Scenario 1 as its own case; audit entry; without a reason → 400 |
| T12 | Conflict | Merged report suggests another pet | Stays locked; nothing confirmed |
| T13 | Unmerge | Unmerge #20 | Inherited link removed; suggestion reopened; chat no longer resolves to the case thread; Case #1 keeps Boyet |
| T14 | Unmerge | Report with its own confirmation is unmerged | Keeps its own confirmation |
| T15 | Owner pending | Staff-confirmed, owner pending on #1; #20 arrives | No second request; waits for the owner's answer on #1 |
| T16 | Sync | One-time sync of Case #1 | Exactly the rows in section 8 change; nothing else |

---

## 8. One-time sync of existing records: exact changes (dry run, rolled back)

Ran `resync_case_pet_identity` on Case #1 inside a transaction, recorded every change, then **rolled back**.

**Confirming match:** #4 (Report #1, Pet #3 Boyet, owner + staff confirmed).

| Table | Row | Field | Before | After |
|---|---|---|---|---|
| `reports` | #13 | `pet_id` | NULL | 3 |
| `reports` | #13 | `pet_inherited_from_match_id` | NULL | 4 |
| `reports` | #15 | `pet_id` | NULL | 3 |
| `reports` | #15 | `pet_inherited_from_match_id` | NULL | 4 |
| `report_matches` | #12 (Report #13) | `status` / `covered_by_match_id` | `AI_SUGGESTED` / NULL | `COVERED_BY_CASE` / 4 |
| `report_matches` | #15 (Report #15) | `status` / `covered_by_match_id` | `AI_SUGGESTED` / NULL | `COVERED_BY_CASE` / 4 |
| `status_history` | new | | | **+2** (one note per report) |
| `pet_history` | new | | | **+2** ("Sighting linked via case") |
| `audit_logs` | new | | | **+2** (`INHERIT_CASE_PET_IDENTITY`) |

Nothing else changes: match #4, owner answers, messages and threads are untouched.

**Backup:** **none found.** No `.sql` dump is in the project; `Database3.3.txt` is the schema script, not a copy of your data. `mysqldump` is installed (MySQL Server 8.0). Create a backup **before** Phase 0:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p --single-transaction --routines straysafe_db > "backup_straysafe_db_$(Get-Date -Format yyyyMMdd_HHmm).sql"
```

Then restore with `mysql -u root -p straysafe_db < backup_….sql` if ever needed. Keep the file outside the repository (it holds personal data).

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| **A wrong merge shares the wrong identity** (two different dogs merged → the second one silently becomes Boyet without an owner check) | Merge requires a written reason (existing); Request Owner Verification is available when unsure; Unmerge and Reverse Decision undo it cleanly (existing); every inheritance is audited |
| **Owner informed later than before** (no immediate "possible sighting" for a non-Lost pet) | Intended: they're informed once staff verify. For **Lost** pets the unverified notice is immediate (Scenario 5). |
| **Stale active cases** force new incidents to be merged | Separate-incident override with reason (Scenario 6); closing resolved cases on time |
| **Conversation consolidation picks the wrong thread** | Only threads with the same owner, same pet and same case are joined; old threads are never deleted; "continues in…" note |
| **Notification spam** on bulk merges | Deduplication per case + report + event; one message per merged report |
| **Legacy data** (#13, #15) | Exact preview above; backup first; run only after approval |
| **Scope / time before the defense** | Phases are independent: Phases 0–2 remove the visible problem; 3–5 can follow |

---
---

# Part B: Incorrect Sighting Disputes and Wrong-Merge Corrections

**Workflow:** New sighting merged → owner notified → owner flags an incorrect sighting (if needed) → staff review → merge upheld or unmerged → owner notified of the outcome.
**Status:** audit and plan for review. Nothing implemented.

## B1. The main risk, and what Part B must cover

A wrong merge (a different dog merged into Boyet's confirmed Case #1) makes Report #15 **inherit Boyet's identity**. A dispute lets the owner catch it, but the inherited identity is already used **before** anyone disputes it. The audit found three places where that matters:

| Consequential use | Where | What a wrong merge would do |
|---|---|---|
| **Bite and chase history** | `routes/reports.py:3635` (link pet) and `:4586` (verify incident) count verified bite reports with `Report.pet_id == pet` | The other dog's bite is counted on **Boyet's** record (`bite_incident_count`, `has_bite_history`) |
| **Return to owner / handover** | `utils/owner_returns.py:84` `owner_already_on_record()` treats the report's pet link as **proof of ownership** | The wrong dog can be handed to Boyet's owner **without the usual ownership proof** |
| **Owner warnings** | `routes/warnings.py:135` fills the warning's pet from the report's pet link | A warning goes to Boyet's owner for another dog's behaviour |

**So the dispute flow alone corrects the mistake but doesn't prevent its damage.** Part B therefore has two halves:
1. **Prevent damage (the trust rule):** an **inherited** identity isn't enough for consequential actions.
2. **Correct the mistake (the dispute lifecycle):** owner flags it → staff decide → unmerge or uphold.

## B2. Security finding in the existing dispute feature (fix first)

The existing "Pet Owner Formal Dispute" endpoints have **no authentication**:

| Endpoint | Problem | Effect |
|---|---|---|
| `POST /reports/{id}/disputes` | No sign-in; the person filing is taken from a form field (`resident_user_id`) | Anyone can file a dispute **in another resident's name** |
| `PATCH /reports/{id}/disputes/{id}/review` | No sign-in; the reviewer is taken from the request body (`reviewer_id`) | **Anyone can accept a dispute** by sending a staff member's ID. Accepting **dismisses the report as a False Alarm** |
| `GET /reports/{id}/disputes` | No sign-in | Anyone can read dispute reasons and attached documents (vaccination card, photos) |

**Fix (Phase B0):** the filer and reviewer come from the signed-in account (`get_current_user` / staff check), never from the request. Only the case handler or an Admin can review. Residents only see their own disputes; staff see disputes in their scope.

## B3. What can be reused (no parallel system)

| Need | Reuse | Change needed |
|---|---|---|
| Dispute record (who, reason, evidence, status, reviewer, notes, dates) | **`report_disputes`** table + endpoints | Add `dispute_type`: `false_report` (existing meaning) or **`wrong_identity`** (new); add `merged_into_report_id` and `contested_pet_id` (the case and pet being disputed); status values extended (B4) |
| Staff "Dispute Review" panel | Existing **Citizen Pet Disputes & Counter-Claims** panel on the report view | Show the type; for `wrong_identity` show side-by-side photos (reuse `MediaLightbox`) and the merge reason |
| Correcting the merge | **Unmerge** (`/reports/{id}/unmerge`) + `resync_case_pet_identity` | Called by the dispute decision; no new correction logic |
| Wrong match decision on the pet itself | **Reverse Decision** (`/matches/{id}/reverse`) | Only if the *original* confirmation was wrong (rare); unchanged |
| Owner messages | Case conversation (Part A, Phase 3) + notifications | New message types for dispute filed / outcome |
| Audit | `log_activity` | New actions `DISPUTE_WRONG_IDENTITY_FILED`, `…_UPHELD`, `…_UNMERGED` |

**Important:** accepting an existing `false_report` dispute **dismisses the whole report**. A `wrong_identity` dispute must never do that: the stray report is real, only the identity is wrong. So the outcome depends on the type.

## B4. Dispute lifecycle (`wrong_identity`)

```
Report #15 merged into Case #1 (inherits Boyet)
        │  owner notified: "new verified sighting… no confirmation required"  [View sighting] [Flag incorrect sighting]
        ▼
 PENDING   "Identity Disputed – Under Review"   (owner gave a reason; one open dispute per report + case)
        │  staff review: photos side by side, details, location, times, AI suggestion,
        │  original confirmation (Match #4: who, when), merge reason + history
        ├──► UPHELD     "Reviewed – Merge Upheld"   (staff explanation required)
        │        report stays in Case #1; owner told the outcome; no new confirmation request
        └──► REVERSED   "Reviewed – Incorrect Sighting Removed"   (staff reason required)
                 Unmerge #15 → inherited Boyet removed → its own suggestions reopened
                 (unless #15 has its own valid confirmation) → owner told:
                 "Report #15 has been removed from Boyet's case following verification.
                  Boyet's original confirmed identity remains unchanged. No further action is required."
```

**Effects while `PENDING`:**
- Report #15's inherited identity is **suspended**: it doesn't count as Boyet for bite/chase history, warnings or return-to-owner (B5). It **stays merged**, because an owner dispute never unmerges by itself.
- Report #1's confirmation (Match #4) is **untouched**.
- The look-alike panel on #15 shows *"Identity disputed by the owner – under review"* instead of "Confirmed via Report #1".
- Staff get one notification (the case handler, else the subdivision's leaders).

**Duplicates:** a second "Flag" on the same report while a dispute is `PENDING` shows the existing one (no new record). After `UPHELD`, the owner can open a new dispute only with new evidence: limit it to one more, after which it goes to the Barangay, similar to the second-review rule.

## B5. The trust rule (prevents the damage)

| Action | Own confirmation on this report | Inherited (case) identity | Inherited + dispute pending |
|---|---|---|---|
| Shown in case, panel, owner conversation | ✓ | ✓ | ✓ (marked disputed) |
| Owner notifications | ✓ | ✓ | ✓ |
| **Counts toward the pet's bite / chase history** | ✓ | **Only after staff re-check** (one click: "Confirm this incident is Boyet") | ✗ |
| **Owner warning auto-filled with the pet** | ✓ | **Only after staff re-check** | ✗ |
| **Return to owner: ownership proven by the record** | ✓ | ✗: ownership proof required as for an unidentified animal (or staff re-check) | ✗ |

The re-check is a small staff action on an inherited report, `identity_rechecked_by` / `_at` with a note. It's needed only for those three consequential actions, so the everyday workflow keeps the benefit of no repeated confirmations.

## B6. Data changes (minimal)

| Table | Field | Purpose |
|---|---|---|
| `report_disputes` | `dispute_type` (`false_report` / `wrong_identity`, default `false_report`) | Same table, two meanings |
| `report_disputes` | `merged_into_report_id`, `contested_pet_id` | Which case and pet the dispute is about |
| `report_disputes` | `status` extended: `Pending`, `Accepted`, `Rejected`, **`Upheld`**, **`Reversed`** | Lifecycle (existing values keep their meaning for `false_report`) |
| `reports` | `identity_rechecked_by`, `identity_rechecked_at`, `identity_recheck_note` | Trust rule (B5) |

No new table. Everything else reuses the merge-fix columns (`pet_inherited_from_match_id`, `covered_by_match_id`).

## B7. Authorization

| Action | Who |
|---|---|
| Flag incorrect sighting | Only the **owner of the contested pet** (signed in); for a community animal (no owner), staff only |
| Review / decide (Upheld / Reversed) | The **case handler** (the Leader who claimed it) or an **Admin**; Barangay staff when the case is in Barangay hands |
| Re-check an inherited identity (B5) | Same as review |
| See a dispute | The owner who filed it; staff in scope |

## B8. Phases (in order)

| Phase | Scope | Why first |
|---|---|---|
| **B0** | Secure the existing dispute endpoints (B2) | Security hole: anyone can dismiss a report today. ✅ **Done:** sign-in required on all three endpoints. The filer is the signed-in resident, who must own the pet named in the dispute. The reviewer is the signed-in officer **handling the case** (or an Admin); any `reviewer_id` sent is ignored. A dispute can be decided only once. Residents see only their own disputes, also inside report details. Dispute uploads no longer block the server. Tested in `test_dispute_security.py` (16/16). |
| **B1** | Trust rule (B5): inherited identity not used for bite/chase history, warnings or ownership proof unless re-checked | **Prevents the damage** of any wrong merge, before disputes exist. ✅ **Done:** one shared `refresh_pet_behavior()` counts only reports with a trusted link (own confirmation, or inherited **and** re-checked). `owner_already_on_record()` no longer accepts an un-re-checked inherited link as ownership proof. Warnings refuse to auto-fill an inherited pet (409). New staff action **Re-check identity** (`POST /reports/{id}/recheck-identity`, case handler or Admin, note required) and a notice on the Subdivision and Barangay report views. Unmerge or reversal clears the re-check and recomputes the pet's history. Also fixed on the way: `verify-incident` had **no sign-in** (acting user taken from the body), and issuing a warning against a report crashed (wrong history field). Tested in `test_trust_rule.py` (22/22). |
| **B2** | `wrong_identity` dispute: owner Flag action (with reason) from the new-sighting notification and the owner's sighting page; staff notified; panel shows "Identity Disputed – Under Review" | Detection  ✅ **Done:** reuses `report_disputes` (`dispute_type = wrong_identity`, `merged_into_report_id`, `contested_pet_id`). When a report joins a confirmed case, the owner gets one *"new verified sighting… no additional confirmation is required"* notice. The owner's sighting page shows **Flag incorrect sighting** (reason required; only the pet's owner; one open dispute per report). Nothing is unmerged automatically; the inherited identity is suspended (trust rule) and re-check is blocked while it's open. The case handler is notified once. The look-alike panel shows "Identity disputed – under review". `POST /reports/{id}/identity-dispute`. |
| **B3** | Staff decision: Upheld (explanation) or Reversed (reason → reuses Unmerge + resync); owner outcome notifications with your wording | Correction  ✅ **Done:** `POST /reports/{id}/identity-dispute/{dispute_id}/decide` (`uphold` / `reverse`, reason required, case handler or Admin, decided once). **Uphold** keeps the merge and the owner's disagreement, and tells the owner the outcome; no new confirmation request. **Reverse** reuses Unmerge (inherited identity removed, suggestions reopened, the original confirmation and other reports untouched) and sends the exact *"…removed from Boyet's case following verification. Boyet's original confirmed identity remains unchanged. No further action is required."* The old false-report review refuses identity disputes, and its own behaviour is unchanged. |
| **B4** | Staff review view: side-by-side photos, merge reason, original confirmation, history | Better decisions  ✅ **Done:** `IdentityDisputePanel` on the Subdivision and Barangay report views: the owner's reason, side-by-side photos (this report / original report / registered pet, full screen on click), the original confirmation (who, when, owner confirmed), the merge (who, when, reason) and the decision. Also fixed: merging never saved the merge reason on the report (`merge_notes` was always blank). Tested in `test_identity_dispute.py` (28/28). |

Part A's phases (no repeated requests, notifications, one conversation) and Part B's are independent. **B0 and B1 are worth doing even if nothing else in Part B is built.**

## B9. Regression tests

| # | Area | Scenario | Expected |
|---|---|---|---|
| D1 | Security | File a dispute without signing in / in another user's name | 401 / filer is always the signed-in user |
| D2 | Security | Review a dispute without signing in, or as a resident, or with a fake `reviewer_id` | 401 / 403; `reviewer_id` in the body is ignored |
| D3 | Trust | Inherited report (#15) is a verified bite incident | Boyet's bite count **unchanged** until a staff re-check; counted after the re-check |
| D4 | Trust | Return-to-owner on an inherited report | Ownership is **not** treated as proven by the record; proof required (or re-check) |
| D5 | Trust | Warning on an inherited report | Pet not auto-filled unless re-checked |
| D6 | Dispute | Owner flags #15 with a reason | Dispute `Pending`, type `wrong_identity`; report still merged; inherited identity suspended; Match #4 untouched; staff notified once |
| D7 | Dispute | Owner flags again while pending | No second record; same dispute returned |
| D8 | Dispute | Someone other than the pet's owner flags it | 403 |
| D9 | Decision | Staff uphold with explanation | `Upheld`; #15 stays merged; owner told the outcome; **no** new confirmation request; disagreement kept |
| D10 | Decision | Staff reverse with reason | `Reversed`; #15 unmerged; inherited Boyet removed; its suggestions reopened; #1 and other merged reports keep Boyet; owner gets the exact "removed… remains unchanged" message |
| D11 | Decision | #15 had its **own** valid confirmation | Reverse keeps that confirmation (only the inherited part is removed) |
| D12 | Decision | Decision without a reason / by an unauthorized user | 400 / 403 |
| D13 | Type safety | Accepting a `false_report` dispute | Still dismisses as False Alarm (existing behaviour unchanged); a `wrong_identity` dispute never does |
| D14 | Duplicates | Decision submitted twice | One outcome, one notification, one audit entry |
| D15 | History | After either outcome | Dispute, merge, unmerge and all messages remain visible in history and the audit log |
