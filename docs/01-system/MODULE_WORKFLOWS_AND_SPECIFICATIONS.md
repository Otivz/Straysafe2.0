# STRAYSAFE: Smart Stray Animal Reporting and Rescue System
## System Modules, Functionalities, and Operational Workflows

> **Document Status:** Current  
> **System Scope:** StraySafe 2.0 (Subdivision-Centric Architecture)  
> **Target Audience:** System Administrators, Subdivision Leaders (HOA Officers / Subdivision Head), Residents, and Development Team

---

## 1. System Access Roles & Architectural Boundaries

StraySafe 2.0 partitions system access across four dedicated participant roles:

```mermaid
flowchart TD
    subgraph EndUserAccess["End-User Interfaces"]
        Resident["Residents (Role 1)<br/>Interface: /resident-app & Mobile APK"]
        SubdLeader["Subdivision Leaders (Role 2)<br/>HOA Officers & Subd Head<br/>Interface: /subd-admin"]
    end

    subgraph InternalUtility["Backend IT Operations"]
        SysAdmin["System Administrator (Role 4)<br/>Backend IT Utility & CLI"]
    end

    subgraph NonAccountEntities["External Coordination"]
        ExternalAgencies["External Authorities<br/>(Barangay, Animal Control, Vet, Welfare)<br/>No direct account; managed via Referrals"]
    end

    Resident -->|Reports, Sightings, Pet Registry| CoreSystem[(StraySafe 2.0 API & Database)]
    SubdLeader -->|Triage, Follow-ups, Warnings, Referrals, Closure| CoreSystem
    SysAdmin -->|User Accounts, Security Policy, AI Toggles| CoreSystem
    CoreSystem <-->|Referral & Outcome Tracking| ExternalAgencies
```

### Detailed Role Definitions

| Role | Interface / Endpoint | Responsibilities & Boundaries |
| :--- | :--- | :--- |
| **Residents (Role 1)** | Web: `/resident-app`<br/>Mobile: Android APK | • Submit animal concern reports across 6 distinct categories.<br/>• Pin and adjust observation coordinates with map-based controls.<br/>• Post and manage lost pet and found animal community notices.<br/>• Submit map-pinned sightings on open stray cases or lost pets.<br/>• Maintain optional personal pet profiles.<br/>• Track real-time status of submitted reports with private internal notes hidden. |
| **Subdivision Leaders (Role 2)**<br/>*(Subdivision Head & HOA Officers)* | Web: `/` or `/subd-admin` | • Primary operational case managers for community incidents.<br/>• Assess incoming reports, urgency, occurrence, and ownership status.<br/>• Review server-side AI decision-support suggestions (species, traits, duplicates).<br/>• Classify triage into Pathways A (Lost Pet), B (Owned/Nuisance), and C (Safety/Welfare).<br/>• Issue and monitor policy warnings and compliance observation periods.<br/>• Log external authority referrals (Barangay, Animal Control, Vets).<br/>• Adjudicate ownership claims, schedule site visits, and publish community alerts.<br/>• Close cases with mandatory documented disposition and review audit analytics/heatmaps. |
| **System Administrator (Role 4)** | Backend IT Utility | • Non-end-user administrative utility.<br/>• Account lifecycle provisioning (create, activate, suspend, reset).<br/>• Enforce password complexity and authentication parameters.<br/>• Global geofence boundary configuration (center GPS coordinates and radius).<br/>• Manage AI model toggles (local YOLOv8 nano / cloud Gemini API) and operational feature switches. |
| **External Authorities** | Non-Account Participants | • External entities including Barangay responders, city/municipal veterinary offices, animal welfare NGOs, and wildlife authorities.<br/>• Do not hold system logins; communications, coordination, handoffs, and final resolution outcomes are logged on their behalf by Subdivision Leaders. |

---

## 2. Module 1: Unified Authentication and User Management Module

### 2.1 Submodules & Functional Capabilities

| Submodule | Authorized Role(s) | Functionalities |
| :--- | :--- | :--- |
| **Role-Based Registration & Login** | Residents | Self-registration via email verification or Google OAuth. Auto-assigns Role 1 and routes to `/resident-app`. Supports secure session handling with JWTs. |
| **Admin Portal Authentication** | Subdivision Leaders | Secure login into `/subd-admin` using credentials issued by the System Administrator, backed by emailed verification codes and role authorization checks. |
| **Password Policy Enforcement** | All Users | Enforces 12–128 character complexity: uppercase letter, lowercase letter, numeric digit, and special character. |
| **User Account Management** | System Administrator (Role 4) | Administrative utility to provision, update, lock, or deactivate accounts across all roles; reset credentials; and audit access logs. |
| **Profile and Settings** | Residents & Subdivision Leaders | Update contact information, validate Philippine phone numbers (`+63` or `09...`), update house/lot address, and configure notification channels (in-app, push, email). |
| **Optional Pet Registry** | Residents | Residents can register household pets with descriptive attributes (breed, markings, collar, photos, microchip). Used as reference data for matching lost/found cases (not a barrier to reporting). |
| **Security & AI Settings** | System Administrator (Role 4) | Set session timeout thresholds, configure geofence radius limits, and enable/disable server-side AI assistance features without disrupting core workflows. |

### 2.2 Module 1 Operational Workflow

```mermaid
flowchart TD
    Start([User Initiates Access]) --> CheckType{Portal / Role Selection}
    
    CheckType -->|Resident Registration/Login| ResFlow[Resident Auth Flow]
    CheckType -->|Leader Login| SubdFlow[Subdivision Admin Auth]
    CheckType -->|IT Admin| SysAdminFlow[Backend IT Management]

    subgraph ResidentAuth["Resident Authentication"]
        ResFlow --> ResInput[Enter Email & Password / Google OAuth]
        ResInput --> ResVerify{Credentials Valid?}
        ResVerify -->|No| ResFail[Return Error & Retry]
        ResVerify -->|Yes| ResSession[Issue JWT Session & Role 1 Claims]
        ResSession --> ResLanding[Direct to /resident-app Dashboard]
        ResLanding --> PetRegOptional[Optional: Register Household Pets]
    end

    subgraph LeaderAuth["Subdivision Leader Authentication"]
        SubdFlow --> SubdInput[Enter Admin Username & Password]
        SubdInput --> SubdVerify{Role 2 Authorized?}
        SubdVerify -->|No| SubdDeny[Deny Access / Invalid Credentials]
        SubdVerify -->|Yes| SubdMFA[Verify Email Sign-in Code]
        SubdMFA --> SubdSession[Issue Role 2 Admin Session]
        SubdSession --> SubdLanding[Direct to /subd-admin Portal]
    end

    subgraph AdminAuth["System Admin Operations"]
        SysAdminFlow --> AdminCLI[Access Backend IT Utility]
        AdminCLI --> AdminActions[Manage Accounts / Policies / AI Toggles]
    end
```

---

## 3. Module 2: Incident Reporting and Pin Correction Module

### 3.1 Submodules & Functional Capabilities

| Submodule | Authorized Role(s) | Functionalities |
| :--- | :--- | :--- |
| **Animal Concern Reporting** | Residents | Submit reports across six standard categories: Lost Pet, Found/Unidentified Animal, Animal Nuisance, Safety Concern, Injured/Distressed Animal, Other. Captures species, descriptive tags, observed date/time, and photo/video evidence. |
| **Geolocation & Pin Correction** | Residents & Subdivision Leaders | Auto-captures device GPS coordinates; provides an interactive map for manual drag-and-drop pin correction. Identifies observation location separately from submission timestamp. Evaluates pin against subdivision boundary and flags out-of-bounds pins for leader review. |
| **Report Tracking & Updates** | Residents | Provides transparent lifecycle tracking (`REPORTED` &rarr; `UNDER_REVIEW` &rarr; `IN_PROGRESS` &rarr; `CLOSED`). Residents can post additional details, photos, or sightings. Internal leader notes remain strictly private. |
| **Lost & Found Notices** | Residents & Subdivision Leaders | Real-time community board publishing lost pet broadcasts and found animal alerts with immediate neighbor visibility. Leaders retain moderation and edit controls. |
| **Sightings & Recovery Confirmation** | Residents & Pet Owners | Allows any resident to pin sightings on active cases or lost pet notices. Differentiates firsthand vs. secondhand observations. Pet owners can confirm recovery and resolve notices. |

### 3.2 Module 2 Operational Workflow

```mermaid
flowchart TD
    A([Resident Observes Animal]) --> B[Open Report Form in /resident-app]
    B --> C[Select Incident Category]
    
    C --> C1["1. Lost Pet"]
    C --> C2["2. Found / Unidentified Animal"]
    C --> C3["3. Animal Nuisance"]
    C --> C4["4. Safety Concern"]
    C --> C5["5. Injured / Distressed Animal"]
    C --> C6["6. Other"]
    
    C1 & C2 & C3 & C4 & C5 & C6 --> D[Capture Observed Date/Time & Description]
    D --> E[Upload Photos / Video Evidence]
    
    E --> F[GPS Coordinate Acquisition]
    F --> G[Interactive Pin Correction on Map]
    
    G --> H{Geofence Radius Check}
    H -->|Within Subdivision Boundary| I[Submit Report as Standard Incident]
    H -->|Outside Subdivision Boundary| J[Flag Pin for Out-of-Bounds Leader Review]
    
    I & J --> K[Save Report Record with Status: REPORTED]
    K --> L[Publish to Lost & Found Notice Board if Applicable]
    K --> M[Send Confirmation Notification to Resident]
    M --> N[Trigger Module 3 Server-Side AI Analysis]
```

---

## 4. Module 3: Multi-Pathway Triage and AI Decision Support Module

### 4.1 Submodules & Functional Capabilities

| Submodule | Authorized Role(s) | Functionalities |
| :--- | :--- | :--- |
| **Automated Report Checks** | System / Subdivision Leaders | Server-side image inference via local YOLOv8 nano and cloud Gemini API. Detects animal species (dog, cat), traits (fur color, collar), checks photo authenticity, and identifies visual similarity with existing records. All AI outputs serve as non-blocking suggestions. |
| **Incident Assessment & Urgency** | Subdivision Leaders | Subdivision Leaders review incoming reports and set priority levels (Low, Medium, High, Critical). Separately adjudicates incident occurrence, animal identity, and ownership status (`Unknown`, `Claimed`, `Under Review`, `Confirmed`, `Disputed`, `Unconfirmed`). |
| **Response Pathway Triage** | Subdivision Leaders | Categorizes incidents into one or more non-exclusive operational pathways:<br/>• **Pathway A:** Lost Pet and Community Assistance.<br/>• **Pathway B:** Owned Animal, Nuisance, or Subdivision Policy Concern.<br/>• **Pathway C:** Safety, Distressed Animal, Welfare, or External Coordination. |
| **Related Reports & Matching** | Subdivision Leaders | Compares location proximity, timestamps, and physical traits across open cases, sightings, and pet registry entries. Allows leaders to link related records without destroying original evidence. |
| **Urgent Safety Handling** | Residents & Subdivision Leaders | High-priority fast-track for severe aggressive animal reports or bite incidents. Bypasses mandatory photo requirements, displays immediate non-approach safety guidance to residents, and flags cases for rapid administrative intervention. |

### 4.2 Module 3 Operational Workflow

```mermaid
flowchart TD
    NewReport([New Report Created]) --> AIStart[Server-Side Background Worker]
    
    subgraph NonBlockingAIDecisionSupport["AI Decision-Support Pipeline"]
        AIStart --> YOLO[Local YOLOv8 nano: Species & Detection]
        AIStart --> Gemini[Cloud Gemini API: Traits & Context Analysis]
        AIStart --> MatchCheck[Compute Visual & Spatiotemporal Similarity]
        YOLO & Gemini & MatchCheck --> AISuggestions[Store Non-Blocking AI Suggestions]
    end

    AISuggestions --> LeaderQueue[Subdivision Leader Triage Queue]
    
    subgraph HumanLeaderTriage["Subdivision Leader Adjudication"]
        LeaderQueue --> ReviewReport[Review Report Evidence & AI Suggestions]
        ReviewReport --> AssessUrgency[Set Urgency: Low / Medium / High / Critical]
        
        AssessUrgency --> EvaluateState[Evaluate Ownership & Identity State]
        
        EvaluateState --> PathwayTriage{Assign Response Pathways}
        
        PathwayTriage -->|Pathway A| PathA["Pathway A: Lost Pet & Community Assistance<br/>- Match with Lost Pet Registry<br/>- Sighting Broadcasts"]
        PathwayTriage -->|Pathway B| PathB["Pathway B: Owned Animal / Nuisance / Policy<br/>- Owner Identification<br/>- Warnings & Compliance Monitoring"]
        PathwayTriage -->|Pathway C| PathC["Pathway C: Safety / Distressed / Welfare<br/>- Rapid Safety Measures<br/>- External Referral Preparation"]
        
        PathA & PathB & PathC --> UpdateStatus[Update Global Status: UNDER_REVIEW]
    end
```

---

## 5. Module 4: Case Intervention and Referral Tracking Module

### 5.1 Submodules & Functional Capabilities

| Submodule | Authorized Role(s) | Functionalities |
| :--- | :--- | :--- |
| **Case Actions & Coordination** | Subdivision Leaders | Centralized case management workspace. Subdivision Head / HOA Officers log administrative actions, notes, resident interviews, and coordinated tasks. |
| **Warning & Compliance Monitoring** | Subdivision Leaders | Formal enforcement tracking for pet policy violations (e.g., roaming without leash, repetitive barking, waste non-compliance). Logs warning notices (1st/2nd/Final), compliance observation windows, owner responses/appeals, and resolution findings. |
| **External Referral Log** | Subdivision Leaders | Structured log for external authorities (Barangay, City Vet, Animal Control, Rescue NGOs). Tracks agency name, contact details, date referred, stated reason, agreed action, referral status, and documented outcome. |
| **Ownership Claims** | Residents & Subdivision Leaders | Residents can assert ownership on unidentified or captured animals by submitting proof (photos, veterinary cards, unique markings). Leaders review, approve, dispute, or deny claims with complete audit history. |
| **Inspection & Site Visit Records** | Subdivision Leaders / Personnel | Record on-site investigation reports, personnel dispatched, interview summaries, and field findings (including "Animal Not Found" without premature case closure). |
| **Community Alerts & Advisories** | Subdivision Leaders & Residents | Broadcast urgent safety advisories or sighting bulletins to residents via in-app push and dashboard banners. Delivers direct status updates to reporting residents. |

### 5.2 Module 4 Operational Workflow

```mermaid
flowchart TD
    TriageDone([Case in Status: UNDER_REVIEW / IN_PROGRESS]) --> ActionDispatch{Determine Intervention Action}

    subgraph OwnedAnimalIntervention["Pathway B: Owner Compliance & Policy Action"]
        ActionDispatch -->|Policy Violation| IdentifyOwner[Identify Pet Owner]
        IdentifyOwner --> IssueNotice[Issue Formal Warning Notice]
        IssueNotice --> ObservationWindow[Initiate 3-Day Compliance Observation]
        ObservationWindow --> OwnerFeedback{Owner Receptive?}
        OwnerFeedback -->|Complied| RecordCompliance[Log Compliance Evidence]
        OwnerFeedback -->|Disputed / Ignored| EscalateAction[Issue Escalated Notice / Schedule Hearing]
    end

    subgraph ExternalReferral["Pathway C: External Authority Coordination"]
        ActionDispatch -->|Safety / Distressed / Wild| SelectAgency[Select Agency: Barangay / City Vet / Rescue NGO]
        SelectAgency --> DispatchLetter[Generate Official Referral Record]
        DispatchLetter --> LogReferral[Log Referral Date, Contact & Reason]
        LogReferral --> FollowUpAgency[Track Coordination & Agency Intervention]
        FollowUpAgency --> RecordAgencyOutcome[Document Formal Agency Outcome]
    end

    subgraph ClaimAdjudication["Ownership Claims & Verification"]
        ActionDispatch -->|Unidentified Animal Found| ClaimSubmission[Resident Submits Ownership Claim]
        ClaimSubmission --> ReviewProof[Leader Reviews Photo/Vet Proof]
        ReviewProof --> ClaimDecision{Claim Legitimate?}
        ClaimDecision -->|Approved| ReunitePet[Authorize Pet Turnover & Return]
        ClaimDecision -->|Disputed / Rejected| LogDispute[Document Rejection with Reason]
    end

    subgraph SiteInspections["Field Operations & Community Updates"]
        ActionDispatch -->|Field Verification| SiteVisit[Conduct Site Inspection]
        SiteVisit --> LogVisit[Document Findings / Animal Observation]
        ActionDispatch -->|Safety Risk| BroadcastAlert[Publish Subdivision Safety Alert]
    end

    RecordCompliance & EscalateAction & RecordAgencyOutcome & ReunitePet & LogDispute & LogVisit & BroadcastAlert --> SyncState[Sync Case Timeline & Update Audit Trail]
```

---

## 6. Module 5: Case Closure and Audit Trail Analytics Module

### 6.1 Submodules & Functional Capabilities

| Submodule | Authorized Role(s) | Functionalities |
| :--- | :--- | :--- |
| **Case Status Lifecycle** | Subdivision Leaders & Residents | Manages four overarching global statuses: `REPORTED` &rarr; `UNDER_REVIEW` &rarr; `IN_PROGRESS` &rarr; `CLOSED`. Orthogonal to ownership, warning, or referral states. |
| **Case Disposition & Closure** | Subdivision Leaders | Requires a mandatory structured disposition upon closing a case: Concern Resolved, Missing Pet Recovered, Owner Compliance Verified, Invalid/Duplicate Report, Formally Handed Off to Authority, or Closed Without Resolution. Disallows undocumented closures. |
| **Role-Based Dashboard** | Residents & Subdivision Leaders | Tailored views: Residents see my reports, pet registry, lost/found feed, and status alerts; Leaders see triage queue, active cases, observation countdowns, referral pipelines, and notifications. |
| **Incident Heatmap & Analytics** | Subdivision Leaders | Interactive Leaflet heatmap displaying spatial clustering of incidents, recurrent stray hotspots, high-density nuisance areas, and safety risks to inform HOA security planning. |
| **Permanent Audit Trail** | Subdivision Leaders / System | Append-only database audit log (`audit_logs`) recording user actions, timestamps, field mutations, and administrative rationale. Retains distinction between raw resident claims, AI hints, and official findings. |

### 6.2 Module 5 Operational Workflow

```mermaid
flowchart TD
    ActiveCase([Case in Active Handling]) --> ClosureInitiated[Leader Initiates Case Closure]
    
    subgraph ClosureProtocol["Mandatory Closure & Disposition Protocol"]
        ClosureInitiated --> SelectDisposition{Select Documented Disposition}
        
        SelectDisposition --> D1["1. Concern Resolved"]
        SelectDisposition --> D2["2. Missing Pet Recovered / Reunited"]
        SelectDisposition --> D3["3. Owner Compliance Verified"]
        SelectDisposition --> D4["4. Formally Handed Off to External Authority"]
        SelectDisposition --> D5["5. Invalid / False Alarm Report"]
        SelectDisposition --> D6["6. Linked to Duplicate Master Report"]
        SelectDisposition --> D7["7. Closed Without Confirmed Resolution"]
        
        D1 & D2 & D3 & D4 & D5 & D6 & D7 --> EnterNotes[Enter Detailed Closure Rationale & Summary]
        EnterNotes --> FinalValidation{All Mandatory Fields Completed?}
        FinalValidation -->|No| BlockClosure[Prevent Closure - Require Documentation]
        FinalValidation -->|Yes| SetClosedStatus[Update Global Status to CLOSED]
    end

    SetClosedStatus --> PostClosureActions[Execute Post-Closure Tasks]

    subgraph PostClosureTasks["System Updates & Analytics"]
        PostClosureActions --> NotifyResident[Send Case Resolution Notification to Reporter]
        PostClosureActions --> WriteAudit[Append Final Record to audit_logs Table]
        PostClosureActions --> UpdateHeatmap[Refresh Spatial Heatmap & Analytics Data]
        PostClosureActions --> ArchiveNotice[Archive or Mark Resolved on Lost/Found Board]
    end

    NotifyResident & WriteAudit & UpdateHeatmap & ArchiveNotice --> Completed([Case Lifecycle Terminated])
```

---

## 7. Complete End-to-End System Integration Flow

The diagram below demonstrates how an incident moves from initial resident submission through triage, multi-pathway intervention, and verified closure:

```mermaid
sequenceDiagram
    autonumber
    actor Resident as Resident (Role 1)
    participant UI as Resident App (/resident-app)
    participant API as Backend FastAPI (:8000)
    participant AI as AI Worker (YOLO / Gemini)
    participant DB as SQLite DB & Audit Log
    actor Leader as Subdivision Leader (Role 2)
    actor Agency as External Authority

    %% Step 1: Reporting
    Resident->>UI: Submits Report + Photos + GPS Pin
    UI->>API: POST /api/reports (Incident Category, Location)
    API->>DB: INSERT into reports (Status: REPORTED)
    API->>AI: Trigger Asynchronous Inference Task
    API-->>UI: Return Report Confirmation (Case ID)

    %% Step 2: AI Support & Triage
    AI->>AI: Run Species Detection & Duplicate Check
    AI->>DB: INSERT ai_suggestions (Non-blocking)
    Leader->>API: GET /api/reports/triage (Queue)
    API-->>Leader: Render Report + Photos + AI Suggestions
    Leader->>API: PATCH /api/reports/{id} (Set Urgency, Ownership, Status: UNDER_REVIEW)
    Leader->>API: POST /api/reports/{id}/pathways (Assign Pathway A / B / C)

    %% Step 3: Interventions
    alt Pathway A: Lost Pet
        Resident->>UI: Post Sighting Pin
        UI->>API: POST /api/sightings
        API->>DB: INSERT sighting + notify owner
    else Pathway B: Owner Policy Violation
        Leader->>API: POST /api/warnings (Issue Notice + 3-Day Observation)
        API->>DB: INSERT into warnings & observations
    else Pathway C: External Authority Referral
        Leader->>API: POST /api/referrals (Refer to Barangay / City Vet)
        API->>DB: INSERT into external_referrals
        Leader->>Agency: Coordinate Off-Platform via Referral Letter
        Agency-->>Leader: Provide Field Outcome
        Leader->>API: PATCH /api/referrals/{id} (Record Outcome)
    end

    %% Step 4: Resolution & Closure
    Leader->>API: POST /api/reports/{id}/close (Disposition + Closure Notes)
    API->>DB: UPDATE reports SET status = CLOSED
    API->>DB: INSERT audit_logs (Actor, Action, Timestamp, Notes)
    API-->>Resident: Push Notification: Case Closed with Documented Outcome
    Leader->>API: GET /api/analytics/heatmaps
    API-->>Leader: Display Updated Hotspots & Analytics Summary
```

---

## 8. Summary of Database Entities & Statuses

### Global Case Statuses
1. **`REPORTED`**: Initial state upon resident submission.
2. **`UNDER_REVIEW`**: Subdivision Leader acknowledged, assessing incident, AI suggestions, and urgency.
3. **`IN_PROGRESS`**: Active interventions underway (investigation, observation window, external referral, or sighting pinging).
4. **`CLOSED`**: Formally resolved with mandatory documented disposition.

### Response Pathways
- **Pathway A**: Lost Pet and Community Assistance.
- **Pathway B**: Owned Animal, Nuisance, or Policy Concern.
- **Pathway C**: Safety, Welfare, or External Coordination.

### Core Database Tables Involved
- `users`: Role-based authentication (`role_id: 1, 2, 4`), credentials, contact information.
- `reports`: Core incident data, categories, geofence status, timestamps, global lifecycle status.
- `report_media`: Associated photos and videos uploaded by reporting residents or leaders.
- `sightings`: Map-pinned observations connected to stray cases or lost pet notices.
- `pets`: Registered household pets linked to resident profiles.
- `lost_found_matches`: Cross-matching table between active reports, notices, and registered pets.
- `owner_warnings`: Violation notices, severity, observation timelines, and compliance evidence.
- `external_referrals`: Detailed logs of coordination with Barangay, City Vet, or rescue organizations.
- `ownership_claims`: Proof and adjudication records for disputed or claimed animals.
- `audit_logs`: Immutable, append-only system journal of all administrative modifications.

