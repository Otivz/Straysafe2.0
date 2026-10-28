# Level 1 DFDs by User Role

> [Exact editable DFD symbols](drawio/README.md) are available in the native `.drawio` files. The Mermaid blocks below are simplified previews with portable labels.

The Level 1 DFD is presented once for each focus role. Whenever process 1.0 Manage User Accounts is drawn as a complete process, all four authenticated human roles are included with account inputs and results. Other processes retain their focus-role interactions. All four use the same process numbers (1.0–10.0) and the same data stores (D1–D11), so they can be read side by side. These are partial views of the same system, with a shared account process and selected operational interactions for the focus role. They do not define separate system boundaries or list every permission available to that role.

| Role | Processes used |
|---|---|
| Resident | 1.0, 2.0, 3.0, 4.0, 6.0, 7.0, 8.0, 9.0 |
| Subdivision Leader | 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 9.0 |
| Barangay Staff | 1.0, 2.0, 3.0, 5.0, 6.0, 7.0, 8.0, 9.0 |
| Administrator | 1.0, 2.0, 3.0, 4.0, 8.0, 10.0 |

## Level 1 DFD — Resident, Part 1: Accounts, Pets, Reports and AI Matching

Because the resident uses eight processes, the resident's Level 1 DFD is drawn on two pages. Part 1 covers the resident's account, pets, reports and the AI matches shown to owners. The resident is on the left and the data stores are on the right.

Raw code: [`mermaid/02r1_level1_resident_part1.mmd`](mermaid/02r1_level1_resident_part1.mmd)

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
    subgraph COL1[" "]
        direction TB
        RES["Resident"]:::ent
        LDR["Subdivision Leader"]:::ent
        STF["Barangay Staff"]:::ent
        ADM["Administrator"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P1("1.0<br/>Manage User<br/>Accounts"):::proc
        P2("2.0<br/>Manage Pet<br/>Records"):::proc
        P3("3.0<br/>Process<br/>Reports"):::proc
        P4("4.0<br/>Perform AI<br/>Matching"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D1["D1 | Users"]:::store
        D2["D2 | Locations"]:::store
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D6["D6 | AI Matches"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    RES -->|"registration, sign-in, profile"| P1
    P1 -->|"account"| D1
    D1 -->|"account details"| P1
    P1 -->|"verified account"| RES
    RES -->|"pet details, photos, ownership answer"| P2
    P2 -->|"pet record, QR tag, scans and ownership response"| D3
    D3 -->|"my pets, scan history"| P2
    P2 -->|"pet QR card, scan alerts"| RES
    RES -->|"stray or lost-pet report, photos, dispute and evidence"| P3
    D2 -->|"subdivision, landmarks"| P3
    P3 -->|"report"| D4
    D4 -->|"report and timeline"| P3
    P3 -->|"report status, timeline"| RES
    D6 -->|"possible match"| P4
    P4 -->|"match for owner to verify"| RES
    RES -->|"owner answer"| P4
    P4 -->|"owner response"| D6


    %% Shared account process includes every authenticated human role.
    LDR -->|"login credentials and profile updates"| P1
    P1 -->|"account status and subdivision access"| LDR
    STF -->|"login credentials and profile updates; personnel account details from Head Officer"| P1
    P1 -->|"access result and personnel account status"| STF
    ADM -->|"login credentials, user account and role changes"| P1
    P1 -->|"access result, user accounts and role records"| ADM

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 1.0 | Manage User Accounts | Registers with an emailed one-time password, signs in and updates the profile |
| 2.0 | Manage Pet Records | Registers the resident's pets, issues QR tags, shows scan history, and asks the resident to accept ownership changes |
| 3.0 | Process Reports | Receives the resident's stray or lost-pet report with photos and shows its status and timeline |
| 4.0 | Perform AI Matching | Shows the owner a possible sighting of their pet and records whether it is their pet |



## Level 1 DFD — Resident, Part 2: Claims, Adoptions, Communication and Announcements

Part 2 covers the resident's claims for found pets, adoptions, messages and notifications, and community alerts. D3 Pets appears on both pages because it is shared by pet registration (Part 1) and claims (Part 2).

Raw code: [`mermaid/02r2_level1_resident_part2.mmd`](mermaid/02r2_level1_resident_part2.mmd)

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
    subgraph COL1[" "]
        direction TB
        RES["Resident"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P6("6.0<br/>Process Claims and<br/>Reunification"):::proc
        P7("7.0<br/>Manage<br/>Adoptions"):::proc
        P8("8.0<br/>Handle Communication<br/>and Notifications"):::proc
        P9("9.0<br/>Publish<br/>Announcements"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D5["D5 | Claims and Returns"]:::store
        D7["D7 | Rescues and Holding"]:::store
        D8["D8 | Adoptions"]:::store
        D9["D9 | Messages and Notifications"]:::store
        D10["D10 | Announcements"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    RES -->|"claim, proof, recovery confirmation"| P6
    P6 -->|"claim"| D5
    P6 -->|"pet history"| D3
    P6 -->|"claim result"| RES
    D7 -->|"animals for adoption"| P7
    P7 -->|"catalog, application status, certificate"| RES
    RES -->|"application, ID, check-ins"| P7
    P7 -->|"application, check-ins"| D8
    RES -->|"messages, notification settings"| P8
    P8 -->|"messages, preferences"| D9
    P8 -->|"notifications, replies"| RES
    D10 -->|"published alerts"| P9
    P9 -->|"community alerts"| RES
    RES -->|"comments, reactions"| P9
    P9 -->|"comments, reactions"| D10
    D5 -->|"claim decisions and return records"| P6
    D8 -->|"applications, certificates and monitoring records"| P7
    D9 -->|"message history, notifications and preferences"| P8
    P6 -->|"pet history and ownership updates"| D3
    P6 -->|"claim and recovery status"| D4
    D3 -->|"registered pet and ownership records"| P6
    D4 -->|"report and recovery records"| P6

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 6.0 | Process Claims and Reunification | Receives the owner's claim and proof, returns the decision, and records a self-confirmed recovery |
| 7.0 | Manage Adoptions | Shows the adoption catalog, receives applications and post-adoption check-ins, and issues the certificate |
| 8.0 | Handle Communication and Notifications | Delivers chat replies and notifications (in-app and push) according to the resident's settings |
| 9.0 | Publish Announcements | Shows community alerts and records the resident's comments and reactions |



## Level 1 DFD — Subdivision Leader, Part 1: Accounts, Pets, Reports and AI Matching

The Subdivision Leader's Level 1 DFD is drawn on two pages. Part 1 covers signing in, the subdivision's pet records, report handling and the review of AI match suggestions. The leader is on the left and the data stores are on the right. The dashed box 5.0 is a connector to Part 2, where escalated reports are followed.

Raw code: [`mermaid/02s1_level1_subdivision_leader_part1.mmd`](mermaid/02s1_level1_subdivision_leader_part1.mmd)

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
    subgraph COL1[" "]
        direction TB
        LDR["Subdivision Leader"]:::ent
        RES["Resident"]:::ent
        STF["Barangay Staff"]:::ent
        ADM["Administrator"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P1("1.0<br/>Manage User<br/>Accounts"):::proc
        P2("2.0<br/>Manage Pet<br/>Records"):::proc
        P3("3.0<br/>Process<br/>Reports"):::proc
        P4("4.0<br/>Perform AI<br/>Matching"):::proc
        P5(["5.0<br/>Manage Rescue<br/>and Holding<br/>(see other part)"]):::off
    end
    subgraph COL3[" "]
        direction TB
        D1["D1 | Users"]:::store
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D6["D6 | AI Matches"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    LDR -->|"sign-in"| P1
    D1 -->|"role and subdivision"| P1
    P1 -->|"subdivision access"| LDR
    LDR -->|"pet registered for an owner, merge decisions, warnings"| P2
    P2 -->|"pet record, warning"| D3
    D3 -->|"subdivision pet records"| P2
    P2 -->|"pet records, possible duplicates"| LDR
    D4 -->|"subdivision reports"| P3
    P3 -->|"report queue"| LDR
    LDR -->|"report assignment, verification, visibility, transfer, status, endorsement and dispute decisions"| P3
    P3 -->|"updated report, timeline, letter"| D4
    D6 -->|"AI match suggestions"| P4
    P4 -->|"suggestions with evidence"| LDR
    LDR -->|"match decision, review remarks and owner-verification request"| P4
    P4 -->|"review decision"| D6
    P3 -->|"report escalated for rescue"| P5


    %% Shared account process includes every authenticated human role.
    RES -->|"registration details, login credentials and profile updates"| P1
    P1 -->|"account verification and access result"| RES
    STF -->|"login credentials and profile updates; personnel account details from Head Officer"| P1
    P1 -->|"access result and personnel account status"| STF
    ADM -->|"login credentials, user account and role changes"| P1
    P1 -->|"access result, user accounts and role records"| ADM

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 1.0 | Manage User Accounts | Signs the leader in and limits access to their own subdivision |
| 2.0 | Manage Pet Records | Registers pets for owners (including owners without an account), resolves possible duplicate records and issues owner warnings |
| 3.0 | Process Reports | Gives the leader the subdivision's reports to claim, verify, set visibility, transfer, update and endorse to the barangay |
| 4.0 | Perform AI Matching | Presents AI match suggestions for the leader to confirm or reject, and sends owner verification requests |



## Level 1 DFD — Subdivision Leader, Part 2: Rescue Status, Claims, Communication and Announcements

Part 2 covers escalated rescues, owners' claims, messages and notifications, and hazard alerts. The dashed box 3.0 is a connector to Part 1, where the report is escalated. D4 Reports appears on both pages because claims close the reports handled in Part 1.

Raw code: [`mermaid/02s2_level1_subdivision_leader_part2.mmd`](mermaid/02s2_level1_subdivision_leader_part2.mmd)

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
    subgraph COL1[" "]
        direction TB
        LDR["Subdivision Leader"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P3(["3.0<br/>Process<br/>Reports<br/>(see other part)"]):::off
        P5("5.0<br/>Manage Rescue<br/>and Holding"):::proc
        P6("6.0<br/>Process Claims and<br/>Reunification"):::proc
        P8("8.0<br/>Handle Communication<br/>and Notifications"):::proc
        P9("9.0<br/>Publish<br/>Announcements"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D2["D2 | Locations"]:::store
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D5["D5 | Claims and Returns"]:::store
        D7["D7 | Rescues and Holding"]:::store
        D9["D9 | Messages and Notifications"]:::store
        D10["D10 | Announcements"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    P3 -->|"report escalated for rescue"| P5
    D7 -->|"rescue and holding records"| P5
    P5 -->|"rescue progress and permitted local holding records"| LDR
    D5 -->|"pending claims"| P6
    P6 -->|"claims to review"| LDR
    LDR -->|"claim decision, handover record"| P6
    P6 -->|"claim status, return record"| D5
    P6 -->|"report closed"| D4
    LDR -->|"messages to reporters"| P8
    P8 -->|"messages"| D9
    P8 -->|"notifications, replies"| LDR
    LDR -->|"hazard alert"| P9
    D2 -->|"subdivision audience"| P9
    P9 -->|"announcement"| D10
    D9 -->|"message history, notifications and preferences"| P8
    P6 -->|"pet history and ownership updates"| D3
    P6 -->|"claim and recovery status"| D4
    D10 -->|"published announcements"| P9
    P9 -->|"published announcement and posting result"| LDR
    P5 -->|"local custody, care and escalation records"| D7
    LDR -->|"rescue escalation, local intake and care details"| P5
    D2 -->|"local holding facilities"| P5
    P5 -->|"local custody and rescue status"| D4
    D7 -->|"local holding and release records"| P6
    P6 -->|"released animal status"| D7

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 5.0 | Manage Rescue and Holding | Records permitted local intake and care, escalates rescue requests, and shows rescue progress; barangay-held animals are read-only to leaders |
| 6.0 | Process Claims and Reunification | Presents owners' claims for decision and records the handover when the animal goes home |
| 8.0 | Handle Communication and Notifications | Exchanges messages with reporters on reports the leader has claimed and delivers notifications |
| 9.0 | Publish Announcements | Posts hazard alerts to the subdivision |



## Level 1 DFD — Barangay Staff, Part 1: Accounts, Pets, Reports, and Rescue and Holding

The Barangay Staff's Level 1 DFD is drawn on two pages. Part 1 covers personnel accounts, pet records and owner warnings, escalated and endorsed reports, and the rescue and holding facility work. The staff member is on the left and the data stores are on the right.

Raw code: [`mermaid/02b1_level1_barangay_staff_part1.mmd`](mermaid/02b1_level1_barangay_staff_part1.mmd)

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
    subgraph COL1[" "]
        direction TB
        STF["Barangay Staff"]:::ent
        RES["Resident"]:::ent
        LDR["Subdivision Leader"]:::ent
        ADM["Administrator"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P1("1.0<br/>Manage User<br/>Accounts"):::proc
        P2("2.0<br/>Manage Pet<br/>Records"):::proc
        P3("3.0<br/>Process<br/>Reports"):::proc
        P5("5.0<br/>Manage Rescue<br/>and Holding"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D1["D1 | Users"]:::store
        D2["D2 | Locations"]:::store
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D7["D7 | Rescues and Holding"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    STF -->|"login credentials; personnel account details from Head Officer"| P1
    P1 -->|"staff account"| D1
    STF -->|"pet record updates, owner warnings"| P2
    P2 -->|"pet record, warning"| D3
    P2 -->|"pet records"| STF
    D4 -->|"escalated and endorsed reports"| P3
    P3 -->|"reports for action"| STF
    STF -->|"status updates, remarks"| P3
    P3 -->|"timeline entry"| D4
    STF -->|"rescue dispatch, responders, intake, care logs"| P5
    D2 -->|"holding facilities"| P5
    P5 -->|"rescue and holding records"| D7
    P5 -->|"status update"| D4
    P5 -->|"rescue requests, holding records"| STF
    D3 -->|"pet records and ownership history"| P2
    D1 -->|"account, role and personnel records"| P1
    P1 -->|"access result and personnel account status"| STF
    D1 -->|"authorized responders"| P5
    D4 -->|"report location and case details"| P5
    D7 -->|"rescue assignments and holding records"| P5


    %% Shared account process includes every authenticated human role.
    RES -->|"registration details, login credentials and profile updates"| P1
    P1 -->|"account verification and access result"| RES
    LDR -->|"login credentials and profile updates"| P1
    P1 -->|"account status and subdivision access"| LDR
    ADM -->|"login credentials, user account and role changes"| P1
    P1 -->|"access result, user accounts and role records"| ADM

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 1.0 | Manage User Accounts | Authenticates staff; the Barangay Head Officer provisions personnel accounts and sends invitations |
| 2.0 | Manage Pet Records | Updates pet records and issues warnings to pet owners |
| 3.0 | Process Reports | Receives reports escalated or endorsed by leaders and records status updates |
| 5.0 | Manage Rescue and Holding | Dispatches rescues, assigns responders, takes animals into holding and logs their care |



## Level 1 DFD — Barangay Staff, Part 2: Claims, Adoptions, Communication and Announcements

Part 2 covers handovers to owners, adoptions, messages and notifications, and community alerts. D3 Pets, D4 Reports and D7 Rescues and Holding appear on both pages because the processes in Part 2 use the records created in Part 1.

Raw code: [`mermaid/02b2_level1_barangay_staff_part2.mmd`](mermaid/02b2_level1_barangay_staff_part2.mmd)

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
    subgraph COL1[" "]
        direction TB
        STF["Barangay Staff"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P6("6.0<br/>Process Claims and<br/>Reunification"):::proc
        P7("7.0<br/>Manage<br/>Adoptions"):::proc
        P8("8.0<br/>Handle Communication<br/>and Notifications"):::proc
        P9("9.0<br/>Publish<br/>Announcements"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D5["D5 | Claims and Returns"]:::store
        D7["D7 | Rescues and Holding"]:::store
        D8["D8 | Adoptions"]:::store
        D9["D9 | Messages and Notifications"]:::store
        D10["D10 | Announcements"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    STF -->|"claim decision, handover record"| P6
    D7 -->|"holding record"| P6
    P6 -->|"return record"| D5
    P6 -->|"report closed"| D4
    D7 -->|"animals for adoption"| P7
    STF -->|"verification, interview, home visit, approval, monitoring"| P7
    P7 -->|"applications, assigned tasks"| STF
    P7 -->|"adoption records"| D8
    P7 -->|"adopter's new pet"| D3
    STF -->|"messages"| P8
    P8 -->|"messages"| D9
    P8 -->|"notifications"| STF
    STF -->|"community alert"| P9
    P9 -->|"announcement"| D10
    D5 -->|"claim decisions and return records"| P6
    D8 -->|"applications, certificates and monitoring records"| P7
    D9 -->|"message history, notifications and preferences"| P8
    P6 -->|"pet history and ownership updates"| D3
    P6 -->|"claim and recovery status"| D4
    D10 -->|"published announcements"| P9
    P9 -->|"published announcement and posting result"| STF
    D5 -->|"pending claims and ownership evidence"| P6
    P6 -->|"claims for review and handover status"| STF
    P6 -->|"released animal status"| D7
    P7 -->|"adopted animal and custody status"| D7

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 6.0 | Process Claims and Reunification | Decides claims and records the handover of an animal to its owner |
| 7.0 | Manage Adoptions | Processes adoption applications through verification, interview, home visit, approval and monitoring, and creates the adopter's pet record |
| 8.0 | Handle Communication and Notifications | Exchanges messages with residents and delivers notifications |
| 9.0 | Publish Announcements | Posts barangay-wide community alerts |



## Level 1 DFD — Administrator, Part 1: Accounts, Pets and Reports

The Administrator's Level 1 DFD is drawn on two pages. Part 1 covers user accounts, pet records and reports across all subdivisions. The administrator is on the left and the data stores are on the right.

Raw code: [`mermaid/02a1_level1_administrator_part1.mmd`](mermaid/02a1_level1_administrator_part1.mmd)

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
    subgraph COL1[" "]
        direction TB
        ADM["Administrator"]:::ent
        RES["Resident"]:::ent
        LDR["Subdivision Leader"]:::ent
        STF["Barangay Staff"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P1("1.0<br/>Manage User<br/>Accounts"):::proc
        P2("2.0<br/>Manage Pet<br/>Records"):::proc
        P3("3.0<br/>Process<br/>Reports"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D1["D1 | Users"]:::store
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    ADM -->|"login credentials, user accounts, role and status changes"| P1
    P1 -->|"user records"| D1
    D1 -->|"user list"| P1
    P1 -->|"user accounts"| ADM
    ADM -->|"pet record changes, warnings"| P2
    P2 -->|"pet record, warning"| D3
    P2 -->|"all pet records"| ADM
    ADM -->|"report review and actions"| P3
    P3 -->|"updated report"| D4
    D4 -->|"all reports"| P3
    P3 -->|"reports"| ADM
    D3 -->|"pet records and ownership history"| P2


    %% Shared account process includes every authenticated human role.
    RES -->|"registration details, login credentials and profile updates"| P1
    P1 -->|"account verification and access result"| RES
    LDR -->|"login credentials and profile updates"| P1
    P1 -->|"account status and subdivision access"| LDR
    STF -->|"login credentials and profile updates; personnel account details from Head Officer"| P1
    P1 -->|"access result and personnel account status"| STF

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 1.0 | Manage User Accounts | Creates and manages user accounts and roles, sends invitations, and emails the administrator's sign-in code |
| 2.0 | Manage Pet Records | Lets the administrator view and manage all pet records and owner warnings |
| 3.0 | Process Reports | Lets the administrator view and act on reports from every subdivision |



## Level 1 DFD — Administrator, Part 2: AI Matching, Notifications and System Administration

Part 2 covers the AI matching setting, the administrator's notifications, and the system settings, landmarks, statistics and audit logs. D1 Users, D3 Pets and D4 Reports appear on both pages because the dashboard in 10.0 reads the records managed in Part 1.

Raw code: [`mermaid/02a2_level1_administrator_part2.mmd`](mermaid/02a2_level1_administrator_part2.mmd)

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
    subgraph COL1[" "]
        direction TB
        ADM["Administrator"]:::ent
    end
    subgraph COL2[" "]
        direction TB
        P4("4.0<br/>Perform AI<br/>Matching"):::proc
        P8("8.0<br/>Handle Communication<br/>and Notifications"):::proc
        P10("10.0<br/>Administer<br/>System"):::proc
    end
    subgraph COL3[" "]
        direction TB
        D1["D1 | Users"]:::store
        D2["D2 | Locations"]:::store
        D3["D3 | Pets"]:::store
        D4["D4 | Reports"]:::store
        D6["D6 | AI Matches"]:::store
        D9["D9 | Messages and Notifications"]:::store
        D11["D11 | Audit and Settings"]:::store
    end
    COL1 ~~~ COL2 ~~~ COL3

    %% Plain-label Mermaid preview. Exact editable DFD symbols: ../drawio/DFD_editable.drawio
    %% Arrows carry data; dashed processes continue on another page.
    ADM -->|"AI matching setting, rescan request"| P4
    P4 -->|"match suggestions"| D6
    D11 -->|"AI matching setting"| P4
    ADM -->|"settings, landmarks, coverage area"| P10
    P10 -->|"landmarks, coverage area"| D2
    P10 -->|"settings"| D11
    D11 -->|"audit logs"| P10
    D1 -->|"user figures"| P10
    D3 -->|"pet figures"| P10
    D4 -->|"report figures"| P10
    P10 -->|"dashboard statistics, heat map, audit logs"| ADM
    D9 -->|"admin notifications"| P8
    P8 -->|"notifications"| ADM
    D4 -->|"report photos and candidate reports"| P4
    D3 -->|"registered pet candidates"| P4
    P4 -->|"AI engine mode and configuration audit entry"| D11
    P4 -->|"AI mode and rescan job status"| ADM
    D2 -->|"current landmarks and coverage"| P10

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#f7eca0,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f7eca0,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4

    style COL1 fill:transparent,stroke:none
    style COL2 fill:transparent,stroke:none
    style COL3 fill:transparent,stroke:none
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name | Description |
|---|---|---|
| 4.0 | Perform AI Matching | Saves the Gemini vision / attribute-only engine mode and starts report rescans (administrator only) |
| 8.0 | Handle Communication and Notifications | Delivers system notifications to the administrator |
| 10.0 | Administer System | Maintains settings, landmarks and the coverage area, and provides dashboard statistics, the report heat map and audit logs |


