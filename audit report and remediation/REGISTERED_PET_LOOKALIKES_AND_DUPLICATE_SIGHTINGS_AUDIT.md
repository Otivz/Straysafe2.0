# Comprehensive Audit & Remediation Report: Registered Pet Look-Alikes & Duplicate Stray Sightings

**Date:** September 30, 2026  
**System:** StraySafe 2.0  
**Audit Scope:** AI Multi-Factor Biometric Matching, Registered Pet Look-Alike Inquiries, Duplicate Stray Sighting Consolidation, Case Merging/Unmerging Workflows, Security & RBAC Integrity, and Cross-Platform Network Reliability.  
**File Location:** `c:\Users\User\Desktop\Straysafe2.0\audit report and remediation\REGISTERED_PET_LOOKALIKES_AND_DUPLICATE_SIGHTINGS_AUDIT.md`

---

## 1. Executive Summary

An exhaustive architectural, security, and algorithmic audit was conducted on two critical intelligence pillars in StraySafe 2.0:
1. **Registered Pet Look-Alikes:** Automated individual biometric identification connecting stray animal sightings with registered owned pets to expedite lost pet reunifications.
2. **Duplicate Stray Sightings (Report Merging):** Spatial-temporal correlation and multi-case consolidation enabling subdivision leaders and barangay officers to merge multiple citizen reports regarding the same stray animal into a single master case.

### Core Architectural Principle Audited
> **Mandate:** *Individual Visual Identity > Generic Breed Similarity*  
> The system evaluates facial contours, muzzle proportions, ear posture, coat patch distributions, and distinctive markings rather than generic breed labels.

### Summary of Remediations Completed
- **CRITICAL-01 (Security & RBAC):** Fixed role authorization in report merge and unmerge endpoints to strictly allow authorized officials (Roles 2, 3, 4) and prevent unauthorized resident executions while restoring System Administrator access.
- **CRITICAL-02 (API & Networking):** Eliminated direct hardcoded `http://localhost:8000` URLs across all match and merge modal components, migrating them to the standardized Axios `api` instance.
- **CRITICAL-03 (ORM Data Integrity):** Resolved runtime attribute errors caused by referencing transient Python annotations (`Report.status_id`) instead of the mapped database column (`Report.current_status_id`).
- **PERF-01 (Query Optimization):** Added species pre-filtering to the registered pet look-alike scanning pipeline, preventing redundant cross-species iterations.
- **NOTIF-01 (Workflow Automation):** Implemented automated officer alerts when a registered pet owner submits an `OWNER_CONFIRMED` response on a potential match.

---

## 2. System Architecture & Workflows

### 2.1 Registered Pet Look-Alike Pipeline
```mermaid
flowchart TD
    A[Stray Report Submitted / Photo Uploaded] --> B[Background Worker: process_report_media_ai]
    B --> C[YOLOv8 Object Detection & Color Extraction]
    C --> D[trigger_looks_matching]
    D --> E[scan_and_generate_matches_for_report]
    E --> F{Species Pre-Filter & Eligibility Gate}
    F -- Exclude Deceased, Impounded, Deleted, No Image --> G[Skip]
    F -- Eligible Candidates --> H[Gemini Vision Forensic Biometrics]
    H --> I{Score >= 50% & No Hard Contradictions?}
    I -- No --> J[Discard]
    I -- Yes --> K[Persist ReportMatch (AI_SUGGESTED)]
    K --> L[Dispatch Real-Time Notification to Pet Owner]
    L --> M[Owner Feedback: OWNER_CONFIRMED / OWNER_REJECTED]
    M -- If Confirmed --> N[Alert Assigned Officer / Subdivision Leader]
    M --> O[Staff Official Verification: CONFIRMED_MATCH / NOT_A_MATCH]
```

### 2.2 Duplicate Stray Sighting & Merging Lifecycle
```mermaid
flowchart TD
    R1[Active Sighting Report A] --> S[Duplicate Sighting Engine]
    R2[Active Sighting Report B] --> S
    S --> T{Criteria: 7-Day Window + <=1.5km Proximity + Species Match}
    T -- Score >= 65% --> U[Create Duplicate Match Record]
    U --> V[Display Warning Badge in Feed & Sighting Details]
    V --> W[Official Opens MergeReportModal]
    W --> X[Execute POST /reports/{id}/merge]
    X --> Y[Set current_status_id=18 (Merged - Duplicate)]
    Y --> Z[Reconcile Claims, Rescues & Holding Facilities]
    Z --> AA[Add Immutable StatusHistory Entries & Notify Both Reporters]
```

---

## 3. Comprehensive Audit Matrix: Findings & Needs to Improve

| # | Subsystem / Component | Issue / Need to Improve | Severity | Status | Remediation Details |
|---|------------------------|-------------------------|----------|--------|---------------------|
| 1 | `backend/app/routes/reports.py` (Lines 4260 & 4460) | **RBAC Authorization Flaw:** Merge and unmerge routes checked `actor.role_id not in [1, 2, 3]`. Role 1 (Citizen) was permitted, while Role 4 (Admin) was blocked. | Critical | **Fixed** | Updated role gate to `[2, 3, 4]` (Subdivision Leader, Barangay Staff, Admin). |
| 2 | `backend/app/routes/pet_qr.py` (Line 497) | **ORM Query Crash:** Filter called `Report.status_id.notin_([14, 15, 17, 18])` which threw `Object of type int \| None has no attribute notin_` because `status_id` is a transient Python annotation. | High | **Fixed** | Changed to mapped column `Report.current_status_id.notin_([14, 15, 17, 18])`. |
| 3 | `frontend/src/components/Modals/MergeReportModal.tsx` | **Hardcoded Localhost Endpoints:** Used direct `axios.get('http://localhost:8000/...')` and `axios.post('http://localhost:8000/...')`, breaking cross-device testing and production proxies. | High | **Fixed** | Migrated all 6 HTTP calls to standardized `api` client from `../../utils/api`. |
| 4 | `frontend/src/components/Modals/UnmergeReportModal.tsx` | **Hardcoded Localhost Endpoint:** Used direct `axios.post('http://localhost:8000/reports/.../unmerge')`. | Medium | **Fixed** | Migrated to `api.post('/reports/.../unmerge')`. |
| 5 | `frontend/src/components/AIPotentialMatchesList.tsx` | **Hardcoded Localhost Endpoints:** Used direct `axios` calls for pet lookup, match queries, and scan triggers. | High | **Fixed** | Replaced with `api.get()` and `api.post()`. |
| 6 | `frontend/src/components/Modals/SubdReportModal.tsx` | **Hardcoded Localhost Endpoint:** Landmark lookup used `axios.get('http://localhost:8000/landmarks')`. | Low | **Fixed** | Migrated to `api.get('/landmarks')`. |
| 7 | `backend/app/routes/matches.py` (Line 438) | **Query Scalability Bottleneck:** Look-alike scan queried all registered pets of all species from database before Python loops. | Medium | **Fixed** | Added database-level pre-filter `Pet.pet_type.ilike(report.animal_type)`. |
| 8 | `backend/app/routes/matches.py` (Line 1030) | **Missing Workflow Notification:** When an owner confirmed a match (`OWNER_CONFIRMED`), the assigned incident handler was not notified. | Medium | **Fixed** | Added automated push notification dispatching to assigned officer or subdivision leaders. |
| 9 | `frontend/src/pages/citizen/ReportStrayPage.tsx` | **UI/UX Disabled State:** If uploaded photo was rejected by AI verification (non-dog/cat), the Next button remained active orange. | Medium | **Fixed** | Added `isAnimalNotEligible` validation to disable and darken the Next button (`bg-gray-400 opacity-60`). |

---

## 4. In-Depth Technical Implementation & Code Remediations

### 4.1 Security & Role Gatekeeping (Merge & Unmerge)
**File:** `backend/app/routes/reports.py`
```diff
- actor = db.query(User).filter(User.user_id == merge_in.user_id).first()
- if not actor or actor.role_id not in [1, 2, 3]:
-     raise HTTPException(status_code=403, detail="Only authorized staff and leaders can merge reports.")
+ actor = db.query(User).filter(User.user_id == merge_in.user_id).first()
+ if not actor or actor.role_id not in [2, 3, 4]:
+     raise HTTPException(status_code=403, detail="Only authorized staff, leaders, and admins can merge reports.")
```
**Rationale:** Role 1 corresponds to Citizen/Resident users who must not alter case consolidation structures. Role 4 is System Administrator who must have full administrative merge authority.

---

### 4.2 Query Performance Optimization
**File:** `backend/app/routes/matches.py`
```diff
- all_registered_pets = db.query(Pet).options(
-     joinedload(Pet.owner)
- ).filter(Pet.status.in_(["Active", "Lost", "Found", "Rescued"]), Pet.status != "Impounded").all()
+ pet_query = db.query(Pet).options(
+     joinedload(Pet.owner)
+ ).filter(Pet.status.in_(["Active", "Lost", "Found", "Rescued"]), Pet.status != "Impounded")
+ 
+ if report.animal_type and report.animal_type.strip().lower() in ["dog", "cat"]:
+     pet_query = pet_query.filter(Pet.pet_type.ilike(report.animal_type.strip()))
+ 
+ all_registered_pets = pet_query.all()
```
**Rationale:** Avoids pulling thousands of irrelevant feline records when analyzing a canine sighting report (and vice versa), reducing database load and memory usage.

---

### 4.3 Automated Handler Alert on Owner Confirmation
**File:** `backend/app/routes/matches.py`
```python
# If owner confirmed match, immediately notify the assigned handler or subdivision leaders
if payload.owner_confirmation == "OWNER_CONFIRMED" and match.source_report:
    handler_id = match.source_report.assigned_leader_id
    pet_name = match.matched_pet.pet_name if match.matched_pet else "Registered Pet"
    if handler_id:
        db.add(Notification(
            user_id=handler_id,
            title=f"🐾 Owner Confirmed Match: Report #{match.source_report_id}",
            message=f"Resident {current_user.name} confirmed that the animal in Report #{match.source_report_id} matches their registered pet '{pet_name}'.",
            type="potential_match",
            related_id=match.source_report_id
        ))
    elif match.source_report.subdivision_id:
        leaders = db.query(User).filter(User.subdivision_id == match.source_report.subdivision_id, User.role_id == 2).all()
        for ldr in leaders:
            db.add(Notification(
                user_id=ldr.user_id,
                title=f"🐾 Owner Confirmed Match: Report #{match.source_report_id}",
                message=f"Resident {current_user.name} confirmed that the animal in Report #{match.source_report_id} matches their registered pet '{pet_name}'.",
                type="potential_match",
                related_id=match.source_report_id
            ))
```
**Rationale:** Closes the communication gap between citizen self-verification and field response.

---

### 4.4 Centralized Frontend API Migration
**Files Modified:**
- `frontend/src/components/AIPotentialMatchesList.tsx`
- `frontend/src/components/Modals/MergeReportModal.tsx`
- `frontend/src/components/Modals/UnmergeReportModal.tsx`
- `frontend/src/components/Modals/SubdReportModal.tsx`

**Sample Migration:**
```diff
- import axios from 'axios';
- const res = await axios.get(`http://localhost:8000/reports/${idToLookup}`);
- const mergeRes = await axios.post(`http://localhost:8000/reports/${reportId}/merge`, payload);
+ import { api } from '../../utils/api';
+ const res = await api.get(`/reports/${idToLookup}`);
+ const mergeRes = await api.post(`/reports/${reportId}/merge`, payload);
```
**Rationale:** Guarantees that authentication tokens from `localStorage`/`sessionStorage` and dynamic environment variables (`VITE_API_BASE_URL`) are applied across all devices and hosting environments.

---

## 5. Verification & Testing Results

| Test Case | Scenario | Expected Result | Result |
| :--- | :--- | :--- | :--- |
| **TC-01** | Resident submits report with non-dog/cat photo | AI blocks verification; Next button turns dark gray (`opacity-60`) and cannot be clicked. | **PASSED** |
| **TC-02** | Scan matches for Dog sighting | Query fetches only canine pet records; avoids pulling cat records. | **PASSED** |
| **TC-03** | Pet owner confirms match in modal | Match status updates to `OWNER_CONFIRMED`; push notification sent to assigned Subdivision Leader. | **PASSED** |
| **TC-04** | Subdivision Leader merges duplicate report | Secondary report status set to 18; claims reconciled; `StatusHistory` logged; both reporters notified. | **PASSED** |
| **TC-05** | Unauthorized resident attempts POST `/reports/{id}/merge` | Server returns HTTP 403 Forbidden ("Only authorized staff, leaders, and admins can merge reports"). | **PASSED** |
| **TC-06** | System Administrator executes report separation (unmerge) | Report restored to active status (1 or 2); match updated to `NOT_A_MATCH`; audit log saved. | **PASSED** |

---

## 6. Recommendations & Future Roadmap

1. **Multi-Angle Visual Gallery Matching:**
   - In
    pet registration, mandate 3 profile photos (Front, Left Profile, Right Profile) so Gemini Vision evaluates side coat patch alignment against sighting reports.
2. **Automated Vector Embedding Indexing:**
   - As registered pet volume scales beyond 5,000 records, introduce pre-computed visual embeddings (e.g. CLIP / ImageBind) with FAISS or pgvector to achieve sub-second preliminary candidate retrieval before Gemini forensic verification.
3. **Automated Duplicate Warning Banner in Incident Map:**
   - On the subdivision leader dispatch map, automatically draw a dashed bounding connector between suspected duplicate sightings with similarity score badges.
