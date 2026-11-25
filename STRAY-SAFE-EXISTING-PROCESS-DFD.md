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

*(Updated 2026-11-24 to match the system as it works today. The diagrams above describe the manual process before the system and are unchanged.)*

| Existing Manual Bottleneck | Proposed STRAY-SAFE 2.0 Improvement |
| :--- | :--- |
| Resident and pet lists live in a homeowner spreadsheet or paper registry; no way to know who is really a resident | The Subdivision Leader imports the official resident list (e-mail activation links) or approves residents who register themselves; pets are registered with photos and a permanent QR collar tag |
| Walk-in, SMS, and Messenger reports scatter across devices with no tracking code | Unified 6-category reporting with an automatic `Reference ID`, a GPS pin, a status timeline, and an automatic starting priority for injured and dangerous animals |
| Street descriptions only; no coverage boundary or map pin correction | Interactive Leaflet map with a reporting coverage area (centre point and radius) and Leader pin fix |
| Memory/logbook lookups miss repeat incidents and look-alikes | Match leads (`breed`, `colour`, `location`), possible pet owners with the owner's own confirmation, and case linking and merging |
| A person who finds a pet can only shout at the gate or comment on a Facebook post, and the owner may never see it | A QR collar tag (`/t/:token`) lets anyone, with or without an account, tell the owner where the pet is, with a place, a note and a photo; the owner answers (Viewed, Pet Returned, Not the Pet) and the Leader sees it on the case |
| Lost and found notices are unmoderated posts that nobody closes | Community notices published at once for a lost pet, reviewed by the Leader for a found animal, with sightings and closure when the pet is home |
| Loose paper warning slips with no acknowledgement or observation tracking | Standardized warning letters with delivery tracking, acknowledgement, observation periods, and for complaints an offense count and steps (letters, summons, fine record, meeting) |
| Phone referrals to outside agencies are not written down, and nobody follows up | A referral log per case (agency, contact, status, outcome) with follow-up dates; a referral never closes the case |
| Paper folders prevent quick trend counts or verifiable history | A Dashboard of what needs attention, case closures with a documented reason, analytics, and an append-only audit log |
