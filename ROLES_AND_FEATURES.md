# StraySafe System: Roles, Modules & Features 🛡️🐾

This document outlines the capabilities, responsibilities, and future potential of the four primary roles within the StraySafe ecosystem.

---

## 1. Resident / Citizen (End User)
The primary reporting layer. Residents provide the raw data needed to identify stray animal hotspots.

### 📍 Current Features
*   **Incident Reporting:** Submit reports with location (via Map), media (photos/videos), animal type, condition, and priority levels.
*   **Geofence Validation:** Reports are strictly validated to ensure they originate within the subdivision boundary (e.g., Selera Homes).
*   **Real-time Tracking:** Follow the status of submitted reports through a visual progress tracker (Pending → Verified → Dispatched → Resolved).
*   **Profile Management:** Manage personal account details and reporting history.

### 🚀 Possible Future Features
*   **Community Awareness Feed:** A local feed showing recent sightings to alert neighbors of aggressive animals.
*   **Lost & Found Module:** A dedicated space for residents to post about missing pets vs. stray sightings.
*   **In-App Notifications:** Receive push alerts when a rescue team is dispatched to a nearby report.

---

## 2. Subdivision Leader (First Responders)
The validation layer. Leaders ensure that reports are legitimate before they reach government resources.

### 📍 Current Features
*   **Report Validation:** Review reports submitted by residents in their specific subdivision.
*   **Escalation Workflow:** Verify and forward critical reports to the Barangay for professional rescue intervention.
*   **Subdivision Dashboard:** View analytics and lists of all reported incidents within their jurisdiction.
*   **Endorsement Letters:** Attach official documentation to escalated reports.

### 🚀 Possible Future Features
*   **Resident Communication:** Direct messaging with the reporter to clarify location or animal behavior details.
*   **Volunteer Coordination:** Assign minor, non-dangerous tasks (like checking a location) to trusted subdivision volunteers.
*   **Hazard Alerts:** Broadcast safety alerts specifically to their subdivision members.

---

## 3. Barangay Head / Officer (Tactical Command & Coordination Layer)
The tactical command layer. The Head/Officer oversees barangay jurisdiction, personnel deployment, and final mission sign-offs.

### 📍 Current Features
*   **Tactical Command Center:** Overview of all incoming escalated reports from subdivision leaders within their barangay.
*   **Personnel & Team Management:** Organize field staff into tactical rescue teams and track staff on-duty/off-duty readiness.
*   **Rescue Mission Dispatch:** Review endorsement letters, approve rescue requests, and assign specific field personnel to missions.
*   **Live Mission Oversight:** Monitor real-time status of active field dispatches (Assigned → En Route → On Site → Picked Up).
*   **Holding Facility Authorization:** Supervise shelter intake, owner claims, behavioral observation, and release approvals.

---

## 4. Barangay Personnel / Field Staff (Operational Execution Layer)
The field operations layer. Personnel handle the physical rescue and frontline management of animals.

### 📍 Current Features
*   **Assigned Missions Inbox:** Direct task feed showing incidents assigned specifically by the Barangay Head Officer.
*   **Field Action Stepper:** Live status progression with one-tap status updates (Accept → En Route → On Site → Picked Up).
*   **Immersive Navigation:** Map-based turn-by-turn routing from current position/Barangay Hall to the rescue site.
*   **Evidence Documentation:** Upload field photos, timestamps, and condition notes upon animal capture.
*   **Shelter Daily Care:** Log medical notes, feeding, and observation updates for animals in the holding facility.

---

## 5. Admin (System Oversight & Governance Layer)
The governance layer. Admins ensure the system is secure, functional, and properly delegated.

### 📍 Current Features
*   **Barangay Head Officer Designation:** Assign or transfer the designated Head/Officer account for each specific barangay.
*   **Global Activity Monitor:** High-level Heatmap and Pinpoint views of all reports across all subdivisions and barangays.
*   **User Management:** Audit, create, and manage accounts for Residents, Subdivision Leaders, Barangay Heads, and Field Staff.
*   **Security Settings:** Manage administrative credentials and system-wide security configurations.
*   **Trend Analytics:** Analyze data over time (24h, 7d, 30d) to monitor stray animal population trends and team response times.

---

## Summary of Modules

| Module | Citizen | Subd Leader | Brgy Head | Brgy Staff | Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Operation Hub & Dispatch** | ❌ | ❌ | ✅ Command / Assign | ✅ Assigned Only | ❌ |
| **AI Priority Feed** | ❌ | ❌ | ✅ Full Review | ✅ View Assigned | ❌ |
| **Incident Reporting** | ✅ Create | ✅ Validate | ❌ | ❌ | ❌ |
| **Rescue Execution & Evidence** | ❌ | ❌ | ✅ Oversee | ✅ Field Capture | ❌ |
| **Personnel Management** | ❌ | ❌ | ✅ Local Brgy | ❌ | ✅ Global System |
| **Assign Barangay Head** | ❌ | ❌ | ❌ | ❌ | ✅ Full |
| **Heatmap Analytics** | ❌ | ❌ | ✅ Local Brgy | ✅ Local Brgy | ✅ Global |
| **Navigation** | ❌ | ❌ | ❌ | ✅ Active | ❌ |
| **Report History** | ✅ Personal | ✅ Subd | ✅ Full Brgy | ✅ Assigned | ✅ Full Global |


- Residents dashboard ilagay daw ung mga important updates and data
- ung description para malaman kung dapat ba hulihin or hindi ung aso (See detailed guide: [ANIMAL_PICKUP_NOTIFICATION_GUIDE.md](file:///c:/Users/User/Desktop/Straysafe2.0/ANIMAL_PICKUP_NOTIFICATION_GUIDE.md))
- adoption ng strays 
- accuracy ng ai, pano raw kung madilim