# STRAY-SAFE 2.0 — Presentation Demo Flow, Scenario & Script

**System:** STRAY-SAFE 2.0 — Smart Stray Animal Reporting and Rescue System  
**Pilot Community:** Selera Homes Subdivision, Barangay San Vicente, Santa Maria, Bulacan  
**Estimated Duration:** 10–12 Minutes

---

## 1. Demo Cast & Connected Storyline

All eight parts follow **one continuous story** so panelists can easily trace how data flows from Resident to Public Finder to Subdivision Administrator:

- **Resident (`Emmanuel Vito Cruz`):** Registers his cat **Nico** in the Resident App (Web / Android APK) and requests a physical **QR Collar**.
- **Public Finder (Unauthenticated Phone):** Scans **Nico's Pet QR Tag** at `/t/<token>` when Nico wanders near the clubhouse, without logging in.
- **Subdivision Administrator (`Kyla Bianca Frias`):** Triages incoming reports on the Admin Web Portal, verifies ownership with Emmanuel, demonstrates tiered warnings and multi-organization **External Referrals**, fulfills Nico's **QR Collar Request**, and presents **Analytics**.

---

## 2. Pre-Demo Checklist

- **Device 1 — Resident App** (`/resident-app` or Android Debug APK): Logged in as `emmanuelvitocruz@gmail.com` / `Password123_`
- **Device 2 — Admin Web Portal** (`/`): Logged in as `kylabiancafrias@gmail.com` or `subleader@gmail.com` / `Password123!`
- **Device 3 — Public Finder** (Phone Camera or Incognito Browser): Ready to open `/t/<token>`

---

## 3. Demo Cue Sheet (At-a-Glance)

| Part | Time | Role & Portal | Feature Demonstrated | Key Takeaway |
| --- | --- | --- | --- | --- |
| **Part 1** | 1.0 min | Overview | Architecture & Portals | Two portals + public QR, human-in-the-loop |
| **Part 2** | 2.0 min | Resident App | Pet Registry, QR Tag & Collar Request | Mandatory photo, RA 9482 tracking, permanent QR |
| **Part 3** | 1.5 min | Public Finder & Resident | Public QR Scan (`/t/<token>`) & Scanner | RA 10173 owner privacy masking |
| **Part 4** | 2.0 min | Resident App | Incident Reporting & Community Sightings | 5 categories, 3 animal types, geofence check |
| **Part 5** | 2.0 min | Admin Portal | Dashboard, Live Map & 4-Stage Lifecycle | Attention Queue, triage, rule-based matching |
| **Part 6** | 1.5 min | Admin ↔ Resident | Owner Verification & 1-to-1 Messaging | Explicit Yes/No confirmation & case chat |
| **Part 7** | 1.5 min | Admin Portal | Warnings, Summons & External Referrals | Tiered warnings & multi-agency escalation |
| **Part 8** | 1.0 min | Admin Portal | QR Collar Fulfillment, Analytics & Settings | End-to-end pickup, CSV export & governance |

---

## 4. Step-by-Step Flow, Scenario & Script

### Part 1 — System Introduction & Architecture (1.0 min)

- **Role & Screen:** Side-by-side view of Resident App (`/resident-app` / Android APK) and Subdivision Admin Portal (`/`).
- **Scenario:** Introduce the real-world problems in Selera Homes: untracked strays, exposed owner phone numbers on traditional tags, and informal reporting.
- **Live Demo Steps:**
  1. Show the Resident App on phone and Admin Portal on laptop.
  2. Point out the Public QR access model (`/t/<token>`).
- **Presenter Script:**
  > *"Good day, panelists. We present STRAY-SAFE 2.0, a Smart Stray Animal Reporting and Rescue System piloted for Selera Homes Subdivision, Barangay San Vicente, Santa Maria, Bulacan. Built around Detect, Validate, Rescue, Monitor, and Protect, it has two authenticated portals—the Resident App on web and Android APK, and the Subdivision Administrator Web Portal—plus a login-free Public QR Scan page. Every critical decision—ownership, warnings, and external referrals—is human-in-the-loop."*

---

### Part 2 — Resident Pet Registry, Pet QR Tags & Collar Requests (2.0 min)

- **Role & Screen:** Resident App → **My Pets** (`/resident-app/pets`).
- **Scenario:** Emmanuel registers his cat **Nico**, views Nico's permanent QR tag, and requests a physical QR collar.
- **Live Demo Steps:**
  1. Tap **Register a pet**, upload a photo of Nico, select **Cat**, pick/type the breed, enter birth date & vaccination info, and tap **Register pet**.
  2. Open Nico's profile to show his permanent **Pet QR Tag** (View / Print / Download).
  3. Tap **Request QR Collar** and submit (status: `Pending`).
- **Presenter Script:**
  > *"First, Emmanuel opens My Pets to register his cat, Nico. A photo is mandatory, birth date auto-calculates age, and rabies vaccination dates support RA 9482 compliance. Saving automatically generates one permanent, unique QR tag for Nico. Emmanuel can print or download it immediately, or tap Request QR Collar to request a physical collar from the subdivision office."*

---

### Part 3 — Privacy-First Public QR Scan & In-App Scanner (1.5 min)

- **Role & Screen:** Public Scan Page (`/t/<token>`) & Resident Scanner (`/resident-app/scan`).
- **Scenario:** Nico slips out of the gate; a passerby scans his QR tag without logging in.
- **Live Demo Steps:**
  1. Scan Nico's QR code with a phone camera (opens `/t/<token>`) or open **Community → Scan a pet tag** (`/resident-app/scan`).
  2. Show that the owner's house address and personal email are hidden.
  3. Submit finder contact info, notes, and location pin, then show the scan notification in Emmanuel's app.
- **Presenter Script:**
  > *"When Nico wanders outside, any finder can scan his QR tag with a standard phone camera—no login required—or use the in-app scanner. Under RA 10173, the public page masks the owner's exact house address and email. The finder submits their contact details and pinpoints where Nico was found, immediately alerting Emmanuel."*

---

### Part 4 — Citizen Incident Reporting & Community Sightings (2.0 min)

- **Role & Screen:** Resident App → **Report** (`/resident-app/report`) & **Community** (`/resident-app/community`).
- **Scenario:** Another resident spots a roaming animal near the park and files a geofence-validated report.
- **Live Demo Steps:**
  1. Open **Report**, show the 5 categories (`lost_pet`, `found_animal`, `nuisance`, `injured`, `safety`) and 3 animal types (`Dog`, `Cat`, `Others`).
  2. Upload a mandatory photo, pin a location inside the Selera Homes geofence on the Leaflet map, and submit.
  3. Show **My Reports** (`/resident-app/reports`) and **Community** (`/resident-app/community`) sightings.
- **Presenter Script:**
  > *"Residents can file structured reports across five categories—lost pet, found animal, nuisance, injured, or safety—for Dogs, Cats, or Others. A photo is required, and the Leaflet map enforces the Selera Homes geofence so pins outside the subdivision are blocked. Residents track progress in My Reports and view active Lost Pet notices or sightings in Community."*

---

### Part 5 — Subdivision Admin Triage, Live Map & Case Lifecycle (2.0 min)

- **Role & Screen:** Admin Portal → **Dashboard** (`/dashboard`) & **Cases** (`/cases`).
- **Scenario:** Subdivision Admin Kyla reviews the new report in the Attention Queue and moves it through triage.
- **Live Demo Steps:**
  1. Show **Dashboard** KPI cards, **Attention Queue**, and the color-coded **Leaflet map**.
  2. Open the new case in **Cases** (`/cases`).
  3. Advance the 4-stage lifecycle (`reported` → `under_review` → `in_progress`), save a **Structured Assessment**, and show **Lost & Found / Related Report Matching**.
- **Presenter Script:**
  > *"In the Subdivision Administrator Portal, the Dashboard highlights urgent cases in the Attention Queue alongside live KPIs and the Leaflet map. Inside the case, we follow a 4-stage lifecycle—Reported, Under Review, In Progress, and Closed—with a Structured Assessment and rule-based Lost & Found and Related Report matching."*

---

### Part 6 — Owner-First Verification & 1-to-1 Messaging (1.5 min)

- **Role & Screen:** Admin **Case Details** ↔ Resident **Case / Messages** (`/resident-app/messages`).
- **Scenario:** The Admin matches the roaming animal to Emmanuel's cat Nico and asks Emmanuel to confirm.
- **Live Demo Steps:**
  1. Trigger **Possible Pet Owner Verification** from the case.
  2. Switch to Emmanuel's Resident App to show the **"Is this your pet?"** side-by-side photo comparison card and tap **Yes**.
  3. Open **1-to-1 Messaging** (`/resident-app/messages` ↔ `/messages`) and send a coordination message with the attached case link.
- **Presenter Script:**
  > *"Before treating a roaming animal as an unowned stray, STRAY-SAFE enforces an Owner-First workflow. The Admin sends a Possible Pet Owner Verification prompt, and Emmanuel sees a side-by-side photo comparison asking 'Is this your pet?' where he explicitly confirms Yes or No. Both sides can also coordinate directly through 1-to-1 messaging linked to the case."*

---

### Part 7 — Compliance Observation, Tiered Warnings & External Referrals (1.5 min)

- **Role & Screen:** Admin **Complaints** (`/complaints`), **Warning Templates** (`/warning-templates`), & **Case Actions**.
- **Scenario:** Show how repeat pet-rule violations receive tiered warnings, while severe safety/bite cases are escalated to partner agencies.
- **Live Demo Steps:**
  1. Open **Warning Templates** (`/warning-templates`) and preview a warning (highlighting the **2nd-warning office summons** date/time and compliance photo proof).
  2. Open **Create External Referral** on a severe case and show the partner agency selector (**Barangay**, **Veterinary Clinic/Office**, **Municipal/City Vet**, **Animal Welfare**, **Animal Control**, **Other**).
- **Presenter Script:**
  > *"For minor violations, Administrators use customizable Warning Templates—supporting 1st, 2nd, and 3rd warnings, including an office summons schedule on the 2nd warning—and track corrective photo proof. For high-risk cases exceeding subdivision capacity, the Admin logs a formal External Referral to partner agencies such as the Barangay, Veterinary Office, or Animal Control."*

---

### Part 8 — QR Collar Fulfillment, Analytics & Settings Wrap-Up (1.0 min)

- **Role & Screen:** Admin **Pet Registry** (`/pets`), **Analytics** (`/analytics`), & **Settings** (`/settings`).
- **Scenario:** Complete Nico's QR collar pickup, export analytics, and summarize system governance.
- **Live Demo Steps:**
  1. Open **Pet Registry → QR Collar Requests** (`/pets`) and advance Nico's request (`Pending` → `Accepted` → `Ready for Pickup` → `Completed`).
  2. Open **Analytics** (`/analytics`) to show resolution rates, species/category charts, and **CSV Export**.
  3. Briefly show **Settings** (`/settings`): separated **Subdivision Info & Contact**, **External Coordination** partners, and **Geofence** controls.
- **Presenter Script:**
  > *"Finally, in Pet Registry, the Admin updates Emmanuel's QR Collar Request from Pending to Ready for Pickup and Completed. In Analytics, leadership reviews resolution rates, species and category breakdowns, and exports CSV reports, while Settings separates Subdivision Info from External Coordination partners. That concludes our demonstration of STRAY-SAFE 2.0. Thank you."*
