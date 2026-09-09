# StraySafe 2.0: User Roles & Report Processing Connection 🔗

This document provides a clear, high-level summary of what each active user role can do within the system and how they connect to process a single stray animal report from start to finish.

---

## 1. What Each Role Can Do 👤

### 🏘️ Resident / Citizen (The Reporter)
*   **Report Incidents:** Submit stray animal reports with photos/videos, descriptions, and GPS locations (Public or Private).
*   **Track Reports:** View the real-time status of their active reports on the home feed.
*   **Communicate:** Leave comments on active reports to provide more information to leaders or staff.
*   **Manage Pets:** Register their own pets, generate pet QR codes, and view scan history if a pet is lost.

### 🛡️ Subdivision Leader (The Validator)
*   **Review & Filter:** See all reports submitted by residents within their specific subdivision. Filter out fake, duplicate, or spam reports (Reject).
*   **Validate & Escalate:** Confirm legitimate reports and escalate them to the Barangay for official rescue.
*   **Endorse:** Generate and attach official PDF Endorsement Letters when escalating a case.
*   **Alert the Community:** Publish hazard alerts (e.g., "Aggressive dog near Block 4") visible to residents in their subdivision.

### 🏛️ Barangay Head / Officer (The Commander)
*   **Command Hub Oversight:** Monitor all incoming escalated reports from various subdivisions under their barangay.
*   **Approve Operations:** Review Subdivision Leader endorsement letters and AI Priority assessments to approve or decline a rescue request.
*   **Dispatch Teams:** Create tactical teams and assign specific field personnel to handle approved rescues.
*   **Facility Management:** Authorize animal intake into the holding facility, medical isolation, owner claims, and final animal releases.

### 🚑 Barangay Field Personnel (The Rescuer)
*   **Receive Tasks:** Get direct rescue assignments and dispatch orders from the Barangay Head.
*   **Execute Rescue:** Travel to the site with live step-by-step status updates (Accept Task → En Route → On Site → Picked Up).
*   **Upload Evidence:** Take photos and timestamps during the capture/pickup and upload them as official mission evidence.
*   **Provide Daily Care:** Log medical notes, feeding schedules, and observations for animals currently in the holding facility.

### ⚙️ System Admin (The Controller)
*   **Global Oversight:** Monitor all reports, heatmaps, and rescue cases across all subdivisions and barangays.
*   **Delegation:** Designate or replace the Barangay Head Officer account for each Barangay.
*   **Accountability:** Manage user accounts (Citizens, Leaders, Staff) and audit full system logs for all status transitions and actions.
*   **Configuration:** Manage animal categories, priority definitions, and geofence boundary mappings.

---

## 2. How They Connect: The Report Processing Workflow 🔄

The system connects these four roles through a strictly enforced **Chain of Responsibility**. A report flows sequentially upward for validation, then downward for execution.

### Phase 1: Detection & Reporting
1.  **Resident** spots an aggressive stray dog.
2.  **Resident** opens the app, pins the location, takes a photo, and submits the report.
    *   *Status:* `Reported`

### Phase 2: Validation & Escalation
3.  **Subdivision Leader** sees the report in their dashboard.
4.  **Subdivision Leader** verifies the report is not fake. They click "Escalate" and attach an Endorsement Letter requesting barangay assistance.
    *   *Status:* `Escalated to Barangay`

### Phase 3: Command Approval & Dispatch
5.  **Barangay Head Officer** receives the escalated report in their Command Center.
6.  **Barangay Head Officer** reviews the priority and approves the operation.
    *   *Status:* `Approved`
7.  **Barangay Head Officer** selects available **Field Personnel** and dispatches them to the location.
    *   *Status:* `Rescue In Progress` (Personnel notified)

### Phase 4: Field Execution & Rescue
8.  **Barangay Field Personnel** receive the mission alert on their device.
9.  **Barangay Field Personnel** click "Start Mission" (Updates to `En Route`), arrive at the location (Updates to `On Site`), and safely secure the dog.
10. **Barangay Field Personnel** take a photo of the captured dog as evidence and click "Picked Up".
    *   *Status:* `Picked Up`

### Phase 5: Facility Holding & Resolution
11. **Barangay Field Personnel** deliver the dog to the Barangay Holding Facility.
12. **Barangay Head Officer** officially logs the animal into the facility.
    *   *Status:* `Impounded` or `Under Observation`
13. Over the next few days, if the owner is found (perhaps by scanning a Pet QR code) or the dog is rehomed, the **Barangay Head Officer** authorizes the final release.
    *   *Status:* `Claimed by Owner` or `Released` (Mission successfully closed and moved to History).

---

## 3. Specific Scenarios & Edge Cases 🛡️

### Scenario A: Returning a Lost Animal to a Resident (Claim Process)
If a resident's pet goes missing and is picked up by the Barangay, the system facilitates a structured claim process:
1.  **Resident Checks Feed:** The resident sees the impounded animal on the public feed or is notified if their pet's QR code was scanned.
2.  **Submit Claim:** The resident submits a formal "Pet Claim" through the app, providing proof of ownership (e.g., vaccine card, registration records, or matching distinct markings).
3.  **Barangay Head Verification:** The **Barangay Head Officer** reviews the submitted evidence against the impounded animal's records.
4.  **Release & Handoff:** Once approved, the resident visits the facility. The **Barangay Head Officer** officially logs the release.
    *   *Final Status:* `Claimed by Owner`

### Scenario B: Subdivision's Process (Temporary Shelter & Direct Resolution)
Not all reports require Barangay escalation. Sometimes, a subdivision can handle minor incidents internally:
1.  **Subdivision Leader Intervenes:** A resident reports a stray dog that is friendly and non-aggressive.
2.  **Temporary Shelter:** Instead of escalating, the **Subdivision Leader** or a trusted subdivision volunteer secures the dog in a local subdivision *Temporary Shelter* or holds it safely.
3.  **Direct Resolution:** The true owner (a neighbor) is quickly identified via the community feed or pet QR code. 
4.  **Close Case:** The **Subdivision Leader** directly resolves the report without ever involving the Barangay Staff.
    *   *Final Status:* `Incident Resolved` (Case closed internally by the subdivision).
    *   *Rule:* Leaders can only resolve cases directly if they have **not** yet been escalated.

### Scenario C: QR Code "Found" Scenarios
The system includes smart collars with QR codes to bypass the full rescue process when possible:
1.  **Citizen Finds Pet:** A citizen or **Subdivision Leader** finds a roaming dog with a StraySafe QR collar.
2.  **Scan & Notify:** They scan the code using a smartphone. The system instantly notifies the registered owner with the GPS location of the scan (e.g., "Found Location" or "Temporary Shelter").
3.  **Direct Retrieval:** The owner contacts the finder and retrieves their pet directly, avoiding the need for an official report, barangay dispatch, or facility impoundment.

---

## 4. Context-Bound Messaging & Communication 💬

To facilitate smooth coordination without compromising privacy, the system utilizes **Context-Bound Direct Messaging**. This means chats are strictly tied to specific active events (Reports, Missions, or Claims) rather than open social networking.

### How Roles Communicate:

*   **Resident & Subdivision Leader:** 
    *   If a resident submits a report, the Subdivision Leader can open a direct chat thread tied to that specific report to ask for more details (e.g., "Is the dog still near the basketball court?").
*   **Barangay Head & Field Personnel:**
    *   Once a rescue is dispatched, a dedicated mission chat thread is created. The Field Personnel can send live updates or request backup directly to the Barangay Head Command Center.
*   **Finder & Pet Owner (QR Code Scan):**
    *   If a pet's QR collar is scanned, a temporary chat session opens between the Finder and the Pet Owner. This allows them to coordinate the pet's return without exposing personal phone numbers directly on a public feed.
*   **Pet Claimant & Barangay Head:**
    *   During a formal pet claim from the holding facility, the claimant can chat with the Barangay Head to provide additional proof or schedule a pickup time.

**Key Rule of Messaging:** When the contextual event (the Report, the Mission, or the Claim) is officially closed or resolved, the chat thread is automatically **archived and locked** to prevent unnecessary ongoing communication.

---

## 5. Exception Workflows & Edge Scenarios 🚨

While the standard workflow is linear, StraySafe 2.0 has built-in handlers for exceptions and edge cases.

### Scenario D: False Reports & Dispute Citations
To maintain data integrity and prevent abuse, the system actively monitors and governs user behavior:
1.  **Detection:** If a **Subdivision Leader** repeatedly receives fake or prank reports from a specific Resident, they can click `Reject` and flag the report as a "False Alarm."
2.  **Warning System:** The system automatically issues a formal "Warning Citation" to the abusive resident.
3.  **Appeals:** The Resident can dispute this warning if they believe it was issued unfairly, requiring the **Admin** to step in and review the evidence.
4.  **Suspension:** If a resident accumulates too many strikes (e.g., 3 false reports), their account is automatically suspended from reporting by the **Admin** module.

### Scenario E: Mission Rejections by Barangay Head
Not all escalated reports result in a rescue. 
1.  **Review:** The **Barangay Head Officer** receives an Escalated Report but notices it is outside their barangay's jurisdiction or resources are currently depleted.
2.  **Reject & Reason:** The Barangay Head clicks `Reject` and provides a mandatory reason (e.g., "Outside Jurisdiction - Endorsed to Brgy. San Jose").
3.  **Notification:** The **Subdivision Leader** and the reporting **Resident** are immediately notified of the rejection and the reason why, closing the loop.

### Scenario F: Deceased Animal Handling
Unfortunately, not all rescues have a happy ending. The system tracks this solemnly to ensure closure.
1.  **Field Discovery:** If the **Barangay Field Personnel** arrive on site and find the animal has passed away, they capture a final photo, log the condition, and update the status to `Deceased`.
2.  **Facility Passing:** If an animal passes away while under observation in the Holding Facility, the **Barangay Head Officer** updates the intake status to `Deceased`.
3.  **Archive:** In both cases, the mission is officially closed, removed from all active feeds, and securely archived in the History logs.
