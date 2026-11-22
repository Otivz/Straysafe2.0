# STRAY-SAFE 2.0 — Evaluation Packet for IT Expert

**System Overview, Documentation, Evaluation Criteria, and Data Privacy Notice**  
**Prepared:** November 2026  
**Researchers:** Arriola, Kyla Joy; Frias, Kyla Bianca S.; Vito Cruz, Emmanuel F.  
**Adviser:** Herliza F. Estrada, M.I.T.  
**Institution:** Dr. Yanga's Colleges, Inc. (DYCI) — Technology & Engineering for Humanity, Bocaue, Bulacan  

---

## 1. Core Purpose and Rationale

Subdivision communities such as **Selera Homes Subdivision, Barangay San Vicente, Santa Maria, Bulacan** frequently face animal-welfare and public-safety concerns involving roaming strays, escaped pets, aggressive/bite-threat animals, and community-rule violations. Traditional pet tags often expose owners' personal phone numbers and home addresses (creating privacy risks under **Republic Act No. 10173**), static paper HOA logs fail to maintain current pet and vaccination records (under **Republic Act No. 9482**), and informal reporting leaves incidents unverified, untracked, or prematurely escalated.

**STRAY-SAFE 2.0 — Smart Stray Animal Reporting and Rescue System** — was developed to address these gaps through a structured, privacy-first, and human-in-the-loop community animal management platform. Guided by the five core operational pillars of **Detect • Validate • Rescue • Monitor • Protect**, STRAY-SAFE 2.0 equips residents and subdivision administrators with QR-based smart pet recovery (including physical QR collar requests and public/in-app scanning), verified pet health profiles, geofence-validated incident reporting, neighborhood lost-pet alerts, owner-first manual matching and possible-owner verification, an owner-compliance observation and tiered warning workflow, formal multi-organization external referrals (Barangay, Veterinary Office, Animal Welfare, Animal Control, and partner agencies), and analytics with CSV export.

**General Problem:** How can STRAY-SAFE 2.0 be designed and evaluated as a centralized, privacy-conscious, and human-in-the-loop community animal reporting and management system that streamlines incident triage, supports owner-first pet recovery and responsible pet ownership compliance, generates formal external agency referrals when escalation is required, and meets software quality and user acceptance standards?

---

## 2. Objectives of the Study

**General Objective:** To design, develop, and evaluate STRAY-SAFE 2.0, an integrated web and Android platform that supports subdivision-level stray and lost-pet reporting, QR smart recovery, incident triage, owner-first matching, compliance observation and tiered warnings, formal multi-organization external referrals, and analytics.

**Specific Objectives:**
1. Develop a role-based platform supporting **Residents** (via web at `/resident-app` and native **Android APK**), **Subdivision Administrators / Leaders** (via the web portal at `/`), and unauthenticated **Public QR Finders** (via `/t/<token>`).
2. Implement privacy-preserving **Pet QR Smart Recovery Tags**, **QR Collar Requests**, and a **Resident Pet Registry** that mask sensitive owner details on public scans while maintaining dynamic age calculations and rabies vaccination records (RA 9482 and RA 10173).
3. Implement geofence-validated **Citizen Stray & Incident Reporting** (`lost_pet`, `found_animal`, `nuisance`, `injured`, `safety` across `Dog`, `Cat`, and `Others`) and a **Lost Pet Alert & Neighborhood Sighting Network** restricted to authorized subdivision boundaries.
4. Provide **Subdivision Administrator Incident Triage** with live interactive Leaflet maps, priority pins, a 4-stage case lifecycle (`reported`, `under_review`, `in_progress`, `closed`), and an **Owner-First Manual Matching & Possible Owner Verification Module** that treats AI suggestions strictly as advisory and requires explicit owner confirmation.
5. Implement an **Owner-Compliance Observation & Tiered Warning** workflow (including customizable warning letter templates and 2nd-warning office summons) and a **Multi-Organization External Referral** module that generates formal referral records for severe cases exceeding subdivision handling capacity.
6. Provide **Analytics, CSV Exports, and Audit Logs** to track case resolution rates, species/category breakdowns, and immutable system accountability trails.
7. Evaluate STRAY-SAFE 2.0's software product quality and user acceptance using an IT Expert validation instrument grounded in **ISO/IEC 25010:2023** and the **Technology Acceptance Model (TAM)**.

---

## 3. System Overview & End-to-End Navigation Cycle

- **Target Environment:** Responsive web application and native Android Resident APK piloted for **Selera Homes Subdivision, Barangay San Vicente, Santa Maria, Bulacan**.
- **Technology Stack & Components:** React/TypeScript frontend (web + Capacitor Android APK) and FastAPI/MySQL backend integrated with **Cloudinary** for high-definition image storage, **Leaflet** for interactive cluster/priority-pin mapping and geofence boundary controls, Web Push & Android FCM notifications, advisory AI image checks, and append-only audit logging.
- **Access Model:** Role-Based Access Control (RBAC) routing authenticated **Residents** to `/resident-app/*` (or the Android APK) and **Subdivision Administrators / Leaders** to `/*`, paired with unauthenticated public QR scan pages (`/t/<token>`) that mask private owner addresses and emails.

### User Roles (2 Authenticated Portals + Public QR Access)
- **Resident (`/resident-app` & Android APK)** — registers pets, views/downloads Pet QR tags, submits **QR Collar Requests**, monitors scan history, scans tags using the in-app QR scanner (`/resident-app/scan`), submits geofence-validated stray/lost/incident reports, submits neighborhood sightings, responds to **Possible Pet Owner Verification** prompts, exchanges 1-to-1 messages with admins, and submits compliance observation updates.
- **Subdivision Administrator / Leader (`/`)** — serves as the frontline neighborhood authority; monitors KPI cards and the live Leaflet incident map (`/dashboard`), manages the 4-stage case lifecycle (`/cases`), reviews resident complaints and enforcement steps (`/complaints`), performs side-by-side owner-first manual matching, manages owner-compliance observations and tiered warnings (`/warning-templates`), logs **multi-organization external referrals** (Barangay, Veterinary Office, Animal Welfare, Animal Control, etc.), fulfills **QR Collar Requests** (`/pets`), manages residents (`/residents`), views analytics with CSV export (`/analytics`), and configures **Subdivision Info** and **External Coordination** settings (`/settings`).
- **Public Finder (Unauthenticated, `/t/<token>`)** — scans a pet's collar QR tag via a standard smartphone camera without logging in or installing an app, views masked public pet/vaccination info, and submits finder contact details, notes, and recovery location.

### End-to-End Operational Navigation Cycle

For IT Experts evaluating STRAY-SAFE 2.0, navigating the system follows a closed-loop **Detect → Validate → Rescue → Monitor → Protect** lifecycle across its core modules:

> `Registry & QR Tag` → `Incident / Lost Report` → `Admin Triage & Live Map` → `Owner-First Matching` → `Observation & Warnings OR External Referral` → `Analytics & Audit Loop`

1. **Stage 1 — Pet Registration, QR Smart Tags & Collar Requests (Resident):** Residents register pet profiles (species `Dog`/`Cat`, breed, coat markings, birth date for auto-calculated age, temperament, bite/chase history, and vaccination dates), receive a permanent unique QR tag, and may request a physical QR collar. Any finder can scan the QR tag publicly at `/t/<token>` (or via `/resident-app/scan`) to submit their contact details and GPS pin while keeping the owner's address and email masked.
2. **Stage 2 — Citizen Incident Reporting & Lost-Pet Broadcasts (Resident):** Residents file reports across five categories (`lost_pet`, `found_animal`, `nuisance`, `injured`, `safety`) and three animal types (`Dog`, `Cat`, `Others`) pinned within the Selera Homes geofence with photo/video evidence, or respond to Lost Pet Alerts with photo-backed GPS sightings.
3. **Stage 3 — Frontline Incident Triage & Live Map Review (Subdivision Administrator):** The Subdivision Administrator reviews incoming reports on `/dashboard` and `/cases` using KPI cards and color-coded Leaflet priority pins, moving cases through the 4-stage lifecycle (`reported` → `under_review` → `in_progress` → `closed`) with structured assessment.
4. **Stage 4 — Owner-First Manual Matching & Possible Owner Verification (Admin & Resident):** Before treating a verified roaming animal as an unowned stray, the Administrator compares candidate pairs side-by-side against registered pets and sends a **Possible Pet Owner Verification** prompt (*"Is this your pet?"* with side-by-side photos) to the suspected owner—requiring explicit owner confirmation (`Yes`/`No`) rather than relying on AI scores or treating "no response" as a match.
5. **Stage 5 — Resolution Path A: Owner-Compliance Observation & Tiered Warnings (Admin & Resident):** For minor community-rule violations (e.g., unleashed roaming or nuisance barking), the Administrator initiates an observation period and issues customizable tiered warnings (including 2nd-warning office summons). The owner acknowledges the warning, uploads corrective photo proof, and the Administrator closes the case once compliance is verified.
6. **Stage 6 — Resolution Path B: Multi-Organization External Referral & Escalation (Subdivision Administrator):** For high-risk cases exceeding subdivision capacity (e.g., severe bite threats, suspected rabies symptoms, or continued non-compliance), the Administrator logs a formal **External Referral** to the appropriate partner agency (**Barangay**, **Veterinary Clinic/Office**, **Municipal/City Vet**, **Animal Welfare**, **Animal Control**, or **Other**) with tracking reference, incident summary, timestamps, and supporting documents.
7. **Stage 7 — Analytics, CSV Export & Audit Accountability (Subdivision Administrator):** All actions across modules feed into `/analytics` (resolution rates, species/category charts, and CSV exports) and immutable audit trail records, closing the feedback loop for targeted community interventions.

---

## 4. Scope and Delimitation

- **Advisory-Only AI & Human-in-the-Loop Decisions:** Automated image checks are strictly advisory. AI outputs never establish pet ownership or trigger automated enforcement; all report verifications, manual matches (requiring explicit owner confirmation), compliance resolutions, and external referrals are executed through human review.
- **Subdivision-Level Frontline Governance & Multi-Organization External Referral:** Frontline operational workflows (triage, manual matching, observation, and tiered warnings) operate at the subdivision level within Selera Homes, while severe or unresolvable cases are handed over via documented External Referral records to partner agencies (Barangay, Veterinary Office, Animal Welfare, Animal Control, etc.).
- **Data Privacy & Masking Controls (RA 10173):** Public QR tag scanning (`/t/<token>`) requires no login and intentionally masks the pet owner's exact house address and personal email address, exposing only authorized emergency/pet details and an append-only finder submission form.
- **Connectivity & Third-Party Service Dependencies:** Requires active internet connectivity to render Leaflet map tiles, load Cloudinary-hosted pet/incident images, and process push/QR scan notifications.

---

## 5. Theoretical & Evaluation Foundations

- **ISO/IEC 25010:2023 Software Product Quality Model:** Assesses technical product quality across all nine standard quality characteristics: **Functional Suitability, Performance Efficiency, Compatibility, Interaction Capability, Reliability, Security, Maintainability, Flexibility, and Safety**.
- **Technology Acceptance Model (TAM):** Evaluates behavioral acceptance through **Perceived Usefulness (PU)** and **Perceived Ease of Use (PEOU)**.
- **Statutory & Privacy Alignment:** Supports community rabies prevention and pet registration under the **Anti-Rabies Act of 2007 (Republic Act No. 9482)** and enforces personal data masking and informed consent under the **Data Privacy Act of 2012 (Republic Act No. 10173)**.

---

## 6. Core Functionality by Module & Actual Routes

| Module | Primary Role(s) | Core Functionality & Routes |
| --- | --- | --- |
| **Module 1: Pet QR Smart Recovery Tag & Collar Requests** | Resident, Admin & Public Finder | Generates permanent unique QR tags per registered pet (`/resident-app/pets`) and supports **QR Collar Requests** (`Pending` → `Accepted` → `Ready for Pickup` → `Completed`, managed by Admin at `/pets`). Public scan page (`/t/<token>`) and in-app scanner (`/resident-app/scan`) mask owner address/email and let finders submit contact/notes/location. |
| **Module 2: Resident Pet Registry & Health Profile** | Resident | Digital pet accountability profiles (`/resident-app/pets`) storing Cloudinary photos, species (`Dog`/`Cat`), breed, markings, temperament, bite/chase history, auto-calculated age from birth date, and rabies vaccination records (RA 9482). |
| **Module 3: Citizen Stray & Incident Reporting** | Resident | Geofence-restricted incident reporting (`/resident-app/report`) capturing report category (`lost_pet`, `found_animal`, `nuisance`, `injured`, `safety`), animal type (`Dog`, `Cat`, `Others`), visible characteristics, mandatory photo/video evidence, and map pin, with real-time stage tracking (`/resident-app/reports`). |
| **Module 4: Lost Pet Alert & Neighborhood Sighting Network** | Resident & Admin | Allows owners to file a Lost Pet report from a registered pet profile and lets neighbors view community notices (`/resident-app/community`) and submit GPS-pinned sightings for Admin verification. |
| **Module 5: Subdivision Admin Triage & Live Map** | Subdivision Administrator | Frontline dashboard (`/dashboard`) with KPI cards, attention queue, interactive Leaflet cluster/priority map, and Cases work queue (`/cases`) supporting the 4-stage lifecycle (`reported`, `under_review`, `in_progress`, `closed`). |
| **Module 6: Owner-First Matching & Possible Owner Verification** | Subdivision Administrator & Resident | Rule-based Lost & Found + Related Report matching (`/cases`) and **Possible Pet Owner Verification** sending side-by-side photo comparison prompts (*"Is this your pet?"*) requiring explicit owner confirmation (`Yes`/`No`). |
| **Module 7: Responsible Pet Ownership Observation, Complaints & Tiered Warnings** | Subdivision Administrator & Resident | Manages complaints (`/complaints`), observation periods, and customizable warning letter templates (`/warning-templates`) including 1st/2nd/3rd warnings and 2nd-warning office summons, with owner corrective photo proof and 1-to-1 messaging (`/messages`, `/resident-app/messages`). |
| **Module 8: Multi-Organization External Referral & Escalation** | Subdivision Administrator | Escalates high-risk cases to partner agencies (**Barangay**, **Veterinary Clinic/Office**, **Municipal/City Vet**, **Animal Welfare**, **Animal Control**, **Other**) via Case Actions, configured under **Settings → External Coordination** (`/settings`), producing documented referral records with tracking reference, summary, timestamps, and supporting documents. |
| **Module 9: Analytics, CSV Export & Settings** | Subdivision Administrator | Displays case resolution metrics, species/category breakdowns, and CSV exports (`/analytics`), resident registry (`/residents`), pet & QR collar registry (`/pets`), separated **Subdivision Info & Contact** and **External Coordination** settings (`/settings`), and append-only audit logs. |

---

## 7. Safety, Privacy & Human-in-the-Loop Specification

- **Privacy-by-Design QR Masking (RA 10173):** Public QR scans (`/t/<token>`) intentionally withhold the pet owner's exact house number and personal email address, routing finder contact details and recovery coordinates directly to the owner's authenticated alert feed without exposing private household data.
- **Owner-First & Advisory-AI Safeguards:** AI image checks serve solely as non-binding decision support. Manual matching and **Possible Pet Owner Verification** require affirmative owner confirmation (`Yes`) before linking a roaming animal to a registered owner, ensuring "no response" is never misclassified as a negative match.
- **Proportional Escalation & Public Safety:** Low-level pet violations are resolved constructively within the subdivision through observation and tiered warnings, whereas severe bite threats or suspected rabies cases are formally documented and escalated via External Referrals to the Barangay, Veterinary Office, or Animal Control.

---

## 8. Definition of Terms

- **External Referral** — A formal referral record generated by a Subdivision Administrator containing tracking references, evidence, timestamps, and case history to escalate severe or specialized animal incidents to partner organizations (Barangay, Veterinary Office, Animal Welfare, Animal Control, etc.).
- **Geofence Validation** — Boundary control configured in Subdivision Settings restricting incident report pins to the authorized Selera Homes Subdivision coverage area.
- **ISO/IEC 25010:2023** — The international software product quality standard comprising nine characteristics used to evaluate STRAY-SAFE 2.0's technical quality.
- **Owner-First Manual Matching & Possible Owner Verification** — Side-by-side comparison of reported roaming animals against registered pets that prioritizes human evidence inspection and explicit owner confirmation (`Yes`/`No`) over automated AI scores.
- **Pet QR Smart Recovery Tag & QR Collar Request** — A permanent unique QR token assigned to each registered pet (with an in-app request workflow for physical QR collars) that opens a login-free public scan page (`/t/<token>`) while masking the owner's private address and email.
- **Technology Acceptance Model (TAM)** — Behavioral evaluation framework measuring user acceptance via Perceived Usefulness (PU) and Perceived Ease of Use (PEOU).
- **Compliance Observation & Tiered Warnings** — A structured corrective compliance period initiated by a Subdivision Administrator for minor pet violations, tracked via inspection logs, customizable warning letters (including 2nd-warning office summons), and owner photo proof.

---

## 9. University-Prescribed Evaluation Criteria

IT Experts evaluate STRAY-SAFE 2.0 using the **STRAYSAFE Software Quality & Acceptance Questionnaire (ISO/IEC 25010:2023 & TAM)** on a mandatory **4-point forced-choice Likert scale** (no neutral midpoint):
- **4** — Strongly Agree
- **3** — Agree
- **2** — Disagree
- **1** — Strongly Disagree

### Scoring Breakdown
- **Part 1 — ISO/IEC 25010:2023 Software Quality** (36 items across 9 characteristics; max 16 points each, 144 points total): Functional Suitability, Performance Efficiency, Compatibility, Interaction Capability, Reliability, Security, Maintainability, Flexibility, and Safety.
- **Part 2 — Technology Acceptance Model** (8 items across 2 constructs; max 16 points each, 32 points total): Perceived Usefulness (PU) (4 items) and Perceived Ease of Use (PEOU) (4 items).
- **Overall Recommendation & Qualitative Feedback:** Evaluators select one deployment readiness verdict (*Accept the system as ready for deployment*, *Accept with minor improvements recommended*, *Accept after major improvements*, or *Not ready — requires significant rework*) and provide specific technical recommendations.

---

## 10. Data Privacy & Informed Consent (RA 10173)

Participation in evaluating STRAY-SAFE 2.0 is voluntary, and evaluators may decline to answer any question at any time. All data processed during the evaluation—including user identifiers, stray animal reports, incident GPS locations, uploaded media, and survey responses—are handled strictly in accordance with the **Data Privacy Act of 2012 (Republic Act No. 10173)**. Responses are consolidated solely for statistical and research purposes, kept confidential, restricted exclusively to the researchers and their thesis adviser, and destroyed once the study has been completed and officially defended.
