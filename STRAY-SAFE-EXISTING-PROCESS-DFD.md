# STRAY-SAFE — Existing Manual Process Data Flow Diagrams (Before Proposed System)

**Gane & Sarson Mermaid.js Data Flow Diagrams (Level 0 & Level 1)** depicting the **existing manual workflow before STRAY-SAFE 2.0** (walk-ins, Messenger/SMS chats, Facebook group posts, paper logbooks, printed warning slips, and manual tallies), designed as the direct **"Before"** counterpart to [STRAY-SAFE-2.0-DFD.md](STRAY-SAFE-2.0-DFD.md).

---

## 1. Existing Manual Scope & Paper/Informal Stores

### 1.1 External Entities

| Entity                           | Role in Existing Manual Process                                                                                                                                                                                                                                                             |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Resident`**           | Reports stray or nuisance animals via walk-in, SMS, or Messenger; posts lost/found pets on community Facebook groups or bulletin boards; receives verbal/printed warnings and informal chat replies.                                                                                        |
| **`Subdivision Leader`** | HOA Officer / Subdivision Head handling complaints manually: writes entries into physical logbooks/spreadsheets, visually inspects streets, checks past paper entries by memory, issues printed warning slips, places phone calls to external animal control/vets, and files paper folders. |

### 1.2 Informal / Manual Data Stores (`D1`–`D4`)

|     Store ID     | Label                                        | Existing Storage Medium                                                                                       |
| :--------------: | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **`D1`** | `Manual Resident & Pet Logbook`            | HOA master homeowner spreadsheet or paper registry (no pet QR tags, no digital pet matching)                  |
| **`D2`** | `Paper Incident Logbook & Chat Threads`    | Physical guardhouse/HOA blotter book plus scattered Messenger/SMS threads (no GPS pins or geofence checks)    |
| **`D3`** | `Social Media Posts & Bulletin Board`      | Unmoderated Facebook group posts and printed gate flyers for lost/found pets                                  |
| **`D4`** | `Written Warning Copies & Referral Folder` | Physical filing cabinet holding carbon copies of warning slips, claim notes, and external call/referral notes |

---

## 2. Existing Process — DFD Level 0 (Context Diagram)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000

    RES["Resident"]:::entity
    P0["0.0 Existing Manual Stray & Pet Concern Process"]:::process
    SL["Subdivision Leader"]:::entity

    RES -->|"Walk-In Report<br/>Messenger Text & Photos<br/>Facebook Lost/Found Post<br/>Verbal Claim & Reply"| P0

    P0 -->|"Verbal Acknowledgement<br/>Messenger / SMS Reply<br/>Group Chat / Flyer Post<br/>Printed Warning Slip<br/>Verbal Claim Notice"| RES

    SL -->|"Manual Logbook Entry<br/>Visual Inspection Notes<br/>Group Post Moderation<br/>Printed Warning Slip<br/>Phone Referral Notes<br/>Manual Filing & Tally"| P0

    P0 -->|"Walk-In & Chat Reports<br/>Photos & Street Notes<br/>Spreadsheet / Logbook<br/>Unverified Sightings<br/>Filing Folder & Counts"| SL
```

---

## 3. Existing Process — DFD Level 1 (`1.0`–`5.0`)

```mermaid
%%{init: {'flowchart': {'curve': 'stepAfter', 'nodeSpacing': 40, 'rankSpacing': 160}}}%%
flowchart LR
    classDef entity fill:#F3E89B,stroke:#000000,color:#000000
    classDef process fill:#FFF2CC,stroke:#000000,rx:12,ry:12,color:#000000
    classDef store fill:#E5E7EB,stroke:#000000,color:#000000

    subgraph DATA_STORES[" "]
        direction TB
        D1["D1 | Manual Resident & Pet Logbook"]:::store
        D2["D2 | Paper Incident Logbook & Chat Threads"]:::store
        D3["D3 | Social Media Posts & Bulletin Board"]:::store
        D4["D4 | Written Warning Copies & Referral Folder"]:::store
    end

    subgraph PROCESSES[" "]
        direction TB
        P1["1.0 Record Manual Resident & Pet List"]:::process
        P2["2.0 Receive Walk-In, Chat & Social Posts"]:::process
        P3["3.0 Manually Review Logs & Street Sightings"]:::process
        P4["4.0 Issue Paper Warnings & Call Referrals"]:::process
        P5["5.0 File Paper Folders & Manual Tally"]:::process
    end

    subgraph ENTITIES[" "]
        direction TB
        RES["Resident"]:::entity
        SL["Subdivision Leader"]:::entity
    end

    style DATA_STORES fill:transparent,stroke:transparent
    style PROCESSES fill:transparent,stroke:transparent
    style ENTITIES fill:transparent,stroke:transparent

    %% 1.0 Record Manual Resident & Pet List
    RES -->|"Walk-In Name & Block/Lot"| P1
    SL -->|"Manual Logbook Entry"| P1
    P1 -->|"Spreadsheet / Logbook"| SL
    D1 -->|"Resident & Pet Sheet"| P1
    P1 -->|"Updated Paper Registry"| D1

    %% 2.0 Receive Walk-In, Chat & Social Posts
    RES -->|"Walk-In Report, Messenger Text & Photos"| P2
    RES -->|"Facebook Lost/Found Post"| P2
    P2 -->|"Verbal Acknowledgement & Group Chat Post"| RES
    SL -->|"Group Post Moderation"| P2
    P2 -->|"Walk-In & Chat Reports, Photos & Street Notes"| SL
    D1 -->|"Owner Contact Sheet"| P2
    P2 -->|"Handwritten Blotter & Chat Logs"| D2
    P2 -->|"Lost/Found Post & Flyer Copy"| D3

    %% 3.0 Manually Review Logs & Street Sightings
    SL -->|"Visual Inspection Notes"| P3
    P3 -->|"Unverified Sightings"| SL
    D1 -->|"Homeowner Pet List"| P3
    D2 -->|"Past Blotter & Chat Entries"| P3
    D3 -->|"Community Sighting Comments"| P3
    P3 -->|"Manual Comparison Notes"| D2

    %% 4.0 Issue Paper Warnings & Call Referrals
    RES -->|"Verbal Claim & Reply"| P4
    P4 -->|"Messenger / SMS Reply & Printed Warning Slip"| RES
    P4 -->|"Verbal Claim Notice"| RES
    SL -->|"Printed Warning Slip & Phone Referral Notes"| P4
    P4 -->|"Warning & Call Record Copy"| SL
    D2 -->|"Active Blotter Case"| P4
    D4 -->|"Past Warning Slips & Referral Notes"| P4
    P4 -->|"Signed Warning Copy & Referral Sheet"| D4

    %% 5.0 File Paper Folders & Manual Tally
    SL -->|"Manual Filing & Tally"| P5
    P5 -->|"Filing Folder & Counts"| SL
    D2 -->|"Closed Blotter Pages"| P5
    D3 -->|"Expired Flyer & Post Notes"| P5
    D4 -->|"Archived Warning & Referral Sheets"| P5
    P5 -->|"Filed Case Folder"| D4
```

---

## 4. Key Gaps Solved by Proposed STRAY-SAFE 2.0

| Existing Manual Bottleneck                                                       | Proposed STRAY-SAFE 2.0 Improvement                                                                           |
| :------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| Walk-in, SMS, and Messenger reports scatter across devices with no tracking code | Unified 6-category reporting with automatic `Reference ID`, GPS pin, and status timeline                    |
| Street descriptions only; no geofence boundary or map pin correction             | Interactive Leaflet map with subdivision geofence validation and Leader pin fix                               |
| Memory/logbook lookups miss repeat incidents and look-alikes                     | Structured Match Leads (`breed`, `color`, `location`), case linking, and QR collar tags (`/t/:token`) |
| Loose paper warning slips with no acknowledgement or observation tracking        | Standardized warning letters, PDF delivery, acknowledgement tracking, and Owner Observation                   |
| Paper folders prevent quick trend counts or verifiable history                   | Digital case closures, case analytics, and immutable chronological audit logs                                 |
