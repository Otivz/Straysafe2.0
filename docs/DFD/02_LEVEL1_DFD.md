# Level 1 DFD

The Level 1 DFD breaks the system into its ten main processes. To keep it readable on a manuscript page it is drawn on two pages: **1A** covers the core operations (processes 1.0–6.0) and **1B** covers adoption and the supporting processes (7.0–10.0). The data stores D1–D11 correspond to the modules of the ERD.

## Level 1A — Core Operations (1.0–6.0)



Raw code: [`mermaid/01a_level1_core.mmd`](mermaid/01a_level1_core.mmd)

```mermaid
---
config:
  theme: base
  themeVariables:
    background: "#ffffff"
    primaryColor: "#ffffff"
    primaryTextColor: "#000000"
    primaryBorderColor: "#000000"
    lineColor: "#000000"
    textColor: "#000000"
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15px"
  flowchart:
    curve: basis
    nodeSpacing: 40
    rankSpacing: 70
    useMaxWidth: false
---
flowchart LR
    RES["Resident"]:::ent
    LDR["Subdivision Leader"]:::ent
    STF["Barangay Staff"]:::ent
    ADM["Administrator"]:::ent
    PUB["Public Visitor<br/>(no account)"]:::ent
    GEM["Google Gemini AI"]:::ent
    CLD["Cloudinary<br/>Media Storage"]:::ent
    EML["Email Service"]:::ent
    MAP["OpenStreetMap<br/>Services"]:::ent
    P1("1.0<br/>Manage User<br/>Accounts"):::proc
    P2("2.0<br/>Manage Pet<br/>Records"):::proc
    P3("3.0<br/>Process<br/>Reports"):::proc
    P4("4.0<br/>Perform AI<br/>Matching"):::proc
    P5("5.0<br/>Manage Rescue<br/>and Holding"):::proc
    P6("6.0<br/>Process Claims and<br/>Reunification"):::proc
    D1[("D1 Users")]:::store
    D2[("D2 Locations")]:::store
    D3[("D3 Pets")]:::store
    D4[("D4 Reports")]:::store
    D5[("D5 Claims and Returns")]:::store
    D6[("D6 AI Matches")]:::store
    D7[("D7 Rescues and Holding")]:::store

    RES -->|"registration and sign-in details"| P1
    ADM -->|"staff accounts"| P1
    P1 -->|"OTP code"| EML
    P1 -->|"user record"| D1
    D1 -->|"account and role"| P1
    RES -->|"pet details and photos"| P2
    LDR -->|"pet registered for an owner"| P2
    PUB -->|"QR scan and found location"| P2
    P2 -->|"public pet information"| PUB
    P2 -->|"pet record, QR tag, scan"| D3
    D3 -->|"pet record"| P2
    RES -->|"stray or lost-pet report, photos"| P3
    P3 -->|"report photos"| CLD
    CLD -->|"file links"| P3
    MAP -->|"street address"| P3
    D2 -->|"subdivision, landmarks"| P3
    LDR -->|"claim, verify, merge, endorse"| P3
    P3 -->|"subdivision reports"| LDR
    P3 -->|"report, timeline, media"| D4
    D4 -->|"report details"| P3
    P3 -->|"new report for analysis"| P4
    P3 -->|"report escalated for rescue"| P5
    D4 -->|"report photos"| P4
    D3 -->|"registered pets"| P4
    P4 -->|"photo pairs"| GEM
    GEM -->|"comparison result"| P4
    P4 -->|"match suggestion"| D6
    P4 -->|"AI match suggestions"| LDR
    LDR -->|"match decision"| P4
    P4 -->|"owner verification request"| RES
    RES -->|"owner answer"| P4
    STF -->|"rescue dispatch, intake, care logs"| P5
    P5 -->|"rescue and holding record"| D7
    P5 -->|"status update"| D4
    RES -->|"claim and proof"| P6
    P6 -->|"claim result"| RES
    STF -->|"handover record"| P6
    D7 -->|"holding record"| P6
    P6 -->|"claim and return record"| D5
    P6 -->|"pet history, ownership"| D3
    P6 -->|"report closed"| D4

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#ffffff,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f2f2f2,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · grey cylinder = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 1.0 | Manage User Accounts | Registers residents (with an emailed OTP), signs users in and out, and lets the administrator create staff accounts |
| 2.0 | Manage Pet Records | Registers pets and QR tags, records QR scans by finders, and handles ownership confirmations and owner warnings |
| 3.0 | Process Reports | Receives stray and lost-pet reports, and lets leaders claim, verify, merge, endorse and update them |
| 4.0 | Perform AI Matching | Analyses report photos and suggests matching reports or registered pets for staff and owners to confirm |
| 5.0 | Manage Rescue and Holding | Dispatches rescues and records animals taken into the holding facility and their care |
| 6.0 | Process Claims and Reunification | Handles owners' claims and records the handover of an animal back to its owner |

Data stores on this page: D1 Users, D2 Locations, D3 Pets, D4 Reports, D5 Claims and Returns, D6 AI Matches, D7 Rescues and Holding.

## Level 1B — Adoption and Support Processes (7.0–10.0)



Raw code: [`mermaid/01b_level1_support.mmd`](mermaid/01b_level1_support.mmd)

```mermaid
---
config:
  theme: base
  themeVariables:
    background: "#ffffff"
    primaryColor: "#ffffff"
    primaryTextColor: "#000000"
    primaryBorderColor: "#000000"
    lineColor: "#000000"
    textColor: "#000000"
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15px"
  flowchart:
    curve: basis
    nodeSpacing: 40
    rankSpacing: 70
    useMaxWidth: false
---
flowchart LR
    RES["Resident"]:::ent
    LDR["Subdivision Leader"]:::ent
    STF["Barangay Staff"]:::ent
    ADM["Administrator"]:::ent
    PUB["Public Visitor<br/>(no account)"]:::ent
    EML["Email Service"]:::ent
    PSH["Web Push Service"]:::ent
    P7("7.0<br/>Manage<br/>Adoptions"):::proc
    P8("8.0<br/>Handle Communication<br/>and Notifications"):::proc
    P9("9.0<br/>Publish<br/>Announcements"):::proc
    P10("10.0<br/>Administer<br/>System"):::proc
    D1[("D1 Users")]:::store
    D2[("D2 Locations")]:::store
    D3[("D3 Pets")]:::store
    D4[("D4 Reports")]:::store
    D7[("D7 Rescues and Holding")]:::store
    D8[("D8 Adoptions")]:::store
    D9[("D9 Messages and Notifications")]:::store
    D10[("D10 Announcements")]:::store
    D11[("D11 Audit and Settings")]:::store
    OFF(["Processes 1.0–7.0<br/>(Level 1A and 7.0)"]):::off

    RES -->|"application, ID, check-ins"| P7
    P7 -->|"adoption updates, certificate"| RES
    STF -->|"verification, evaluations, approval"| P7
    P7 -->|"task assignments"| STF
    D7 -->|"animals for adoption"| P7
    P7 -->|"adoption records"| D8
    D8 -->|"adoption case"| P7
    P7 -->|"new pet record for adopter"| D3
    PUB -->|"certificate number"| P7
    P7 -->|"certificate validity"| PUB
    OFF -->|"system events"| P8
    RES -->|"chat messages"| P8
    LDR -->|"chat messages"| P8
    D1 -->|"recipients, preferences"| P8
    P8 -->|"messages, notifications"| D9
    P8 -->|"notifications"| RES
    P8 -->|"status emails"| EML
    P8 -->|"push notifications"| PSH
    LDR -->|"announcement"| P9
    STF -->|"announcement"| P9
    D2 -->|"audience area"| P9
    P9 -->|"announcement, media"| D10
    P9 -->|"announcement feed"| RES
    RES -->|"comments, reactions"| P9
    ADM -->|"settings, landmarks, coverage"| P10
    P10 -->|"landmarks, coverage area"| D2
    P10 -->|"settings"| D11
    D11 -->|"audit logs"| P10
    D4 -->|"report figures"| P10
    D3 -->|"pet figures"| P10
    P10 -->|"dashboard statistics, audit logs"| ADM

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#ffffff,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f2f2f2,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · grey cylinder = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 7.0 | Manage Adoptions | Publishes adoptable animals, processes applications through screening, approval, handover, certificate and monitoring |
| 8.0 | Handle Communication and Notifications | Delivers chat messages, in-app notifications, push notifications and emails triggered by the other processes |
| 9.0 | Publish Announcements | Posts community alerts to a barangay or subdivision and records residents' comments and reactions |
| 10.0 | Administer System | Maintains settings, landmarks and the coverage area, and provides dashboard statistics and audit logs |

The dashed connector stands for processes 1.0–7.0, which send events (for example a new report or a claim decision) to process 8.0. Every process also writes an audit entry to D11; these flows are omitted for clarity.
