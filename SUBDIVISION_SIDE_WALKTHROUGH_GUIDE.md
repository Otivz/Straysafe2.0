# StraySafe 2.0 — Comprehensive Subdivision / HOA Side Walkthrough Documentation 🏘️🐾

---

## 1. Executive Summary & Governance Overview

In **StraySafe 2.0**, the **Subdivision Level (HOA Officers, Subdivision Leaders, & Security Personnel)** acts as the **First Responder and Community Governance Layer**. Positioned between the grassroots Residents and the legal municipal Barangay tier, Subdivision Leaders validate resident reports, manage localized temporary shelters, handle pet ownership claims, issue formal Barangay Endorsement Letters, and broadcast safety hazard alerts within their gated community.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                RESIDENTS / HOMEOWNERS                                   │
│   • Submits photo-verified stray animal reports and sightings                           │
│   • Registers household pets for QR collar tracking                                     │
│   • Files ownership claims for recovered pets                                           │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Reports & Sighting Inquiries
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    SUBDIVISION LEADERS / HOA OFFICERS (ROLE ID: 2)                      │
│                                                                                         │
│   • First-line Triage: Inspects resident reports for authenticity and urgency            │
│   • Community Resolution: Reconnects lost pets with registered owners in subdivision    │
│   • Temporary Holding: Safely secures strays in HOA holding cage during observation     │
│   • Official Escalation: Generates digital Endorsement Letters to Barangay Hall         │
│   • Hazard Broadcast: Sends real-time community alerts (rabies, aggressive packs)       │
│   • Registry Master: Maintains database of registered subdivision pets & lost records   │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Official Escalations & Dispatches
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           BARANGAY COMMAND (ROLE ID: 3 & 5)                             │
│   • Executes municipal field containment & legal impoundment                            │
│   • Provides veterinary quarantine & public adoption pipelines                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Navigation Architecture

### 2.1 Login & Session Management
- **Login Route:** `/staff/login`
- **Component:** [`CommunityStaffLogin.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx)
- **Role Verification:** Authenticates `role_id === 2` (Subdivision Leader / HOA Administrator).
- **Session Storage:** Key `staff_user` stores the authenticated officer payload (`user_id`, `name`, `email`, `role_id`, `subdivision_id`, `subdivision_name`).
- **Route Guarding:** Guarded by [`ProtectedRoute.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/ProtectedRoute.tsx) configured with `allowedRoles={[2]}`.

### 2.2 Global Navigation Shell & Routing Matrix
All Subdivision pages utilize the responsive administration layout with live notification counters:

| Module / Route | Page Component | Key Functionality |
| :--- | :--- | :--- |
| **DASHBOARD**<br>`/subd/dashboard` | [`SubdDashboard.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdDashboard.tsx) | Geofenced live map, emergency status tiles, recent sightings, and fast dispatch shortcuts. |
| **INCIDENT QUEUE**<br>`/subd/reports` | [`SubdReports.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdReports.tsx) | Verification queue of resident-submitted stray reports, urgency triage, and status updates. |
| **REPORT DETAILS**<br>`/subd/reports/:id` | [`SubdViewReport.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx) | In-depth case investigation, photo evidence, reporter messaging, and Endorsement Letter generator. |
| **ESCALATED MISSIONS**<br>`/subd/escalated` | [`EscelatedMissions.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/EscelatedMissions.tsx) | Live progress tracker for missions endorsed to Barangay (Dispatched → Picked Up → Impounded). |
| **ENDORSEMENT ARCHIVE**<br>`/subd/endorsements` | [`EndorsementArch.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/EndorsementArch.tsx) | Digital ledger of all formal Barangay Endorsement Letters with tracking codes and printable PDFs. |
| **PET CLAIMS**<br>`/subd/pet-claims` | [`SubdPetClaims.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx) | Ownership claim verification, vaccination proof audit, and resident reunification handover. |
| **HOLDING FACILITY**<br>`/subd/holding-facility` | [`SubdHoldingFacility.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx) | Local subdivision cage capacity tracker, intake logs, and 3-day observation timeline. |
| **PET REGISTRY**<br>`/subd/pet-records` | [`SubdPetRecords.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdPetRecords.tsx) | Master subdivision pet directory, microchip & QR collar lookup, rabies vaccine records. |
| **ARCHIVED PETS**<br>`/subd/removed-pets` | [`SubdRemovedPetRecords.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdRemovedPetRecords.tsx) | Historical records of deceased, relocated, or transferred resident animals. |
| **HAZARD BROADCASTS**<br>`/subd/hazard-alert` | [`SubdHazardAlert.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdHazardAlert.tsx) | Instant SMS/Push community warnings (Rabies threat, aggressive pack, stray notice). |
| **COMMUNICATIONS**<br>`/subd/messages` | [`SubdMessages.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdMessages.tsx) | Real-time direct chat with reporting residents, pet claimants, and Barangay responders. |
| **AUDIT ARCHIVE**<br>`/subd/history` | [`SubdHistoryReport.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx) | Permanent record logs of resolved, reunited, and closed incident reports. |
| **PROFILE & SETTINGS**<br>`/subd/profile`<br>`/subd/settings` | [`SubdProfile.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdProfile.tsx)<br>[`SubdSettings.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdSettings.tsx) | HOA guardhouse contacts, geofence bounds, automated alert preferences, and account security. |

---

## 3. Detailed Walkthrough of Core Subdivision Modules

---

### 📍 Module 1: Subdivision Command Dashboard (`/subd/dashboard`)

The Command Dashboard provides HOA Leaders with high-altitude situational awareness across their residential territory.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               SUBDIVISION COMMAND CENTER                               │
│                                                                                        │
│  [ 🚨 3 Pending Reports ]   [ 🔄 2 In Progress ]   [ 🏠 1 Local Cage ]   [ 🐾 1 Claim ] │
├──────────────────────────────────────────────────────────┬─────────────────────────────┤
│                                                          │  ⚡ QUICK ACTIONS           │
│  🗺️ GEOFENCED MAP (SELERA HOMES)                         │  • Verify Incoming Reports  │
│                                                          │  • Broadcast Hazard Alert   │
│  • Red Pins: Urgent Unverified Reports                   │  • View Escalated Missions  │
│  • Orange Pins: Endorsed to Barangay                     ├─────────────────────────────┤
│  • Green Pins: Captured & In Holding                     │  📢 ACTIVE HAZARD NOTICES   │
│  • Selera Boundary Geofence Outline (Dashed Amber)       │  "Aggressive Dog - Phase 2" │
└──────────────────────────────────────────────────────────┴─────────────────────────────┘
```

#### 1. Metric Summary Cards
- **Pending Review:** Resident reports requiring immediate HOA verification.
- **Under Barangay Action:** Reports escalated to Barangay where responders are currently in transit.
- **Local Holding Occupancy:** Number of strays currently secured in the subdivision safe cage.
- **Pending Claims:** Residents requesting return of their lost pets.

#### 2. Geofenced Community Map
- **Geofence Enforcement:** Outlines official boundaries (e.g. *Selera Homes Polygon*).
- **Incident Pin Filtering:** Highlights stray density per phase/street.
- **Interactive Marker Click:** Direct popover with pet picture, reporter landmark, urgency, and one-click jump to report verification.

---

### 🚨 Module 2: Resident Report Triage & Verification (`/subd/reports`)

When a resident spots a stray animal, the report appears in the Subdivision Incident Queue.

```
[Resident Submits Report] 
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│              STEP 1: HOA LEADER REPORT TRIAGE EVALUATION               │
│                                                                        │
│  1. Check Photo & Location: Is the animal within the subdivision?      │
│  2. Evaluate Urgency:                                                  │
│     • Critical: Bite history, aggressive behavior, rabies suspicion    │
│     • Medium/Low: Docile stray, wandering puppy                        │
│  3. Database Cross-Check: Match against Subdivision Pet Registry      │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
      [Matches Registered Pet]             [Unknown Stray / Aggressive]
                    │                                │
                    ▼                                ▼
       Contact Owner via Claims             Generate Official Endorsement
```

#### Verification Actions:
1. **Approve / Verify:** Marks report as legitimate community incident.
2. **Reject / Mark False Alarm:** Dismisses duplicate, out-of-boundary, or prank submissions with required explanatory note to the reporter.
3. **Internal Containment:** HOA guards secure docile strays in the local holding cage for owner retrieval.
4. **Escalate to Barangay:** Triggers official multi-responder intervention for dangerous or unmanageable animals.

---

### 📄 Module 3: Digital Barangay Endorsement Generator (`/subd/reports/:id`)

When an incident exceeds subdivision capacity (e.g. aggressive canine, rabies hazard, feral pack), the Subdivision Leader generates an **Official Barangay Endorsement Letter**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     OFFICIAL BARANGAY RESCUE ENDORSEMENT LETTER                        │
│                                                                                        │
│  TO:       Barangay San Vicente Tactical Operations Center                             │
│  FROM:     Homeowners Association (HOA) Administration - Selera Homes                  │
│  TRACKING: END-2026-0914-0821                                                          │
│                                                                                        │
│  INCIDENT PARTICULARS:                                                                 │
│  • Case #: #104 (Aggressive Stray Dog)                                                 │
│  • Location: Near Phase 2 Basketball Court, Selera Homes, Bulacan                      │
│  • Urgency Tier: HIGH (Behavior: Threatening pedestrians)                              │
│                                                                                        │
│  FORMAL REQUEST:                                                                       │
│  "The Subdivision HOA formally requests Barangay dispatch of containment personnel     │
│   and animal control transport equipment for safe pickup and impoundment."             │
│                                                                                        │
│  [ DIGITAL SIGNATURE: Juan Dela Cruz, HOA President ]    [ VERIFIED QR TRACKER ]       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Key Endorsement Capabilities:
- **Auto-Generated Tracking Code:** Unique identifier (`END-YYYY-XXXX`) synchronizing HOA and Barangay databases.
- **Digital Officer Stamp:** Authenticated with the logged-in Subdivision Leader's credentials.
- **Live Transmission:** Instantly places the case into the Barangay Command Queue with sound and push alerts.

---

### 🚀 Module 4: Escalated Missions Tracking (`/subd/escalated`)

Once endorsed, Subdivision Leaders can monitor Barangay rescue teams in real time:

| Mission Stage | Status Code | Meaning for Subdivision |
| :--- | :--- | :--- |
| **Endorsement Received** | `Status 4 / 13` | Barangay OIC is reviewing the letter and preparing dispatch. |
| **Team Dispatched** | `Status 5` | Barangay vehicle and field staff are en route to the subdivision gate. |
| **Animal Picked Up** | `Status 6` | Barangay personnel have successfully captured and secured the animal. |
| **Transferred to Holding**| `Status 7 / 8` | Animal is safely admitted into the Barangay Holding Facility for observation. |
| **Reunited / Resolved** | `Status 9 / 11` | Pet returned to registered owner or successfully adopted out. |

---

### 🏷️ Module 5: Pet Claims & Owner Reunification (`/subd/pet-claims`)

When a pet is found or reported, homeowners can file an Ownership Claim.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PET OWNERSHIP CLAIM VERIFICATION                                │
├──────────────────────────────────────────────────┬─────────────────────────────────────┤
│  CLAIMANT PROOF OF OWNERSHIP                     │  EVALUATION CHECKLIST               │
│                                                  │                                     │
│  • Resident Name: Maria Santos (Lot 12, Block 4) │  [✓] Address verified in Subd       │
│  • Photo Evidence: Photo with pet from 2025      │  [✓] Collar / Fur marks match       │
│  • Vet Record: Anti-Rabies Card Uploaded         │  [✓] Vaccination up to date         │
│  • Registered QR: Registered in Subd Registry    │  [✓] Contact number verified        │
├──────────────────────────────────────────────────┴─────────────────────────────────────┤
│  DECISION:  [ ✅ APPROVE CLAIM & SCHEDULE HANDOVER ]    [ ❌ REJECT WITH REASON ]       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Claims Workflow:
1. **Verification of Records:** Compares claimant documents against the Pet Registry.
2. **Direct Claimant Chat:** Messages the owner to confirm retrieval time at the HOA guardhouse/cage.
3. **Turnover Sign-Off:** Once picked up, the incident report automatically updates to `Claimed by Owner` (`Status 9`).

---

### 🏠 Module 6: Subdivision Temporary Holding Facility (`/subd/holding-facility`)

Subdivisions maintain small temporary containment cages to secure docile strays safely away from road traffic before transfer.

- **3-Day Local Hold Rule:** Animals are kept for up to 72 hours while searching for subdivision owners.
- **Capacity Monitoring:** Tracks available vs. occupied cages in real time to prevent overcrowding.
- **Feeding & Daily Care Logs:** Notes animal health condition, feeding schedule, and behavior.
- **Auto-Escalation Prompt:** If unclaimed after 3 days, prompts the Leader to generate a transfer endorsement to the Barangay municipal facility.

---

### 📋 Module 7: Master Subdivision Pet Registry (`/subd/pet-records`)

The digital census of all registered dogs and cats residing inside the subdivision.

- **Pet Profiles:** Name, breed, color markings, age, microchip ID, and resident owner profile.
- **Rabies Vaccination Status:** Color-coded badges indicating current vs. expired vaccines.
- **QR Collar ID Generator:** Generates printable digital QR codes for resident pet collars. When scanned by guards, immediately pulls up the owner's phone number and home address.
- **Deceased / Relocated Archive:** Clean management of former pets under `/subd/removed-pets`.

---

### 📢 Module 8: Community Hazard Broadcasts (`/subd/hazard-alert`)

Empowers HOA Officers to broadcast instant emergency warnings to all residents via the mobile/web app.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         COMMUNITY HAZARD ALERT DISPATCH                                │
│                                                                                        │
│  Alert Title:     ⚠️ Aggressive Canine Warning - Phase 2 Park                          │
│  Severity:        🔴 HIGH / CRITICAL                                                   │
│  Target Audience: All Selera Homes Residents                                           │
│                                                                                        │
│  Message Content:                                                                      │
│  "A large brown stray canine exhibiting territorial behavior has been spotted near      │
│   Phase 2 Playground. Barangay Rescue has been dispatched. Please keep children and     │
│   pets indoors until animal control secures the area."                                 │
│                                                                                        │
│  [ 📢 BROADCAST ALERT TO RESIDENT APP FEED & SMS ]                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. End-to-End User Flow Scenarios

### Scenario A: Resident Reports a Docile Lost Dog (Internal Resolution)
1. **Resident Submits:** Uploads photo of a Golden Retriever wandering in Phase 1.
2. **Subdivision Leader Receives:** Checks `/subd/reports` and cross-references `/subd/pet-records`.
3. **Match Found:** Matches "Buddy" owned by resident in Block 3.
4. **Direct Notification:** Leader initiates chat with owner via `/subd/messages`.
5. **Reunification:** Dog is temporarily secured in the HOA cage, owner retrieves pet, and case is closed as `Resolved / Reunited` without burdening Barangay responders.

### Scenario B: Pack of Aggressive Strays (Barangay Escalation)
1. **Resident Submits:** Multiple reports of 3 aggressive strays chasing motorbikes near the main gate.
2. **Leader Triage:** Marks report as `Critical Urgency`.
3. **Endorsement Generated:** Leader clicks **"Endorse to Barangay"** in [`SubdViewReport.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx), generating official tracking letter `END-2026-XXXX`.
4. **Hazard Broadcast:** Leader issues an instant Community Hazard Alert advising residents to avoid the main entrance road.
5. **Barangay Intervention:** Barangay OIC approves dispatch; field team arrives and captures the strays.
6. **Live Synchronization:** Subdivision Leader tracks the status change in `/subd/escalated` until the animals are safely admitted to the Barangay municipal facility.

---

## 5. Security & Permission Matrix

| Action / Capability | Resident | Subdivision Leader | Barangay Staff | Barangay Head |
| :--- | :---: | :---: | :---: | :---: |
| Submit Stray Animal Report | ✅ | ✅ | ❌ | ❌ |
| Verify / Reject Resident Reports | ❌ | ✅ | ❌ | ❌ |
| Generate Official Barangay Endorsement | ❌ | ✅ | ❌ | ❌ |
| Broadcast HOA Hazard Alerts | ❌ | ✅ | ❌ | ❌ |
| Approve Pet Ownership Claims | ❌ | ✅ | ❌ | ✅ |
| Manage Subd Pet Registry & QR Collars | ❌ | ✅ | ❌ | ❌ |
| Dispatch Barangay Field Rescue Teams | ❌ | ❌ | ❌ | ✅ |
| Admit Animal to Municipal Impound | ❌ | ❌ | ✅ | ✅ |
| Approve Public Animal Adoptions | ❌ | ❌ | ❌ | ✅ |

---

*StraySafe 2.0 — Developed for Intelligent Community Animal Welfare, Automated Triage, and Municipal Rescue Coordination.* 🐾🛡️
