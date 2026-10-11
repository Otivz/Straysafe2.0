# StraySafe 2.0 — System Features & Functionality Manual

> **StraySafe 2.0** is an integrated animal welfare, stray management, lost-and-found pet recovery, and adoption lifecycle platform designed for local government units (Barangays), homeowner subdivisions, and community residents.

---

## 📌 Table of Contents
1. [Platform Overview & Objectives](#1-platform-overview--objectives)
2. [User Roles & Permissions Matrix](#2-user-roles--permissions-matrix)
3. [Resident & Citizen Features](#3-resident--citizen-features)
4. [Subdivision Leader Features](#4-subdivision-leader-features)
5. [Barangay Staff & Head Officer Features](#5-barangay-staff--head-officer-features)
6. [System Administrator Features](#6-system-administrator-features)
7. [Core Technical Subsystems](#7-core-technical-subsystems)
8. [Database Schema & Architecture Summary](#8-database-schema--architecture-summary)

---

## 1. Platform Overview & Objectives

StraySafe 2.0 connects citizens, subdivision leaders, and barangay officials in a centralized digital ecosystem to:
- **Accelerate Stray Animal Reporting & Rescue:** Enable real-time incident reports with photos, GPS coordinates, landmarks, and severity levels.
- **Prevent Pet Loss via AI & QR IDs:** Match lost pet reports with rescued strays using visual AI matching, and provide scannable QR Pet Cards.
- **Manage Holding Facilities Transparently:** Track animal health status, kennel assignments, holding timers, and disposition records.
- **Streamline Pet Claiming:** Ensure pets are returned only to verified owners through documented proof of ownership.
- **Standardize the 6-Stage Adoption Lifecycle:** Provide an end-to-end adoption management pipeline with verified assessments, digital certificate generation, and 30-day welfare monitoring.
- **Enhance Public Safety:** Broadcast community hazard alerts (e.g., rabies risks, aggressive stray packs) and maintain spatial incident heat maps.

---

## 2. User Roles & Permissions Matrix

| Feature / Capability | Citizen / Resident | Subdivision Leader | Barangay Staff / Tanod | Barangay Head Officer | System Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Report Stray / Lost Pet** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Register Personal Pet & QR Card** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AI Match Suggestions & Review** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **File Pet Claim** | ✅ | — | — | — | — |
| **Apply for Pet Adoption** | ✅ | — | — | — | — |
| **Subdivision Reports & Escalation** | — | ✅ | — | — | ✅ |
| **Subdivision Holding Facility** | — | ✅ | — | — | ✅ |
| **Subdivision Hazard Alerts** | — | ✅ | — | — | ✅ |
| **Barangay Rescue Requests** | — | — | ✅ | ✅ | ✅ |
| **Barangay Holding Facility** | — | — | ✅ | ✅ | ✅ |
| **Perform Assigned Adoption Tasks** | — | — | ✅ | ✅ | ✅ |
| **Adoption Dossier & Stage Approval** | — | — | Read-Only | ✅ | ✅ |
| **Generate Adoption Certificate** | — | — | View / Print | ✅ | ✅ |
| **Manage Barangay Personnel** | — | — | — | ✅ | ✅ |
| **Community-wide Hazard Broadcasts** | — | — | ✅ | ✅ | ✅ |
| **GIS Incident Heat Map** | — | — | — | — | ✅ |
| **System Audit Logs & Warnings** | — | — | — | — | ✅ |

---

## 3. Resident & Citizen Features

The Citizen portal empowers pet owners and community residents with tools for pet safety, adoption, and reporting:

### 3.1. Incident & Stray Animal Reporting
- **Multi-Category Reporting:** Report stray dogs/cats, aggressive strays, injured animals, abandoned pets, bite incidents, and lost pets.
- **Location & Landmarks:** Pin exact incident locations with interactive map support, automatic address detection, and nearby landmark tagging.
- **Photo Evidence:** Upload high-resolution photos with automatic client-side image compression.
- **Real-time Incident Status & Timeline:** Track reporting progress (`Submitted`, `Acknowledged`, `Dispatched`, `Rescued`, `Impounded`, `Resolved`).
- **Interactive Case Chat:** Chat directly with barangay responders and subdivision leaders regarding the reported animal.

### 3.2. Pet Registry & Digital QR Identity
- **Pet Profile Registration:** Store pet details (name, species, breed, color, age, gender, sterilization, vaccination records, and microchip numbers).
- **Digital QR Pet Card:** Instant generation of a printable/shareable digital QR code card.
- **Smart QR Scanning:** When someone scans a lost pet's QR tag:
  - The owner receives an immediate notification with the scan timestamp and approximate GPS location.
  - The finder sees the pet's public safety profile and emergency contact buttons.
- **Scan History Log:** Track when and where a pet's QR code was scanned.

### 3.3. AI-Powered Lost & Found Matching
- **Automated Visual Matching:** When a stray is impounded or reported, the AI engine compares it against registered lost pets.
- **Match Confidence Score:** Residents receive visual match alerts with similarity percentage scores.
- **Match Review Dashboard:** Side-by-side photo comparison to confirm or dismiss potential pet matches.

### 3.4. Pet Ownership Claiming
- **Claim Filing:** File an ownership claim on animals currently in the subdivision or barangay holding facility.
- **Proof of Ownership Verification:** Upload vet records, vaccination certificates, purchase/adoption receipts, and old photos with the pet.
- **Claim Status Tracking:** Follow claim review (`Pending Review`, `Approved for Release`, `Claimed`, `Rejected`).

### 3.5. Public Adoption Catalog & Applications
- **Browse Adoptable Animals:** View rescue animals ready for adoption with health status, temperament, size, age, and photos.
- **Online Adoption Application:** Submit adoption applications specifying residential living space, household agreement, pet care experience, and valid government ID.
- **Adoption Journey Stepper:** Track application progress across the 6 consolidated stages in real-time.
- **Adopter-Barangay Messaging:** In-app chat with barangay staff for interview scheduling, queries, and document submission.
- **Digital Deed of Commitment Signing:** Digitally sign the adoption agreement once approved.
- **Public Certificate Verification:** Verify the authenticity of any StraySafe adoption certificate using the SHA-256 seal verification link.

---

## 4. Subdivision Leader Features

Designed for Homeowners Association (HOA) officers and subdivision security leaders:

### 4.1. Subdivision Incident Dashboard
- View all incident reports originating inside the subdivision borders.
- Filter reports by status, urgency, and category.
- Triage and handle incidents locally or escalate complex cases to the Barangay Welfare Center.

### 4.2. Temporary Subdivision Holding Facility
- Manage temporary holding pens for impounded strays prior to barangay transfer.
- Track intake timestamps, feeding/medical notes, and holding countdowns.
- Process local pet claims for subdivision residents before transferring animals to the barangay.

### 4.3. Neighborhood Hazard Alerts
- Issue localized hazard notifications to subdivision residents (e.g., stray pack sightings, rabies advisory, curfew notices).

### 4.4. Subdivision Pet Records
- Maintain a neighborhood directory of registered resident pets.
- Fast identification of roaming pets belonging to subdivision homeowners.

---

## 5. Barangay Staff & Head Officer Features

The operational core of the platform for municipal animal welfare officers and barangay tanods:

### 5.1. Barangay Master Dashboard
- **Operational Metrics:** Real-time counts of total applications, active rescues, animals in holding, adoptable catalog pets, and pending reviews.
- **Fast Search & Multi-Filters:** Filter applications by status (`All`, `Pending`, `Approved`, `Rejected`, `Cancelled`) and stage.

### 5.2. Rescue Dispatch & Incident Operations
- Receive escalated reports from subdivisions and direct citizen submissions.
- Dispatch barangay rescue personnel with route and landmark navigation.
- Log rescue evidence, officer remarks, and intake animals into the facility.

### 5.3. Barangay Holding Facility Management
- **Intake Logging:** Record animal species, estimated age, gender, health status, and cage/kennel assignment.
- **Holding Period Countdown:** Automated timer tracking legal holding duration before making animals eligible for adoption.
- **Disposition Tracking:** Record whether an animal was claimed, adopted, relocated to a sanctuary, or humanely treated.

### 5.4. Simplified 6-Stage Adoption Lifecycle Management
The adoption pipeline is consolidated into **6 clear stages** while preserving all detailed procedures:

1. **1. Apply (Application):**
   - Review incoming resident adoption applications.
   - Initial verification of applicant identity and residential details.

2. **2. Assess (Applicant Evaluation):**
   - **Subtask A — Applicant Verification:** Verify government ID, proof of residency, and check blacklist history.
   - **Subtask B — Interview Assessment:** Schedule, conduct, and record virtual or in-person interview sessions on pet care knowledge and commitment.
   - **Subtask C — Home Visit Inspection:** Schedule and record on-site living space and perimeter fence security inspection with photo evidence.

3. **3. Review (Consolidated Dossier Evaluation):**
   - Comprehensive review of all verification results, interview ratings, and home visit inspection scores in a unified dossier.
   - Staff recommendations and formal dossier endorsement.

4. **4. Approve (Final Decision & Certification):**
   - **Official Approval Decision:** Barangay Head Officer final approval.
   - **Digital Adoption Certificate Generation:** System generates the official StraySafe certificate sealed with an immutable SHA-256 cryptographic hash.
   - **Adoption Agreement:** Generation of the Deed of Commitment for adopter signature.

5. **5. Handover (Official Animal Release):**
   - Handover schedule coordination (date, time, facility location).
   - Dual-confirmation sign-off: Staff confirmation + Adopter physical release receipt with photo evidence.

6. **6. Monitor (Post-Adoption Welfare & Closure):**
   - 30-day post-adoption welfare monitoring tracking milestones (Day 7, Day 14, and Day 30).
   - Log home check-ins, pet health photos, and adopter feedback.
   - Official case closure marking the adoption as **Successfully Completed**.

### 5.5. Adoption Tasks (Field Work Delegation)
- **Task Assignment:** Head Officer can assign specific field procedures (interviews, home visits, handover, monitoring check-ins) to individual Tanod/staff members.
- **Staff Work Queue:** Staff see assigned tasks under `New`, `To Do`, `Completed`, and `Declined`.
- **Enforced Accountability:** Only the assigned officer can record evaluations, ensuring clear audit ownership.

### 5.6. Personnel Management
- Register and manage barangay animal welfare staff, tanods, and officers.
- Role-based permissions (Head Officer vs. Field Tanod).
- Track active workload and assigned tasks per staff member.

### 5.7. Community Alerts Broadcast
- Broadcast emergency alerts to all registered barangay residents (SMS/In-app push notifications).

---

## 6. System Administrator Features

System-wide governance, security, and oversight tools:

### 6.1. Administrative Analytics & GIS Heat Map
- **Spatial Incident Heatmap:** Geographical distribution of stray sightings, animal bites, and rescue operations across barangays.
- **Trend Analytics:** Incident volume over time, adoption success rates, and facility turnaround times.

### 6.2. User & Barangay Management
- Master management of all user accounts across resident, subdivision leader, and barangay staff tiers.
- Account activation, deactivation, password resets, and role assignments.
- Barangay and subdivision territory configuration.

### 6.3. Security & Audit Trail
- **System Audit Logs:** Immutable audit log tracking sensitive actions (status overrides, approvals, rejections, logins, and data modifications).
- **Incident Warnings & Blacklists:** Issue system warnings and maintain blacklists for abusive users or neglectful adopters.

---

## 7. Core Technical Subsystems

### 7.1. SHA-256 Digital Adoption Certificate Verification
- Each approved adoption generates a unique certificate number.
- System creates an SHA-256 hash digest combining adoption ID, certificate number, adopter identity, animal holding ID, and timestamp.
- Anyone can scan the certificate QR code or visit `/verify-adoption-cert` to confirm authenticity against the database.

### 7.2. Real-Time Chat & Unread Notifications Engine
- WebSocket / polling-based messaging drawer integrated into each adoption and rescue incident.
- Role-scoped message routing ensuring private conversations between authorized staff and residents.
- Dynamic unread count badges across navigation sidebars and task cards.

### 7.3. Client-Side Image Compression
- Automatic browser-level compression of photos before upload to ensure fast uploads on low-bandwidth mobile connections.

---

## 8. Database Schema & Architecture Summary

### Backend Stack
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL / SQLite with SQLAlchemy ORM
- **Authentication:** OAuth2 JWT bearer tokens with role-based access control (RBAC)
- **Security:** bcrypt password hashing, cryptographic SHA-256 certificate hashing

### Frontend Stack
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Vanilla CSS & TailwindCSS utility tokens (custom theme: orange, peach, navy, slate)
- **Icons:** Lucide React
- **State & Networking:** Axios with unified API interceptors

---

*Document generated for StraySafe 2.0 Community Animal Welfare System.*
