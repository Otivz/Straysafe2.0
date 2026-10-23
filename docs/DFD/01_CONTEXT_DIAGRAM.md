# Context Diagram (Level 0)

## Context Diagram

The context diagram shows StraySafe 2.0 as a single process and every outside party that exchanges data with it: the four user roles, members of the public without an account, and the five outside services the system relies on.

Raw code: [`mermaid/00_context_diagram.mmd`](mermaid/00_context_diagram.mmd)

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
    PSH["Web Push Service"]:::ent
    MAP["OpenStreetMap<br/>Services"]:::ent
    SYS("0<br/>StraySafe 2.0<br/>System"):::proc

    %% Arrows carry data; dashed processes continue on another page.
    RES -->|"account and pet data, reports and disputes, claims, adoption evidence, messages and preferences"| SYS
    SYS -->|"access results, pet profile and QR, report and claim results, adoption records, messages and alerts"| RES
    LDR -->|"credentials, scoped report and match decisions, pet records, local custody and claim data, announcements and messages"| SYS
    SYS -->|"access results, subdivision cases and pets, match and claim reviews, rescue and local holding records, messages and alerts"| LDR
    STF -->|"credentials, Head Officer personnel account data, report and claim decisions, rescue and adoption records, alerts and messages"| SYS
    SYS -->|"access and account results, escalated cases, assignments, claim and adoption records, holding records and messages"| STF
    ADM -->|"credentials, account and record changes, AI engine mode and rescan requests, settings, landmarks and coverage"| SYS
    SYS -->|"access and action results, pet and report records, AI job status, statistics, maps, audit logs and notifications"| ADM
    PUB -->|"QR tag scan and found location, certificate number"| SYS
    SYS -->|"public pet information, certificate validity"| PUB
    SYS -->|"photos and descriptions"| GEM
    GEM -->|"comparison results, suggested details"| SYS
    SYS -->|"uploaded photos, videos, documents"| CLD
    CLD -->|"stored file links"| SYS
    SYS -->|"OTP codes, status emails"| EML
    SYS -->|"push notifications"| PSH
    SYS -->|"location coordinates and map extent"| MAP
    MAP -->|"map tiles, street addresses, routes"| SYS

    classDef ent fill:#ffffff,stroke:#000000,stroke-width:2px
    classDef proc fill:#ffffff,stroke:#000000,stroke-width:1.5px
    classDef store fill:#f2f2f2,stroke:#000000,stroke-width:1px
    classDef off fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray:5 4
```

**Legend.** Rectangle (bold border) = external entity · rounded box = process · open-ended box with a grey ID compartment and yellow name area = data store ·
dashed rounded box = a process shown on another diagram (connector) · arrow = data flow, labelled with the data that
moves.

| Process | Name                 | Description                                                                                                                                      |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0       | StraySafe 2.0 System | The complete system: accounts, pets, reports, AI matching, rescue and holding, claims, adoption, communication, announcements and administration |

### External entities

| Entity                 | Exchanges with the system                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Resident               | Sends registrations, pet records, reports, claims and adoption applications; receives status updates, match requests and notifications |
| Subdivision Leader     | Handles reports in their subdivision, reviews AI matches, registers pets for owners, posts announcements                               |
| Barangay Staff         | Runs rescues and the holding facility, completes handovers, processes adoptions, issues owner warnings                                 |
| Administrator          | Manages user accounts, settings, landmarks and the coverage area; views statistics and audit logs                                      |
| Public Visitor         | Scans a pet's QR tag and reports where it was found; checks whether an adoption certificate is genuine (no sign-in needed)             |
| Google Gemini AI       | Receives photos and descriptions; returns comparison results and suggested animal details                                              |
| Cloudinary             | Stores uploaded photos, videos and documents and returns their links                                                                   |
| Email Service          | Delivers OTP codes and status emails (SMTP / Resend)                                                                                   |
| Web Push Service       | Delivers push notifications to browsers and phones                                                                                     |
| OpenStreetMap Services | Provides map tiles, street addresses (Nominatim) and routes (OSRM)                                                                     |
