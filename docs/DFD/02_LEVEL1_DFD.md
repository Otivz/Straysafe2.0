# Level 1 DFD

The Level 1 DFD breaks the system into its ten main processes. It is drawn as two system views: **1A** covers the core operations (processes 1.0–6.0) and **1B** covers adoption and the supporting processes (7.0–10.0). The data stores D1–D11 correspond to the modules of the ERD. These system views retain the full boundary exchanges; use the smaller split role views for manuscript figures. Dashed processes on the other page keep their original process number. The role views are projections of these processes, not independent decompositions.

## Level 1A — Core Operations (1.0–6.0)



Raw code: [`mermaid/01a_level1_core.mmd`](mermaid/01a_level1_core.mmd)

```mermaid
---
config:
  theme: base
  htmlLabels: true
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
    D1["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D1</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Users</td></tr></table>"]:::store
    D2["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D2</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Locations</td></tr></table>"]:::store
    D3["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D3</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Pets</td></tr></table>"]:::store
    D4["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D4</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Reports</td></tr></table>"]:::store
    D5["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D5</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Claims and Returns</td></tr></table>"]:::store
    D6["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D6</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>AI Matches</td></tr></table>"]:::store
    D7["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D7</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Rescues and Holding</td></tr></table>"]:::store
    D11["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D11</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Audit and Settings</td></tr></table>"]:::store
    P7(["7.0 Manage<br/>Adoptions"]):::off
    P8(["8.0 Handle Communication<br/>and Notifications<br/>(Level 1B)"]):::off

    %% Arrows carry data; dashed processes continue on another page.
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
    RES -->|"stray or lost-pet report, photos, dispute and supporting evidence"| P3
    P3 -->|"report photos"| CLD
    CLD -->|"file links"| P3
    MAP -->|"street address"| P3
    D2 -->|"subdivision, landmarks"| P3
    LDR -->|"assignment, verification, merge, visibility, transfer, endorsement and dispute decisions"| P3
    P3 -->|"subdivision reports"| LDR
    P3 -->|"report, timeline, media"| D4
    D4 -->|"report details"| P3
    P3 -->|"new report for analysis"| P4
    P3 -->|"report escalated for rescue"| P5
    D4 -->|"report photos"| P4
    D3 -->|"registered pets"| P4
    P4 -->|"photos, descriptions and comparison pairs"| GEM
    GEM -->|"suggested animal details and comparison results"| P4
    P4 -->|"AI jobs, cached comparisons, match suggestions and review responses"| D6
    P4 -->|"AI match suggestions"| LDR
    LDR -->|"match decision"| P4
    P4 -->|"owner verification request"| RES
    RES -->|"owner answer"| P4
    STF -->|"rescue dispatch, intake, care logs"| P5
    P5 -->|"rescue and holding record"| D7
    P5 -->|"status update"| D4
    RES -->|"claim proof, evidence and recovery confirmation"| P6
    P6 -->|"claim result"| RES
    STF -->|"claim decision and handover record"| P6
    D7 -->|"holding record"| P6
    P6 -->|"claim and return record"| D5
    P6 -->|"pet history, ownership"| D3
    P6 -->|"report closed"| D4
    LDR -->|"login credentials"| P1
    STF -->|"login credentials; personnel account details from Head Officer"| P1
    ADM -->|"login credentials and user account changes"| P1
    P1 -->|"access result and account status"| RES
    P1 -->|"access result and subdivision scope"| LDR
    P1 -->|"access result and personnel account status"| STF
    P1 -->|"access result and user records"| ADM
    P2 -->|"pet profile, QR card, warnings and scan alerts"| RES
    STF -->|"pet record changes and owner warning details"| P2
    ADM -->|"authorized pet record changes"| P2
    P2 -->|"scoped pet records and registration results"| LDR
    P2 -->|"pet records and warning results"| STF
    P2 -->|"pet records and action results"| ADM
    P2 -->|"pet photos"| CLD
    CLD -->|"stored pet media links"| P2
    P3 -->|"report acknowledgement, timeline and dispute results"| RES
    STF -->|"status, evidence and dispute decisions"| P3
    ADM -->|"report review and authorized decisions"| P3
    P3 -->|"endorsed reports and action records"| STF
    P3 -->|"report records and action results"| ADM
    D3 -->|"pet records relevant to disputes"| P3
    P3 -->|"location coordinates"| MAP
    P4 -->|"jointly confirmed sighting and pet history"| D3
    P4 -->|"AI details and jointly confirmed pet links"| D4
    D6 -->|"jobs, cached comparisons and pending match reviews"| P4
    D11 -->|"AI matching configuration"| P4
    ADM -->|"AI engine configuration and rescan request"| P4
    P4 -->|"AI engine setting and configuration audit entry"| D11
    P4 -->|"saved AI engine mode and rescan job status"| ADM
    P4 -->|"confirmed duplicate report information"| P3
    D1 -->|"authorized responders"| P5
    D2 -->|"holding facilities"| P5
    D4 -->|"report location and case details"| P5
    D7 -->|"rescue assignments and holding records"| P5
    LDR -->|"rescue escalation, permitted local intake and care details"| P5
    P5 -->|"rescue progress and permitted local holding records"| LDR
    P5 -->|"assignment notices and rescue or holding status"| STF
    P5 -->|"care and condition photos"| CLD
    CLD -->|"stored care media links"| P5
    D3 -->|"pet and ownership records"| P6
    D4 -->|"case and recovery records"| P6
    D5 -->|"pending claims and approved handover records"| P6
    LDR -->|"scoped claim decision and permitted local handover details"| P6
    P6 -->|"pending claims, proof and review results"| LDR
    P6 -->|"pending claims, proof and review results"| STF
    P6 -->|"released animal status"| D7
    P6 -->|"claim, handover and recovery evidence"| CLD
    CLD -->|"stored ownership proof links"| P6
    P5 -->|"adoption-eligible animal record"| P7
    P1 -->|"account and case event data"| P8
    P2 -->|"account and case event data"| P8
    P3 -->|"account and case event data"| P8
    P4 -->|"account and case event data"| P8
    P5 -->|"account and case event data"| P8
    P6 -->|"account and case event data"| P8

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#ffffff,stroke:#000000,stroke-width:1.5px
    classDef store fill:transparent,stroke:none,padding:0px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
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
  htmlLabels: true
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
    D1["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D1</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Users</td></tr></table>"]:::store
    D2["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D2</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Locations</td></tr></table>"]:::store
    D3["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D3</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Pets</td></tr></table>"]:::store
    D4["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D4</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Reports</td></tr></table>"]:::store
    D7["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D7</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Rescues and Holding</td></tr></table>"]:::store
    D8["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D8</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Adoptions</td></tr></table>"]:::store
    D9["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D9</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Messages and Notifications</td></tr></table>"]:::store
    D10["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D10</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Announcements</td></tr></table>"]:::store
    D11["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D11</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Audit and Settings</td></tr></table>"]:::store
    P1(["1.0<br/>Manage User<br/>Accounts"]):::off
    P2(["2.0<br/>Manage Pet<br/>Records"]):::off
    P3(["3.0<br/>Process<br/>Reports"]):::off
    P4(["4.0<br/>Perform AI<br/>Matching"]):::off
    P5(["5.0<br/>Manage Rescue<br/>and Holding"]):::off
    P6(["6.0<br/>Process Claims and<br/>Reunification"]):::off
    CLD["Cloudinary<br/>Media Storage"]:::ent
    MAP["OpenStreetMap<br/>Services"]:::ent

    %% Arrows carry data; dashed processes continue on another page.
    RES -->|"application and ID, signed agreement, handover confirmation and check-in evidence"| P7
    P7 -->|"adoption catalog, application status, certificate, monitoring and handover updates"| RES
    STF -->|"verification, task assignments, evaluations, approval, handover and monitoring decisions"| P7
    P7 -->|"task assignments"| STF
    D7 -->|"animals for adoption"| P7
    P7 -->|"adoption records"| D8
    D8 -->|"adoption case"| P7
    P7 -->|"new pet record for adopter"| D3
    PUB -->|"certificate number"| P7
    P7 -->|"certificate validity"| PUB
    RES -->|"chat messages"| P8
    LDR -->|"chat messages"| P8
    D1 -->|"recipient accounts and contact details"| P8
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
    P1 -->|"account and case event data"| P8
    P2 -->|"account and case event data"| P8
    P3 -->|"account and case event data"| P8
    P4 -->|"account and case event data"| P8
    P5 -->|"account and case event data"| P8
    P6 -->|"account and case event data"| P8
    P7 -->|"adoption event data"| P8
    P9 -->|"announcement event data"| P8
    P10 -->|"administrative event data"| P8
    P5 -->|"adoption-eligible animal record"| P7
    P7 -->|"adopted animal and custody status"| D7
    P7 -->|"applicant documents and adoption evidence photos"| CLD
    CLD -->|"stored adoption media links"| P7
    D9 -->|"message history, notification preferences and push subscriptions"| P8
    STF -->|"chat messages and notification preferences"| P8
    P8 -->|"messages and notifications"| LDR
    P8 -->|"messages and notifications"| STF
    P8 -->|"system notifications"| ADM
    D10 -->|"published announcements and discussion records"| P9
    P9 -->|"published announcement and posting result"| LDR
    P9 -->|"published announcement and posting result"| STF
    D1 -->|"user statistics and account records"| P10
    D2 -->|"current landmarks and coverage"| P10
    P10 -->|"map extent and report coordinates"| MAP
    MAP -->|"map tiles"| P10

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#ffffff,stroke:#000000,stroke-width:1.5px
    classDef store fill:transparent,stroke:none,padding:0px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 7.0 | Manage Adoptions | Publishes adoptable animals, processes applications through screening, approval, handover, certificate and monitoring |
| 8.0 | Handle Communication and Notifications | Delivers chat messages, in-app notifications, push notifications and emails triggered by the other processes |
| 9.0 | Publish Announcements | Posts community alerts to a barangay or subdivision and records residents' comments and reactions |
| 10.0 | Administer System | Maintains settings, landmarks and the coverage area, and provides dashboard statistics and audit logs |

The dashed connector stands for processes 1.0–7.0, which send events (for example a new report or a claim decision) to process 8.0. Every process also writes an audit entry to D11; these flows are omitted for clarity.
