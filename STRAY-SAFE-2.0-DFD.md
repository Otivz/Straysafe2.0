# STRAY-SAFE 2.0 — Data Flow Diagrams (Level 0 & Divided Level 1 Modules 1.0–5.0)

Balanced **Gane & Sarson Mermaid.js Data Flow Diagrams** matching your **Level 0 Context Diagram** (`Resident ↔ STRAYSAFE ↔ Subdivision Leader`) and dividing **DFD Level 1** into **5 clean, standalone module diagrams** (`Modules 1.0–5.0`) with **short, specific data flow labels** and 100% Level 0 ↔ Diagrams 2–6 balancing.

---

## 1. Diagram 1 — DFD Level 0 (Context Diagram)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000

    RES["Resident"]:::entity
    P0["0.0 STRAYSAFE"]:::process
    SL["Subdivision Leader"]:::entity

    RES -->|"Login, OTP<br/>Pet Profile<br/>Report, Media, GPS Pin<br/>QR Tag Scan, Sighting Notice<br/>Claim Proof, Chat, Acknowledgement"| P0

    P0 -->|"Session Token, Reference ID<br/>Notices, Sightings, Push Alerts<br/>Case Timeline, Chat<br/>Warning Letter, Claim Verdict"| RES

    SL -->|"Leader Login, Policies<br/>Pin Fix, Notice Moderation<br/>Assessments, Links, Pathways<br/>Actions, Warnings, Referrals<br/>Claim Verdicts, Closures, Queries"| P0

    P0 -->|"Leader Session, Directory<br/>Reports, Photos, Pin Flags<br/>Match Leads, QR Scans<br/>Compliance, Claims, Referrals<br/>Analytics, Audits"| SL
```

---

## 2. Diagram 2 — DFD Level 1 (Module 1.0: Auth, Accounts, Pets & QR Tags)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000
    classDef store fill:#E5E7EB,stroke:#000000,color:#000000

    subgraph DATA_STORES[" "]
        direction TB
        D1["D1 | Users & Authentication"]:::store
        D2["D2 | Pet Registry & QR Tags"]:::store
        D9["D9 | Alerts & Notifications"]:::store
        D10["D10 | Subdivision & Policy Config"]:::store
        D11["D11 | Audit Logs"]:::store
    end

    subgraph PROCESSES[" "]
        direction TB
        P1_1["1.1 Register & Verify Resident"]:::process
        P1_2["1.2 Authenticate Subdivision Leader"]:::process
        P1_3["1.3 Manage Pet Profile & QR Tag"]:::process
        P1_4["1.4 Manage User Accounts & Policies"]:::process
    end

    subgraph ENTITIES[" "]
        direction TB
        RES["Resident"]:::entity
        SL["Subdivision Leader"]:::entity
    end

    style DATA_STORES fill:transparent,stroke:transparent
    style PROCESSES fill:transparent,stroke:transparent
    style ENTITIES fill:transparent,stroke:transparent

    %% 1.1 Register & Verify Resident
    RES -->|"Login, OTP"| P1_1
    P1_1 -->|"Session Token"| RES
    D1 -->|"Credential Hash & OTP"| P1_1
    P1_1 -->|"New Account & JWT Session"| D1
    D10 -->|"Password Rules"| P1_1
    P1_1 -->|"OTP Verification Alert"| D9
    P1_1 -->|"Resident Auth Log"| D11

    %% 1.2 Authenticate Subdivision Leader
    SL -->|"Leader Login"| P1_2
    P1_2 -->|"Leader Session"| SL
    D1 -->|"Leader Account & Role"| P1_2
    P1_2 -->|"Leader JWT Session"| D1
    D10 -->|"Session Timeout Rules"| P1_2
    P1_2 -->|"Leader Auth Log"| D11

    %% 1.3 Manage Pet Profile & QR Tag
    RES -->|"Pet Profile"| P1_3
    P1_3 -->|"Notices"| RES
    D2 -->|"Saved Pet & Tag Token"| P1_3
    P1_3 -->|"Pet Profile & QR Tag Record"| D2
    P1_3 -->|"Pet Registry Log"| D11

    %% 1.4 Manage User Accounts & Policies
    SL -->|"Policies"| P1_4
    P1_4 -->|"Directory"| SL
    D1 -->|"User Accounts & Roles"| P1_4
    P1_4 -->|"Role & Activation Writes"| D1
    D10 -->|"Subdivision Policy Config"| P1_4
    P1_4 -->|"Updated Subdivision Policies"| D10
    P1_4 -->|"Account & Policy Audit Log"| D11
```

---

## 3. Diagram 3 — DFD Level 1 (Module 2.0: Reporting, Geofence, Notices & QR Scans)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000
    classDef store fill:#E5E7EB,stroke:#000000,color:#000000

    subgraph DATA_STORES[" "]
        direction TB
        D2["D2 | Pet Registry & QR Tags"]:::store
        D3["D3 | Incident Reports & Evidence"]:::store
        D4["D4 | Lost & Found & Sightings"]:::store
        D9["D9 | Alerts & Notifications"]:::store
        D10["D10 | Subdivision & Policy Config"]:::store
        D11["D11 | Audit Logs"]:::store
    end

    subgraph PROCESSES[" "]
        direction TB
        P2_1["2.1 Submit Report & GPS Pin"]:::process
        P2_2["2.2 Validate Geofence & Pin Fix"]:::process
        P2_3["2.3 Publish & Moderate Notices"]:::process
        P2_4["2.4 Log Sighting & QR Tag Scan"]:::process
    end

    subgraph ENTITIES[" "]
        direction TB
        RES["Resident"]:::entity
        SL["Subdivision Leader"]:::entity
    end

    style DATA_STORES fill:transparent,stroke:transparent
    style PROCESSES fill:transparent,stroke:transparent
    style ENTITIES fill:transparent,stroke:transparent

    %% 2.1 Submit Report & GPS Pin
    RES -->|"Report, Media, GPS Pin"| P2_1
    P2_1 -->|"Reference ID"| RES
    P2_1 -->|"Reports & Photos"| SL
    D2 -->|"Linked Pet Snapshot"| P2_1
    P2_1 -->|"Report, Media & GPS Pin"| D3
    P2_1 -->|"Submission Alert"| D9

    %% 2.2 Validate Geofence & Pin Fix
    SL -->|"Pin Fix"| P2_2
    P2_2 -->|"Case Timeline"| RES
    P2_2 -->|"Pin Flags"| SL
    D10 -->|"Geofence Polygon"| P2_2
    D3 -->|"Submitted Coordinates"| P2_2
    P2_2 -->|"Validated & Fixed GPS Pin"| D3
    P2_2 -->|"Pin Fix Audit Log"| D11

    %% 2.3 Publish & Moderate Notices
    RES -->|"Sighting Notice"| P2_3
    SL -->|"Notice Moderation"| P2_3
    P2_3 -->|"Notices"| RES
    P2_3 -->|"Reports"| SL
    D2 -->|"Missing Pet Photo & Traits"| P2_3
    D4 -->|"Existing Lost/Found Notices"| P2_3
    P2_3 -->|"Published Notice Record"| D4
    P2_3 -->|"Community Notice Alert"| D9
    P2_3 -->|"Moderation Audit Log"| D11

    %% 2.4 Log Sighting & QR Tag Scan
    RES -->|"QR Tag Scan & Sighting Notice"| P2_4
    P2_4 -->|"Sightings & Push Alerts"| RES
    P2_4 -->|"QR Scans"| SL
    D4 -->|"Active Notice Records"| P2_4
    P2_4 -->|"Sighting Pin & Recovery State"| D4
    D2 -->|"Active Tag Token"| P2_4
    P2_4 -->|"QR Scan Location & Message"| D2
    P2_4 -->|"QR Scan & Sighting Alert"| D9
    P2_4 -->|"Sighting & Scan Audit Log"| D11
```

---

## 4. Diagram 4 — DFD Level 1 (Module 3.0: Assessment, Match Leads & Pathways)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000
    classDef store fill:#E5E7EB,stroke:#000000,color:#000000

    subgraph DATA_STORES[" "]
        direction TB
        D2["D2 | Pet Registry & QR Tags"]:::store
        D3["D3 | Incident Reports & Evidence"]:::store
        D4["D4 | Lost & Found & Sightings"]:::store
        D6["D6 | Case Interventions & Messaging"]:::store
        D11["D11 | Audit Logs"]:::store
    end

    subgraph PROCESSES[" "]
        direction TB
        P3_1["3.1 Assess Urgency & Ownership"]:::process
        P3_2["3.2 Review Match Leads & Links"]:::process
        P3_3["3.3 Assign Case Pathways"]:::process
    end

    subgraph ENTITIES[" "]
        direction TB
        SL["Subdivision Leader"]:::entity
    end

    style DATA_STORES fill:transparent,stroke:transparent
    style PROCESSES fill:transparent,stroke:transparent
    style ENTITIES fill:transparent,stroke:transparent

    %% 3.1 Assess Urgency & Ownership
    SL -->|"Assessments"| P3_1
    P3_1 -->|"Reports & Photos"| SL
    D3 -->|"Unverified Reports & Media"| P3_1
    P3_1 -->|"Urgency & Ownership State"| D3
    P3_1 -->|"Assessment Audit Log"| D11

    %% 3.2 Review Match Leads & Links
    SL -->|"Links"| P3_2
    P3_2 -->|"Match Leads"| SL
    D2 -->|"Pet Breed & Color Tags"| P3_2
    D3 -->|"Related Incident Reports"| P3_2
    D4 -->|"Lost/Found Notice Records"| P3_2
    P3_2 -->|"Confirmed Links & Identity"| D3
    P3_2 -->|"Match & Link Audit Log"| D11

    %% 3.3 Assign Case Pathways
    SL -->|"Pathways"| P3_3
    P3_3 -->|"Reports"| SL
    D3 -->|"Assessed Case & Links"| P3_3
    P3_3 -->|"Pathway A / B / C Queue"| D6
    P3_3 -->|"Pathway Audit Log"| D11
```

---

## 5. Diagram 5 — DFD Level 1 (Module 4.0: Interventions, Warnings, Claims & Referrals)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000
    classDef store fill:#E5E7EB,stroke:#000000,color:#000000

    subgraph DATA_STORES[" "]
        direction TB
        D2["D2 | Pet Registry & QR Tags"]:::store
        D3["D3 | Incident Reports & Evidence"]:::store
        D6["D6 | Case Interventions & Messaging"]:::store
        D7["D7 | Warnings, Complaints & Observation"]:::store
        D8["D8 | External Referrals & Claims"]:::store
        D9["D9 | Alerts & Notifications"]:::store
        D10["D10 | Subdivision & Policy Config"]:::store
        D11["D11 | Audit Logs"]:::store
    end

    subgraph PROCESSES[" "]
        direction TB
        P4_1["4.1 Log Actions & Chat"]:::process
        P4_2["4.2 Issue Warning Letter & Compliance"]:::process
        P4_3["4.3 Log External Referrals & Outcomes"]:::process
        P4_4["4.4 Decide Claims & Case Alerts"]:::process
    end

    subgraph ENTITIES[" "]
        direction TB
        RES["Resident"]:::entity
        SL["Subdivision Leader"]:::entity
    end

    style DATA_STORES fill:transparent,stroke:transparent
    style PROCESSES fill:transparent,stroke:transparent
    style ENTITIES fill:transparent,stroke:transparent

    %% 4.1 Log Actions & Chat
    RES -->|"Chat"| P4_1
    SL -->|"Actions"| P4_1
    P4_1 -->|"Chat & Case Timeline"| RES
    P4_1 -->|"Reports"| SL
    D3 -->|"Active Case Record"| P4_1
    D6 -->|"Action Logs & Chat History"| P4_1
    P4_1 -->|"Follow-Ups, Visits & Messages"| D6
    P4_1 -->|"Chat Push Alert"| D9
    P4_1 -->|"Intervention Audit Log"| D11

    %% 4.2 Issue Warning Letter & Compliance
    RES -->|"Acknowledgement"| P4_2
    SL -->|"Warnings"| P4_2
    P4_2 -->|"Warning Letter & Push Alerts"| RES
    P4_2 -->|"Compliance"| SL
    D10 -->|"Subdivision Rules"| P4_2
    D3 -->|"Verified Violation Case"| P4_2
    D7 -->|"Templates, Offenses & Warnings"| P4_2
    P4_2 -->|"A4 Letter & Compliance Log"| D7
    P4_2 -->|"Warning Push Alert"| D9
    P4_2 -->|"Warning Audit Log"| D11

    %% 4.3 Log External Referrals & Outcomes
    SL -->|"Referrals"| P4_3
    P4_3 -->|"Referrals"| SL
    D3 -->|"Escalated Case Record"| P4_3
    D8 -->|"Stored Referral Records"| P4_3
    P4_3 -->|"Referral & Field Outcome Log"| D8
    P4_3 -->|"Referral Audit Log"| D11

    %% 4.4 Decide Claims & Case Alerts
    RES -->|"Claim Proof"| P4_4
    SL -->|"Claim Verdicts"| P4_4
    P4_4 -->|"Claim Verdict & Push Alerts"| RES
    P4_4 -->|"Claims"| SL
    D2 -->|"Pet Ownership Record"| P4_4
    P4_4 -->|"Confirmed Owner Transfer"| D2
    D3 -->|"Claimed Animal Case"| P4_4
    D8 -->|"Competing Claim Proofs"| P4_4
    P4_4 -->|"Claim Verdict Record"| D8
    P4_4 -->|"Targeted Push & Claim Alerts"| D9
    P4_4 -->|"Claim & Alert Audit Log"| D11
```

---

## 6. Diagram 6 — DFD Level 1 (Module 5.0: Closure, Analytics & Audit Trails)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000
    classDef store fill:#E5E7EB,stroke:#000000,color:#000000

    subgraph DATA_STORES[" "]
        direction TB
        D2["D2 | Pet Registry & QR Tags"]:::store
        D3["D3 | Incident Reports & Evidence"]:::store
        D4["D4 | Lost & Found & Sightings"]:::store
        D6["D6 | Case Interventions & Messaging"]:::store
        D7["D7 | Warnings, Complaints & Observation"]:::store
        D8["D8 | External Referrals & Claims"]:::store
        D9["D9 | Alerts & Notifications"]:::store
        D11["D11 | Audit Logs"]:::store
    end

    subgraph PROCESSES[" "]
        direction TB
        P5_1["5.1 Record Closure Dispositions"]:::process
        P5_2["5.2 Generate Case Analytics"]:::process
        P5_3["5.3 Compile Audit Trails"]:::process
    end

    subgraph ENTITIES[" "]
        direction TB
        RES["Resident"]:::entity
        SL["Subdivision Leader"]:::entity
    end

    style DATA_STORES fill:transparent,stroke:transparent
    style PROCESSES fill:transparent,stroke:transparent
    style ENTITIES fill:transparent,stroke:transparent

    %% 5.1 Record Closure Dispositions
    SL -->|"Closures"| P5_1
    P5_1 -->|"Case Timeline & Push Alerts"| RES
    P5_1 -->|"Reports"| SL
    D2 -->|"Pet Tag Scan & Status"| P5_1
    P5_1 -->|"Updated Pet Home Status"| D2
    D3 -->|"Open & Closed Case Records"| P5_1
    P5_1 -->|"Disposition & Reopen Status"| D3
    D4 -->|"Active Notice Records"| P5_1
    P5_1 -->|"Closed Notice Status"| D4
    D6 -->|"Completed Action & Chat Logs"| P5_1
    D7 -->|"Compliance Completion Logs"| P5_1
    D8 -->|"Final Referral & Claim States"| P5_1
    P5_1 -->|"Case Closure Alert"| D9
    P5_1 -->|"Closure Audit Entry"| D11

    %% 5.2 Generate Case Analytics
    SL -->|"Queries"| P5_2
    P5_2 -->|"Analytics"| SL
    D3 -->|"Report Counts & Categories"| P5_2
    D4 -->|"Sighting & Recovery Counts"| P5_2

    %% 5.3 Compile Audit Trails
    SL -->|"Queries"| P5_3
    P5_3 -->|"Audits"| SL
    D11 -->|"Chronological Audit Entries"| P5_3
```

---

## 7. Level 0 ↔ Diagrams 2–6 Balancing Check

| Level 0 Flow | Exact Level 0 Labels | Covered In |
| :--- | :--- | :--- |
| **`Resident` → `STRAYSAFE`** | `Login, OTP`, `Pet Profile`, `Report`, `Media`, `GPS Pin`, `QR Tag Scan`, `Sighting Notice`, `Claim Proof`, `Chat`, `Acknowledgement` | **Diagram 2** (`1.1`, `1.3`) · **Diagram 3** (`2.1`, `2.3`, `2.4`) · **Diagram 5** (`4.1`, `4.2`, `4.4`) |
| **`STRAYSAFE` → `Resident`** | `Session Token`, `Reference ID`, `Notices`, `Sightings`, `Push Alerts`, `Case Timeline`, `Chat`, `Warning Letter`, `Claim Verdict` | **Diagram 2** (`1.1`, `1.3`) · **Diagram 3** (`2.1`, `2.2`, `2.3`, `2.4`) · **Diagram 5** (`4.1`, `4.2`, `4.4`) · **Diagram 6** (`5.1`) |
| **`Subdivision Leader` → `STRAYSAFE`** | `Leader Login`, `Policies`, `Pin Fix`, `Notice Moderation`, `Assessments`, `Links`, `Pathways`, `Actions`, `Warnings`, `Referrals`, `Claim Verdicts`, `Closures`, `Queries` | **Diagram 2** (`1.2`, `1.4`) · **Diagram 3** (`2.2`, `2.3`) · **Diagram 4** (`3.1`, `3.2`, `3.3`) · **Diagram 5** (`4.1`, `4.2`, `4.3`, `4.4`) · **Diagram 6** (`5.1`, `5.2`, `5.3`) |
| **`STRAYSAFE` → `Subdivision Leader`** | `Leader Session`, `Directory`, `Reports`, `Photos`, `Pin Flags`, `Match Leads`, `QR Scans`, `Compliance`, `Claims`, `Referrals`, `Analytics`, `Audits` | **Diagram 2** (`1.2`, `1.4`) · **Diagram 3** (`2.1`, `2.2`, `2.3`, `2.4`) · **Diagram 4** (`3.1`, `3.2`, `3.3`) · **Diagram 5** (`4.1`, `4.2`, `4.3`, `4.4`) · **Diagram 6** (`5.1`, `5.2`, `5.3`) |
