# Level 1 Data Flow Diagram (DFD) - Existing (Manual) System

This document breaks down the "Manual Stray Management" Level 0 Context Diagram into a Level 1 DFD. It identifies the manual processes and physical data stores used before the implementation of STRAY-SAFE.

---

## 🗄️ Manual System Entities, Processes & Data Stores

### External Entities
1. **Resident**
2. **Subdivision Leader**
3. **Barangay**

### Manual Processes
*   **1.0 Incident Logging:** The manual process of receiving complaints and recording them in a physical logbook.
*   **2.0 Coordination & Escalation:** The manual communication/dispatch workflow between subdivision leaders and the barangay office.
*   **3.0 Field Operations:** The physical deployment of barangay personnel for verification and rescue.
*   **4.0 Record Keeping & Resolution:** Filing impound records and manually updating residents/leaders on case status.

### Manual Data Stores
*   **D1: Physical Incident Logbook:** Paper records of all reported incidents.
*   **D2: Impound Registry:** Paper records of captured animals and resolution details.

---

## 📊 Level 1 DFD Diagrams (Per User)

Below are the expanded Level 1 Data Flow Diagrams broken down by entity for the **Existing System**.

### Figure 1.0 | Level 1 Data Flow Diagram: Resident (Existing)
```mermaid
flowchart TD
    %% Entity
    RES["Resident"]:::entity

    %% Processes
    P1(("1.0<br>Incident<br>Logging")):::process
    P4(("4.0<br>Record Keeping<br>& Resolution")):::process

    %% Data Stores
    D1[("D1<br>Incident Logbook")]:::datastore

    %% Flows
    RES -->|"Location Information, Animal Description,<br>Stray Animal Report, Request for Update"| P1
    P1 -->|"Write Entry"| D1
    
    D1 -->|"Check Status"| P4
    P4 -->|"Verbal acknowledgment, SMS Notification,<br>Report Status, Final Resolution"| RES

    %% Styling (Orange/Gray theme for manual system)
    classDef process fill:#fbd38d,stroke:#c05621,stroke-width:2px,color:#1a202c
    classDef datastore fill:#fff,stroke:#4a5568,stroke-width:2px,color:#1a202c
    classDef entity fill:#e2e8f0,stroke:#4a5568,stroke-width:2px,color:#1a202c
```

### Figure 2.0 | Level 1 Data Flow Diagram: Subdivision Leader (Existing)
```mermaid
flowchart TD
    %% Entity
    SUB["Subdivision Leader"]:::entity

    %% Processes
    P2(("2.0<br>Coordination<br>& Escalation")):::process
    P4(("4.0<br>Record Keeping<br>& Resolution")):::process

    %% Data Stores
    D1[("D1<br>Incident Logbook")]:::datastore

    %% Flows
    SUB -->|"Escalation Request,<br>Request Assistance"| P2
    P2 -->|"Log Request"| D1

    D1 -->|"Fetch Case Info"| P4
    P4 -->|"Final Resolution Report, Action taken Information,<br>Report Updates"| SUB

    %% Styling 
    classDef process fill:#fbd38d,stroke:#c05621,stroke-width:2px,color:#1a202c
    classDef datastore fill:#fff,stroke:#4a5568,stroke-width:2px,color:#1a202c
    classDef entity fill:#e2e8f0,stroke:#4a5568,stroke-width:2px,color:#1a202c
```

### Figure 3.0 | Level 1 Data Flow Diagram: Barangay (Existing)
```mermaid
flowchart TD
    %% Entity
    BRG["Barangay"]:::entity

    %% Processes
    P2(("2.0<br>Coordination<br>& Escalation")):::process
    P3(("3.0<br>Field<br>Operations")):::process
    P4(("4.0<br>Record Keeping<br>& Resolution")):::process

    %% Data Stores
    D1[("D1<br>Incident Logbook")]:::datastore
    D2[("D2<br>Impound Registry")]:::datastore

    %% Flows
    P2 -->|"Personnel visit Request"| BRG
    
    D1 -->|"Animal Location Details,<br>Incident Information"| P3
    P3 -->|"Dispatch Instructions"| BRG
    
    BRG -->|"Verification Results, Rescue Details"| P3
    P3 -->|"Update Log"| D1
    
    BRG -->|"Impound Information, Resolution Information"| P4
    P4 -->|"File Manual Record"| D2

    %% Styling 
    classDef process fill:#fbd38d,stroke:#c05621,stroke-width:2px,color:#1a202c
    classDef datastore fill:#fff,stroke:#4a5568,stroke-width:2px,color:#1a202c
    classDef entity fill:#e2e8f0,stroke:#4a5568,stroke-width:2px,color:#1a202c
```

---

## 📝 Existing System Level 1 DFD Explanation – Per User

This section details how each entity interacted with the manual processes and physical records in the existing system, using the exact terminology from the Manual Stray Management diagram.

### 1. Resident Data Flows (Existing)

**Resident → 1.0 Incident Logging**
The resident manually submits or calls in their **Stray Animal Report**, providing the **Animal Description** and **Location Information**, or makes a **Request for Update** on a previous report.

**4.0 Record Keeping & Resolution → Resident**
The barangay staff manually contacts the resident to provide a **Verbal acknowledgment**, an **SMS Notification**, the current **Report Status**, or the **Final Resolution** of the case.

---

### 2. Subdivision Leader Data Flows (Existing)

**Subdivision Leader → 2.0 Coordination & Escalation**
The subdivision leader manually contacts the barangay to submit an **Escalation Request** or **Request Assistance** for a community issue.

**4.0 Record Keeping & Resolution → Subdivision Leader**
The barangay manually provides the leader with **Report Updates**, **Action taken Information**, and the **Final Resolution Report** for cases in their area.

---

### 3. Barangay Data Flows (Existing)

**2.0 / 3.0 Processes → Barangay**
Barangay personnel receive the **Personnel visit Request**, along with **Animal Location Details** and **Incident Information** retrieved from the physical logbook to initiate a field response.

**Barangay → 3.0 / 4.0 Processes**
After a manual operation, the personnel report back their **Verification Results** and **Rescue Details**, and manually file the **Impound Information** and **Resolution Information** into the physical registries.
