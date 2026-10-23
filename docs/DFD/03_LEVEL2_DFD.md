# Level 2 DFDs

Level 2 breaks down the five processes with the most internal steps: 3.0, 4.0, 5.0, 6.0 and 7.0. Processes 1.0, 2.0, 8.0, 9.0 and 10.0 are simple enough to be described at Level 1. Dashed boxes are connectors to processes drawn on other diagrams.

## Level 2 — Process 3.0 Process Reports

Process 3.0 covers the life of a report, from submission until it is resolved, handed to the barangay, or disputed.

Raw code: [`mermaid/02_level2_p3_reports.mmd`](mermaid/02_level2_p3_reports.mmd)

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
    CLD["Cloudinary<br/>Media Storage"]:::ent
    MAP["OpenStreetMap<br/>Services"]:::ent
    P31("3.1<br/>Submit<br/>Report"):::proc
    P32("3.2<br/>Claim, Verify and<br/>Transfer Report"):::proc
    P33("3.3<br/>Merge Duplicate<br/>Reports"):::proc
    P34("3.4<br/>Update Status<br/>and Timeline"):::proc
    P35("3.5<br/>Endorse to<br/>Barangay"):::proc
    P36("3.6<br/>Resolve<br/>Disputes"):::proc
    D2["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D2</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Locations</td></tr></table>"]:::store
    D3["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D3</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Pets</td></tr></table>"]:::store
    D4["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D4</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Reports</td></tr></table>"]:::store
    O4(["4.0 Perform<br/>AI Matching"]):::off
    O5(["5.0 Manage Rescue<br/>and Holding"]):::off
    ADM["Administrator"]:::ent
    O8(["8.0 Handle Communication<br/>and Notifications"]):::off

    %% Arrows carry data; dashed processes continue on another page.
    RES -->|"report details, photos, location"| P31
    P31 -->|"photos"| CLD
    CLD -->|"file links"| P31
    MAP -->|"street address"| P31
    D2 -->|"subdivision, landmarks"| P31
    P31 -->|"new report"| D4
    P31 -->|"report for analysis"| O4
    D4 -->|"unclaimed reports"| P32
    LDR -->|"assignment request, verification findings, visibility and transfer details"| P32
    P32 -->|"assigned and verified report"| D4
    P32 -->|"subdivision report queue"| LDR
    O4 -->|"confirmed duplicate"| P33
    LDR -->|"merge or separation decision and reason"| P33
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
    P31 -->|"location coordinates"| MAP
    P31 -->|"report acknowledgement and saved report status"| RES
    D4 -->|"source and candidate report records"| P33
    D4 -->|"current report status and timeline"| P34
    D4 -->|"verified report and endorsement details"| P35
    D4 -->|"disputed case and supporting evidence"| P36
    P34 -->|"timeline evidence files"| CLD
    CLD -->|"stored timeline media links"| P34
    LDR -->|"scoped dispute decision and remarks"| P36
    ADM -->|"report review and assignment decisions"| P32
    P32 -->|"report records and action results"| ADM
    ADM -->|"authorized dispute decision and remarks"| P36
    P34 -->|"account and case event data"| O8

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
    LDR["Subdivision Leader"]:::ent
    RES["Resident"]:::ent
    GEM["Google Gemini AI"]:::ent
    P41("4.1<br/>Queue AI<br/>Jobs"):::proc
    P42("4.2<br/>Analyze Report<br/>Photos"):::proc
    P43("4.3<br/>Find Candidate<br/>Matches"):::proc
    P44("4.4<br/>Review<br/>Matches"):::proc
    P45("4.5<br/>Verify with<br/>Owner"):::proc
    D3["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D3</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Pets</td></tr></table>"]:::store
    D4["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D4</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Reports</td></tr></table>"]:::store
    D6["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D6</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>AI Matches</td></tr></table>"]:::store
    D11["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D11</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Audit and Settings</td></tr></table>"]:::store
    O3(["3.0 Process<br/>Reports"]):::off
    P46("4.6<br/>Configure AI<br/>Matching"):::proc
    ADM["Administrator"]:::ent
    O8(["8.0 Handle Communication<br/>and Notifications"]):::off

    %% Arrows carry data; dashed processes continue on another page.
    O3 -->|"new report or photo"| P41
    P41 -->|"AI job"| D6
    D6 -->|"queued job"| P42
    D4 -->|"report photos"| P42
    P42 -->|"photo and description"| GEM
    GEM -->|"suggested details"| P42
    P42 -->|"AI details, animal detected"| D4
    D4 -->|"analyzed report and candidate report records"| P43
    D3 -->|"registered pets"| P43
    D11 -->|"AI matching setting"| P43
    P43 -->|"photo pairs"| GEM
    GEM -->|"comparison result"| P43
    P43 -->|"cached result, match suggestion"| D6
    D6 -->|"match suggestions"| P44
    P44 -->|"suggestions with evidence"| LDR
    LDR -->|"match review decision and remarks"| P44
    P44 -->|"review decision"| D6
    P44 -->|"confirmed duplicate"| O3
    P44 -->|"jointly confirmed sighting and pet history"| D3
    P44 -->|"match needing owner"| P45
    P45 -->|"verification request"| RES
    RES -->|"owner answer"| P45
    P45 -->|"owner response"| D6
    D6 -->|"cached photo comparison results"| P43
    D6 -->|"match and pending owner verification"| P45
    D4 -->|"report and current pet link"| P45
    P44 -->|"jointly confirmed report-pet link or removal"| D4
    P45 -->|"jointly confirmed report-pet link or removal"| D4
    P45 -->|"jointly confirmed sighting and pet history"| D3
    ADM -->|"rescan request"| P41
    P41 -->|"rescan job status"| ADM
    ADM -->|"AI engine mode configuration"| P46
    D11 -->|"current AI engine configuration"| P46
    P46 -->|"AI engine setting and audit entry"| D11
    P46 -->|"saved AI engine configuration"| ADM
    P44 -->|"account and case event data"| O8

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
| 4.1 | Queue AI Jobs | Adds a background job for each new photo or report so the resident does not wait for the AI |
| 4.2 | Analyze Report Photos | Checks that the photo shows a dog or cat and asks Gemini to suggest the animal's details |
| 4.3 | Find Candidate Matches | Compares the sighting with other reports and registered pets (reusing earlier comparisons) and saves likely matches |
| 4.4 | Review Matches | A leader reviews suggestions and duplicate decisions; a pet with an owner is linked only after both the reviewer and owner confirm |
| 4.5 | Verify with Owner | Reads the pending match, records the owner's answer, and applies or removes the report-pet link and pet history when the confirmation rules allow |
| 4.6 | Configure AI Matching | The administrator selects Gemini vision or attribute-only matching; the setting and configuration audit entry are saved in D11 |



## Level 2 — Process 5.0 Manage Rescue and Holding

Process 5.0 follows the animal from the moment a rescue is sent until it is cared for at the holding facility and, if unclaimed, made available for adoption.

Raw code: [`mermaid/02_level2_p5_rescue_holding.mmd`](mermaid/02_level2_p5_rescue_holding.mmd)

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
    STF["Barangay Staff"]:::ent
    P51("5.1<br/>Dispatch<br/>Rescue"):::proc
    P52("5.2<br/>Assign<br/>Responders"):::proc
    P53("5.3<br/>Track Rescue<br/>Progress"):::proc
    P54("5.4<br/>Intake Animal<br/>to Holding"):::proc
    P55("5.5<br/>Record<br/>Care"):::proc
    P56("5.6<br/>Update Facility<br/>Status"):::proc
    D1["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D1</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Users</td></tr></table>"]:::store
    D2["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D2</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Locations</td></tr></table>"]:::store
    D4["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D4</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Reports</td></tr></table>"]:::store
    D7["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D7</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Rescues and Holding</td></tr></table>"]:::store
    O3(["3.0 Process<br/>Reports"]):::off
    O7(["7.0 Manage<br/>Adoptions"]):::off
    CLD["Cloudinary<br/>Media Storage"]:::ent
    LDR["Subdivision Leader"]:::ent
    O8(["8.0 Handle Communication<br/>and Notifications"]):::off

    %% Arrows carry data; dashed processes continue on another page.
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
    P56 -->|"adoption-eligible animal record"| O7
    D7 -->|"rescue request and current assignments"| P52
    D7 -->|"rescue assignment and current status"| P53
    D7 -->|"rescue and existing custody records"| P54
    D7 -->|"current animal and care records"| P55
    D7 -->|"animal condition and current facility status"| P56
    P55 -->|"care and condition photos"| CLD
    CLD -->|"stored care media links"| P55
    LDR -->|"rescue escalation request"| P51
    LDR -->|"permitted local intake details"| P54
    LDR -->|"permitted local care notes and photos"| P55
    LDR -->|"local custody status or escalation details"| P56
    P53 -->|"escalated rescue progress"| LDR
    P56 -->|"permitted local holding records"| LDR
    P56 -->|"updated facility and animal status"| STF
    P53 -->|"account and case event data"| O8

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
| 5.1 | Dispatch Rescue | Creates a rescue for an escalated report using the report's location |
| 5.2 | Assign Responders | Assigns one or more responders to the rescue and notifies them |
| 5.3 | Track Rescue Progress | Records each rescue stage (en route, on site, animal secured) and adds it to the report timeline |
| 5.4 | Intake Animal to Holding | Records the animal's arrival at a holding facility and marks the report as impounded |
| 5.5 | Record Care | Reads the current holding record and saves care observations and media links; leaders can update permitted local custody records |
| 5.6 | Update Facility Status | Sets the animal's status (for example healthy or for adoption) and releases it to the adoption process |



## Level 2 — Process 6.0 Process Claims and Reunification

Process 6.0 brings a found animal back to its owner, either through a reviewed claim and a recorded handover, or when the owner confirms they already recovered the pet.

Raw code: [`mermaid/02_level2_p6_claims.mmd`](mermaid/02_level2_p6_claims.mmd)

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
    CLD["Cloudinary<br/>Media Storage"]:::ent
    P61("6.1<br/>Submit<br/>Claim"):::proc
    P62("6.2<br/>Review<br/>Claim"):::proc
    P63("6.3<br/>Complete<br/>Handover"):::proc
    P64("6.4<br/>Confirm<br/>Recovery"):::proc
    D3["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D3</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Pets</td></tr></table>"]:::store
    D4["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D4</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Reports</td></tr></table>"]:::store
    D5["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D5</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Claims and Returns</td></tr></table>"]:::store
    D7["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D7</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Rescues and Holding</td></tr></table>"]:::store
    O8(["8.0 Handle Communication<br/>and Notifications"]):::off

    %% Arrows carry data; dashed processes continue on another page.
    RES -->|"claim and proof files"| P61
    P61 -->|"proof files"| CLD
    CLD -->|"file links"| P61
    D3 -->|"owner's pets"| P61
    D4 -->|"report"| P61
    P61 -->|"claim"| D5
    D5 -->|"pending claims"| P62
    LDR -->|"scoped claim decision and evidence request"| P62
    STF -->|"claim decision and evidence request"| P62
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
    P62 -->|"pending claims, ownership proof and review results"| LDR
    P62 -->|"pending claims, ownership proof and review results"| STF
    D5 -->|"approved claim and handover eligibility"| P63
    D4 -->|"current case and recovery records"| P63
    LDR -->|"permitted local handover details and proof"| P63
    D4 -->|"owned report and current recovery status"| P64
    D3 -->|"pet ownership and status"| P64
    P63 -->|"handover proof photos"| CLD
    CLD -->|"stored handover proof links"| P63
    P64 -->|"recovery evidence photos"| CLD
    CLD -->|"stored recovery proof links"| P64
    P64 -->|"recovery and return documentation"| D5
    P62 -->|"account and case event data"| O8

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
    STF["Barangay Staff"]:::ent
    PUB["Public Visitor<br/>(no account)"]:::ent
    P71("7.1<br/>Publish Catalog<br/>and Apply"):::proc
    P72("7.2<br/>Verify Applicant<br/>and Assign Tasks"):::proc
    P73("7.3<br/>Interview and<br/>Home Visit"):::proc
    P74("7.4<br/>Approve and<br/>Hand Over"):::proc
    P75("7.5<br/>Issue<br/>Certificate"):::proc
    P76("7.6<br/>Monitor<br/>Adoption"):::proc
    D3["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D3</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Pets</td></tr></table>"]:::store
    D7["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D7</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Rescues and Holding</td></tr></table>"]:::store
    D8["<table style='border-collapse:collapse;border-spacing:0;border:1px solid black;border-right:0;color:black'><tr><td style='border-right:1px solid black;background:rgb(217,217,217);padding:8px 10px;white-space:nowrap'>D8</td><td style='background:rgb(247,236,160);padding:8px 12px;white-space:nowrap'>Adoptions</td></tr></table>"]:::store
    O5(["5.0 Manage Rescue<br/>and Holding"]):::off
    CLD["Cloudinary<br/>Media Storage"]:::ent
    O8(["8.0 Handle Communication<br/>and Notifications"]):::off

    %% Arrows carry data; dashed processes continue on another page.
    D7 -->|"animals for adoption"| P71
    P71 -->|"adoption catalog, application acknowledgement and status"| RES
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
    O5 -->|"adoption-eligible animal record"| P71
    D8 -->|"existing application status"| P71
    D8 -->|"verified application and assigned tasks"| P73
    D8 -->|"reviewed application and approval eligibility"| P74
    D8 -->|"approved adoption, certificate and handover records"| P75
    D8 -->|"adoption case and monitoring schedule"| P76
    P71 -->|"applicant identification documents"| CLD
    CLD -->|"stored applicant document links"| P71
    P73 -->|"home-visit evidence photos"| CLD
    CLD -->|"stored home-visit media links"| P73
    P76 -->|"post-adoption check-in photos"| CLD
    CLD -->|"stored monitoring media links"| P76
    P76 -->|"monitoring schedule and review result"| RES
    P74 -->|"adoption event data"| O8
    P74 -->|"adoption decision and handover result"| RES

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
| 7.1 | Publish Catalog and Apply | Shows animals marked for adoption and receives residents' applications with their ID |
| 7.2 | Verify Applicant and Assign Tasks | Checks the applicant's ID, residency and blacklist status, assigns a case owner and assigns tasks to staff |
| 7.3 | Interview and Home Visit | Schedules and records the interview scores and the home visit results |
| 7.4 | Approve and Hand Over | Approves the adoption, records the signed agreement and handover, and creates the adopter's new pet record |
| 7.5 | Issue Certificate | Uses the saved approved adoption and certificate records; public verification returns validity and marks certificates pending until the required handover flags are complete |
| 7.6 | Monitor Adoption | Records the adopter's check-ins and staff assessments after the animal goes home |


