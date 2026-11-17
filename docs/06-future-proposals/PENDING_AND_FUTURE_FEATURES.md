# STRAYSAFE 2.0: Missing, Pending, and Future Features Roadmap

> **Document Status:** Reference & System Audit  
> **Date:** 2026-11-16  
> **Scope:** Comprehensive audit of missing, partially implemented, proposed, and prospective features for STRAYSAFE 2.0.  
> **Note:** Strictly an assessment and planning reference. Does not modify application source code, database structures, or active configurations.

---

## 1. Executive Summary

STRAYSAFE 2.0 has established a functional, subdivision-centric core covering:
* Real-time 6-category incident reporting with mandatory GPS map pinning and landmark proximity.
* Decoupled 3-Pathway Triage (**Pathway A:** Lost/Found & Sightings, **Pathway B:** Complaints & Owner Observations, **Pathway C:** External Responder Referrals).
* Non-blocking AI decision support (YOLOv8 nano local detection and Google Gemini Vision cloud analysis).
* Isolated 1-to-1 person-to-person case communications and progressive due-process complaint management.

This document inventories features and components that are:
1. **Completely Missing:** Planned or documented capabilities with zero functional implementation.
2. **Partially Implemented / Incomplete:** Features with backend logic or frontend UI present, but lacking end-to-end integration or production completion.
3. **Restricted Workflows & Architectural Decisions:** Deliberate architectural boundaries that differ from conventional open platforms.
4. **Proposed Future Work (Recommendations Chapter):** Features proposed in system design documents (`docs/06-future-proposals/` and `AI_TODO.md`) suitable for defense recommendations.

---

## 2. Completely Missing Features (Documented or Planned, But Not Built)

### 2.1 SMS Alert & Notification Gateway
* **Description:** The system preferences schema (`channels.sms`) and notification architecture outline SMS alerts for high-priority safety concerns, rabies warnings, and urgent missing pet broadcasts.
* **Current State:** 
  * `ResidentCapabilities` explicitly hardcodes `smsChannel: false`.
  * There is no SMS gateway provider (e.g., Twilio, Semaphore, or Infobip) integrated into the backend or environment configurations.
* **What is Needed to Complete:**
  * Integration of a local Philippine SMS API (e.g., Semaphore).
  * Backend dispatcher in `backend/app/utils/notification_dispatcher.py` to route SMS messages to resident phone numbers when `channels.sms = true`.

### 2.2 Resident-to-Office Direct In-App Inquiries
* **Description:** An open channel for residents to send general non-incident inquiries, policy questions, or office messages to HOA officers directly within the app.
* **Current State:** 
  * `ResidentCapabilities` explicitly disables this via `messageOffice: false`.
  * The resident Help & Contact screen displays only static office contact information (phone, email, office hours).
* **What is Needed to Complete:**
  * A dedicated `office_inquiry_threads` schema and backend router.
  * A resident messaging interface detached from specific incident report IDs.

### 2.3 Resident Account Self-Service Deactivation
* **Description:** The ability for residents to request account deletion, self-suspension, or data anonymization in compliance with data privacy standards.
* **Current State:** 
  * The Resident Profile and Settings pages offer no option to deactivate or delete an account.
  * Account activation and deactivation are reserved exclusively for the backend System Administrator.
* **What is Needed to Complete:**
  * Self-service deactivation endpoint (`POST /users/me/deactivate`) with password confirmation and active case check.

### 2.4 Standalone Advisory Media Management (Selective Photo Deletion)
* **Description:** The ability for Subdivision Leaders to edit an existing published announcement or safety advisory by removing or replacing specific attached photos.
* **Current State:** 
  * Leaders can create advisories with media or delete the entire announcement.
  * There is no route or UI control to detach an individual photo from `announcement_media` while retaining the text.
* **What is Needed to Complete:**
  * Endpoint `DELETE /announcements/{id}/media/{media_id}` and individual photo removal buttons in `frontend/src/admin/pages/NoticeEditorPage.tsx`.

### 2.5 Pet Ownership Transfer & Ownership History Log
* **Description:** Allowing a registered pet owner to initiate an official transfer of their registered pet profile to another verified resident in the subdivision (e.g., when moving or rehoming).
* **Current State:** 
  * Proposed in `docs/06-future-proposals/OWNER_HISTORY_AND_PET_TRANSFER_PLAN.md`, but nothing is built.
  * Pets have an immutable `user_id` foreign key.
* **What is Needed to Complete:**
  * Transfer workflow schema (`pet_transfers` table with status `pending`, `accepted`, `declined`).
  * Resident UI workflow for initiating and accepting a transfer.

---

## 3. Partially Implemented & Incomplete Features

### 3.1 Graphical System Administrator (Role 4) Web Portal
* **Description:** A dedicated web dashboard for the IT System Administrator to provision accounts, toggle AI features, configure global geofences, and inspect system audit logs.
* **Current State:** 
  * Backend endpoints and SQLAlchemy models exist in `backend/app/routes/admin.py`, `users.py`, and `audit_logs.py`.
  * There is **no web user interface** for Role 4. All system administration requires direct API calls, CLI scripts (`seed_admin.py`), or direct MySQL access.
* **What is Needed to Complete:**
  * An authenticated web portal route (`/sys-admin`) with views for User Lifecycle Management, System Configuration & AI Feature Toggles, and Audit Log Explorer.

### 3.2 Firebase Cloud Messaging (FCM) Native Mobile Push Integration
* **Description:** Background push notifications that ring and vibrate the resident's mobile phone when the app is closed (for urgent lost pet alerts, sightings, and warning notices).
* **Current State:** 
  * The Android APK project integrates `@capacitor/push-notifications` and registers device tokens on login.
  * Backend service `backend/app/utils/fcm_push.py` is implemented for FCM HTTP v1.
  * **Incomplete:** The Google Cloud Service Account in `~/.straysafe/` requires the project owner to enable the `Firebase Cloud Messaging API` permission in Google Cloud Console. Until granted, notifications fallback to in-app polling.
* **What is Needed to Complete:**
  * Enabling the `Firebase Cloud Messaging API Admin` role on the GCP service account.

### 3.3 AI Model Benchmarking & Standardized Test Dataset
* **Description:** Quantitative measurement of YOLOv8 and Google Gemini accuracy (precision, recall, IoU thresholds, and confusion matrices) on actual community stray photos for Capstone Chapter 4.
* **Current State:** 
  * Evaluation scripts (`scripts/check_test_set.py`, `scripts/evaluate_ai.py`) are written.
  * The test folder `ai_test_set/photos/` currently contains 0 real community-collected images.
* **What is Needed to Complete:**
  * Populating the 8 benchmark folders (daylight, low light, angle, partial, small, breed, no animal, multiple) with ~170 photos and running the evaluation harness.

### 3.4 Automated AI Matching Re-run on Pet Photo Update
* **Description:** Automatically re-running stray look-alike and duplicate matching when a resident updates or uploads clearer pictures to an existing pet profile.
* **Current State:** 
  * Background AI matching triggers automatically when a new incident report is filed or report photos change.
  * Updating photos on `pets` does not dispatch a new AI matching job to `ai_jobs`.
* **What is Needed to Complete:**
  * Hooking the `PUT /pets/{id}` photo upload handler to queue a `MATCH_PET` job in `backend/app/routes/pets.py`.

### 3.5 Granular Resident Notification Category Toggles
* **Description:** Allowing residents to selectively opt in or out of specific notification topics (e.g., enable Lost Pet alerts, but disable General Community notices).
* **Current State:** 
  * In `frontend/src/resident/pages/account/SettingsPage.tsx`, `communityToggles` is hardcoded to `false`.
  * Community notices and safety advisories are grouped into a unified setting.
* **What is Needed to Complete:**
  * Activating discrete topic toggles on the resident settings screen and binding them to `user_notification_preferences`.

---

## 4. Workflows Restricted by Design (Intentional Architectural Boundaries)

These are architectural choices designed for privacy, data integrity, and operational feasibility:

| Feature / Workflow | How It Works in StraySafe 2.0 | Rationale & Defense Justification |
| :--- | :--- | :--- |
| **Physical Pet QR Tags** | **Retired.** Replaced by map-pinned community sightings and photo AI matching. | Unowned strays do not wear collars; lost pets frequently lose tags; bystanders should not be forced to physically approach unknown animals to scan a tag. |
| **External Authority Direct Logins & Portal** | **Retired.** External authority coordination is tracked exclusively via Subdivision Leader Referral Logs. | Subdivisions maintain community jurisdiction; external municipal responders operate on their own systems and do not hold accounts in the subdivision platform. |
| **Public Incident Chat & Forums** | **Retired.** Replaced by strictly 1-to-1 contextual messaging (Leader $\leftrightarrow$ Resident, Owner $\leftrightarrow$ Finder). | Eliminates neighbor-on-neighbor harassment, unmoderated public disputes, and false accusations. |
| **Informal Complaint Chat** | **Disabled.** Formal complaints follow structured enforcement (Letters, Summons, Meetings). | Animal complaints carry legal and bylaw implications; communications require documented due process rather than casual chat. |
| **Registration-First Lost Pet Filing** | **Enforced.** Filing a Lost Pet report requires linking a registered pet profile. | Prevents fake or spam reports; guarantees accurate reference photos, owner identity, and historical traits. |
| **Domestic Species Restriction** | **Restricted to Dogs and Cats.** Other animals file under general "Other" reports. | Aligned with RA 9482 (Anti-Rabies Act) and standard subdivision pet keeping guidelines. |

---

## 5. Proposed Future Enhancements (Capstone Recommendations)

Features documented in system proposals (`docs/06-future-proposals/`) suitable for thesis Chapter 5 / recommendations:

* 💡 **30-Day Re-linking for Unresolved "Animal Cannot Be Found" Reports:**
  * When a report is closed as "Animal Cannot Be Found", keep its feature vector active in background matching for 30 days to flag new sightings matching the unresolved animal.
* 💡 **Multi-User Household Co-Ownership:**
  * Permitting multiple verified residents in the same household (Block/Lot) to co-manage registered family pets.
* 💡 **Automated External Referral Endorsement Packet Generation:**
  * One-click generation of PDF referral packages containing incident GPS maps, warning histories, and repeat-offense logs for municipal animal control and veterinary escalations.
* 💡 **Offline PWA Report Caching:**
  * Local caching of draft reports and photos on mobile devices when moving through low-signal areas of the subdivision, auto-submitting once Wi-Fi/cellular connection is restored.
