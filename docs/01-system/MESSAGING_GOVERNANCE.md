# STRAYSAFE 2.0 — Messaging System Governance, Rulings & Audit Checklist

**Document Version:** 2.1  
**Audit & Governance Date:** October 12, 2026  
**Update 2026-10-28:** adoption was removed from the system (not approved by the panel). Adoption chats no longer exist; the adoption items below are kept as audit history only.  
**Audited Target Modules:**
- Backend: [`backend/app/routes/chat.py`](../../backend/app/routes/chat.py), `backend/app/routes/adoption_chat.py` (removed 2026-10-28), [`backend/app/schemas/chat.py`](../../backend/app/schemas/chat.py), [`backend/app/models/chat.py`](../../backend/app/models/chat.py)
- Frontend: [`ReportChatDrawer.tsx`](../../frontend/src/components/Chat/ReportChatDrawer.tsx), [`ReportChatBadge.tsx`](../../frontend/src/components/Chat/ReportChatBadge.tsx), [`MessagesDropdown.tsx`](../../frontend/src/components/Chat/MessagesDropdown.tsx), [`MessagesDrawer.tsx`](../../frontend/src/components/Chat/MessagesDrawer.tsx), [`SubdMessages.tsx`](../../frontend/src/pages/Subd_Leaders/SubdMessages.tsx), [`BrgyMessages.tsx`](../../frontend/src/pages/Barangay_Staff/BrgyMessages.tsx), [`useUnreadMessageCount.ts`](../../frontend/src/utils/useUnreadMessageCount.ts)

---

## Part 1: Official System Rulings for In-App Messaging

In StraySafe 2.0, the messaging module is **not an unmoderated social network chatroom**. It functions as an **official, context-bound operational communication system** designed for community animal welfare, field rescue coordination, lost-pet recovery, adoption applicant screening, and legal auditability.

Every message sent within the platform is governed by the following strict rulings:

---

### 📋 Governance & Role Permission Matrix

| Capability / Action | Resident Reporter | Other Resident / Citizen | Subdivision Leader | Barangay Field Responders | Barangay Head Officer | Super Admin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **View Report Case Chat** | ✅ Full access (own report) | ❌ Denied (Strictly confidential between reporter & staff) | ✅ Full access (own subdivision) | 👁️ Read-only (escalated cases) | ✅ View all in barangay | ✅ Global oversight |
| **Send Message in Report Chat** | ✅ Permitted (case author) | ❌ Denied (403 Forbidden) | ✅ Permitted (assigned / subdivision) | ✅ Permitted (assigned rescuer only) | ✅ Permitted (assigned / head officer) | ✅ Permitted |
| **View Look-Alike Match Chat** | ✅ Permitted (reporter / pet owner) | ❌ Denied (no relation) | ✅ Permitted (in-jurisdiction) | 👁️ Read-only (if escalated) | ✅ Permitted (if escalated) | ✅ Global oversight |
| **Send in Match Chat** | ✅ Permitted (pet owner / reporter) | ❌ Denied (403 Forbidden) | ✅ Permitted (handling leader) | ✅ Permitted (assigned rescuer) | ✅ Permitted | ✅ Permitted |
| **Edit / Modify Sent Message** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** |
| **Delete Sent Message** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** | 🚫 **PROHIBITED** |
| **Forge System Flag (`is_system`)** | 🚫 Rejected by server | 🚫 Rejected by server | 🚫 Rejected by server | 🚫 Rejected by server | 🚫 Rejected by server | ⚙️ Backend triggers only |

---

### 🏛️ Ruling 1: Official Public Record Status (Immutability & Evidence)
1. **Zero Message Editing or Deletion:** Messages sent through StraySafe cannot be updated (`PUT`/`PATCH`) or deleted (`DELETE`) by any resident, subdivision officer, or barangay responder. Every entry is an indelible digital record.
2. **Comprehensive Audit Trail:** Every chat entry records the exact UTC `sent_at` timestamp, `sender_id`, human-readable role at time of posting, target `thread_id`, and delivery receipt.
3. **Forensic Evidence Admissibility:** In the event of an animal bite investigation, dispute of pet ownership, neglect accusation, or false alarm inquiry, official chat logs serve as admissible administrative evidence.

---

### 🔒 Ruling 2: Strict Contextual Scoping (Prohibition of Arbitrary DMs)
1. **Zero Unsolicited Peer-to-Peer Messaging:** Users cannot browse or search user directories to initiate random private conversations.
2. **Three Exclusive Permitted Contexts:**
   - **Type A: Incident Report Case Chat (`thread_type = 'Report'`):** Permanently bound to an active stray sighting or rescue incident (`report_id`).
   - **Type B: Lost Pet Look-Alike Match Chat (`thread_type = 'Direct'`):** Bound to an AI/rule look-alike pet candidate (`match_id` or `pet_id`).
   - **Type C: Adoption Screening Thread (`thread_type = 'Adoption'`):** Retired 2026-10-28 with the adoption feature; the server never opens one.

---

### 🚪 Ruling 3: Multi-Jurisdictional Escalation Gate (Subdivision vs. Barangay)
1. **Subdivision Confidentiality:** When a resident reports a stray inside a registered subdivision, discussions between the resident and the Subdivision Leader remain strictly private to that subdivision.
2. **Barangay Access Barrier:** Barangay staff and field responders **cannot view, query, or join** a subdivision report chat while the report remains in local statuses (*Reported*, *Validated*, *Under Local Investigation*).
3. **Escalation Handover:** Barangay staff gain chat access only after:
   - The Subdivision Leader issues an official escalation (`POST /reports/{id}/escalate-to-barangay`), or
   - An Endorsement Letter / Field Rescue dispatch is formally registered.

---

### 🦺 Ruling 4: Command Authority & Operational Safety in the Field
1. **Active Dispatch Protocol:** During an active field rescue, communications must be succinct and direct to prevent conflicting instructions during aggressive animal capture or rabies containment.
2. **Responder Interactivity:** Only responders **actively assigned** to the rescue mission (`RescueAssignment` / `staff_id`) and the on-site resident reporter hold interactive messaging permissions.
3. **Oversight Roles:** High-ranking officials (Barangay Captains, Subdivision HOA Officers, Admins) possess **read-only oversight rights** unless explicitly assigned to the rescue team, preventing administrative interference with tactical field personnel.

---

### 🛡️ Ruling 5: Data Privacy & Minimization (RA 10173 Compliance)
1. **Address Protection in Match Inquiries:** When a pet owner is matched to a stray sighting, the conversation header displays only broader area indicators (Subdivision/Barangay/Street) rather than exact house/lot numbers.
2. **Personal Contact Concealment:** Personal phone numbers and email addresses are withheld from public chat payloads.
3. **Notification Privacy:** Push/in-app notifications display message snippets truncated to a maximum of **80 characters** to protect sensitive situational details from lock-screen exposure.

---

### 🛑 Ruling 6: Finality & Automatic Read-Only Archival
1. **Case Closure Lockdown:** When an incident reaches a terminal resolution:
   - *Status 3:* Rejected / False Alarm Dismissed
   - *Status 8:* Returned to Owner
   - *Status 9:* Claimed by Owner
   - *Status 10:* Adopted / Released
   - *Status 11:* Incident Resolved / Reunited
   - *Status 12:* Deceased
   - *Status 14:* Dismissed
   - *Status 17:* Search Concluded / Cannot Be Found
   - *Status 18:* Merged Duplicate
   The thread is immediately locked into **Read-Only Mode** (`thread.is_closed = True`).
2. **Post-Resolution Ban:** Attempting to post to a closed thread is rejected by the API (`HTTP 400: "This case has been solved and archived. Chat is in read-only mode"`). This prevents post-investigation harassment or stale chatter.
3. **Match Exception:** Look-alike pet match chats remain open during *Status 9 (Claimed by Owner)* solely to coordinate physical handover logistics, locking upon terminal handover.
4. **Adoption Application Lockdown:** Adoption chats lock into read-only mode once the application status reaches *Rejected* or reaches terminal completion (*Successful_Adoption*).

---

### 📸 Ruling 7: Media Integrity & Security Standards
1. **Signed Storage Only:** Users cannot upload arbitrary files, zip archives, or executable scripts into the chat.
2. **Validated Cloudinary Presets:** All attachments must pass file-type validation (`image/*`, `video/*`, `application/pdf`) and originate from the project's authenticated Cloudinary media bucket.
3. **Text Length Constraints:** Messages must contain at least 1 printable character (`min_length = 1`) and cannot exceed **2,000 characters**.

---

### 🤖 Ruling 8: System vs. Human Message Integrity
1. **Protected System Notices:** Status transition announcements, facility intake alerts, and dispute logs are categorized as `is_system = True`.
2. **Client Spoofing Prohibition:** Regular clients cannot forge the `is_system` flag. All human submissions are strictly stamped `is_system = False` with the authenticated user ID.

---

## Part 2: Comprehensive Code Audit (Bugs, Inconsistencies & Gaps)

---

### 🚨 1. Critical Bugs & Runtime Issues

#### 🔴 Bug 1.1: Missing Polling Loop in `ReportChatDrawer.tsx` (No Real-Time Incoming Messages)
* **Location:** [`frontend/src/components/Chat/ReportChatDrawer.tsx:465-473`](../../frontend/src/components/Chat/ReportChatDrawer.tsx#L465-L473)
* **The Issue:** The polling `setInterval` (5 seconds) is placed **exclusively** inside `if (isAdoptionMode)`. For standard **Report Case Chats** (`threadMode === 'report'`) and **Match Inquiry Chats** (`threadMode === 'match'`), `fetchLiveMessages()` executes only **once** upon mounting.
* **Impact:** While looking at an open chat drawer, residents and officers never see incoming responses in real-time unless they manually close and re-open the drawer.
* **Remediation:** Pull the polling interval outside the `if (isAdoptionMode)` check so all active drawer modes poll every 3–5 seconds.

---

#### 🔴 Bug 1.2: Duplicate Mounting of `<ReportChatDrawer>` in `BrgyReportView.tsx`
* **Location:** [`frontend/src/pages/Barangay_Staff/BrgyReportView.tsx:2408-2420`](../../frontend/src/pages/Barangay_Staff/BrgyReportView.tsx#L2408-L2420) and [Line 3324-3335](../../frontend/src/pages/Barangay_Staff/BrgyReportView.tsx#L3324-L3335)
* **The Issue:** `BrgyReportView.tsx` declares and mounts `<ReportChatDrawer>` **twice** in the same component tree, both tied to `isOpen={isChatOpen}`.
* **Impact:** Clicking "Open Chat" mounts two identical chat drawer portals simultaneously, generating duplicate network calls, dual event listeners, and DOM overlay conflicts.
* **Remediation:** Remove the redundant instance at line 2408 and preserve the unified instance at line 3324.

---

#### 🔴 Bug 1.3: Navigation Query Parameter Loss in Dropdowns and Drawers
* **Location:** [`frontend/src/components/Chat/MessagesDropdown.tsx:91-95`](../../frontend/src/components/Chat/MessagesDropdown.tsx#L91-L95) and [`frontend/src/components/Chat/MessagesDrawer.tsx:80-86`](../../frontend/src/components/Chat/MessagesDrawer.tsx#L80-L86)
* **The Issue:** 
  1. In `MessagesDropdown.tsx`, clicking a thread as Subdivision or Barangay staff navigates to `/subd/messages` or `/brgy/messages` without query parameters (`?reportId=...` or `?matchId=...`).
  2. In `MessagesDrawer.tsx`, the `brgy` role is not handled; clicking a thread erroneously routes Barangay staff to resident URLs (`/resident/reports/...`).
* **Impact:** Selecting a conversation from the header dropdown navigates to the messages dashboard but fails to open the clicked thread.
* **Remediation:** Pass query parameters upon navigation (e.g. `navigate('/subd/messages?reportId=' + thread.report_id)`).

---

#### 🔴 Bug 1.4: Hardcoded `recipient_id = 2` Foreign Key Vulnerability
* **Location:** [`backend/app/routes/chat.py:202`](../../backend/app/routes/chat.py#L202)
* **The Issue:** When a resident initiates a new report thread, `recipient_id` defaults to a hardcoded integer `2`:
  ```python
  recipient_id = 2  # default to leader/staff placeholder
  ```
* **Impact:** If `user_id = 2` does not exist in the database (or was deleted/reseeded), `db.commit()` throws an SQL `IntegrityError` (`FOREIGN KEY (recipient_id) REFERENCES users (user_id)`), causing an unhandled HTTP 500 server crash.
* **Remediation:** Dynamically resolve `recipient_id` via `report.assigned_leader_id` or query an active leader in `report.subdivision_id`.

---

### ⚖️ 2. Business Logic & Status Inconsistencies

#### 🟡 Inconsistency 2.1: Model Attribute Mismatch (`status_id` vs `current_status_id`)
* **Location:** [`backend/app/routes/chat.py:212`](../../backend/app/routes/chat.py#L212)
* **The Issue:** `is_closed=report.status_id in [3, 9, 10, 11, 12, 14]`. In SQLAlchemy model [`backend/app/models/report.py`](../../backend/app/models/report.py), `status_id` is an unmapped transient property (`status_id: Optional[int] = None`). The real database column is `current_status_id`.
* **Impact:** `report.status_id` evaluates to `None` on fresh loads, causing `is_closed` to be incorrectly initialized to `False` on thread creation.
* **Remediation:** Change line 212 to `is_closed=(report.current_status_id or report.status_id) in [3, 9, 10, 11, 12, 14]`.

---

#### 🟡 Inconsistency 2.2: Terminal Status Set Divergence
* **The Issue:** Different files define different terminal statuses for closing chats:
  * In `matches.py`: `RESOLVED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18]`
  * In `ReportChatDrawer.tsx`: `[3, 9, 10, 11, 12, 14, 17, 18]`
  * In `backend/app/routes/chat.py:219`: `[3, 9, 10, 11, 12, 14]`
* **Impact:** Reports marked as **Status 17 ("Cannot Be Found")** or **Status 18 ("Merged Duplicate")** are considered closed in the UI drawer, but the backend still considers them open (`thread.is_closed == False`).
* **Remediation:** Align all terminal status checks to include `[3, 8, 9, 10, 11, 12, 14, 17, 18]`.

---

#### 🟡 Inconsistency 2.3: Admin Role (`role_id == 4`) Missing from `GET /chat/unread-count`
* **Location:** [`backend/app/routes/chat.py:1218-1237`](../../backend/app/routes/chat.py#L1218-L1237)
* **The Issue:** The endpoint explicitly checks `role_id == 1`, `role_id == 2`, and `role_id == 3`. There is no check for `role_id == 4` (Admin).
* **Impact:** When an Administrator calls `GET /chat/unread-count`, `thread_ids` is empty and the endpoint always returns `{"unread_count": 0}`, even though `GET /chat/threads` returns unread messages for Admins.
* **Remediation:** Add an `elif current_user.role_id == 4:` block in `get_unread_chat_count` querying all threads.

---

#### 🟡 Inconsistency 2.4: Adoption Chats Omitted from `GET /chat/unread-count`
* **The Issue:** `GET /chat/unread-count` only queries `Report` and `Direct` threads. Adoption chats live on a separate endpoint (`GET /chat/adoptions/unread-counts`).
* **Impact:** 
  * `BrgyNavbar.tsx` uses `useUnreadMessageCount(..., true)` which calls both endpoints and sums them.
  * `BrgySidebar.tsx` calls `GET /chat/unread-count` directly.
  * **Result:** The Navbar badge and the Sidebar badge display conflicting numbers for Barangay staff.
* **Remediation:** Incorporate adoption thread unread counts into `get_unread_chat_count` when requested, or update `BrgySidebar.tsx` to use the unified `useUnreadMessageCount` hook.

---

### 🛡️ 3. Security & Access Control Gaps

#### 🟠 Gap 3.1: Client-Forged `is_system` Messages in `ChatMessageCreate`
* **Location:** [`backend/app/schemas/chat.py:8`](../../backend/app/schemas/chat.py#L8) & [`backend/app/routes/chat.py:581, 810`](../../backend/app/routes/chat.py#L581)
* **The Issue:** `ChatMessageCreate` accepts `is_system: Optional[bool] = False` directly from the client. The backend stores this value without verifying if the sender is an admin or system process:
  ```python
  is_system = payload.is_system
  ...
  new_msg = ChatMessage(..., is_system=is_system or False)
  ```
* **Impact:** A malicious user can post messages with `is_system: true`. In the frontend UI, these render as official grey "System Bot" notices and are excluded from unread counters, enabling spoofing of official announcements.
* **Remediation:** Hardcode `is_system = False` on client POST endpoints, allowing only internal backend functions to set `is_system = True`.

---

#### 🟠 Gap 3.2: Missing Authorization on `PATCH /chat/*/read` Endpoints
* **Location:** [`backend/app/routes/chat.py:689-734`](../../backend/app/routes/chat.py#L689-L734)
* **The Issue:** `PATCH /chat/threads/{thread_id}/read`, `PATCH /chat/reports/{report_id}/read`, and `PATCH /chat/matches/{match_id}/read` do not verify whether `current_user` has permission to access the target thread or report.
* **Impact:** Any authenticated resident can call the PATCH endpoint for any other user's report/thread and mark their messages as read.
* **Remediation:** Add authorization checks (`check_user_report_chat_access` / `check_user_match_chat_access`) before executing the update query.

---

#### 🟠 Gap 3.3: Global `is_read` Flag on Multi-Participant Threads
* **Location:** [`backend/app/models/chat.py:34`](../../backend/app/models/chat.py#L34)
* **The Issue:** `chat_messages.is_read` is a single boolean column per message. A report thread involves the resident reporter, subdivision leader, and barangay responders.
* **Impact:** When the Subdivision Leader opens the thread, `is_read` is set to `True` for that message. When a Barangay Responder later logs in, their unread counter shows 0 because `is_read == False` is checked globally.
* **Remediation / Defense Strategy:** For Capstone defense, explain that 1-on-1 direct matching and adoption threads have true per-pair read state, while report case threads use simplified thread-level acknowledgement.

---

#### 🟠 Gap 3.4: Over-Permissive Backend Access Check in `chat.py:275-278` Leaking Case Chats to Other Citizens
* **Location:** [`backend/app/routes/chat.py:275-278`](../../backend/app/routes/chat.py#L275-L278)
* **The Issue:** In `check_user_report_chat_access`, the code grants read access to non-reporter citizens with:
  ```python
  if report.subdivision_id and current_user.subdivision_id and report.subdivision_id == current_user.subdivision_id:
      return True
  if getattr(report, 'visibility', 'Public') == 'Public':
      return True
  ```
* **Impact:** Even though the frontend hides the chat drawer from non-reporters (`isReporter && ...`), any authenticated citizen could call `GET /chat/reports/{id}/messages` and read private messages containing the reporter's exact house location, directions, and phone numbers.
* **Remediation:** Remove the public visibility and subdivision resident bypass so that for citizens (`role_id == 1`), access is strictly restricted to `report.user_id == current_user.user_id` or an owner with a matched pet.

---

### 🎨 4. UI / UX Flaws

#### 🔵 Flaw 4.1: Citizen View Restricts Chat to Reporter Only on `ResiViewReport.tsx`
* **Location:** [`frontend/src/pages/citizen/ResiViewReport.tsx:2291`](../../frontend/src/pages/citizen/ResiViewReport.tsx#L2291)
* **The Issue:** `<ReportChatDrawer>` is wrapped in `{isReporter && ...}`.
* **Impact:** If a registered pet owner opens `ResiViewReport.tsx` to view a report where their dog was matched, they cannot open the case drawer from that page (it is completely hidden). They can only open it from `PetMatchReview.tsx`.
* **Remediation:** Allow pet owners with confirmed matches on the report to open the drawer on `ResiViewReport.tsx`.

---

#### 🔵 Flaw 4.2: Confusing 403 Error Message for Non-Reporter Citizens
* **Location:** [`backend/app/routes/chat.py:560-563`](../../backend/app/routes/chat.py#L560-L563)
* **The Issue:** When a citizen tries to send a message on a report they did not author, the backend responds: `"Only Barangay responders assigned to this report can send messages. Higher role officers have view-all oversight."`
* **Impact:** The error message is confusing to residents because it references internal Barangay responder roles.
* **Remediation:** Return role-tailored error messages (e.g., `"Only the incident reporter or assigned responders can send messages on this case."`).

---

## Part 3: Actionable Implementation & Defense Checklist

Use this checklist to track bug fixes, policy verification, automated testing, and live capstone defense milestones:

---

### 🚀 Category A: Critical Bug Fixes (P1 Priority)
- [x] **A1 (Real-Time Polling):** ✅ Done: every chat type (report, match, adoption) checks every 5 s while the drawer is open, paused while the tab is hidden; the view and read marks only update when a new message arrives (no re-scroll every 5 s); reply / read-only state refreshed every 30 s. Pull polling `setInterval` outside `isAdoptionMode` in [`ReportChatDrawer.tsx`](../../frontend/src/components/Chat/ReportChatDrawer.tsx#L465-L473) so Report and Match chats poll every 3–5 seconds while drawer is open.
- [x] **A2 (Deduplicate Drawer):** ✅ Done: one drawer kept (the one with the rescue id, title and reporter fallback), now `threadMode="report"` and mounted only once the report has loaded; the duplicate removed. Delete duplicate `<ReportChatDrawer>` declaration at line 2408 in [`BrgyReportView.tsx`](../../frontend/src/pages/Barangay_Staff/BrgyReportView.tsx#L2408).
- [x] **A3 (Dropdown Deep-Linking):** ✅ Done (shared `utils/chatLinks.ts`). Note: the navbars already opened the clicked thread through their own `onSelectThread` handler; the bug was in the fallback path, which now links `?reportId` / `?matchId` / `?adoptionId` (residents: report, match-review or adoption page). Update [`MessagesDropdown.tsx`](../../frontend/src/components/Chat/MessagesDropdown.tsx#L91-L95) to append `?reportId=${thread.report_id}`, `?matchId=${thread.match_id}`, and `?adoptionId=${thread.adoption_id}` when routing.
- [x] **A4 (Drawer Deep-Linking):** ✅ Done: same helper; Barangay staff go to `/brgy/messages?...`, never to resident pages. Fix role routing in [`MessagesDrawer.tsx`](../../frontend/src/components/Chat/MessagesDrawer.tsx#L80-L86) so Barangay staff navigate to `/brgy/messages` instead of `/resident/reports/...`.
- [x] **A5 (Dynamic Recipient):** ✅ Done: both hard-coded `recipient_id = 2` (report and match chats) replaced by `default_staff_recipient()`: handling leader → active subdivision leader → active Barangay staff of the barangay → active Admin → the caller. Tested in `test_chat_governance.py`. Replace hardcoded `recipient_id = 2` in [`chat.py:202`](../../backend/app/routes/chat.py#L202) with dynamic resolution of `report.assigned_leader_id` or an active subdivision leader.

---

### 🛡️ Category B: Logic, Status & Security Hardening (P2 Priority)
- [x] **B1 (Status Attribute):** ✅ Done: new threads use the real status column (`report_status()` helper). Update thread initialization in [`chat.py:212`](../../backend/app/routes/chat.py#L212) to use `(report.current_status_id or report.status_id)`.
- [x] **B2 (Terminal Status Parity):** ✅ Done: one list on the server (`REPORT_CHAT_CLOSED_STATUS_IDS` = 3, 8, 9, 10, 11, 12, 14, 17, 18; match chats the same minus 9) and the same lists in the drawer; match chats judged on the case's main report everywhere. (Note: status 8 is *Impounded* in the database, not "Returned to Owner".) Unify terminal status IDs to `[3, 8, 9, 10, 11, 12, 14, 17, 18]` across [`chat.py`](../../backend/app/routes/chat.py) and [`ReportChatDrawer.tsx`](../../frontend/src/components/Chat/ReportChatDrawer.tsx).
- [x] **B3 (Admin Unread Count):** ✅ Done: Admins count unread messages in all report and match chats. Add `elif current_user.role_id == 4:` block to `get_unread_chat_count` in [`chat.py:1218`](../../backend/app/routes/chat.py#L1218).
- [x] **B4 (System Message Sanitization):** ✅ Done: both send endpoints save `is_system = False`; the request field is accepted but ignored. Force `is_system = False` on client messages in `send_report_message` and `send_match_message` in [`chat.py:581, 810`](../../backend/app/routes/chat.py#L581).
- [x] **B5 (Read Route Authorization):** ✅ Done: all three mark-as-read routes check access first (403 otherwise). Add permission verification checks (`check_user_report_chat_access` / `check_user_match_chat_access`) to `PATCH /chat/threads/{id}/read`, `PATCH /chat/reports/{id}/read`, and `PATCH /chat/matches/{id}/read`.
- [x] **B6 (Enforce Case Chat Confidentiality):** ✅ Done: residents see a case chat only as its reporter, or as the owner of the pet the report really is (linked, or staff-confirmed and not rejected); same-subdivision and public-report access removed. Tested in `test_chat_governance.py` (22/22). Remove public visibility and subdivision resident bypass in [`chat.py:275-278`](../../backend/app/routes/chat.py#L275-L278) so other residents cannot access report case conversations via API.

---

### 🎨 Category C: UI/UX & Consistency Enhancements (P3 Priority)
- [x] **C1 (Pet Owner Access on Report):** ⏭️ Not needed (design choice, not a bug): the case chat is private between the reporter and staff (Ruling 2); a pet owner talks to staff in their own look-alike match chat on the sighting page. Since B6 a confirmed owner may *read* the case chat through the API, but no button is added on the report page. In [`ResiViewReport.tsx:2291`](../../frontend/src/pages/citizen/ResiViewReport.tsx#L2291), allow pet owners with matched records to open the chat drawer.
- [x] **C2 (Role-Specific Error Messages):** ✅ Done: residents are told only the reporter sends in a case chat and to use the match chat for their pet; unassigned Barangay responders that only the assigned rescue team replies during an operation. Tailor 403 error messages in [`chat.py:560`](../../backend/app/routes/chat.py#L560) so citizens and officers receive clear, context-appropriate feedback.
- [x] **C3 (Badge Count Parity):** ✅ Done: the Barangay sidebar uses the same `useUnreadMessageCount(…, true)` as the navbar (report, match and adoption chats), so both badges show the same number. Update [`BrgySidebar.tsx`](../../frontend/src/components/BrgySidebar.tsx) to query the unified `useUnreadMessageCount` hook, aligning sidebar and navbar badges.

---

### 🧪 Category D: Quality Assurance & End-to-End Test Verification
- [ ] **T1 (Real-Time Synchronous Chat Test):** 🟡 Code done (A1: 5 s polling while the drawer is open). Needs a manual run in two browsers: steps below.
  - Open Citizen portal on Browser A and Subdivision Leader portal on Browser B.
  - Send message from Browser A.
  - **Verify:** Without refreshing or reopening drawer, Browser B displays the new message within 5 seconds.
- [x] **T2 (Subdivision Escalation Boundary Test):** ✅ Automated (`test_chat_governance.py`): before escalation the case chat is missing from the Barangay list and returns 403 (read and post); after escalation the head officer sees it with the full earlier conversation.
  - Create a new report in Selera Homes as Resident.
  - Log in as Barangay Staff (Role 3).
  - **Verify:** Report chat is completely invisible in Barangay messages list and returns HTTP 403 upon manual URL fetch.
  - Trigger "Escalate to Barangay" as Subdivision Leader.
  - **Verify:** Report chat appears in Barangay messages list immediately with full conversation history preserved.
- [x] **T3 (Closed Case Read-Only Lockdown Test):** ✅ Automated: once resolved (11) the thread turns read-only and posting returns 400 "This case has been solved and archived. Chat is in read-only mode." for the reporter and the leader; history stays readable. (The drawer's banner reads "Case Closed — Direct Messaging Disabled".)
  - Transition a report to Status 11 (*Incident Resolved / Reunited*).
  - Open `<ReportChatDrawer>` on Resident and Leader portals.
  - **Verify:** Text input area is replaced with yellow/amber banner: *"Case Closed — Read Only"*.
  - Attempt `POST /chat/reports/{id}/messages` via Postman/curl.
  - **Verify:** Backend returns `HTTP 400: "This case has been solved and archived. Chat is in read-only mode."`
- [x] **T4 (Anti-Spoofing Security Test):** ✅ Automated: a message sent with `is_system: true` is stored and returned as a normal message from the sender, and counts as unread like any message.
  - Send POST request to `/chat/reports/{id}/messages` with payload `{"message_text": "System alert", "is_system": true}`.
  - **Verify:** Message is saved with `is_system = False` and rendered with standard user avatar/styling, not system bot styling.
- [x] **T5 (Deep-Link Navigation Test):** ✅ Link logic checked (8/8): staff open `/subd|brgy/messages?reportId|matchId|adoptionId=…`, residents the report / match review / adoption chat; both message pages read those parameters. A quick click-through in the browser is still worthwhile.
  - Click a conversation item inside `<MessagesDropdown>`.
  - **Verify:** Page routes to `/subd/messages?reportId=...` and automatically expands the active thread.

---

### 🎓 Category E: Capstone Panel Defense Demonstration & Talking Points
- [ ] **E1 (Defense Demo: Multi-Jurisdictional Escalation Gate):**
  - *Talking Point:* *"StraySafe respects local community autonomy. Minor incidents are resolved within the HOA/subdivision. Only when community resources are exhausted or rabies risk is detected does escalation occur, opening communications to municipal responders."*
- [ ] **E2 (Defense Demo: Field Command Integrity):**
  - *Talking Point:* *"During an active capture operation, command clutter causes physical injuries. Only assigned field rescuers and the reporting eyewitness hold two-way transmission rights; senior captains monitor in read-only mode."*
- [ ] **E3 (Defense Demo: Data Privacy / RA 10173 Compliance):**
  - *Talking Point:* *"To protect citizen safety, exact lot/block numbers and personal emails are redacted in look-alike match chats, preventing predatory claims or harassment while facilitating reunion."*
- [ ] **E4 (Defense Demo: Archival Immutability & Audit Trail):**
  - *Talking Point:* *"Chat records cannot be modified or erased because they constitute official public records for legal accountability, rabies contact tracing, and bite liability."*
- [ ] **E5 (Defense Q&A: 'Why Polling instead of WebSockets?'):**
  - *Talking Point:* *"Operational incident messaging in municipal LGUs prioritizes high fault-tolerance, low server state footprint, and battery conservation over millisecond streaming. HTTP polling ensures effortless reconnection in intermittent mobile cellular data environments."*
