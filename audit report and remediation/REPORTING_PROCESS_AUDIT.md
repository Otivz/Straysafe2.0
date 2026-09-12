# StraySafe 2.0 — Reporting Process Audit

**Original Audit Date:** 2026-09-09  
**Last Reviewed:** 2026-09-11  
**Auditor:** Senior Software & Process Auditor  
**Scope:** Full reporting lifecycle — from report submission to resolution/completion  
**Files Audited:**
- [`backend/app/routes/reports.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py) (originally 3,051 lines — **now 3,589 lines / 170KB** as of 2026-09-11)
- [`backend/app/routes/rescue.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py) (815 lines)
- [`backend/app/routes/holding.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py) (565 lines)

> **This document is audit-only. No system modifications have been made.**
> All line-number references are anchored to the files as reviewed on the audit date.

---

## Remediation Status (as of 2026-09-11)

> [!CAUTION]
> **Zero findings from this audit have been resolved.** The authentication gap (RP-01 through RP-11) remains completely unaddressed — all 20+ reporting endpoints still accept `user_id` from the request body rather than verifying a JWT token. The `reports.py` file has grown by 538 lines since the audit was conducted, deepening the architectural debt.

| Summary | Count |
|:---|:---|
| Critical findings open | **12** |
| High findings open | **17** |
| Medium findings open | **8** |
| Low findings open | **3** |
| **Total open** | **40** |
| Resolved | **0** |

**Root cause still unresolved:** Not one of the 20+ reporting-related endpoints uses JWT token verification. All user identity is still derived from request body `user_id` fields. See the [Authentication Gap section](#authentication-gap-affects-every-stage) for full impact.


---

## Report Status Reference

| ID | Name | Description |
|:---|:---|:---|
| 1 | Reported | Initial submission by resident |
| 2 | Verified | Claimed by officer / on-site verified |
| 3 | Rejected | Rejected based on verification criteria |
| 4 | Escalated to Barangay | Forwarded to Barangay Operations |
| 5 | Rescue In Progress | Rescue team dispatched |
| 6 | Picked Up | Animal picked up |
| 7 | Under Observation | Animal under observation |
| 8 | Impounded | Animal securely impounded |
| 9 | Claimed by Owner | Animal claimed by owner |
| 10 | Released | Animal safely released |
| 11 | Resolved | Incident resolved |
| 12 | Deceased | Animal deceased |
| 13 | Approved | Approved by Barangay |
| 14 | False Alarm / Dismissed | Report dismissed |
| 15 | Disputed | Report contested by pet owner |
| 16 | Under Investigation | Dispute rejected; back to investigation |
| 17 | Animal Cannot Be Found | Animal not at reported location |

---

## Process Flow Diagram

```
[Resident Submits Report] --> Status 1: REPORTED
         |
         v
[Media Validation] --- YOLO + Gemini AI
         |
         v
[Subdivision Leader Claims Report] --> Status 2: VERIFIED (auto on claim)
         |
         |---> [On-Site Verify] --> verification_status = 'verified_true'
         |
         |---> [Mark False Alarm] --> Status 14: FALSE ALARM
         |
         |---> [Endorse/Escalate to Barangay] --> Status 4: ESCALATED
         |         |
         |         v
         |    [Barangay Approves] --> Status 13: APPROVED
         |         |
         |         v
         |    [Assign Rescue Team] --> Status 5: RESCUE IN PROGRESS
         |         |
         |         v
         |    [Pickup/Impound] --> Status 6/7/8 + HoldingAnimal record created
         |         |
         |         v
         |    [Release/Resolve] --> Status 9/10/11/12
         |
         |---> [Resident Disputes] --> Status 15: DISPUTED
         |         |
         |         v
         |    [Officer Reviews Dispute]
         |         |-- Accepted --> Status 14: FALSE ALARM
         |         `-- Rejected --> Status 16: UNDER INVESTIGATION
         |
         `---> [Transfer to Other Officer] --> assigned_leader_id updated
```

---

## STAGE 1 — Report Submission

**Endpoint:** `POST /reports/`  
**File:** [`reports.py` L861-L1051](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 1.C1 | Geofencing guard present — `is_inside_selera_homes()` called before report creation |
| 1.C2 | Deceased pet validation — reports for deceased pets as "Lost" are blocked with HTTP 400 |
| 1.C3 | Pet status auto-updated to "Lost" when `category_id == 6` (Lost Pet report) |
| 1.C4 | Initial coordinates preserved in `initial_latitude`, `initial_longitude`, `initial_landmark` before any updates can overwrite current location |
| 1.C5 | StatusHistory entry created immediately after report creation (status 1, "Initial report submitted by resident.") |
| 1.C6 | AI suggestions generated synchronously on submission using `generate_ai_suggestions()` |
| 1.C7 | Subdivision leaders notified via Notification record on new report |
| 1.C8 | Audit log created (`CREATE_REPORT`) with animal type, priority, subdivision |
| 1.C9 | Pet photo automatically added as ReportMedia when a `pet_id` is linked |
| 1.C10 | Looks-matching triggered after commit to cross-reference against registered pets |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 1.X1 | **CRITICAL** | **No authentication on `POST /reports/`** — the endpoint has no `Depends(get_current_user)`. Any unauthenticated HTTP request can create a report as any user. | L862 |
| 1.X2 | **CRITICAL** | **Geofence always returns `True`** — `is_inside_selera_homes()` contains a bounding box check but falls through to `return True` at the end (L416), making geofencing completely inoperative. Even an explicitly out-of-bounds location passes. | L406-L416 |
| 1.X3 | **HIGH** | **User ID fallback to first DB user** — if `user_id` not found in DB, `db.query(User).first()` is used (L896). A request with an invalid or missing user_id will be silently attributed to whoever happens to be the first user in the table. | L892-L897 |
| 1.X4 | **HIGH** | **No duplicate report prevention** — no check for existing reports at the same location, time window, or by the same user. Rapid re-submissions (accidental or deliberate) create duplicate records, inflating active case counts. | L861-L1051 |
| 1.X5 | **HIGH** | **AI backfill writes inside `GET /` (read endpoint)** — `GET /reports/` mutates the database (`db.commit()` at L347) for every report missing AI suggestions. Write operations inside read endpoints violate REST semantics and can cause partial-commit data corruption if the loop fails mid-way. | L311-L393 |
| 1.X6 | **MEDIUM** | **AI suggestions not generated from media data at submission time** — `generate_ai_suggestions()` at L934 is called without `media_animal_type` or `media_dominant_color` because media is uploaded separately. The initial AI profile is based only on description text. | L926-L951 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 1.R1 | Without geofencing, reports from outside the designated area will clutter the officer queue and map. Reports from entirely wrong jurisdictions could be accidentally escalated. |
| 1.R2 | Without authentication, automated scripts could flood the system with fake reports, causing alert fatigue, degraded AI performance, and wasted barangay/rescue resources. |
| 1.R3 | The `user_id` fallback means audit logs for those reports will show the wrong actor, corrupting accountability records. |
| 1.R4 | AI backfill inside GET means every heavy list-load request could trigger a cascade of DB writes and Gemini API calls, causing API rate-limit errors and slow list responses. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 1.F1 | Add `current_user: User = Depends(get_current_user)` to `POST /reports/` and derive `user_id` from the token, not the request body. |
| 1.F2 | Fix `is_inside_selera_homes()`: remove the final `return True` fallback at L416. Return `False` if the bounding box check fails. |
| 1.F3 | Remove the `db.query(User).first()` fallback. Raise HTTP 400 or 401 if user_id is invalid or missing. |
| 1.F4 | Add a duplicate check on `POST /reports/`: within a 10-minute window, if the same `user_id` + `subdivision_id` + `animal_type` combination exists at status 1, return the existing report or warn before creating a new one. |
| 1.F5 | Move AI backfill out of `GET /`: create a separate background task or admin endpoint (`POST /reports/backfill-ai`) that processes reports without AI suggestions. |

---

## STAGE 2 — Media Upload & AI Validation

**Endpoints:** `POST /reports/validate-images`, `POST /reports/analyze-media`, `POST /reports/{id}/media`  
**File:** [`reports.py` L470-L1432](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 2.C1 | Dual-layer validation: YOLO object detection + Gemini Vision AI to confirm animal presence |
| 2.C2 | Multi-image similarity check via Gemini — prevents multi-animal reports in a single submission |
| 2.C3 | AI extracts animal type, primary/secondary/tertiary colors, breed, size, collar/QR detection |
| 2.C4 | Evidence media (`is_evidence=True`) correctly excluded from AI analysis to avoid contaminating report AI profile |
| 2.C5 | File size limit enforced (10MB max) in `POST /{id}/media` (L1248-1256) |
| 2.C6 | Dog color normalization: "Orange"/"Ginger" mapped to "Brown" for consistency (L1340-1351) |
| 2.C7 | Crop-to-animal-bounding-box before Gemini analysis to reduce background color contamination |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 2.X1 | **CRITICAL** | **No authentication on `/validate-images` or `/analyze-media`** — any caller can trigger YOLO + Gemini AI inference without any credentials, enabling abuse and exhausting paid API quotas. | L470, L671 |
| 2.X2 | **HIGH** | **Extension-only file type validation** — file type is determined solely by extension (`.jpg`, `.png`, etc.) with no magic-number or MIME-type validation. A maliciously renamed file passes validation. | L694-L697, L1263-1269 |
| 2.X3 | **HIGH** | **YOLO model loaded on every request** — `YOLO('yolov8n.pt')` is instantiated inside the request handler (L724, L1291) with no singleton or cache pattern. Under concurrent requests, multiple YOLO instances load into memory simultaneously, risking OOM crashes. | L724, L1291 |
| 2.X4 | **MEDIUM** | **`bboxes` variable is built but never populated** — in `upload_report_media`, `bboxes = []` is declared (L1297) and the loop on L1299-1302 parses `c` and `box` but never appends to `bboxes`. The subsequent `target_bbox = next((b for b, t in bboxes...), None)` at L1316 always returns `None`, meaning animal-specific color extraction is never used; the fallback `extract_dominant_colors(file_content)` runs on the full image instead. | L1295-1337 |
| 2.X5 | **MEDIUM** | **Temp file not cleaned up on YOLO constructor failure** — if `tempfile.NamedTemporaryFile` itself throws, `tmp_path` is undefined and the `finally` block errors, leaving no cleanup path. | L492-506 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 2.R1 | The broken `bboxes` list (2.X4) means dominant color is always extracted from the full image (including background — grass, road, pavement), degrading the accuracy of color-based animal matching. |
| 2.R2 | Unprotected AI endpoints (2.X1) mean external actors could use StraySafe as a free YOLO/Gemini proxy service, running up API costs. |
| 2.R3 | YOLO model loading per request (2.X3) under load testing conditions could cause server OOM and process restart. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 2.F1 | Add `current_user = Depends(get_current_user)` to both `/validate-images` and `/analyze-media`. |
| 2.F2 | Add MIME-type detection using `python-magic` library before extension check: validate that the actual byte signature matches the declared extension. |
| 2.F3 | Initialize YOLO as a module-level singleton: `_yolo_model = None` with lazy initialization on first request and a lock for thread safety. |
| 2.F4 | Fix `bboxes` population: change `bbox = box.tolist()` to `bboxes.append((box.tolist(), label.capitalize()))` inside the detection loop at L1302. |

---

## STAGE 3 — Report Assignment & Claim

**Endpoints:** `POST /reports/{id}/claim`, `POST /reports/{id}/take-over`, `POST /reports/{id}/unclaim`  
**File:** [`reports.py` L1836-L2180](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 3.C1 | Row-level locking with `with_for_update()` prevents two officers claiming the same report simultaneously |
| 3.C2 | Subdivision boundary enforcement — role_id 2 officers can only claim within their subdivision |
| 3.C3 | Re-claim by same officer is idempotent (returns current state silently) |
| 3.C4 | Status auto-transitions from 1 (Reported) to 2 (Verified) on first claim |
| 3.C5 | StatusHistory entry created on claim, takeover, and unclaim |
| 3.C6 | Audit log created for CLAIM, TAKEOVER, UNCLAIM |
| 3.C7 | Inactivity window enforced on takeover (2h urgent / 24h standard) |
| 3.C8 | Previous handler notified on takeover; colleagues notified on claim and takeover |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 3.X1 | **CRITICAL** | **No JWT authentication on any claim endpoint** — `user_id` is taken from the request body (`claim_in.user_id`), not from a verified JWT token. Anyone can impersonate any officer by providing that officer's `user_id`. | L1840, L1963 |
| 3.X2 | **HIGH** | **Unclaim does not revert status** — `unclaim_report` clears `assigned_leader_id` and `claimed_at` but does NOT revert `current_status_id` from 2 (Verified) back to 1 (Reported). Unclaimed reports appear "Verified" with no handler. | L2139-2140 |
| 3.X3 | **MEDIUM** | **Timezone mismatch in inactivity calculation** — `datetime.now()` (local time, no timezone) is compared against `claimed_at` or `hist.created_at`. If the DB stores timestamps in UTC and the server runs in UTC+8, the 2h/24h threshold is calculated with an 8-hour offset error. | L2004-2018 |
| 3.X4 | **MEDIUM** | **Priority detection uses fragile string matching** — `any(kw in priority for kw in ["emergency", "high", "urgent", "bite", "severe"])` at L2009. Any typo in the `priority_level` field misclassifies urgency and applies the wrong inactivity threshold. | L2008-2010 |
| 3.X5 | **LOW** | **No reporter notification on claim** — the reporter (citizen who submitted) is never notified that their report has been picked up by an officer. | L1920-1938 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 3.R1 | Without authentication, a malicious user knowing an officer's `user_id` (visible in localStorage) can claim any unclaimed report on behalf of that officer, or unclaim active cases. |
| 3.R2 | Unclaimed reports showing status "Verified" (2) with no handler will confuse residents and officers. The resident sees "Verified" but no action follows. |
| 3.R3 | Timezone bugs (3.X3) could allow premature takeovers of urgent cases or block takeovers of truly inactive cases. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 3.F1 | Replace `claim_in.user_id` with `current_user = Depends(get_current_user)` on all claim/takeover/unclaim endpoints. |
| 3.F2 | In `unclaim_report`: revert `current_status_id` to 1 if status is still at 2 and was only set during the initial claim. |
| 3.F3 | Replace `datetime.now()` with `datetime.now(timezone.utc)` and ensure all DB timestamps use timezone-aware storage. |
| 3.F4 | Use an enum for `priority_level` values (`Literal["Low", "Medium", "High", "Urgent", "Emergency"]`) in the Pydantic schema to prevent typo-based misclassification. |
| 3.F5 | Add a `Notification` to the reporter (`report.user_id`) when their report is claimed. |

---

## STAGE 4 — On-Site Verification

**Endpoints:** `POST /reports/{id}/verify-incident`, `POST /reports/{id}/mark-false-alarm`  
**File:** [`reports.py` L2572-L2771](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 4.C1 | Full behavioral assessment recorded: `verified_actual_bite`, `verified_chasing`, `verified_attempted_bite`, `verified_injury`, `verified_aggressive` |
| 4.C2 | `behavior_finding` auto-set to "Substantiated" or "Unsubstantiated / Friendly" based on findings |
| 4.C3 | Pet behavioral profile synced when `pet_id` is linked — bite count, chase count, temperament updated |
| 4.C4 | Animal condition auto-updated to "Injured" when `verified_injury == True` |
| 4.C5 | Reporter notified on verification with behavior finding |
| 4.C6 | Audit log created (VERIFY_REPORT / DISMISS_FALSE_ALARM) with full before/after values |
| 4.C7 | `verification_status` field properly set to `'verified_true'` or `'false_alarm'` |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 4.X1 | **CRITICAL** | **No authentication and no role check on `verify-incident`** — any user (including residents) can mark any report as officially verified. There is only an existence check for `user_id`, not a role restriction. | L2585-2588 |
| 4.X2 | **CRITICAL** | **No authentication and no role check on `mark-false-alarm`** — same issue; any user can dismiss any report as a false alarm. | L2714-2716 |
| 4.X3 | **HIGH** | **`verify-incident` forces status to 2** — the endpoint hardcodes `report.current_status_id = 2` (L2592). If the report is at status 4 (Escalated), 5 (Rescue In Progress), or 8 (Impounded), calling `verify-incident` reverts it to "Verified", breaking the workflow. | L2592 |
| 4.X4 | **HIGH** | **Previous false alarm data overwritten silently** — calling `mark-false-alarm` on an already-dismissed report silently overwrites `false_alarm_reason`, `verification_notes`, `verified_at`, and `verified_by_user_id` with no warning. The original dismissal record is lost. | L2721-2726 |
| 4.X5 | **MEDIUM** | **`verify-incident` can be called on any status** — there is no guard against verifying a report that is already at a terminal status (Resolved, Deceased, Released). A "Resolved" report can be re-verified. | L2572-2698 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 4.R1 | A resident who knows their own `user_id` can call `verify-incident` to mark their own report as officially verified, bypassing officer review and fabricating an official investigation record. |
| 4.R2 | Status regression (4.X3) can cause confusion: a report escalated to Barangay that gets accidentally re-verified will disappear from the Barangay queue since status 2 is not in the Barangay "escalated" filter. |
| 4.R3 | Re-verification clearing behavioral flags could set a previously aggressive animal's temperament back to "Friendly", causing incorrect handling recommendations. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 4.F1 | Add `current_user = Depends(get_current_user)` and check `current_user.role_id in [2, 3, 4]` on both verification endpoints. |
| 4.F2 | Replace hardcoded `report.current_status_id = 2` in `verify-incident` with a conditional: only transition to 2 if currently at status 1. If already at a higher status, keep the existing status. |
| 4.F3 | Add a guard in `mark-false-alarm`: if `report.verification_status == 'false_alarm'`, return HTTP 409 (Conflict) with the existing dismissal details, requiring explicit override. |
| 4.F4 | Add allowed-status guards: `verify-incident` should only work on statuses [1, 2]; `mark-false-alarm` should only work on statuses [1, 2, 3, 4]. |

---

## STAGE 5 — Endorsement & Escalation to Barangay

**Endpoint:** `POST /rescue-requests/`  
**File:** [`rescue.py` L134-L226](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 5.C1 | EndorsementLetter created alongside Rescue record when `leader_id` is provided |
| 5.C2 | Duplicate Rescue records for the same report are prevented (upsert pattern) |
| 5.C3 | Barangay staff and admins (role_id 3 and 4) notified on escalation |
| 5.C4 | Evidence file attached to endorsement letter (latest `is_evidence=True` media) |
| 5.C5 | Audit log created (Create Rescue Request) |
| 5.C6 | Relations fully loaded after creation for accurate response |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 5.X1 | **CRITICAL** | **No authentication on `POST /rescue-requests/`** — the endpoint has no auth dependency. Any unauthenticated request can create or update a rescue request for any report. | L134 |
| 5.X2 | **HIGH** | **Rescue upsert silently changes `leader_id`** — if a rescue already exists and a new request comes in with a different `leader_id`, the existing rescue's `leader_id` is overwritten with no StatusHistory entry or audit log for this change. | L141-144 |
| 5.X3 | **HIGH** | **No parent-report status validation** — creating a rescue request on a report at status 11 (Resolved), 12 (Deceased), or 14 (False Alarm) is silently permitted. | L134-226 |
| 5.X4 | **MEDIUM** | **Only the latest evidence file attached to endorsement letter** — multiple evidence files may be uploaded, but only the most recent `is_evidence=True` media is linked. Previous evidence files are not referenced. | L159-163 |
| 5.X5 | **MEDIUM** | **Escalation notifies all barangay officials regardless of jurisdiction** — `db.query(User).filter(User.role_id.in_([3, 4]))` returns barangay officials from all subdivisions/barangays. A report from Subdivision A notifies Barangay B officials. | L186 |
| 5.X6 | **LOW** | **`log_activity` uses `rescue_id` before flush** — if `db_rescue` is a new object not yet committed, `rescue_id` may be None, logging None as the target_id in the audit record. | L200-208 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 5.R1 | Without auth (5.X1), anyone can create endorsement letters and escalation requests for arbitrary reports, flooding the Barangay queue with fake escalations. |
| 5.R2 | Silent `leader_id` override (5.X2) means if an officer submits a second endorsement, the first leader is removed from the record without any notification or audit trail. |
| 5.R3 | Broadcasting to all barangay officials (5.X5) will cause alert fatigue and may expose report details to officials outside the jurisdiction. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 5.F1 | Add `current_user = Depends(get_current_user)` and require `role_id in [2, 4]` (Subdivision Leader / Admin). |
| 5.F2 | Log the `leader_id` change in StatusHistory and audit log when upserting an existing rescue with a different leader. |
| 5.F3 | Add a report status guard: reject escalation if `report.current_status_id` is in `[3, 9, 10, 11, 12, 14]` (terminal or rejected statuses). |
| 5.F4 | Filter barangay notification recipients by matching `barangay_id` to the report's subdivision's barangay. |
| 5.F5 | Call `db.flush()` before `log_activity()` to ensure `rescue_id` is populated. |

---

## STAGE 6 — Rescue Team Assignment & Dispatch

**Endpoint:** `PATCH /rescue-requests/{id}`  
**File:** [`rescue.py` L267-L550](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 6.C1 | Permission check for Barangay Staff — only assigned personnel or Head Officer can update rescue status (L298-318) |
| 6.C2 | Previous "Assigned" RescueAssignments marked "Cancelled" before new assignments created |
| 6.C3 | Multiple responders supported via `assigned_personnel_ids` |
| 6.C4 | Duplicate responders deduplicated with `dict.fromkeys()` before creating assignments |
| 6.C5 | Facility relocation logged as HoldingTimeline "transfer" event |
| 6.C6 | StatusHistory entry created on rescue status update |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 6.X1 | **CRITICAL** | **No authentication on `PATCH /rescue-requests/{id}`** — the endpoint has no auth dependency. | L267-319 |
| 6.X2 | **HIGH** | **Permission check bypassed with empty body** — if `user_id`, `barangay_staff_id`, and `staff_id` are all omitted from the request, `updater_user_id` is `None`, and the `if updater_user_id:` check at L300 is skipped entirely, allowing unrestricted rescue updates. | L296-319 |
| 6.X3 | **HIGH** | **No notification to cancelled responders** — when new personnel are assigned, old assignments are set to "Cancelled" via bulk SQL update, but no notification is sent to the responders who were removed. | L333-337 |
| 6.X4 | **MEDIUM** | **Rescue `status_id` values not documented** — the numeric `status_id` values on the `Rescue` model have no accompanying enum or lookup table. Status meanings are inferred only from UI strings. | Global |
| 6.X5 | **LOW** | **Audit log missing for assignment changes** — when responders are assigned or reassigned, no `log_activity()` call records who was assigned or removed. | L327-380 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 6.R1 | The permission bypass (6.X2) means an attacker who can observe network traffic can replay a rescue update request with an empty body, bypassing all role checks. |
| 6.R2 | Responders who are silently un-assigned (6.X3) may continue to travel to the scene unaware their assignment was cancelled, wasting resources and causing coordination conflicts. |
| 6.R3 | Undocumented rescue `status_id` values (6.X4) make it impossible to validate state transitions or detect invalid status combinations. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 6.F1 | Add `current_user = Depends(get_current_user)` and derive `updater_user_id = current_user.user_id` from the token, not from the request body. |
| 6.F2 | Remove the `if updater_user_id:` guard — if auth is token-based, the user will always be present. |
| 6.F3 | Send notifications to previously assigned responders when their assignment status changes to "Cancelled". |
| 6.F4 | Create a `RescueStatus` enum or lookup table: `{1: "Pending", 2: "Assigned", 3: "In Progress", 4: "Completed", 5: "Cancelled"}`. |
| 6.F5 | Add `log_activity()` calls specifically for assignment changes (CREATE_ASSIGNMENT, CANCEL_ASSIGNMENT). |

---

## STAGE 7 — Pickup / Impound & Holding Facility

**Endpoints:** `PATCH /reports/{id}/status` (statuses 6/7/8) + Holding routes  
**Files:** [`reports.py` L1614-1651](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py), [`holding.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 7.C1 | Auto-intake to HoldingAnimal triggered on status transitions to 6 (Picked Up), 7 (Observation), or 8 (Impounded) |
| 7.C2 | HoldingTimeline intake event created on first admission |
| 7.C3 | Relocation to new facility logged as "transfer" event in HoldingTimeline |
| 7.C4 | Duplicate intake guarded — `already_in` check prevents creating a second HoldingAnimal for the same report |
| 7.C5 | Holding facility details (contact, capacity, type) populated in response |
| 7.C6 | Subdivision and Barangay stay durations calculated in `holding.py` `_populate()` |
| 7.C7 | 7-day impound window and 2-day expiry warning configured as constants |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 7.X1 | **HIGH** | **`report.rescues` accessed without eager loading** — at L1624, `report.rescues[0].rescue_id` is accessed on a `report` object loaded without `rescues` eager load. This triggers a lazy load (N+1) or raises `DetachedInstanceError` if the session is closed. | L1624 |
| 7.X2 | **HIGH** | **HoldingAnimal default `facility_status = 1` ("Need Treatment")** — every animal is admitted as "Need Treatment" regardless of its actual reported condition. A healthy rescued animal is incorrectly flagged as needing treatment. | L1629 |
| 7.X3 | **HIGH** | **No status rollback handling for HoldingAnimal** — if a report status is updated from 8 (Impounded) back to 2 (Verified), the HoldingAnimal record is not cleaned up or updated. The animal remains "in holding" in the dashboard despite the report status reverting. | L1614-1651 |
| 7.X4 | **MEDIUM** | **`custody_status` default is "Sighting" for all reports** — in `populate_location_and_facility_info()`, `rep_data.custody_status = rep.custody_status or "Sighting"` (L237). For reports that have been through pickup/impound, if `custody_status` was not explicitly set, they display as "Sighting" rather than "In Custody". | L237 |
| 7.X5 | **LOW** | **Impound duration calculated from `intake_date` which defaults to `created_at`** — if `intake_date` is not explicitly set at intake, the holding duration is calculated from the HoldingAnimal creation time (the status-update time), not the actual physical intake time. | L96 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 7.R1 | Lazy loading (7.X1) will cause application errors in production under certain session configurations (SQLAlchemy lazy-load disabled) or if `report` was loaded in a different session context. |
| 7.R2 | Default "Need Treatment" status (7.X2) will cause holding facility dashboards to show all animals as requiring treatment, failing to prioritize genuinely injured ones. |
| 7.R3 | Ghost HoldingAnimal records (7.X3) cause the holding facility capacity count to be inflated by animals no longer in actual custody, potentially leading to capacity management errors. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 7.F1 | Add `selectinload(Report.rescues)` to the eager load options in `update_report_status` or fetch the rescue separately: `rescue = db.query(Rescue).filter(Rescue.report_id == report_id).first()`. |
| 7.F2 | Determine `facility_status` from the current report `condition`: `"Injured"` maps to 1 (Need Treatment), otherwise defaults to 2 (Observation/Healthy). |
| 7.F3 | Add a cleanup handler for status rollbacks: when status moves from [6,7,8] to [1,2,3], mark the HoldingAnimal as discharged (update `facility_status` and `discharge_date`). |
| 7.F4 | Change `custody_status` default from "Sighting" to "In Facility" when `facility_id` is set, or "In Custody" when status is [6,7,8]. |
| 7.F5 | Rename `RESOLVED_STATUSES` in holding.py to `RESOLVED_FACILITY_STATUSES` to prevent confusion with report status IDs. |

---

## STAGE 8 — Status Updates (General)

**Endpoints:** `PATCH /reports/{id}/status`, `PATCH /reports/{id}`  
**File:** [`reports.py` L1435-L1694](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 8.C1 | Permission check for Barangay Staff — only assigned or head officer can update status |
| 8.C2 | Duplicate history detection — no new `StatusHistory` created if status and remarks are identical to last entry |
| 8.C3 | Friendly default remarks provided for each status ID |
| 8.C4 | Reporter notified on every status change |
| 8.C5 | Barangay staff notified when status escalates to 4 |
| 8.C6 | Relocation note appended to remarks when facility changes |
| 8.C7 | Audit log created (UPDATE_STATUS) with before/after status IDs |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 8.X1 | **CRITICAL** | **No authentication on `PATCH /reports/{id}/status`** — `user_id` comes from request body; JWT is not verified. Any caller can update any report's status as any user. | L1436 |
| 8.X2 | **CRITICAL** | **`PATCH /reports/{id}` has zero protection** — the general update endpoint (L1201) has no auth, no permission check, no history logging, and no notification. Any field on any report can be overwritten by anyone. It is effectively a hidden admin backdoor. | L1201-1228 |
| 8.X3 | **HIGH** | **No status transition state machine** — any status can transition to any other status. A "Resolved" (11) report can revert to "Reported" (1). A "False Alarm" (14) can be escalated to "Rescue In Progress" (5) without any re-verification. | L1504 |
| 8.X4 | **MEDIUM** | **`status_names` dict in `update_report_status` is incomplete** — statuses 14 (False Alarm), 15 (Disputed), 16 (Under Investigation), 17 (Animal Cannot Be Found) are missing from the dict at L1677-1681. Audit log descriptions for these statuses show the raw numeric ID instead of a name. | L1677-1681 |
| 8.X5 | **MEDIUM** | **Notification message includes full officer remarks** — `notif_msg += f" Remarks: {final_remarks}"` at L1587. If `final_remarks` contains private officer notes, these are forwarded directly to the resident's notification. | L1586-1587 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 8.R1 | The unprotected `PATCH /reports/{id}` (8.X2) is the most dangerous endpoint in the system. A malicious caller with a known `report_id` can silently change any field (`current_status_id`, `user_id`, `animal_type`, `latitude`, `verification_status`) without creating any audit trace. |
| 8.R2 | Without a status machine (8.X3), historical timelines become meaningless. Resolving and re-opening reports arbitrarily pollutes StatusHistory with contradictory entries. |
| 8.R3 | Private officer remarks forwarded in notifications (8.X5) may include sensitive notes about the reporter or investigation, violating privacy expectations. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 8.F1 | Add `current_user = Depends(get_current_user)` to `PATCH /reports/{id}/status`. Derive `user_id` from the token. |
| 8.F2 | Add `current_user = Depends(get_current_user)` to `PATCH /reports/{id}` and restrict which fields can be updated based on role. Consider replacing with specific sub-routes. |
| 8.F3 | Implement a status transition matrix. Define allowed transitions as a dict: `ALLOWED_TRANSITIONS = {1: [2, 3, 14], 2: [3, 4, 14, 15], 4: [13], 13: [5], 5: [6, 7, 17], ...}`. Reject transitions not in the allowed list. |
| 8.F4 | Complete the `status_names` dict in `update_report_status` to include statuses 14-17. |
| 8.F5 | Separate public notification message from internal remarks. Use a `public_message` field that omits officer-internal notes. |

---

## STAGE 9 — Transfer Workflow

**Endpoints:** `POST /reports/{id}/transfer/request`, `/accept`, `/reject`, `/cancel`  
**File:** [`reports.py` L2187-L2565](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 9.C1 | Sender must be current handler (or admin) to initiate transfer |
| 9.C2 | Target must be in same subdivision (or admin) |
| 9.C3 | Cannot transfer to self |
| 9.C4 | Transfer state tracked atomically with `with_for_update()` |
| 9.C5 | Accept/Reject/Cancel all correctly clear pending transfer fields |
| 9.C6 | Notifications sent to target on request; sender on accept/reject |
| 9.C7 | Audit logs created for all transfer operations |
| 9.C8 | StatusHistory entry created for all transfer events with descriptive remarks |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 9.X1 | **CRITICAL** | **No authentication on any transfer endpoint** — `user_id` and `target_user_id` come from request body, not JWT. | L2190, L2296, L2397, L2494 |
| 9.X2 | **HIGH** | **No expiry on pending transfers** — a transfer request left pending forever keeps `pending_transfer_to_id` set, preventing the original handler from initiating a new transfer to a different officer. The report can be permanently stuck. | Global |
| 9.X3 | **MEDIUM** | **Concurrent transfer requests overwrite silently** — if two different transfer requests are submitted almost simultaneously, the second overwrites the first `pending_transfer_to_id` without error or notification to the first target. | L2233-2236 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 9.R1 | Without auth (9.X1), anyone can initiate a fake transfer, cancel an in-progress transfer, or force an officer to "accept" a transfer they never agreed to by spoofing their `user_id`. |
| 9.R2 | Expired pending transfers will leave reports in a broken state where neither officer can make progress. If the target officer leaves the subdivision, the report becomes permanently stuck. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 9.F1 | Add authentication to all transfer endpoints (JWT-based current_user). |
| 9.F2 | Add `pending_transfer_expires_at` field to Report. Set expiry to 24h when transfer is requested. Add a scheduled check to auto-cancel expired transfers. |
| 9.F3 | If `pending_transfer_to_id` is already set when a new transfer is requested, return HTTP 409 (Conflict) with details about the existing pending transfer. |

---

## STAGE 10 — Dispute Workflow

**Endpoints:** `POST /reports/{id}/disputes`, `PATCH /reports/{id}/disputes/{d_id}/review`  
**File:** [`reports.py` L2778-L3049](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)

### Correct Implementations

| # | Finding |
|:---|:---|
| 10.C1 | Vaccination card and supporting photo uploaded to Cloudinary |
| 10.C2 | Duplicate pending dispute upserted (not duplicated) for same user/report |
| 10.C3 | Report status set to 15 (Disputed) on dispute lodging |
| 10.C4 | Subdivision officers notified of dispute |
| 10.C5 | Dispute review with Accept maps to False Alarm (14) or Reject maps to Under Investigation (16) |
| 10.C6 | Reporter/resident notified on dispute review outcome |
| 10.C7 | Audit log created for LODGE_DISPUTE and REVIEW_DISPUTE |

### Incorrect / Missing Implementations

| # | Severity | Finding | Location |
|:---|:---|:---|:---|
| 10.X1 | **CRITICAL** | **No authentication on `POST /reports/{id}/disputes`** — any unauthenticated request can lodge a dispute on any report. | L2778 |
| 10.X2 | **HIGH** | **No role check on who can dispute** — a Subdivision Leader or Barangay Staff can dispute their own assigned report, creating a conflict of interest. Disputes should be restricted to residents (`role_id == 1`). | L2794-2796 |
| 10.X3 | **HIGH** | **No pet ownership verification on dispute** — when a dispute is lodged with a `pet_id`, there is no check that `dispute.pet.owner_id == resident_user_id`. A resident could dispute a report claiming ownership of a pet they do not own. | L2830-2839 |
| 10.X4 | **HIGH** | **Reviewed disputes can be re-submitted repeatedly** — there is no check whether a previous dispute was already reviewed and accepted/rejected. A second dispute for the same user/report overwrites the first in the upsert logic. A resident can repeatedly re-dispute after rejection. | L2813-2828 |
| 10.X5 | **MEDIUM** | **No authentication on dispute review endpoint** — anyone can review and resolve any dispute. | L2937 |

### Potential Issues / Risks

| # | Risk |
|:---|:---|
| 10.R1 | Officers or staff filing disputes on reports they themselves handle (10.X2) could effectively dismiss their own escalated reports, circumventing the process chain. |
| 10.R2 | Pet ownership spoofing (10.X3) could allow a user to dispute a report for a neighbor's aggressive dog by falsely claiming it is their own vaccinated pet, getting the report dismissed and the animal released. |
| 10.R3 | Repeated re-disputing (10.X4) could be used as harassment, flooding the dispute queue with the same case after each rejection. |

### Recommended Remediations

| # | Recommendation |
|:---|:---|
| 10.F1 | Add authentication to both dispute endpoints. |
| 10.F2 | Add role guard on `POST /{id}/disputes`: require `current_user.role_id == 1` (Resident only). |
| 10.F3 | Add pet ownership check: if `pet_id` provided, verify `pet.owner_id == resident_user_id` before accepting the dispute. Return HTTP 403 if not. |
| 10.F4 | Prevent re-disputes: if any previous dispute for this `user_id`/`report_id` has status "Accepted" or "Rejected", return HTTP 409 and do not allow a new one without admin override. |
| 10.F5 | Add review role check: require `current_user.role_id in [2, 3, 4]` on the review endpoint. |

---

## Cross-Cutting Issues

### Authentication Gap (Affects Every Stage)

**The single most critical finding in this audit:** Not one of the 20+ reporting-related endpoints uses JWT token verification. All user identity is derived from request body `user_id` fields. This means:

1. Any unauthenticated caller can perform any reporting action
2. Any authenticated user can impersonate any other user (including officers and admins)
3. The audit log (`log_activity`) records whatever `user_id` was sent in the body — audit trails are completely untrustworthy

**Impact:** Every finding marked "CRITICAL" above flows from this root cause. Fixing authentication would resolve or significantly reduce the risk of 12 findings in this audit.

**Remediation:** Add `Depends(get_current_user)` to every endpoint in `reports.py` and `rescue.py`. The `get_current_user` dependency already exists in `app/utils/auth.py`.

---

### No Status State Machine (Affects Stages 3, 4, 7, 8)

Status transitions are entirely unconstrained. The following logically impossible sequences are currently permitted:

| Sequence | Why It's Invalid |
|:---|:---|
| Resolved (11) to Reported (1) | A resolved case reopened without any documentation |
| False Alarm (14) to Rescue In Progress (5) | Dismissed report dispatching rescue team |
| Impounded (8) to Verified (2) | Animal in custody but report "unverified" |
| Deceased (12) to Released (10) | Dead animal "released" |

**Remediation:** Implement `ALLOWED_TRANSITIONS` dict and validate `status_update.status_id` against it in `update_report_status`.

---

### Missing Notifications (Affects Stages 3, 6, 8)

| Missing Notification | Impact |
|:---|:---|
| Reporter not notified when officer claims report | Resident has no idea their report is being handled |
| Cancelled responders not notified when assignment replaced | Field responders travel to scene unaware of cancellation |
| No notification to assigned officer when report is re-disputed | Officer loses dispute status context |
| Barangay jurisdiction not filtered on escalation notifications | Off-jurisdiction officials receive case notifications |

---

## Consolidated Findings Table

| ID | Stage | Severity | Issue Summary | Recommended Action |
|:---|:---|:---|:---|:---|
| RP-01 | 1 Submission | CRITICAL | No authentication on `POST /reports/` | Add `Depends(get_current_user)` |
| RP-02 | 1 Submission | CRITICAL | Geofence `is_inside_selera_homes()` always returns `True` | Remove final `return True` fallback |
| RP-03 | 2 Media | CRITICAL | No auth on `/validate-images`, `/analyze-media` | Add `Depends(get_current_user)` |
| RP-04 | 3 Claim | CRITICAL | `user_id` from request body, not JWT, on all claim endpoints | Replace with token-based auth |
| RP-05 | 4 Verify | CRITICAL | No auth + no role check on `verify-incident` / `mark-false-alarm` | Add auth + role guard |
| RP-06 | 5 Endorse | CRITICAL | No auth on `POST /rescue-requests/` | Add `Depends(get_current_user)` |
| RP-07 | 6 Dispatch | CRITICAL | Permission check bypassed with empty request body | Require auth; remove body-based user check |
| RP-08 | 8 Status | CRITICAL | No auth on `PATCH /reports/{id}/status` | Add `Depends(get_current_user)` |
| RP-09 | 8 Status | CRITICAL | `PATCH /reports/{id}` has zero protection, any field writable | Add auth + allowlist updatable fields |
| RP-10 | 9 Transfer | CRITICAL | No auth on any transfer endpoint | Add `Depends(get_current_user)` |
| RP-11 | 10 Dispute | CRITICAL | No auth on dispute lodge or review | Add `Depends(get_current_user)` |
| RP-12 | Global | CRITICAL | No status transition state machine | Implement `ALLOWED_TRANSITIONS` dict |
| RP-13 | 1 Submission | HIGH | User ID fallback to first DB user on invalid input | Raise 400 on invalid `user_id` |
| RP-14 | 1 Submission | HIGH | No duplicate report prevention | Add time+location window dedup check |
| RP-15 | 1 Submission | HIGH | AI backfill writes data inside GET endpoint | Move to dedicated background endpoint |
| RP-16 | 2 Media | HIGH | `bboxes` list never populated — color extracted from full image | Fix append inside detection loop |
| RP-17 | 2 Media | HIGH | YOLO model loaded per request — no singleton | Implement module-level singleton |
| RP-18 | 3 Claim | HIGH | Unclaim does not revert status from 2 to 1 | Add status revert in unclaim logic |
| RP-19 | 4 Verify | HIGH | `verify-incident` forces status to 2 regardless of current status | Conditional status transition only |
| RP-20 | 4 Verify | HIGH | Previous false alarm data silently overwritten | Return HTTP 409 on duplicate dismissal |
| RP-21 | 5 Endorse | HIGH | Rescue upsert silently changes `leader_id` without audit | Log leader_id changes |
| RP-22 | 5 Endorse | HIGH | Endorsement created on terminal/resolved reports | Add parent report status guard |
| RP-23 | 6 Dispatch | HIGH | No notification to cancelled responders | Send cancellation notification |
| RP-24 | 7 Holding | HIGH | `report.rescues` accessed without eager loading (N+1 / DetachedInstanceError risk) | Add `selectinload(Report.rescues)` |
| RP-25 | 7 Holding | HIGH | HoldingAnimal default status "Need Treatment" for all animals | Derive from report condition field |
| RP-26 | 7 Holding | HIGH | HoldingAnimal not cleaned up on status rollback | Add rollback handler for [6,7,8] to lower |
| RP-27 | 9 Transfer | HIGH | No expiry on pending transfers — reports can get stuck | Add 24h expiry + auto-cancel |
| RP-28 | 10 Dispute | HIGH | No pet ownership verification on dispute | Check `pet.owner_id == resident_user_id` |
| RP-29 | 10 Dispute | HIGH | Reviewed disputes can be re-submitted repeatedly | Block re-dispute after resolution |
| RP-30 | 10 Dispute | HIGH | No role guard — officers can dispute their own reports | Restrict to `role_id == 1` |
| RP-31 | 3 Claim | MEDIUM | Timezone mismatch in inactivity window calculation | Use timezone-aware datetime |
| RP-32 | 3 Claim | MEDIUM | Priority detection uses fragile string matching | Use enum for `priority_level` |
| RP-33 | 4 Verify | MEDIUM | No guard for verifying terminal-status reports | Add allowed-status list |
| RP-34 | 5 Endorse | MEDIUM | Only one evidence file attached to endorsement letter | Attach all evidence files |
| RP-35 | 5 Endorse | MEDIUM | Escalation notifies all barangay officials regardless of jurisdiction | Filter by `barangay_id` |
| RP-36 | 6 Dispatch | MEDIUM | Rescue status_id values undocumented | Create enum/lookup table |
| RP-37 | 7 Holding | MEDIUM | `custody_status` defaults to "Sighting" for in-custody animals | Fix default based on status/facility |
| RP-38 | 8 Status | MEDIUM | `status_names` dict missing statuses 14-17 | Add missing entries |
| RP-39 | 8 Status | MEDIUM | Private officer remarks forwarded in resident notifications | Separate internal/public messages |
| RP-40 | 3 Claim | LOW | No reporter notification on officer claim | Add claim notification to reporter |

---

## Prioritized Top 5 Reporting Process Fixes

| Priority | ID | Fix | Rationale |
|:---|:---|:---|:---|
| 1 | RP-01 through RP-11 | **Add `Depends(get_current_user)` to ALL reporting endpoints** | Root cause of 12 critical findings. Single change that closes the largest attack surface. All user_id values should come from the verified JWT token, not the request body. |
| 2 | RP-02 | **Fix `is_inside_selera_homes()` — remove final `return True`** | Geofencing is currently non-functional. A 1-line fix restores the intended geographic boundary enforcement for all new reports. |
| 3 | RP-12 | **Implement status transition state machine** | Without it, any status can be set to any value, making audit trails and report histories unreliable. Prevents resolved cases from re-opening without documentation. |
| 4 | RP-09 | **Restrict or remove unprotected `PATCH /reports/{id}`** | This endpoint allows any field on any report to be silently modified with zero audit trail. Replace with field-specific update routes. |
| 5 | RP-15 | **Remove AI backfill from `GET /reports/`** | Eliminates write operations inside read endpoints, prevents partial-commit data corruption, and dramatically improves GET performance. |

---

*End of Reporting Process Audit — StraySafe 2.0*
