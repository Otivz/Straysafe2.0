# STRAYSAFE 2.0 — Comprehensive Consultation Audit & Defense Checklist

**Document Version:** 1.0  
**Audit Date:** October 12, 2026  
**Audited Target:** StraySafe 2.0 Full-Stack Repository (`backend/`, `frontend/`, `ai_test_set/`, `docs/`)  
**Basis:** Capstone Consultation Summary (16 Priority Areas & Action Items)  
**Purpose:** Forensic assessment of what is currently implemented, partially implemented, and not yet implemented in the actual StraySafe 2.0 system, paired with an actionable checklist for capstone panel defense.

---

## Executive Summary & System Health at a Glance

| Consultation Section | Status | Primary Implementation Evidence | Key Action Still Needed |
|---|---|---|---|
| **1. Main Direction** | **IMPLEMENTED** | All 4 portals (`Citizen`, `Subd`, `Brgy`, `Admin`) active & integrated | Freeze new feature scope; focus on defense defense rehearsal |
| **2. AI Accuracy & Validation** | **PARTIALLY IMPLEMENTED** | YOLOv8 (`0.35` conf), Gemini Vision, OpenCV (`cv2`), Pillow (`PIL`) | Run benchmark script on `ai_test_set/` to generate Confusion Matrix |
| **3. Risk Classification** | **IMPLEMENTED (Discrete)** | Gemini contextual prompt + Tagalog regex negations + Fallback rules | Document why discrete (`Low/Med/High/Emergency`) was chosen over 1–100 |
| **4. Human Intervention** | **IMPLEMENTED** | Required officer notes on merges, claim approvals, adoption stages | Textarea empty by default verified; no auto-rejections exist |
| **5. Duplicate Protection** | **IMPLEMENTED** | Haversine (`1.5km`, `7d`), `case-preview`, terminal status locks | Perform test matrix with 3+ duplicates and resolved-case re-reports |
| **6. Lost Pet Matching** | **IMPLEMENTED** | Rule score + Gemini biometric similarity (`0–100%`), Haversine dist | Document supporting role of distance + vet evidence in panel slides |
| **8. Privacy & GPS** | **IMPLEMENTED** | Role-based portal data scoping (`verify_subdivision_scope`) + masked public QR scan payload | Document data privacy compliance (Data Privacy Act of 2012 / RA 10173) in panel defense |
| **9. Complete Workflow** | **IMPLEMENTED** | 9-step lifecycle (Submit → Subd → Brgy → Rescue → Holding → Done) | Execute live end-to-end rehearsal with audit logging verification |
| **10. Timestamp & Case Tracking** | **IMPLEMENTED** | `StatusHistory`, `HoldingTimeline`, `RescueTimeline` | Ensure timeline renders all timestamps cleanly on mobile |
| **11. Audit Logs** | **IMPLEMENTED** | `AuditLog` model (WHO, WHAT, WHICH RECORD, WHEN, OLD/NEW VALUES) | Add export to CSV/PDF button for admin reporting evidence |
| **12. Roles & Jurisdiction** | **IMPLEMENTED** | Strict RBAC (Role 1–4), subdivision geofencing and data filtering | Audit unscoped queries in `users.py` to prevent cross-subd leakage |
| **13. Account Security** | **PARTIALLY IMPLEMENTED** | Email cryptographic 6-digit OTP, Admin 2FA email code, JWT expiry | Note in defense: Email OTP used; App-based TOTP (Google Auth) out-of-scope |
| **14. GPS Accuracy** | **PARTIALLY IMPLEMENTED** | `enableHighAccuracy: true`, pin-drag manual override, landmark snap | Measure and document physical ±5–10m drift table for manuscript |
| **15. Poor Connectivity / Offline** | **IMPLEMENTED** | 48-hour localStorage draft autosave/restore in ReportStrayPage + backend fallback heuristics | Rehearse offline/reload scenario for panel presentation |
| **16. Top 5 Priorities** | **SUBSTANTIALLY READY** | Core foundations operational in code across all 5 priorities | Execute validation runs and compile final presentation exhibits |

---

## Section-by-Section Comprehensive Audit

---

### 1. Main Direction
> **Recommendation:** Avoid adding more features for now; strengthen, test, document, and connect existing features (AI, GPS, QR, rescue management, holding facility, lost-pet matching, adoption, messaging, notification, audit logs, and multi-role functions).

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  - Multi-role portals: [`frontend/src/routes/AppRoutes.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/routes/AppRoutes.tsx) strictly routes Residents, Subdivision Leaders, Barangay Staff, and Administrators.
  - Active operational endpoints:
    - Reports & Geofencing: [`backend/app/routes/reports.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)
    - Rescue Dispatch: [`backend/app/routes/rescue.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py)
    - Holding Facilities: [`backend/app/routes/holding.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py)
    - Pet Records & QR: [`backend/app/routes/pets.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pets.py), [`backend/app/routes/pet_qr.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pet_qr.py)
    - Adoption 5-Stage Process: [`backend/app/routes/adoptions.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/adoptions.py)
    - Chat & Case Threads: [`backend/app/routes/chat.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/chat.py)
    - Notifications & Dispatcher: [`backend/app/utils/notification_dispatcher.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/notification_dispatcher.py)
    - Audit Trail: [`backend/app/routes/audit_logs.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/audit_logs.py)
- **Verdict & Action Items:**
  - `[x]` Feature development is officially frozen.
  - `[ ]` Focus exclusively on testing, UI consistency, bug fixes, and documentation defense.

---

### 2. PRIORITY: AI Accuracy and Validation
> **Requirements:** Clearly document YOLOv8, Gemini, OpenCV, and Pillow. Add/measure confidence scores. Test and document correct detections, false positives, false negatives under difficult conditions (low lighting, angles, partial visibility, small animals, breeds). Avoid claiming arbitrary accuracy.

- **Implementation Status:** `[PARTIALLY IMPLEMENTED (Engineering Done, Benchmark Execution Pending)]`
- **What is Implemented in Code:**
  1. **YOLOv8 (`yolov8n.pt`):**
     - Located in [`backend/app/utils/model_loader.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/model_loader.py).
     - Clamped confidence threshold: `conf >= 0.35` (`YOLO_MIN_CONFIDENCE = 0.35`).
     - Restricted classes: COCO class 15 (`cat`) and class 16 (`dog`). All 78 other classes rejected.
     - Single-animal constraint: [`backend/app/routes/reports.py:validate_report_images()`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py#L2081-L2092) enforces 1 animal per report; rejects 0 animals (`no_animal`) or multiple animals (`multiple_animals`).
  2. **Gemini 2.5 Flash:**
     - Located in [`backend/app/utils/ai_suggestions.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/ai_suggestions.py) and [`backend/app/utils/photo_checks.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/photo_checks.py).
     - Multimodal species/breed/color confirmation, behavior risk reasoning, and synthetic AI-generation forensic scoring.
  3. **OpenCV (`cv2`):**
     - Located in [`backend/app/utils/video_processing.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/video_processing.py).
     - Temporal frame decimation (samples 8 evenly distributed RGB frames, scores best frame using `conf*0.7 + rel_area*0.6`).
  4. **Pillow (`PIL`):**
     - Located in [`backend/app/utils/color_detection.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/color_detection.py).
     - Inset crop (8% margin) inside YOLO bounding box, filters background sky and green foliage, clusters HSV space for dominant fur colors.
  5. **Confidence Scores Exposed:**
     - Bounding-box detection confidence (`ai_detection_confidence`, type `Numeric(4, 3)`).
     - Authenticity likelihood (`ai_photo_likelihood` / `ai_generated_likelihood`).
     - Pairwise similarity score (`similarity_score`, 0–100%).
- **What is NOT Implemented / Pending:**
  - Automated benchmark run on the physical test set in [`ai_test_set/`](file:///c:/Users/User/Desktop/Straysafe2.0/ai_test_set/README.md) (`daylight`, `low_light`, `angle`, `partial`, `small`, `breed`, `negative`).
  - Empirical confusion matrix (True Positives, False Positives, False Negatives, Precision, Recall, F1) calculated across the 155 test images.
- **Action Items for Defense:**
  - `[x]` Document the 4 technologies and their pipeline in the capstone paper (completed in [`STRAYSAFE_AI_ACCURACY_RISK_CLASSIFICATION_WALKTHROUGH.md`](file:///c:/Users/User/Desktop/Straysafe2.0/STRAYSAFE_AI_ACCURACY_RISK_CLASSIFICATION_WALKTHROUGH.md)).
  - `[ ]` Populate the 7 test folders in `ai_test_set/photos/` and run the evaluation script to produce measurable confusion matrices for the manuscript.

---

### 3. Risk Classification: Low / Medium / High / Emergency
> **Requirements:** Define how risk level is determined. Identify indicators. Provide numerical/logical explanation. Address the 1–100 scoring concept versus thresholds. Prepare defensible rationale for panel.

- **Implementation Status:** `[IMPLEMENTED (Discrete Multi-Factor Architecture)]`
- **What is Implemented in Code:**
  - **Database Storage:** Column `reports.priority_level` is defined as `Enum('Low', 'Medium', 'High')` in [`backend/app/models/report.py:67`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/report.py#L67).
  - **Classification Engine:** Evaluated in [`backend/app/utils/ai_suggestions.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/ai_suggestions.py):
    - **High Priority Trigger Indicators:** Severe active trauma/injuries, active bite aggression, suspected rabies symptoms (hypersalivation, unprovoked lunging), entrapment in fast-moving highway/traffic.
    - **Medium Priority Trigger Indicators:** Limping, visible skin mange/malnutrition without collapse, wandering in busy residential corridors, mild defensive barking/fear.
    - **Low Priority Trigger Indicators:** Calm, resting, healthy body condition, ear-tipped / neutered community animals, roaming quietly.
    - **Whole-Sentence Tagalog & English Negation Parsing:** Uses strict regex boundary parsing (`HINDI_NANGANGAGAT_RE`, `NO_BITING_RE`) so that sentences like *"Tahol lang, hindi nangangagat"* are NOT falsely elevated to High Priority.
  - **Where 'Emergency' Lives:** In StraySafe, `Emergency` is NOT a report priority enum; it is an **Operational Action State**. Reports exhibiting active rabies or critical injury trigger an immediate `community_alert_type = 'Hazard'` and dispatch priority in [`backend/app/routes/rescue.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py).
- **Addressing the 1–100 Consultation Concept:**
  - *Why StraySafe does not use an arbitrary 1–100 integer:* Continuous 1–100 risk scores create false precision (e.g., what is the clinical difference between a 71% risk and a 73% risk?). A discrete, multi-factor indicator system (`Low`, `Medium`, `High`, with `Emergency` dispatch trigger) is more defensible, clinically standard in animal triage, and directly maps to response SLAs.
- **Action Items for Defense:**
  - `[x]` Defensible logic fully coded and documented.
  - `[ ]` Present the indicator matrix table during panel defense to defend why discrete triage is superior to an artificial 1–100 formula.

---

### 4. Human Intervention in Critical Decisions
> **Requirements:** AI must remain an assistive tool (AI recommendation → Human review → Authorized decision). Human verification required for classification, duplicate reports, ownership claims, adoption, report rejection, rescue dispatch, and case resolution. System must never auto-reject legitimate reports based only on AI.

- **Implementation Status:** `[FULLY IMPLEMENTED & HARDENED]`
- **Codebase Evidence:**
  - **AI Classification Review:** Sighting tags suggested by AI remain in `ai_suggested_*` columns. Official reviews and confirms/overrides them before setting official report status.
  - **Duplicate Verification:** [`AIMatchReviewModal.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Modals/AIMatchReviewModal.tsx) and [`MergeReportModal.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Modals/MergeReportModal.tsx) require an authorized officer to manually input a reason (textarea starts blank by default; submit button disabled until valid reason entered).
  - **Ownership Claims:** [`backend/app/routes/claims.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/claims.py) and [`BrgyPetClaims.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx) require staff to inspect government ID and veterinary proof before approving ownership transfer.
  - **Adoption Oversight:** [`backend/app/routes/adoptions.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/adoptions.py) enforces 5 individual human-approved milestones. Completing form requirements does NOT auto-adopt.
  - **Report Rejection:** Requires an authorized officer to choose a specific rejection reason (`false_alarm`, `invalid_photo`, `out_of_jurisdiction`) with explanatory notes in [`SubdViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx). AI never auto-rejects a report.
- **Verdict & Action Items:**
  - `[x]` Fully compliant with the assistive AI paradigm.

---

### 5. Duplicate Report Protection
> **Requirements:** Link/merge ongoing cases regarding the same animal. Treat new reports submitted after case resolution as new cases. Test 2+ duplicate scenarios. Test resolving 1 report while others remain active. Document how animal pickup/secured confirmation is recorded.

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  - **Duplicate Detection Radius & Window:**
    - [`backend/app/routes/matches.py:65-68`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/matches.py#L65-L68):
      - `DUPLICATE_MIN_SCORE = 65`
      - `DUPLICATE_RADIUS_KM = 1.5` (Haversine distance)
      - `DUPLICATE_WINDOW_DAYS = 7`
  - **Terminal Status Lock (Resolved Cases Cannot Be Merged Into):**
    - Defined in [`backend/app/routes/matches.py:62`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/matches.py#L62):
      `RESOLVED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18]`
    - In [`frontend/src/components/Modals/MergeReportModal.tsx:6`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Modals/MergeReportModal.tsx#L6):
      `const TERMINAL_STATUSES = [3, 9, 10, 11, 12, 14, 18];`
    - If a report is already resolved, it cannot absorb or be absorbed as a duplicate. New sightings filed after case closure automatically initiate independent cases.
  - **Case Previews & Grouping:** [`backend/app/utils/case_groups.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/case_groups.py) handles multi-report merges into a single case root (`duplicate_of_report_id`).
  - **Pickup / Animal Secured Documentation:**
    - Recorded through the Handover and Facility Intake workflows:
      [`CompleteHandoverModal.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Modals/CompleteHandoverModal.tsx) and [`holding.py:intake_animal`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py), logging custody status change from `'Sighting'` to `'Impounded'` or `'In Custody'` with photo evidence and timestamps.
- **Action Items for Defense:**
  - `[ ]` Rehearse live demonstration: File Report A, file Report B within 1.5km, merge them; resolve Report A, file Report C, verify Report C opens as a new case.

---

### 6. Lost Pet Matching
> **Requirements:** Clarify matching logic. Improve similarity-score presentation. Use location/distance as supporting info. Consider registered pet appearance, photos, vet/vaccination evidence. Maintain human review before confirming match.

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  - **Two-Tier Matching Algorithm:**
    - **Tier 1 (Rule-Based Pre-filter):** Calculates species match (strict boolean), breed similarity, color overlap (Jaccard coefficient), size compatibility, and spatial distance using Haversine formula (`_distance_km`). Clamped at `PET_MATCH_MIN_SCORE = 50`.
    - **Tier 2 (Gemini Vision Multimodal Comparison):** Top 10 rule-based candidates undergo side-by-side visual feature extraction (facial structure, ear shape, distinctive markings, tail geometry) to generate `similarity_score` (0–100%) and key evidence bullets.
  - **Distance as Supporting Info:**
    - UI explicitly renders distance (e.g., *"0.3 km from registered home"*) alongside the percentage score in [`AIMatchReviewModal.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Modals/AIMatchReviewModal.tsx).
  - **Ownership Proof & Veterinary Verification:**
    - [`PetMatchReview.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/PetMatchReview.tsx) and [`claims.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/claims.py) allow owner to attach vaccination cards, vet receipts, and historical photos.
  - **Two-Way Confirmation Protocol:**
    - Match confirmation is finalized only when **both** the reviewing official confirms and the pet owner acknowledges the sighting.
- **Action Items for Defense:**
  - `[x]` Logic fully implemented in code.
  - `[ ]` Include the two-tier matching workflow diagram in the defense presentation.

---

### 8. Privacy and GPS
> **Requirements:** Citizen reports must not expose sensitive personal info to everyone. Citizen views own reports. Subdivision leaders view authorized subdivision reports. Hide owner's full home address in public QR scan. Use only necessary contact info. Review exact GPS access.

- **Implementation Status:** `[IMPLEMENTED]`
- **What is Implemented in Code:**
  - **Role Scoping:** [`backend/app/utils/auth.py:verify_subdivision_scope`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py) restricts Subdivision Leaders strictly to their assigned `subdivision_id`.
  - **Citizen Report Privacy:** Non-staff citizens cannot view private details or unescalated reports belonging to other residents.
  - **Public Report Visibility:** Stray sighting photos and landmarks are public on the community map; reporter personal contact details are restricted to staff.
  - **QR Public Scan Privacy Masking:**
    - In [`backend/app/routes/pet_qr.py:182-192`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pet_qr.py#L182-L192):
      `owner_address` is sanitized and masked to show only the broader community jurisdiction (`f"{subd_name}, Brgy. {brgy_name}"`), removing sensitive house/lot numbers from public viewers.
    - `owner_email` is set to `None` in the public payload to prevent spambots/harassment.
    - Owner and emergency contact phone numbers remain available so finders can promptly contact the owner to return the pet.
- **Action Items for Defense:**
  - `[ ]` Cite compliance with the Philippine Data Privacy Act of 2012 (RA 10173) by demonstrating data minimization on public QR scans.

---

### 9. Complete Workflow: Citizen to Rescue
> **Requirements:** Test the complete 9-stage lifecycle: 1. Citizen submits → 2. Subdivision reviews → 3. Validated → 4. Escalated to Barangay → 5. Barangay verifies/approves → 6. Rescue approved/rescuer assigned → 7. Rescuer arrives/secures animal → 8. Holding facility intake → 9. Case completed/endorsed.

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  1. `Citizen Submits`: `POST /reports` in [`reports.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py) (Status 1: Pending).
  2. `Subdivision Leader Reviews`: [`SubdViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx) claims report (`claimed_at`).
  3. `Report Validated`: Leader marks status as Validated / Under Investigation (`PUT /reports/{id}/status`, Status 2).
  4. `Escalated to Barangay`: Leader triggers Escalation (`POST /reports/{id}/escalate-to-barangay`, Status 4).
  5. `Barangay Staff Verifies`: Staff approves escalation in [`BrgyRescueRequests.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx).
  6. `Rescue Approved & Rescuer Assigned`: Staff creates `rescue_requests` row and assigns personnel (`POST /rescue/assign`).
  7. `Rescuer Arrives & Secures`: Status updated to `En Route` → `On Scene` → `Secured` in [`rescue.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py).
  8. `Holding Facility Intake`: Animal logged into subdivision or barangay holding pen (`POST /holding/intake` in [`holding.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py)).
  9. `Case Completed`: Animal returned to owner, adopted, or case archived (`ResolveLostPetModal.tsx`, Terminal Status 9/11/12).
- **Action Items for Defense:**
  - `[ ]` Record a video or take slide screenshots documenting each of the 9 stages in sequence.

---

### 10. Timestamp / Case Tracking
> **Requirements:** Record timestamps for all major stages (submission, subd review, validation, barangay escalation, rescue approval, rescuer assignment, rescuer arrival, animal pickup, case completion). Purpose: establish complete lifecycle history.

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  - **Report Timestamps:** `created_at`, `claimed_at`, `verified_at`, `merged_at`, `identity_rechecked_at` in [`backend/app/models/report.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/report.py).
  - **Status History Audit Trail:** Table `status_history` logs `changed_at`, `changed_by_user_id`, `from_status_id`, `to_status_id`, and transition `notes`.
  - **Rescue Tracking:** Table `rescue_requests` records `requested_at`, `dispatched_at`, `arrived_at`, and `completed_at`.
  - **Holding Facility Tracking:** Table `holding_timeline` logs intake timestamp, health checks, feeding events, and release dates.
  - **Visual Timeline Component:** Rendered on both frontend portals via [`RescueTimeline.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/RescueTimeline.tsx) and [`ResiViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResiViewReport.tsx).

---

### 11. Audit Logs
> **Requirements:** Audit logs must make system changes traceable: WHO, WHAT, WHICH RECORD, WHEN, OLD VALUE, NEW VALUE.

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  - **Schema:** [`backend/app/models/audit_log.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/audit_log.py):
    - `user_id` (**WHO** — who performed the action)
    - `action` + `description` (**WHAT** — action taken)
    - `target_table` + `target_id` (**WHICH RECORD** — affected row)
    - `created_at` (**WHEN** — timestamp)
    - `old_values` (**OLD VALUE** — JSON snapshot of pre-change state)
    - `new_values` (**NEW VALUE** — JSON snapshot of post-change state)
    - `ip_address` + `user_agent` (Forensic request tracking)
  - **Central Logger Utility:** [`backend/app/utils/audit.py:log_activity()`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/audit.py) automatically commits structured audit entries across user logins, report status changes, duplicate merges, pet approvals, and adoption stages.
  - **UI Viewer:** Admin Audit Logs page with search, date filter, and JSON diff viewer.
- **Action Items for Defense:**
  - `[ ]` Ensure Admin Audit Log screen is prepared to show during panel questions on traceability.

---

### 12. User Roles and Jurisdiction Access
> **Requirements:** Use role-based access control. Subdivision Leader accesses only authorized reports/users within their subdivision. Subdivision A cannot view private reports of Subdivision B. Barangay receives properly escalated reports. Admin follows administrative duties. Data isolation verified.

- **Implementation Status:** `[IMPLEMENTED]`
- **Codebase Evidence:**
  - Four distinct system roles:
    - `Role 1`: Resident
    - `Role 2`: Subdivision Leader
    - `Role 3`: Barangay Staff
    - `Role 4`: Administrator
  - **Subdivision Jurisdiction Scoping:**
    - [`backend/app/utils/auth.py:verify_subdivision_scope()`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py) enforces that requests originating from a Subdivision Leader validate `user.subdivision_id == resource.subdivision_id`.
    - Cross-subdivision viewing is restricted. If a stray moves across subdivision boundaries, it must be officially transferred via the Case Transfer protocol (`pending_transfer_to_id` in [`report.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/report.py)).
  - **Barangay Jurisdiction:** Receives reports marked with `barangay_id` or escalated from constituent subdivisions.

---

### 13. Account Security
> **Requirements:** Consider Multi-Factor Authentication (MFA). Review secure password-reset procedures. Implement session expiration, proper logout behavior, and authentication audit records.

- **Implementation Status:** `[PARTIALLY IMPLEMENTED (Email OTP Implemented; App-based TOTP Out of Scope)]`
- **What is Implemented in Code:**
  - **Email-Based 2FA / OTP:**
    - Implemented in [`backend/app/routes/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/auth.py) and [`backend/app/models/otp.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/otp.py).
    - Cryptographic 6-digit OTP generated via `secrets.randbelow()` with 5-minute expiration (`OTP_EXPIRY_MINUTES = 5`).
    - Enforced during Resident registration verification and Administrator login verification (`send_admin_login_code_email`).
  - **Password Policy:** Enforced via [`backend/app/utils/password_policy.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/password_policy.py) (minimum 8 characters, uppercase, digit, special character).
  - **Session Expiration:** Standard JWT access tokens expire after configurable duration (`ACCESS_TOKEN_EXPIRE_MINUTES`).
  - **Secure Password Reset:** Password reset links utilize single-use secure OTP tokens delivered to registered email.
  - **Authentication Audit Logs:** Failed logins, successful logins, and password resets logged in `audit_logs`.
- **What is NOT Implemented:**
  - Authenticator app-based TOTP (Google Authenticator / QR seed keys). Email OTP serves as the 2FA layer.
- **Defense Note:**
  - State clearly: *"StraySafe utilizes email-based two-factor authentication (OTP) rather than third-party authenticator apps to maximize accessibility for community residents and local barangay officials."*

---

### 14. GPS Accuracy
> **Requirements:** Compare actual location with reported GPS location. Measure and document location error (testing check point around 5–10 meter range). Test reports created in weak GPS areas.

- **Implementation Status:** `[PARTIALLY IMPLEMENTED (Field Testing & Documentation Pending)]`
- **What is Implemented in Code:**
  - **High-Accuracy Geolocation API:** [`ReportStrayPage.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ReportStrayPage.tsx) queries browser location using `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`.
  - **Subdivision Boundary Geofencing:** Validates coordinates against Polygon boundaries (`frontend/src/utils/coverageArea.ts`).
  - **Pin-Dragging Override:** If GPS accuracy is degraded (e.g., indoor multipath error), residents can manually drag the pin to the true sighting location.
  - **Two-Tier Position Storage:** Sighting stores both `initial_latitude`/`initial_longitude` (raw device GPS) and `latitude`/`longitude` (user-corrected pin position) in [`backend/app/models/report.py:56-60`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/report.py#L56-L60).
- **What is NOT Implemented:**
  - A formal measurement test table comparing known surveyor coordinates vs device GPS readings across 10–20 test points in the target subdivision (e.g., Block 5 Clubhouse: Actual vs Reported delta).
- **Action Items for Defense:**
  - `[ ]` Take sample readings at 5 known subdivision landmarks, compute the average distance delta in meters (e.g. 6.4m error), and include this in Chapter 4 / Appendix of the manuscript.

---

### 15. Poor Connectivity / Offline Handling
> **Requirements:** Prevent entered report data from disappearing if connection drops while filling out form. Preserve entered info as draft. Allow resume/edit upon reconnection. Test backend/Gemini failure scenarios.

- **Implementation Status:** `[IMPLEMENTED]`
- **What is Implemented in Code:**
  - **Graceful Gemini Degradation:**
    - In [`backend/app/utils/ai_suggestions.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/ai_suggestions.py): If Gemini API times out (15s timeout) or internet is severed, backend catches the error and executes local regex/keyword rules without crashing or blocking report submission.
  - **Network Retry on Matches:** Match retry fallback in [`AIMatchReviewModal.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Modals/AIMatchReviewModal.tsx).
  - **In-Progress Report Draft Autosave & Recovery:**
    - In [`ReportStrayPage.tsx:300-394`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ReportStrayPage.tsx#L300-L394): Debounced 500ms `useEffect` autosaves form inputs (category, breed, color, description, landmark, markings, conditions, custody status) into `localStorage` (`straysafe_report_draft`).
    - Validates draft age (48-hour expiration window).
    - Upon accidental page refresh, reconnection, or re-opening, the draft is restored automatically and a dismissible amber banner is shown (`💾 Your unsaved report draft was automatically restored`).
    - Automatically wiped via `clearDraft()` upon successful submission or when user clicks "Discard Draft".
- **Action Items for Defense:**
  - `[ ]` Rehearse offline/accidental reload scenario during live demo to showcase resident data preservation.

---

### 16. Top 5 Priorities Review

| Priority | Consultation Area | Current System Status | What is Needed for 100% Defense Readiness |
|---|---|---|---|
| **1** | **AI Testing & Validation** | Models & pipeline active; test set planned | Fill 155 images in `ai_test_set/` and produce Confusion Matrix |
| **2** | **Duplicate Protection** | Radius, window, case merge & locks active | Execute test scenario with 3+ duplicates and post-resolution report |
| **3** | **End-to-End Workflow** | Full 9-stage lifecycle fully functional | Rehearse complete live demo from citizen submission to case closure |
| **4** | **Adoption Workflow** | 5-stage human-reviewed workflow in place | Prepare slides showing why human approval is mandatory at each stage |
| **5** | **Security & Audit** | RBAC, Email OTP, AuditLog fully operational | Mask full address on public QR endpoint; export sample audit log |

---

## Actionable Capstone Defense Checklist

Use this checklist to track final tasks before your capstone panel defense:

### Category A: Code Hardening & Privacy Fixes (Quick Tasks)
- [x] **A1 (Privacy):** In [`backend/app/routes/pet_qr.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pet_qr.py), updated `get_public_scan_info` so `owner_address` returns only the broader area (`{subd_name}, Brgy. {brgy_name}`), hiding exact street/lot number, and `owner_email` is omitted from public QR payload.
- [x] **A2 (Draft Autosave):** In [`frontend/src/pages/citizen/ReportStrayPage.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ReportStrayPage.tsx), implemented 48h `localStorage` autosave (`straysafe_report_draft`), automatic restoration with amber banner notification, and auto-wipe on report submission.
- [x] **A3 (Build Cleanliness):** Verified frontend builds cleanly with 0 TypeScript/Vite compilation errors via `npm run build`.

### Category B: Field Testing & Data Gathering (For Manuscript & Slides)
- [ ] **B1 (AI Benchmark):** Populate the test folders in [`ai_test_set/photos/`](file:///c:/Users/User/Desktop/Straysafe2.0/ai_test_set/README.md) across the 7 categories (`daylight`, `low_light`, `angle`, `partial`, `small`, `breed`, `negative`).
- [ ] **B2 (Confusion Matrix):** Compute True Positives, False Positives, False Negatives, and Accuracy/Precision/Recall for YOLOv8 and Gemini on the test set.
- [ ] **B3 (GPS Error Table):** Walk 5 points in a subdivision with known coordinates, compare against `navigator.geolocation` readings, and record a 1-page table showing average error in meters (target: ~5–10m).
- [ ] **B4 (Offline Fallback Test):** Temporarily disable WiFi on test machine and verify that report submission gracefully falls back to local heuristic rules without server crashes.

### Category C: Capstone Panel Defense Presentation Artifacts
- [ ] **C1 (Explainability Slide):** Create a slide explaining the 4 AI technologies: YOLOv8 (detection), Gemini (multimodal context & forensics), OpenCV (video frame decimation), Pillow (fur color clustering).
- [ ] **C2 (Triage vs Score Slide):** Prepare the defense explanation for why discrete risk classification (`Low`, `Medium`, `High`, and `Emergency` dispatch trigger) was implemented rather than an arbitrary continuous 1–100 formula.
- [ ] **C3 (Human-in-the-Loop Slide):** Highlight that StraySafe strictly follows the assistive AI model: AI suggests → Human verifies → Authorized official decides.
- [ ] **C4 (Lifecycle Demo Script):** Rehearse the 9-stage end-to-end workflow demo script (Citizen Report → Subd Review → Brgy Escalation → Dispatch → Secured → Holding → Closure).
- [ ] **C5 (Audit Log Evidence):** Prepare a sample PDF/screenshot of the Admin Audit Trail showing WHO, WHAT, WHICH RECORD, WHEN, OLD VALUES, and NEW VALUES.
