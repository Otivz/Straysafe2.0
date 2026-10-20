# Level 2 DFDs

Level 2 breaks down the five processes with the most internal steps: 3.0, 4.0, 5.0, 6.0 and 7.0. Processes 1.0, 2.0, 8.0, 9.0 and 10.0 are simple enough to be described at Level 1. Dashed boxes are connectors to processes drawn on other diagrams.

## Level 2 — Process 3.0 Process Reports

Process 3.0 covers the life of a report, from submission until it is resolved, handed to the barangay, or disputed.

Raw code: [`mermaid/02_level2_p3_reports.mmd`](mermaid/02_level2_p3_reports.mmd)

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
    CLD["Cloudinary<br/>Media Storage"]:::ent
    MAP["OpenStreetMap<br/>Services"]:::ent
    P31("3.1<br/>Submit<br/>Report"):::proc
    P32("3.2<br/>Claim, Verify and<br/>Transfer Report"):::proc
    P33("3.3<br/>Merge Duplicate<br/>Reports"):::proc
    P34("3.4<br/>Update Status<br/>and Timeline"):::proc
    P35("3.5<br/>Endorse to<br/>Barangay"):::proc
    P36("3.6<br/>Resolve<br/>Disputes"):::proc
    D2[("D2 Locations")]:::store
    D3[("D3 Pets")]:::store
    D4[("D4 Reports")]:::store
    O4(["4.0 Perform<br/>AI Matching"]):::off
    O5(["5.0 Manage Rescue<br/>and Holding"]):::off

    RES -->|"report details, photos, location"| P31
    P31 -->|"photos"| CLD
    CLD -->|"file links"| P31
    MAP -->|"street address"| P31
    D2 -->|"subdivision, landmarks"| P31
    P31 -->|"new report"| D4
    P31 -->|"report for analysis"| O4
    D4 -->|"unclaimed reports"| P32
    LDR -->|"claim, verification, visibility, transfer"| P32
    P32 -->|"assigned and verified report"| D4
    P32 -->|"subdivision report queue"| LDR
    O4 -->|"confirmed duplicate"| P33
    LDR -->|"merge or separate decision"| P33
    P33 -->|"merged case"| D4
    LDR -->|"status, remarks, evidence"| P34
    STF -->|"status, remarks, evidence"| P34
    P34 -->|"timeline entry, media"| D4
    P34 -->|"report escalated for rescue"| O5
    LDR -->|"endorsement letter"| P35
    P35 -->|"letter record"| D4
    P35 -->|"endorsed report"| STF
    RES -->|"dispute and evidence"| P36
    D3 -->|"pet record"| P36
    STF -->|"dispute decision"| P36
    P36 -->|"dispute outcome"| D4
    P36 -->|"decision"| RES

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
| 3.1 | Submit Report | Saves a resident's report with its photos (stored in Cloudinary), location and landmark, then sends it to AI analysis |
| 3.2 | Claim, Verify and Transfer Report | A Subdivision Leader claims the report, verifies it or marks it a false alarm, decides its visibility, or transfers it to another leader |
| 3.3 | Merge Duplicate Reports | Merges sightings of the same animal into one case after a duplicate match is confirmed, or separates them again |
| 3.4 | Update Status and Timeline | Records each status change with remarks and evidence, and escalates reports that need a rescue |
| 3.5 | Endorse to Barangay | Creates the leader's endorsement letter that forwards a report to the barangay |
| 3.6 | Resolve Disputes | Receives a resident's dispute with evidence and records staff's decision |



## Level 2 — Process 4.0 Perform AI Matching

Process 4.0 shows how the AI helps without making decisions. The AI analyses and compares photos (4.1–4.3), while a Subdivision Leader reviews each suggestion (4.4) and the owner confirms it (4.5).

Raw code: [`mermaid/02_level2_p4_ai_matching.mmd`](mermaid/02_level2_p4_ai_matching.mmd)

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
    LDR["Subdivision Leader"]:::ent
    RES["Resident"]:::ent
    GEM["Google Gemini AI"]:::ent
    P41("4.1<br/>Queue AI<br/>Jobs"):::proc
    P42("4.2<br/>Analyze Report<br/>Photos"):::proc
    P43("4.3<br/>Find Candidate<br/>Matches"):::proc
    P44("4.4<br/>Review<br/>Matches"):::proc
    P45("4.5<br/>Verify with<br/>Owner"):::proc
    D3[("D3 Pets")]:::store
    D4[("D4 Reports")]:::store
    D6[("D6 AI Matches")]:::store
    D11[("D11 Audit and Settings")]:::store
    O3(["3.0 Process<br/>Reports"]):::off

    O3 -->|"new report or photo"| P41
    P41 -->|"AI job"| D6
    D6 -->|"queued job"| P42
    D4 -->|"report photos"| P42
    P42 -->|"photo and description"| GEM
    GEM -->|"suggested details"| P42
    P42 -->|"AI details, animal detected"| D4
    D4 -->|"other reports"| P43
    D3 -->|"registered pets"| P43
    D11 -->|"AI matching setting"| P43
    P43 -->|"photo pairs"| GEM
    GEM -->|"comparison result"| P43
    P43 -->|"cached result, match suggestion"| D6
    D6 -->|"match suggestions"| P44
    P44 -->|"suggestions with evidence"| LDR
    LDR -->|"confirm or not a match"| P44
    P44 -->|"review decision"| D6
    P44 -->|"confirmed duplicate"| O3
    P44 -->|"sighting linked to pet"| D3
    P44 -->|"match needing owner"| P45
    P45 -->|"verification request"| RES
    RES -->|"owner answer"| P45
    P45 -->|"owner response"| D6

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
| 4.1 | Queue AI Jobs | Adds a background job for each new photo or report so the resident does not wait for the AI |
| 4.2 | Analyze Report Photos | Checks that the photo shows a dog or cat and asks Gemini to suggest the animal's details |
| 4.3 | Find Candidate Matches | Compares the sighting with other reports and registered pets (reusing earlier comparisons) and saves likely matches |
| 4.4 | Review Matches | A leader confirms or rejects each suggestion; confirmed duplicates are merged and confirmed pets are linked |
| 4.5 | Verify with Owner | Asks the pet's owner whether the sighting is their pet and records the answer |



## Level 2 — Process 5.0 Manage Rescue and Holding

Process 5.0 follows the animal from the moment a rescue is sent until it is cared for at the holding facility and, if unclaimed, made available for adoption.

Raw code: [`mermaid/02_level2_p5_rescue_holding.mmd`](mermaid/02_level2_p5_rescue_holding.mmd)

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
    STF["Barangay Staff"]:::ent
    P51("5.1<br/>Dispatch<br/>Rescue"):::proc
    P52("5.2<br/>Assign<br/>Responders"):::proc
    P53("5.3<br/>Track Rescue<br/>Progress"):::proc
    P54("5.4<br/>Intake Animal<br/>to Holding"):::proc
    P55("5.5<br/>Record<br/>Care"):::proc
    P56("5.6<br/>Update Facility<br/>Status"):::proc
    D1[("D1 Users")]:::store
    D2[("D2 Locations")]:::store
    D4[("D4 Reports")]:::store
    D7[("D7 Rescues and Holding")]:::store
    O3(["3.0 Process<br/>Reports"]):::off
    O7(["7.0 Manage<br/>Adoptions"]):::off

    O3 -->|"report escalated for rescue"| P51
    STF -->|"rescue request"| P51
    D4 -->|"report location"| P51
    P51 -->|"rescue record"| D7
    D1 -->|"available responders"| P52
    STF -->|"responder assignment"| P52
    P52 -->|"assignments"| D7
    P52 -->|"assignment notice"| STF
    STF -->|"rescue status updates"| P53
    P53 -->|"rescue status"| D7
    P53 -->|"timeline entry"| D4
    STF -->|"intake details"| P54
    D2 -->|"holding facility"| P54
    P54 -->|"holding record"| D7
    P54 -->|"status impounded"| D4
    STF -->|"care notes, photos"| P55
    P55 -->|"care log"| D7
    STF -->|"facility status"| P56
    P56 -->|"updated status"| D7
    P56 -->|"animal for adoption"| O7

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
| 5.1 | Dispatch Rescue | Creates a rescue for an escalated report using the report's location |
| 5.2 | Assign Responders | Assigns one or more responders to the rescue and notifies them |
| 5.3 | Track Rescue Progress | Records each rescue stage (en route, on site, animal secured) and adds it to the report timeline |
| 5.4 | Intake Animal to Holding | Records the animal's arrival at a holding facility and marks the report as impounded |
| 5.5 | Record Care | Logs observations, treatment and photos while the animal is held |
| 5.6 | Update Facility Status | Sets the animal's status (for example healthy or for adoption) and releases it to the adoption process |



## Level 2 — Process 6.0 Process Claims and Reunification

Process 6.0 brings a found animal back to its owner, either through a reviewed claim and a recorded handover, or when the owner confirms they already recovered the pet.

Raw code: [`mermaid/02_level2_p6_claims.mmd`](mermaid/02_level2_p6_claims.mmd)

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
    CLD["Cloudinary<br/>Media Storage"]:::ent
    P61("6.1<br/>Submit<br/>Claim"):::proc
    P62("6.2<br/>Review<br/>Claim"):::proc
    P63("6.3<br/>Complete<br/>Handover"):::proc
    P64("6.4<br/>Confirm<br/>Recovery"):::proc
    D3[("D3 Pets")]:::store
    D4[("D4 Reports")]:::store
    D5[("D5 Claims and Returns")]:::store
    D7[("D7 Rescues and Holding")]:::store

    RES -->|"claim and proof files"| P61
    P61 -->|"proof files"| CLD
    CLD -->|"file links"| P61
    D3 -->|"owner's pets"| P61
    D4 -->|"report"| P61
    P61 -->|"claim"| D5
    D5 -->|"pending claims"| P62
    LDR -->|"approve, request evidence, reject"| P62
    STF -->|"approve, request evidence, reject"| P62
    P62 -->|"claim status"| D5
    P62 -->|"claim result or evidence request"| RES
    STF -->|"ID presented, handover photo"| P63
    D7 -->|"holding record"| P63
    P63 -->|"return record"| D5
    P63 -->|"report closed"| D4
    P63 -->|"animal discharged"| D7
    P63 -->|"pet history, ownership"| D3
    RES -->|"pet recovered confirmation"| P64
    P64 -->|"report resolved"| D4
    P64 -->|"pet history"| D3

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
| 6.1 | Submit Claim | The owner claims a reported animal as their pet and uploads proof such as a vaccine card or photos |
| 6.2 | Review Claim | A leader or staff member approves the claim, asks for more evidence, or rejects it |
| 6.3 | Complete Handover | Records the handover (ID presented, handover photo), closes the report, discharges the animal and updates the pet's history |
| 6.4 | Confirm Recovery | The resident confirms that they recovered their own lost pet, which resolves the report |



## Level 2 — Process 7.0 Manage Adoptions

Process 7.0 takes an animal from the holding facility to a new home, following the adoption stages of the system.

Raw code: [`mermaid/02_level2_p7_adoptions.mmd`](mermaid/02_level2_p7_adoptions.mmd)

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
    STF["Barangay Staff"]:::ent
    PUB["Public Visitor<br/>(no account)"]:::ent
    P71("7.1<br/>Publish Catalog<br/>and Apply"):::proc
    P72("7.2<br/>Verify Applicant<br/>and Assign Tasks"):::proc
    P73("7.3<br/>Interview and<br/>Home Visit"):::proc
    P74("7.4<br/>Approve and<br/>Hand Over"):::proc
    P75("7.5<br/>Issue<br/>Certificate"):::proc
    P76("7.6<br/>Monitor<br/>Adoption"):::proc
    D3[("D3 Pets")]:::store
    D7[("D7 Rescues and Holding")]:::store
    D8[("D8 Adoptions")]:::store

    D7 -->|"animals for adoption"| P71
    P71 -->|"adoption catalog"| RES
    RES -->|"application and ID"| P71
    P71 -->|"application"| D8
    STF -->|"verification, case owner, tasks"| P72
    D8 -->|"application"| P72
    P72 -->|"verification, assignments"| D8
    P72 -->|"assigned task"| STF
    STF -->|"schedules and evaluations"| P73
    P73 -->|"interview and visit schedule"| RES
    P73 -->|"interview and visit results"| D8
    STF -->|"approval, handover details"| P74
    RES -->|"signed agreement, receipt confirmation"| P74
    P74 -->|"approved adoption"| D8
    P74 -->|"new pet record"| D3
    P74 -->|"animal adopted"| D7
    P75 -->|"certificate"| D8
    P75 -->|"adoption certificate"| RES
    PUB -->|"certificate number"| P75
    P75 -->|"certificate validity"| PUB
    RES -->|"check-ins, photos"| P76
    STF -->|"assessments, reviews"| P76
    P76 -->|"monitoring logs"| D8

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
| 7.1 | Publish Catalog and Apply | Shows animals marked for adoption and receives residents' applications with their ID |
| 7.2 | Verify Applicant and Assign Tasks | Checks the applicant's ID, residency and blacklist status, assigns a case owner and assigns tasks to staff |
| 7.3 | Interview and Home Visit | Schedules and records the interview scores and the home visit results |
| 7.4 | Approve and Hand Over | Approves the adoption, records the signed agreement and handover, and creates the adopter's new pet record |
| 7.5 | Issue Certificate | Issues the adoption certificate and lets anyone verify it by its number |
| 7.6 | Monitor Adoption | Records the adopter's check-ins and staff assessments after the animal goes home |


