# StraySafe 2.0 — Comprehensive Barangay Side Walkthrough Documentation 🛡️🐾

---

## 1. Executive Summary & Governance Overview

In **StraySafe 2.0**, the **Barangay Level** operates as the **Tactical Command and Operational Execution Engine**. While Citizens report sightings and Subdivision Leaders validate legitimacy, the Barangay holds legal authority, field personnel, rescue equipment, and animal holding facilities to safely pick up, impound, treat, adopt out, and resolve stray animal incidents.

### 🏛️ Dual-Role Structure within Barangay

Within the Barangay tier, the system distinguishes two distinct operational levels:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        BARANGAY HEAD / OFFICER-IN-CHARGE (OIC)                          │
│               Role ID: 5 (or Role ID: 3 with `is_head_officer = 1`)                     │
│                                                                                         │
│   • Reviews incoming escalated reports & Subdivision endorsement letters                 │
│   • Approves or rejects official rescue operations                                      │
│   • Dispatches multi-responder teams (assigning up to 5 field personnel)                │
│   • Manages Barangay personnel accounts, duty readiness, and permissions                │
│   • Authorizes Holding Facility intake, quarantine holds, and owner claims              │
│   • Evaluates and approves Public Animal Adoption applications (`/brgy/adoptions`)      │
│   • Gives final case resolution and adoption turnover sign-offs                         │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Dispatches & Assigns
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                       BARANGAY FIELD STAFF / PERSONNEL                                  │
│                                  Role ID: 3                                             │
│                                                                                         │
│   • Receives direct field mission assignments and push alerts                           │
│   • Navigates turn-by-turn from Barangay Hall or current GPS location to incident site   │
│   • Executes physical containment and capture of stray/aggressive animals               │
│   • Uploads real-time photographic evidence and updates mission status                  │
│   • Delivers animals to the registered Holding Facility and logs daily health notes     │
│   • Assists in physical adoption handover, adopter verification, and QR registration    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Navigation Architecture

### 2.1 Login & Session Management
- **Login Route:** `/staff/login`
- **Component:** [`CommunityStaffLogin.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx)
- **Role Verification:** Authenticates `role_id === 3` (Barangay Staff) or `role_id === 5` (Barangay Head Officer).
- **Local Storage Key:** `staff_user` (contains user object: `user_id`, `name`, `email`, `role_id`, `barangay_id`, `is_head_officer`, `position_name`).
- **Protected Routing:** Guarded by [`ProtectedRoute.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/ProtectedRoute.tsx) ensuring unauthorized citizens or external staff cannot access Barangay operational views.

### 2.2 Global Navigation Shell
All Barangay pages are wrapped in:
- **Header:** [`BrgyNavbar.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/Navbars/BrgyNavbar.tsx) with search, notifications drawer, user avatar, and mobile toggle.
- **Sidebar:** [`BrgySidebar.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/BrgySidebar.tsx) with live badge counters.

#### Sidebar Menu Structure:

| Menu Section | Route | Page Component | Live Badge Indicator |
| :--- | :--- | :--- | :--- |
| **OPERATIONS** | | | |
| 📊 **Dashboard** | `/brgy/dashboard` | [`BrgyDashboard.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyDashboard.tsx) | — |
| 💬 **Messages** | `/brgy/messages` | [`BrgyMessages.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyMessages.tsx) | Unread messages count |
| 🚨 **Incident Reports** | `/brgy/rescue-requests` | [`BrgyRescueRequests.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx) | Unviewed escalated reports count |
| 🏠 **Holding Facility** | `/brgy/holding-facility` | [`BrgyHoldingFacility.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx) | Capacity warnings & impound timer alerts |
| 📢 **Community Alerts** | `/brgy/community-alerts` | [`BrgyCommunityAlerts.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyCommunityAlerts.tsx) | — |
| **ANIMAL MANAGEMENT** | | | |
| 🏡 **Adoption Pipeline** | `/brgy/adoptions` | *Adoption Management* | Pending adoption applications count |
| 🐾 **Pet Records** | `/brgy/pet-records` | [`BrgyPetRecords.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPetRecords.tsx) | — |
| 🏷️ **Pet Claims** | `/brgy/pet-claims` | [`BrgyPetClaims.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx) | Pending owner claims count |
| 📷 **Scan QR Collar** | *Modal Action* | [`QRScannerModal.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/Modals/QRScannerModal.tsx) | Direct camera / image scanner |
| **RECORDS** | | | |
| 📜 **Report History** | `/brgy/history` | [`BrgyHistoryReports.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx) | Archived closed & adopted cases |
| **SYSTEM** | | | |
| 👥 **Personnel** | `/brgy/personnel` | [`BrgyPersonnelManagement.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPersonnelManagement.tsx) | Dynamic title (Management vs Directory) |
| ⚙️ **Settings** | `/brgy/settings` | [`BrgySettings.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgySettings.tsx) | Full barangay operational preferences |
| 👤 **Profile** | `/brgy/profile` | [`BrgyProfile.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyProfile.tsx) | Station & account details |

---

## 3. Walkthrough of Core Barangay Modules

### 📍 Module 1: Tactical Dashboard (`/brgy/dashboard`)

The Command Dashboard provides real-time situational awareness across the entire barangay jurisdiction.

#### 1. Metrics & Readiness Cards
- **Incoming Escalations:** Reports escalated from Subdivision Leaders awaiting review (`Status 4` / `Status 13`).
- **Active Operations:** Field rescues currently in progress (`Status 5: Team Dispatched`).
- **Resolved Today:** Rescues successfully concluded and animals impounded, rehomed, or returned (`Status 6`, `9`, `10`, `11`).
- **Personnel Roster:** Total on-duty personnel vs. currently deployed responders.

#### 2. Interactive Tactical GIS Map
- **View Modes:** Toggle between `Pins Only`, `Heatmap Density`, or `Combined View` to inspect incident clusters.
- **Full-Screen Modal:** Expand map for tactical planning and deployment.
- **Live Route Planning:** Choose route origin:
  - `Barangay Hall HQ` (coordinates: `14.806906, 121.0039297` - San Vicente, Santa Maria, Bulacan).
  - `Current GPS Location` of the officer's device.
  - Draws interactive path directly to the stray animal's coordinates.

#### 3. Real-Time Telemetry Feed
- Automatically syncs every 10 seconds with the backend API (`/rescue-requests/`, `/reports/?escalated_only=true`, `/users/?role_id=3`).

---

### 🚨 Module 2: Incident Reports & Dispatch Center (`/brgy/rescue-requests`)

The Incident Reports board is where Barangay staff process escalated cases, evaluate AI recommendations, and deploy rescue personnel.

#### 1. Filters & Search Engine
- **Search:** Instant text search across Report ID, Animal Type, Breed, Landmark, and Reporter Name.
- **Priority Filter:** `ALL` | `EMERGENCY` | `HIGH` | `REGULAR` | `LOW`.
- **Status Filter:** Filter by lifecycle state (`Forwarded to Barangay`, `Approved`, `Dispatched`, etc.).
- **View Toggle:** Switch between responsive **Grid Cards**, structured **Data Table**, or **AI Matches**.

#### 2. AI Decision Support & Verification Inspection
- **AI Assessment Card:** Displays YOLO/Gemini vision findings:
  - Animal species (Dog/Cat), Dominant color, Estimated size, Breed suggestion.
  - Urgency level and reasoning (e.g., *"Emergency: Aggressive behavior, high bite risk, possible rabies symptoms"*).
- **Subdivision Ground-Truth Verification Data:**
  - Verified Actual Bite (Yes/No)
  - Chasing Behavior (Yes/No)
  - Attempted Bite (Yes/No)
  - Visible Injury (Yes/No)
  - Leader Verification Notes and investigator name.
- **Official Endorsement Letter:** Direct preview and PDF download of the signed endorsement from the Subdivision Leader.
- **Reverse Geocoding:** Auto-resolves raw latitude/longitude into human-readable street, neighbourhood, and road names via OpenStreetMap Nominatim.

#### 3. Dispatch & Status Actions
- **Approve Request (`Status 13: Approved`):** Officially accepts the case for barangay action.
- **Dispatch Rescue Team (`Status 5: Rescue In Progress`):**
  - Opens the **Team Dispatch Modal**.
  - Allows multi-selection of up to **5 field responders**.
  - Assigns team lead and adds operational dispatch instructions.
  - Automatically sends push notifications to all selected responders.
- **Update Operational State:**
  - `Status 6: Picked Up` (Captures animal; unlocks mandatory photo evidence upload).
  - `Status 7: Under Observation` (Transfers animal to registered Holding Facility).
  - `Status 8: Impounded` (Enters holding pen with 7-day impound countdown timer).
  - `Status 10: Released / Rehomed` (Successfully adopted or released).
  - `Status 11: Incident Resolved` (Case completed).
  - `Status 14: Case Dismissed` (False alarm / gone on arrival).
  - `Status 17: Animal Not Found` (Search conducted, no stray located).

---

### 🔍 Module 3: Incident Details & Single Case Command (`/brgy/reports/:id`)

When clicking into any specific report, the staff enters the comprehensive single-case command view ([`BrgyReportView.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyReportView.tsx)).

#### 1. Visual Evidence & Media Gallery
- Displays high-resolution photos and videos uploaded by the reporting citizen.
- Lightbox gallery with zoom and timestamp inspection.
- Distinguishes **Initial Sighting Media** from **Field Rescue Evidence Media** uploaded by officers.

#### 2. Duplicate Detection & AI Match Review
- Automatically analyzes nearby reports within 500 meters and similar animal visual embeddings.
- Highlights potential duplicate sightings to prevent redundant dispatches.
- Includes **Merge Reports** ([`MergeReportModal.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/Modals/MergeReportModal.tsx)) and **Unmerge Reports** capability with full audit trail.

#### 3. Real-Time Multi-Party Chat Drawer
- Click **"Open Incident Chat"** to slide out [`ReportChatDrawer.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/Chat/ReportChatDrawer.tsx).
- Enables 3-way conversation between:
  1. The **Citizen Reporter**
  2. The **Subdivision Leader**
  3. The **Barangay Operations Staff & Responders**
- Allows exchanging location updates, gate access instructions, or animal sighting updates in real time.

#### 4. Rescue Assignment Roster Card
- Lists all responders assigned to the operation with photos, contact numbers, and status badges (`Assigned`, `En Route`, `On Site`).
- Barangay Head Officers can add or swap responders directly via the **Manage Responders** button.

---

### 🏠 Module 4: Holding Facility & Shelter Management (`/brgy/holding-facility`)

Once an animal is secured (`Status 6: Picked Up`), it transitions to the **Holding Facility** module ([`BrgyHoldingFacility.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx)).

#### 1. Facility Infrastructure Management
- **Multiple Facility Support:** Tracks both:
  - **Subdivision Temporary Holding Pens** (e.g., Selera Homes Temporary Holding Pen, capacity 6).
  - **Barangay Central Shelter / Impounding Center** (capacity 20+).
- **Capacity Meter:** Visual progress bar tracking cage occupancy percentages with automatic 80% threshold warnings.
- **Facility Details:** Caretaker name, caretaker contact phone number, exact GPS pin, and address.

#### 2. Animal Intake & Care Workflow
- **Kennel Slot Assignment:** Assigns animals to specific cages (e.g., `Kennel A-1`, `Isolation Pen 3`).
- **Health & Observation Statuses:**
  - 🔴 `Need Treatment` (Injured / sick strays requiring veterinary attention).
  - 🟢 `Healthy` (Stable, vaccinated, fed).
  - 🔵 `Claimed by Owner` (Successfully identified and reclaimed).
  - 🟡 `For Adoption` (`facility_status = 6`: Promoted to public catalog).
  - 🟣 `Transferred to Shelter` (Relocated to municipal or welfare shelter).
  - ⚫ `Deceased` (Passed away during medical care).
- **7-Day Impound Countdown Clock:** System automatically tracks `intake_date` and calculates remaining days (`adoptionGraceDays: 7`).
- **Timeline & Caregiver Event Logging:**
  - Log daily feeding, medical treatments, rabies observation checks, and relocation logs.
  - Every entry records timestamp, event type icon (`🐾 intake`, `💊 medical`, `📋 observation`, `🚚 transfer`), and logging staff member.

#### 3. Transition to Public Adoption Feed
- Once the 7-day impoundment window expires without an owner claim and the animal is certified healthy:
  - A **"Promote to Adoption Feed"** button becomes active.
  - Clicking this button transitions the animal to `facility_status = 6 (For Adoption)`.
  - The animal is instantly published to the public **Public Adoption Catalog (`/adopt`)** for citizen applications.

---

### 🏡 Module 5: Animal Adoption & Public Rehoming Pipeline (`/brgy/adoptions`)

The **Animal Adoption Pipeline** connects impounded, unclaimed stray animals with loving community adopters, replacing prolonged shelter confinement with responsible rehoming.

```
┌─────────────────────────┐
│ Stray Secured in Kennel │
│ (facility_status = 1/2) │
└────────────┬────────────┘
             │ 7-Day Grace Period Expires (Unclaimed)
             ▼
┌─────────────────────────────────────────────────────────┐
│     Barangay Head Officer Promotes to Adoption          │
│   (facility_status = 6) ──► Published on `/adopt`       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│     Citizen Browses Catalog & Submits Application       │
│     (POST /adoptions/apply — Living space, experience)  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│     Barangay Head Officer Review (`/brgy/adoptions`)    │
│  • Screen applicant profile, living conditions & pets   │
│  • Decision: Approve / Reject / Request Interview       │
│  • On Approval: Auto-cancels other pending applicants   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│     Physical Handover & Adoption Completion             │
│  • Status 10: Released / Rehomed                        │
│  • facility_status = 7 (Adopted)                        │
│  • Pet QR Collar assigned to new owner                  │
│  • Custody Trail updated on Journey Map                 │
└─────────────────────────────────────────────────────────┘
```

#### 1. Public Adoption Catalog Integration (`/adopt`)
- When Barangay staff promote an animal (`facility_status = 6`), it automatically appears on the public `/adopt` portal.
- **Listing Transparency:** Each adoption card shows:
  - High-resolution sighting & facility photos.
  - Animal breed, age estimation, gender, color, and behavior tags.
  - Health notes (vaccination status, anti-rabies administration, medical clearance).
  - Facility Name and Caretaker Contact Number so prospective adopters can inquire or schedule visits.

#### 2. Adoption Application Review & Screening
- Accessible via the **Adoption Pipeline** module (`/brgy/adoptions` or directly from the Holding Facility management table).
- **Who Can Approve:** Restricted to **Barangay Head Officer** (`Role ID 5` or `Role ID 3` with `is_head_officer = 1`) or System Admin. Regular field staff have read-only access.
- **Applicant Dossier:** Review submitted application details:
  - Applicant full name, phone number, and residential address.
  - Housing type (Own home, apartment, fenced yard availability).
  - Household composition (presence of young children or elderly).
  - Existing pets and history with companion animals.
  - Reason for adopting and preparedness for veterinary care.
- **Action Buttons:**
  - **`Approve Application`**: Designates the applicant as the approved adopter. Automatically cancels any competing pending applications for the same animal with a notification: *"Another applicant was approved for this pet."*
  - **`Reject Application`**: Prompts staff to record a reason (e.g., inadequate living space, landlord restriction), notifying the applicant gently.
  - **`Schedule Interview / Visit`**: Facilitates an in-person meeting at the holding facility prior to final sign-off.

#### 3. Physical Handover & Adoption Sign-Off
- When the adopter arrives at the facility for pickup:
  1. Staff verifies the adopter's government-issued ID.
  2. Staff updates animal status to **`facility_status = 7 (Adopted)`** and the master incident report to **`Status 10 (Released / Rehomed)`**.
  3. **Instant Pet QR Collar Registration:** The system auto-links the animal to the adopter's account, generating an official **StraySafe Pet QR Code** and pet profile record.
  4. The kennel cage slot is immediately marked vacant and returned to available inventory.

#### 4. Custody Trail & Animal Journey Map (`/adopt/journey/:id`)
- StraySafe actively maintains a complete, permanent **Custody Trail** for every rescued animal:
  - 🔴 **Red Pin:** Original citizen sighting location (GPS coordinates, landmark, timestamp).
  - 🟠 **Orange Pin:** Subdivision temporary holding pen (intake timestamp, caretaker).
  - 🔵 **Blue Pin:** Barangay central holding facility (transfer date, veterinary logs).
  - 🟢 **Green Pin:** Adoption destination and rehoming timestamp.
- **Privacy Enforcement:** 
  - On the public journey view, the adopter's identity is anonymized (e.g., *"Adopted by Juan D. on Sep 10"*).
  - Under no circumstances is the adopter's exact residential street address exposed publicly or on late-claim screens.

#### 5. Legal Finality & Edge Cases:
- **Owner Claim while Listed "For Adoption" (`status = 6`):**
  - If a legitimate owner surfaces *before* handover, they may claim the animal with proof of ownership (vet records/photos).
  - Staff reverts status to `facility_status = 3 (Claimed)`.
  - All pending adoption applications are auto-cancelled with the message: *"Animal has been claimed by its original owner."*
- **Late Owner Claim after Adoption (`facility_status = 7` / `Status 10`):**
  - Once physical handover is complete, the adoption is **legally final** and non-reversible in the system.
  - If an original owner comes forward later, staff use the **"Log Late Owner Claim"** modal.
  - The system records the claim in the Custody Trail (`event_type = 'late_owner_claim'`).
  - The system displays the **adopter's name and contact number only** (never home address) so staff can facilitate private communication between the two parties.
- **Unclaimed / Expired Adoptions:**
  - If an approved adopter fails to collect the animal, staff can cancel the approval and return the animal to the catalog without penalty.

---

### 🏷️ Module 6: Pet Claims & Owner Reunification (`/brgy/pet-claims`)

When a resident submits a lost pet claim against an impounded animal during the 7-day grace period, it is processed in [`BrgyPetClaims.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx).

#### 1. Sighting vs Registered Pet Comparison
- **Visual Match Review:** Side-by-side comparison of the claimant's registered pet photo vs the impounded stray photo.
- **Geographic Proximity Analysis:** Computes straight-line and road distance between the registered home address and the stray animal pickup coordinates.
- **Physical Traits Comparison:** Breed, color, gender, estimated size, distinctive markings (collar, spots, scars).

#### 2. Ownership Proof Verification
- Inspects attached documents:
  - Veterinary health booklet and rabies vaccination cards.
  - Official pet registration certificate or purchase/adoption receipts.
  - Photos of owner with pet over time.

#### 3. Claim Lifecycle Progression
- `Pending Review` → Staff inspects submitted documentation.
- `Evidence Requested` → Sends in-app prompt to citizen requesting clearer proof or vaccination cards.
- `Approved` → Official authorization for pet release.
- `Handover Complete / Pet Received` → Physical release at the holding facility; transitions report to `Status 9: Claimed by Owner` and discharges animal from kennel.

---

### 🐾 Module 7: Pet Records & Collar QR Scanner (`/brgy/pet-records`)

Barangay officers can look up any registered pet across their jurisdiction in [`BrgyPetRecords.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPetRecords.tsx).

#### 1. Jurisdiction Registry
- Search by **Pet Name**, **Owner Name**, **Microchip ID**, **Breed**, or **QR Tag Token**.
- Filter by species (`Dog` vs `Cat`) and active vs archived pets.
- View detailed health profile: Vaccination dates, anti-rabies status, spay/neuter record, and emergency contact details.

#### 2. QR Collar Tag Scanning
- Clicking **"Scan QR Collar"** on the sidebar triggers [`QRScannerModal.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/components/Modals/QRScannerModal.tsx).
- Uses device camera or uploaded photo to scan a StraySafe Pet QR Collar Tag.
- **Instant Result:**
  - Immediately displays owner profile and one-tap phone call button.
  - Records a `pet_scans` audit record capturing the officer's GPS coordinates and timestamp, notifying the owner that their pet was scanned by Barangay authorities.

---

### 💬 Module 8: Operations Chat Hub (`/brgy/messages`)

The centralized messaging center ([`BrgyMessages.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyMessages.tsx)) unifies all field communication channels:

#### 1. Filter Tabs
- **My Missions:** Shows threads for incident reports assigned specifically to the logged-in staff member.
- **All Active:** Available to Barangay Head Officers to monitor all concurrent jurisdictional chats.
- **Past Cases:** Read-only archive of resolved cases, adoption handovers, and pet claim conversations.

#### 2. Chat Capabilities
- Real-time messaging with instant updates via backend polling and webhooks.
- Support for uploading scene photos and reference images.
- System announcement banners embedded directly in threads when statuses transition.

---

### 📢 Module 9: Community Safety Alerts (`/brgy/community-alerts`)

In [`BrgyCommunityAlerts.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyCommunityAlerts.tsx), Barangay officials broadcast public advisories directly to all residents in their jurisdiction:

#### 1. Alert Types & Severity
- 🔴 **Danger:** Aggressive stray warnings, confirmed rabies incidents, roaming wild pack sightings.
- 🟡 **Warning:** Cautionary notices (e.g., caution near school gates or park areas).
- 🔵 **Info:** Public service announcements (e.g., Free Rabies Vaccination Drive, Stray Animal Adoption Day).

#### 2. Lifecycle & Targeting
- Broadcasts appear instantly on the Citizen Home Feed banner.
- Staff can mark alerts as `Active`, `Resolved`, or `Expired`.

---

### 👥 Module 10: Personnel Management & Roster (`/brgy/personnel`)

The personnel view ([`BrgyPersonnelManagement.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyPersonnelManagement.tsx)) adapts dynamically depending on whether the user is the **Barangay Head Officer** or a **Regular Field Staff**:

#### 1. For Barangay Head Officers (Full Management Authority)
- **Add Personnel Account:** Create new accounts under their barangay (Name, Email, Password, Phone, Position).
- **Assign Positions:**
  - `Field Rescuer`
  - `Animal Control Officer`
  - `Holding Facility Caretaker`
  - `Dispatch Officer`
  - `Barangay Officer-in-Charge (OIC)`
  - `Animal Control Operations Head`
- **Granular Permissions:**
  - `Tactical Command` (Ability to authorize operations, approve adoptions, and sign off cases).
  - `Command Dispatch` (Ability to assign personnel teams).
- **Account Status Toggle:** Activate or suspend accounts (`Active` vs `Inactive`).
- **Personnel Deployment Tracker:** Real-time visibility into who is idle on standby vs currently assigned to an active mission.

#### 2. For Field Staff (Personnel Directory)
- Displays colleague directory with contact numbers and email addresses for field coordination.

---

### ⚙️ Module 11: Barangay Settings & Landmark Configuration (`/brgy/settings`)

In [`BrgySettings.tsx`](file:///c:/Users/user/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgySettings.tsx), Barangay staff configure jurisdictional rules across 7 tabs:

| Tab | Key Configurations |
| :--- | :--- |
| **Profile** | Officer name, contact email, phone, position, and profile avatar. |
| **Landmarks & Facilities** | Interactive Leaflet map picker to pin official landmarks, gates, clinics, and holding facilities with capacity and caretaker contacts. |
| **Holding & Adoption** | Quarantine observation days (default: 14), capacity alert threshold (default: 80%), unclaimed stray adoption grace period (default: 7 days). |
| **Dispatch** | Default rescue priority escalation, auto-geocoding, responder capacity limits. |
| **Alerts** | Audio alert sirens on incoming bite reports, SMS notifications, and email alerts. |
| **Security** | Secure password updates and session timeout settings. |
| **Preferences** | Map display defaults and auto-archive thresholds. |

---

## 4. Complete Status Progression & Facility Matrix

The table below outlines how incident reports and holding facility statuses transition through the Barangay workflow:

| Report Status ID | Status Name | Managed By | Holding Facility Status | Description & Operational Action |
| :---: | :--- | :---: | :---: | :--- |
| **1** | `Reported` | Citizen | — | Initial sighting submitted by resident with GPS and photo. |
| **2** | `Verified` | Subd Leader | — | Subdivision leader confirms report legitimacy. |
| **3** | `Rejected` | Subd / Brgy | — | Fake report, spam, or out-of-jurisdiction case closed with reason. |
| **4** | `Forwarded to Barangay` | Subd Leader | — | Escalated to Barangay with uploaded Endorsement Letter PDF. |
| **13** | `Approved by Barangay` | Brgy Staff | — | Barangay Head/Officer approves case for field operation planning. |
| **5** | `Team Dispatched` | Brgy Staff | — | Responders assigned (1-5 staff). Team en route with live GPS navigation. |
| **6** | `Picked Up` | Brgy Staff | — | Stray animal captured. Mandatory scene photo evidence uploaded. |
| **7** | `Under Observation` | Brgy Staff | `1: Need Treatment` | Admitted to holding facility for medical isolation and quarantine. |
| **8** | `Impounded` | Brgy Staff | `2: Healthy` | Animal placed in standard kennel cage. 7-day impound countdown starts. |
| — | *For Adoption* | Brgy Head | `6: For Adoption` | 7-day grace period expired unclaimed. Promoted to public `/adopt` catalog. |
| **9** | `Claimed by Owner` | Brgy Staff | `3: Claimed` | Pet claim verified; animal returned to original owner. |
| **10** | `Released / Adopted` | Brgy Head | `7: Adopted` | Approved citizen adopter completes physical pickup. Pet QR Collar issued. |
| — | *Transferred* | Brgy Staff | `5: Transferred` | Relocated between subdivision pen and central barangay shelter. |
| **11** | `Incident Resolved` | Brgy Staff | `3 / 7` | Case officially concluded and records archived. |
| **12** | `Deceased` | Brgy Staff | `4: Deceased` | Animal succumbed to injuries or disease. Logged in medical records. |
| **14** | `Case Dismissed` | Brgy Staff | — | False alarm or incident settled on arrival. |
| **17** | `Animal Not Found` | Brgy Staff | — | Field team conducted thorough search but animal was not located. |

---

## 5. Frontline Playbook: Step-by-Step Field Operation

Here is a practical step-by-step guide for a Barangay Field Rescuer and Shelter Caretaker on duty:

### Step 1: Receiving Assignment
1. Log in to `/staff/login`.
2. Inspect the **Incident Reports** (`/brgy/rescue-requests`) or **Messages** (`/brgy/messages`).
3. Look for cases marked `Status 5: Team Dispatched` with your name on the responder card.

### Step 2: Tactical Navigation to Scene
1. Open the report details page (`/brgy/reports/:id`).
2. Review the **AI Urgency Badge** and **Behavior Notes** (Check if animal has bite history or visible rabies signs).
3. In the **Incident Navigation Map**, select **"Navigate from Current Location"**.
4. Follow the live route navigation directly to the incident pin.

### Step 3: Scene Assessment & Capture
1. Arrive on site and locate the animal.
2. If gates are locked or animal has moved, use the **Incident Chat Drawer** to message the resident reporter directly.
3. Secure the animal using humane animal control poles, safety gloves, or transport cages.

### Step 4: Status Update & Photo Evidence
1. On the report view, click **"Update Status"**.
2. Select **`Picked Up (Status 6)`**.
3. Select animal physical condition: `Healthy`, `Injured`, or `Need Treatment`.
4. Click **"Choose Evidence Photos"** and upload a photo showing the secured animal in the rescue transport vehicle.
5. Click **Submit**. Status updates immediately across Citizen and Subdivision feeds.

### Step 5: Facility Intake & Impound Care
1. Transport animal to the designated Holding Facility (e.g., Selera Holding Pen or Barangay Central Facility).
2. On the report view or Holding Facility page, update status to **`Under Observation (Status 7)`** or **`Impounded (Status 8)`**.
3. Select the facility name from the dropdown.
4. Open `/brgy/holding-facility`, locate the animal entry, assign a **Kennel Slot** (e.g., `Cage 02`), and submit an initial intake log.
5. Monitor daily feeding and health logs during the 7-day impoundment countdown.

### Step 6: Adoption Turnover & Rehoming Handover
1. Once 7 days expire unclaimed, the Head Officer promotes the pet to the **Adoption Catalog (`facility_status = 6`)**.
2. When an adopter's application is approved:
   - Staff coordinates the pickup schedule at the facility.
   - Staff verifies adopter ID and conducts final health check.
   - Staff marks animal as **`facility_status = 7 (Adopted)`** and **`Status 10 (Released / Adopted)`**.
   - Staff issues and assigns a new **StraySafe Pet QR Collar Tag** registered to the adopter.
   - The Custody Trail Journey Map is updated with the final green adoption milestone.

---

## 6. Security, Jurisdictional Isolation & Audit Trails

1. **Strict Jurisdictional Multi-Tenancy:**
   - Barangay personnel can only view reports originating from subdivisions assigned to their `barangay_id`.
   - Any attempt to access reports from another barangay returns a `404 Not Found or Outside Jurisdiction` error.
2. **Designated Head Officer Authority:**
   - System Admin designates exactly one Head Officer per Barangay via the Admin portal.
   - High-level operations (personnel creation, permission modification, mission dispatch, adoption approvals) require Head Officer credentials or explicit tactical command authorization.
3. **Adopter Privacy Protection:**
   - Adopter home address is never exposed in public journey feeds or late owner claim logs. Only verified staff have access to contact numbers for legitimate operational mediation.
4. **Comprehensive Audit Ledger:**
   - Every status update, team assignment, evidence upload, pet claim resolution, and adoption handover records the exact user ID, role, and timestamp in `status_history`, `rescue_assignments`, `holding_timeline`, and `audit_logs`.
