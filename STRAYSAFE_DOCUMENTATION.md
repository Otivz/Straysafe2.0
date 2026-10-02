# STRAY-SAFE 2.0: Technical and System Documentation
**Smart Stray Animal Reporting, Rescue, and Community Safety Management System**

---

## 1. System Overview

### 1.1 What is STRAY-SAFE 2.0?
**STRAY-SAFE 2.0** is an intelligent, full-stack, role-based web application and community animal welfare ecosystem. It facilitates end-to-end management of stray animal sightings, lost/found pet reconciliations, bite and nuisance hazard investigations, rescue dispatches, holding facility medical custody, owner violations/warnings, pet QR identification, and public adoption drives.

Built specifically around the local government unit (LGU) and homeowner association (HOA) structure in the Philippines (e.g., Barangay San Vicente and subdivisions like Selera Homes), STRAY-SAFE 2.0 bridges the operational gap between neighborhood residents, subdivision HOA security leaders, barangay animal welfare desks/rescue responders, and municipal system administrators.

```
       DETECT               VALIDATE              RESCUE              MONITOR              PROTECT
┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ Citizen Sighting │  │ Subdivision HOA  │  │ Barangay Staff │  │ Holding Facility│ │ Pet QR Codes,  │
│ AI Vision / NLP  │─▶│ Officer Review & │─▶│ Dispatch & Team│─▶│ Medical Care & │─▶│ Responsible     │
│ Media Analysis   │  │ Verification     │  │ Mission Tracker│  │ Timeline Audit │  │ Ownership /    │
│ GPS Geolocation  │  │ Dispute/False Flg│  │ Transport Ops │  │ Public Adoption│  │ Warnings / Law │
└──────────────────┘  └──────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘
```

### 1.2 Purpose of the System
The primary purpose of STRAY-SAFE 2.0 is to replace slow, unstructured, manual, and unverified social media reporting of stray animals with a centralized, verified, location-aware, and auditable digital incident and animal custody pipeline.

### 1.3 Problems the System Addresses
1. **Unverified & False Reporting:** Unverified social media posts cause panic, false alarms, and wasted dispatch resources on non-existent or exaggerated incidents.
2. **Delayed Barangay Response:** Barangay animal control units lack structured, prioritized incident queues with accurate GPS coordinates, visual evidence, and behavior classifications.
3. **Lost & Found Pet Mismatches:** Stray animals impounded or sighted on the streets are difficult to cross-match with lost pet notices posted by residents across different channels.
4. **Lack of Custody & Shelter Traceability:** Animals held in temporary cages lack structured intake logs, veterinary observation timelines, stay-limit alerts, or seamless transitions into adoption.
5. **Irresponsible Pet Ownership:** Free-roaming unleashed animals, repeat rabies/bite offenses, and overdue vaccinations go unpenalized and untracked.

### 1.4 Main Objectives
- **Automate Sightings & Analysis:** Leverage local computer vision (YOLOv8 Nano) and Multimodal LLMs (Google Gemini 2.5/3.5/3.7 Flash) to categorize animals, extract dominant colors, estimate sizes, and detect behavioral risks (e.g., actual bites vs. near-misses vs. playful behavior).
- **Enforce Hierarchical Validation:** Guarantee that neighborhood reports are inspected and verified at the subdivision HOA level before escalation to municipal/barangay rescue teams.
- **Provide Real-Time Geospatial Intelligence:** Map all active incidents, shelter facilities, subdivision boundaries, and rabies/bite density heatmaps using Leaflet and OpenStreetMap.
- **Support Animal Lifecycle & Identity:** Provide digital pet registries with unique cryptographic QR identity cards and public scan logs.
- **Ensure Full Transparency & Accountability:** Maintain tamper-evident system audit logs, case transfers, dispute resolutions, and automated unassigned/overdue background alerts.

### 1.5 Target Users & User Roles
1. **Citizen / Resident (Role ID = 1):** Community residents who report strays, register owned pets, generate pet QR tags, apply for animal adoptions, and track incident resolutions.
2. **Subdivision Leader / HOA Officer (Role ID = 2):** Community gatekeepers and HOA personnel who review, verify, dismiss false alarms, manage case transfers/merges, issue owner warnings, and escalate severe cases to the Barangay.
3. **Barangay Staff / Animal Welfare Officer (Role ID = 3):** Municipal responders and shelter handlers who execute rescue missions, manage the holding facility intake/medical timeline, review adoption applications, and conduct verified incident investigations.
4. **System Administrator (Role ID = 4):** System supervisors who manage user accounts, assign Barangay Head Officers, configure geospatial subdivision coverage boundaries, review system-wide audit logs, and analyze density heatmaps.

### 1.6 The DETECT → VALIDATE → RESCUE → MONITOR → PROTECT Workflow
- **DETECT:** A citizen captures a photo/video and submits a stray report. The system automatically processes the visual and textual data using YOLOv8, color extraction heuristics, and Gemini AI.
- **VALIDATE:** The report enters the Subdivision Leader's queue. Leaders verify ground truth, filter duplicates, flag false alarms, or resolve community-level incidents.
- **RESCUE:** Validated, high-priority, or unresolvable cases are escalated to Barangay Staff with an official Endorsement Letter. The Barangay assigns rescue personnel, updates transit and on-site statuses, and secures the animal.
- **MONITOR:** Secured animals enter the Holding Facility. Staff record intake weights, kennel slots, veterinary treatments, medical logs, and stay durations. Stale or overdue animals trigger automated background alerts.
- **PROTECT:** Animals are reunited with owners via Pet Claims or matched with new homes via the Public Adoption Catalog. Owners of repeat offenders receive structured municipal warning notices, while registered pets are protected by QR emergency tags.

---

## 2. System Features

| Category | Feature Name | Implementation Status | Description |
| :--- | :--- | :--- | :--- |
| **Authentication & Access** | JWT & HttpOnly Cookie Auth | **Fully Implemented** | Dual-token authentication (60-min access token + 7-day refresh token in HttpOnly cookie with rotation and JTI blacklisting). |
| | Multi-Step Resident Onboarding | **Fully Implemented** | Google OAuth & email signup requiring profile completion and 6-digit cryptographic OTP verification. |
| | Role-Based Access Control (RBAC) | **Fully Implemented** | Scoped authorization for Citizen (1), Subd Leader (2), Barangay Staff (3), and Admin (4) with IDOR multi-tenant boundary checks. |
| **Scope & Multi-Tenant Control**| Subdivision & Barangay Boundary Scoping | **Fully Implemented** | Strict role-based jurisdictional filters preventing HOA leaders or staff from inspecting or mutating incidents outside their assigned subdivision/barangay. |
| | Geospatial Geofence Coverage | **Fully Implemented** | Automated ray-casting polygon point-in-polygon and Haversine distance geofencing validating that incident pins reside within authorized subdivision territory. |
| | Feed & Visibility Scoping | **Fully Implemented** | Public vs. Private report separation, automated archiving of terminal statuses (Resolved, Deceased, Dismissed) from the active citizen home feed. |
| **Artificial Intelligence & Vision**| YOLOv8 Nano Animal Detection | **Fully Implemented** | Real-time on-premise object detection classifying Dogs and Cats, cropping bounding boxes, and calculating visual confidence scores. |
| | Video Frame Extraction & Scoring | **Fully Implemented** | OpenCV timeline sampler extracting up to 8 distributed video frames, running YOLO scoring to pick the optimal animal frame. |
| | Pillow Fur Color Extraction | **Fully Implemented** | Automated RGB pixel hue mapping cropping bounding boxes, filtering background vegetation/sky, and identifying primary/secondary coat colors. |
| | Gemini Multi-Model Fallback Engine| **Fully Implemented** | Automated 6-tier fallback chain (`gemini-2.5-flash` → `gemini-3.6-flash` → `gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-2.5-pro`) with local heuristic fallback. |
| | Whole-Narrative Contextual NLP | **Fully Implemented** | Semantic text analyzer understanding English, Tagalog, and Taglish negations, differentiating actual bites from near-misses and playful behavior. |
| | AI Photo Authenticity Forensics | **Fully Implemented** | Gemini multimodal detector identifying stock images, web downloads, and synthetic AI generation vs. authentic camera captures. |
| | Bidirectional Lost/Found Matcher | **Fully Implemented** | AI-driven similarity engine comparing stray incident traits against registered lost pet profiles with 0–100% scoring and evidence cards. |
| **Stray Animal Reporting** | Multi-Media Report Submission | **Fully Implemented** | Support for photos, video uploads (with frame extraction), GPS coordinate capture, landmark selection, and visibility controls. |
| | Automated Coverage Boundary Check | **Fully Implemented** | Real-time ray-casting / Haversine verification confirming report coordinates fall within the subdivision's active boundary. |
| | AI Copilot Incident Suggestions | **Fully Implemented** | Gemini AI + rule heuristics for animal type, colors, coat pattern, breed, risk level, priority, and whole-narrative behavioral analysis. |
| | Image Authenticity / AI Detector | **Fully Implemented** | Multi-model visual verification detecting downloaded, synthetic, or reused stock images vs. authentic mobile camera captures. |
| **Report Lifecycle & Case Mgmt** | Leader Verification & Claiming | **Fully Implemented** | Subdivision Leaders claim unassigned cases, conduct ground investigations, verify bites/chasing, or dismiss false alarms. |
| | Official Barangay Escalation | **Fully Implemented** | Formal endorsement workflow attaching digitized Endorsement Letters and elevating status to Barangay Rescue Requests. |
| | Case Transfer & Direct Takeover | **Fully Implemented** | Inter-leader case transfer requests with accept/reject flows, plus Head Officer emergency takeovers. |
| | Report Deduplication & Merging | **Fully Implemented** | Merging secondary duplicate reports into a primary case with audit tracking and unmerge capabilities. |
| | False Alarm Dispute Management | **Fully Implemented** | Citizens can file formal disputes with proof (photos/vaccine cards) when reports against their pets are marked as violations/false alarms. |
| **Rescue & Field Operations** | Rescue Mission Assignment | **Fully Implemented** | Barangay dispatching of rescue teams with status transitions: *Assigned*, *In Transit*, *On Site*, *Completed*, *Cancelled*. |
| | Live Status & Timeline Tracking | **Fully Implemented** | Step-by-step history tracking with timestamps, updater details, GPS relocation checkpoints, and status badges. |
| **Holding Facility & Shelter** | Intake & Kennel Management | **Fully Implemented** | Tracking admitted animals, kennel slots, animal condition, breed, and health categories (*Need Treatment*, *Healthy*, *Claimed*, etc.). |
| | Medical & Facility Timeline | **Fully Implemented** | Timestamped audit log for veterinary checks, vaccinations, feeding, observations, and photo evidence. |
| | Automated Overdue Watcher | **Fully Implemented** | Background asyncio worker running every 60s to notify staff when animals exceed the default 3-day holding custody limit. |
| | Promotion to Adoption | **Fully Implemented** | One-click promotion of unclaimed, healthy holding animals directly to the public adoption catalog. |
| **Pet & Owner Management** | Digital Pet Registry | **Fully Implemented** | Comprehensive pet records including multi-angle photos (front, left, right), vaccination records, bite history, and temperament. |
| | Pet QR Code & Public Scanning | **Fully Implemented** | Unique QR tokens per pet. Anyone scanning the QR tag can view public owner contact info and log GPS finder location coordinates. |
| | Automated Lost/Found Matching | **Fully Implemented** | Dual-direction similarity matcher comparing stray report media and descriptions against lost/registered pet profiles. |
| | Formal Pet Claims System | **Fully Implemented** | Multi-stage owner claim workflow (*Pending*, *Evidence Requested*, *Approved*, *Handover Complete*) with proof of ownership verification. |
| **Public Adoption Portal** | Adoption Catalog & Journey Map | **Fully Implemented** | Public browsable catalog of adoptable rescues with interactive chronological journey maps from rescue to shelter. |
| | Application & ID Verification | **Fully Implemented** | Multi-field adoption applications with living space checks, government ID uploads, Barangay approval, and automated pet profile creation. |
| **Safety, Warnings & Alerts** | Community Hazard Alerts | **Fully Implemented** | Publication of urgent rabies, aggressive pack, or stray advisories with priority badges, comments, and media attachments. |
| | Official Owner Warnings | **Fully Implemented** | Municipal penalty and violation warnings (*Notice*, *1st Warning*, *2nd Warning*, *Final Escalation*) with fine amounts and citizen acknowledgment. |
| | Integrated In-App Messaging | **Fully Implemented** | Scoped direct and report-based chat threads between citizens and HOA/Barangay staff. |
| **Analytics & Governance** | Interactive Maps & GPS Routing | **Fully Implemented** | Leaflet maps with custom landmark markers, holding facility overlays, and OSRM turn-by-turn rescue routing. |
| | Incident Density Heatmap | **Fully Implemented** | Dynamic Leaflet.heat layer visualizing stray and bite incident clusters across subdivisions. |
| | Audit Logs & Forensics | **Fully Implemented** | Complete audit logging tracking user IDs, actions, IP addresses, user agents, and JSON diffs of modified records. |
| | Background Operations Watcher | **Fully Implemented** | Asyncio background task monitoring 30-minute unassigned reports and holding stay limits. |

---

## 3. User Roles and Permissions

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ROLE HIERARCHY & SCOPE                         │
├───────────────────┬────────────────────────────────────────────────────┤
│ Role 4: Admin     │ System-wide oversight, user management, audit logs │
├───────────────────┼────────────────────────────────────────────────────┤
│ Role 3: Barangay  │ Full barangay scope, rescue dispatches, shelter    │
├───────────────────┼────────────────────────────────────────────────────┤
│ Role 2: Subd Lead │ Subdivision scope, report validation & escalation  │
├───────────────────┼────────────────────────────────────────────────────┤
│ Role 1: Citizen   │ Personal reports, owned pets, adoptions, QR tags   │
└───────────────────┴────────────────────────────────────────────────────┘
```

### 3.1 Multi-Tenant Jurisdiction & Scoping Architecture
The system enforces strict multi-tenancy and Insecure Direct Object Reference (IDOR) prevention through the backend dependency `verify_subdivision_scope` in `app/utils/auth.py`:

1. **System Administrator (Role ID = 4):**
   - **Scope:** Global / Enterprise.
   - **Access:** Complete uninhibited access across all barangays, subdivisions, holding shelters, and user records.
2. **Barangay Staff / Animal Welfare Desk (Role ID = 3):**
   - **Scope:** Municipal / Barangay-wide (`barangay_id`).
   - **Access:** Can access and manage any incident, rescue dispatch, or holding facility within their assigned Barangay (e.g., Barangay San Vicente). Access to records in other barangays is rejected with `403 Forbidden`.
   - **Head Officer Elevation:** Staff with `is_head_officer = True` possess additional operational rights to assign rescue personnel and perform direct case takeovers.
3. **Subdivision Leader / HOA Security Officer (Role ID = 2):**
   - **Scope:** Local Subdivision / Community (`subdivision_id`).
   - **Access:** Restricted strictly to incidents, pet registrations, and temporary holding cages belonging to their specific subdivision (e.g., Selera Homes). Cannot modify incidents once escalated to Barangay Staff.
4. **Citizen / Resident (Role ID = 1):**
   - **Scope:** Personal Resource Ownership & Public Community Feed.
   - **Access:** Full write access to their own authored reports, owned pet profiles, and adoption applications. Read access to active public neighborhood incidents. Access to internal staff notes or other users' private reports is denied.

#### A. Citizen / Resident (Role ID = 1)
- **Purpose:** Community reporter and pet owner.
- **Dashboard / Home:** `/resident-home`
- **Accessible Pages:** `/resident-home`, `/resident/report/new`, `/resident/reports/:id`, `/resident/pets`, `/resident/profile`, `/resident/settings`, `/resident/reports/:id/match-review`, `/resident/pet/:id/claims-dashboard`, `/adopt`, `/adopt/apply/:id`, `/adopt/applications`, `/adopt/journey/:id`, `/pet/scan/:token`.
- **Available Actions:** Submit reports with media/GPS; view active public and private reports; comment on reports; file disputes on false alarm tags; register owned pets; upload vaccination records; view pet QR code and scan history; submit adoption applications; chat with assigned handlers.
- **Data Restrictions:** Can only edit or delete their own unverified reports and owned pet records; cannot view internal leader verification notes or modify incident statuses.

#### B. Subdivision Leader / HOA Officer (Role ID = 2)
- **Purpose:** Local community validation layer and neighborhood safety manager.
- **Dashboard:** `/subd/dashboard`
- **Accessible Pages:** `/subd/dashboard`, `/subd/reports`, `/subd/reports/:id`, `/subd/history`, `/subd/history/:id`, `/subd/escalated`, `/subd/pet-claims`, `/subd/endorsements`, `/subd/pet-records`, `/subd/removed-pets`, `/subd/hazard-alert`, `/subd/holding-facility`, `/subd/messages`, `/subd/profile`, `/subd/settings`.
- **Available Actions:** Claim unassigned reports; verify incident facts; mark false alarms / dismissed; escalate cases to Barangay with PDF endorsement; directly resolve non-escalated cases; initiate and accept case transfers; merge duplicate reports; issue owner warning notices; manage temporary subdivision holding cages; publish hazard alerts.
- **Data Restrictions:** Scoped strictly to reports and pets within their assigned `subdivision_id`. Cannot modify reports once escalated to Barangay Staff.

#### C. Barangay Staff / Rescue Officer (Role ID = 3)
- **Purpose:** Field rescue dispatch, holding facility management, and municipal animal welfare operations.
- **Dashboard:** `/brgy/dashboard`
- **Accessible Pages:** `/brgy/dashboard`, `/brgy/rescue-requests`, `/brgy/reports/:id`, `/brgy/history-reports`, `/brgy/community-alerts`, `/brgy/holding-facility`, `/brgy/pet-records`, `/brgy/pet-claims`, `/brgy/adoptions`, `/brgy/personnel`, `/brgy/messages`, `/brgy/profile`, `/brgy/settings`.
- **Available Actions:** Accept escalated rescue requests; assign rescue staff teams; update field rescue statuses (*In Transit*, *On Site*, *Picked Up*, *Impounded*); admit animals to holding facilities; maintain holding medical logs and kennel slots; approve/reject adoption applications; execute pet handovers; resolve municipal bite investigations.
- **Data Restrictions:** Scoped to their assigned `barangay_id`. Head Officers (`is_head_officer = True`) have elevated privileges to reassign staff and perform direct case takeovers.

#### D. System Administrator (Role ID = 4)
- **Purpose:** System-wide governance, user account management, and operational analytics.
- **Dashboard:** `/admin/dashboard`
- **Accessible Pages:** `/admin/dashboard`, `/admin/users`, `/admin/account-settings`, `/admin/incidents`, `/admin/heatmap`, `/admin/logs`, `/admin/pets`, `/admin/holding-facility`, `/admin/adoptions`.
- **Available Actions:** Create and deactivate user accounts; assign Barangay Head Officers; configure subdivision coverage boundaries; view all reports across all barangays; inspect audit logs with JSON diffs; view incident heatmaps and system telemetry.
- **Data Restrictions:** Unrestricted global system access.

### 3.2 Role-Permission Matrix

| Functional Capability | Citizen (1) | Subd Leader (2) | Brgy Staff (3) | Admin (4) |
| :--- | :---: | :---: | :---: | :---: |
| Submit New Stray Report | Yes | Yes | Yes | Yes |
| View Active Public Community Feed | Yes | Yes | Yes | Yes |
| Claim Unassigned Report | No | Yes (Subd only) | Yes (Brgy only) | Yes |
| Verify Ground Truth / Behavior | No | Yes (Subd only) | Yes | Yes |
| Mark Report as False Alarm / Dismissed | No | Yes (Subd only) | Yes | Yes |
| Escalate Report with Endorsement Letter | No | Yes (Subd only) | No | Yes |
| Direct Resolve (Non-escalated cases) | No | Yes (Subd only) | Yes | Yes |
| Dispatch Rescue Teams & Update Transit | No | No | Yes | Yes |
| Admit Animal to Holding Facility | No | Yes (Subd Pen) | Yes (Main Facility) | Yes |
| Log Medical / Kennel Timeline Entries | No | Yes (Subd Pen) | Yes | Yes |
| Promote Holding Animal to Adoption Catalog | No | No | Yes | Yes |
| Submit Adoption Application | Yes | Yes | Yes | Yes |
| Approve / Reject Adoption Applications | No | No | Yes | Yes |
| Execute Animal Adoption Handover | No | No | Yes | Yes |
| Register Owned Pet & Generate QR Tag | Yes | Yes | Yes | Yes |
| Scan QR Code & Log Finder GPS Location | Public / Anyone | Public / Anyone | Public / Anyone | Public / Anyone |
| File Owner Claim on Found Stray | Yes | Yes | Yes | Yes |
| Review & Approve Pet Claims | No | Yes (Subd only) | Yes | Yes |
| Issue Violation Warning Notice to Owner | No | Yes (Subd only) | Yes | Yes |
| Publish Community Hazard Alert | No | Yes (Subd only) | Yes (Brgy-wide) | Yes |
| View System Audit Logs & Forensics | No | No | No | Yes |
| Edit Subdivision Coverage Geo-Fence | No | No | No | Yes |
| Manage User Roles & Account Status | No | No | No | Yes |

---

## 4. System Architecture

STRAY-SAFE 2.0 uses a modern decoupled client-server architecture consisting of a **React 19 Single Page Application (SPA)** frontend, a **FastAPI (Python 3.10+)** RESTful backend, a **MySQL 8.0** relational database managed by **SQLAlchemy 2.0**, and an **AI/Computer Vision pipeline** combining local YOLOv8 with Google Gemini Generative AI.

```mermaid
flowchart TB
    subgraph Client_Layer ["Client Layer (Browser / Mobile Web)"]
        ReactApp["React 19 + TypeScript (Vite)\nTailwindCSS + Lucide Icons"]
        LeafletMap["Leaflet + React-Leaflet\nOSRM Routing & Heatmap Layer"]
        QRScanner["Html5-Qrcode Engine\nBrowser Camera / GPS API"]
    end

    subgraph Gateway_Security ["Security & API Gateway"]
        CORS["CORS Middleware\nDynamic Environment Origins"]
        RateLimiter["SlowAPI Rate Limiter\n5 req/min on Auth endpoints"]
        JWTAuth["JWT Bearer + HttpOnly Cookies\nJTI Token Revocation Engine"]
        MultiTenant["Multi-Tenant Scope Validator\nIDOR Prevention Engine"]
    end

    subgraph Backend_Layer ["Backend Core (FastAPI Python)"]
        MainApp["FastAPI Main Application\nLifespan Manager"]
        
        subgraph APIRoutes ["REST API Routers"]
            AuthRoutes["/auth (Auth & OTP)"]
            ReportRoutes["/reports (Reports & Verification)"]
            RescueRoutes["/rescue (Rescue & Missions)"]
            HoldingRoutes["/holding (Facility & Medical)"]
            PetRoutes["/pets & /pet-qr (Registry & QR)"]
            AdoptionRoutes["/adoptions (Catalog & Workflow)"]
            ClaimRoutes["/claims (Pet Ownership Claims)"]
            WarningRoutes["/warnings (Violations & Notices)"]
            ChatRoutes["/chat (Direct & Case Messaging)"]
            GeoRoutes["/landmarks & Coverage"]
            AuditRoutes["/audit-logs (Security Auditing)"]
        end

        subgraph BackgroundTasks ["Async Background Workers"]
            UnassignedWorker["Unassigned Reports Watcher (30m)"]
            OverdueWorker["Holding Stay Overdue Watcher (3d)"]
        end
    end

    subgraph AI_Media_Layer ["AI & Media Services"]
        YOLO["YOLOv8 Nano (yolov8n.pt)\nLocal Object Detection"]
        ColorEngine["Pillow + RGB K-Means\nFur Color Detection Engine"]
        VideoEngine["OpenCV Video Processor\nFrame Extractor & Evaluator"]
        GeminiAPI["Google Gemini Generative AI\n(2.5-flash / 3.5-flash / 3.7-flash)"]
        Cloudinary["Cloudinary Cloud Storage\nMedia CDN (Photos, Videos, PDFs)"]
    end

    subgraph Database_Layer ["Persistence Layer"]
        MySQL[("MySQL 8.0 Relational DB\n(straysafe_db)")]
        SQLAlchemyORM["SQLAlchemy 2.0 ORM\nConnection Pool (15/25)"]
    end

    ReactApp -->|HTTP/REST with JWT| Gateway_Security
    Gateway_Security --> APIRoutes
    APIRoutes --> MainApp
    MainApp --> SQLAlchemyORM
    SQLAlchemyORM --> MySQL

    APIRoutes --> YOLO
    APIRoutes --> ColorEngine
    APIRoutes --> VideoEngine
    APIRoutes --> GeminiAPI
    APIRoutes --> Cloudinary

    MainApp -.->|Async Tasks| BackgroundTasks
    BackgroundTasks --> SQLAlchemyORM
```

---

## 5. Technology Stack

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | `^19.2.4` | Component-based UI library for single-page web applications. |
| **Frontend Language** | TypeScript | `~6.0.2` | Type-safe JavaScript superset for scalable client code. |
| **Build Tool & Bundler** | Vite | `^8.0.4` | High-performance frontend dev server and production bundler. |
| **Styling & CSS** | TailwindCSS | `^4.2.2` | Utility-first CSS framework integrated via `@tailwindcss/postcss`. |
| **Client Routing** | React Router DOM | `^7.14.1` | Declarative client-side routing and protected route guards. |
| **HTTP Client** | Axios | `^1.15.0` | Promise-based HTTP client with request/response interceptors. |
| **Mapping Engine** | Leaflet | `^1.9.4` | Mobile-friendly interactive JavaScript map rendering. |
| **React Map Wrapper** | React-Leaflet | `^5.0.0` | React component bindings for Leaflet maps and markers. |
| **Map Heatmap Layer** | Leaflet.heat | `^0.2.0` | Heatmap visualization layer for incident and bite clusters. |
| **Turn-by-Turn Routing** | Leaflet-Routing-Machine | `^3.2.12` | OSRM routing control for calculating rescue transit paths. |
| **QR Code Scanner** | Html5-Qrcode | `^2.3.8` | In-browser QR code and barcode scanning via device camera. |
| **UI Icons** | Lucide React | `^1.28.0` | Modern, lightweight SVG icon package. |
| **Backend Framework** | FastAPI | `>=0.110.0` | High-performance asynchronous Python web API framework. |
| **ASGI Web Server** | Uvicorn | `>=0.27.1` | Lightning-fast ASGI web server implementation. |
| **ORM & DB Abstraction** | SQLAlchemy | `>=2.0.27` | Python SQL toolkit and Object Relational Mapper with 2.0 type syntax. |
| **Database Driver** | PyMySQL | `>=1.1.0` | Pure-Python MySQL client library. |
| **Database Engine** | MySQL | `8.0+` | Relational database server storing all operational data. |
| **Password Hashing** | Bcrypt / Passlib | `bcrypt<4, passlib>=1.7.4` | Secure salted password hashing algorithm. |
| **JWT Library** | PyJWT | `>=2.8.0` | JSON Web Token encoding, decoding, and signature verification. |
| **Rate Limiting** | SlowAPI | `>=0.1.9` | Rate-limiting library based on limits to prevent brute-force attacks. |
| **Data Validation** | Pydantic / Pydantic-Settings | `>=2.6.3` | Data validation and settings management using Python type hints. |
| **Object Detection AI** | Ultralytics YOLOv8 | `>=8.1.0` | Real-time object detection model (`yolov8n.pt`) for animal detection. |
| **Generative AI** | Google Generative AI | `>=0.3.0` | Gemini API SDK for multimodal vision, authenticity, and NLP analysis. |
| **Image Processing** | Pillow (PIL) | `>=9.0.0` | Python Imaging Library for cropping, resizing, and color analysis. |
| **Video Processing** | OpenCV (cv2) | `4.x+` (headless) | Video frame extraction and frame sampling. |
| **QR Code Generation** | Qrcode | `>=7.4.2` | Python QR code generator creating scannable pet tag tokens. |
| **Cloud Storage** | Cloudinary SDK | `>=1.38.0` | Cloud media management for photos, videos, and PDF letters. |

---

## 6. Frontend Documentation

### 6.1 Structure and Organization
The frontend code is structured inside `frontend/src/` with clear role-based pages, modular reusable UI components, centralized context providers, and typed API utilities:

```text
frontend/src/
├── assets/                 # Static branding, logo assets, placeholder graphics
├── components/             # Reusable UI components & modals
│   ├── Cards/              # Report cards, alert cards, statistic widgets
│   ├── Chat/               # Message drawers, report chat badges, thread lists
│   ├── MapControls/        # Custom map buttons, layer switchers, GPS triggers
│   ├── Modals/             # Verification, Transfer, Merge, QR Scanner modals
│   ├── Navbars/            # Role-specific top navigation bars and mobile bars
│   ├── Notifications/      # Toast notification container
│   ├── PetRecords/         # Pet card grids and detail modals
│   ├── Shared/             # Common buttons, inputs, dropdowns, status badges
│   ├── AIPotentialMatchesList.tsx
│   ├── AISuggestionPanel.tsx
│   ├── AiImageVerificationBadge.tsx
│   ├── HeatmapLayer.tsx
│   ├── MapComponent.tsx
│   ├── ProtectedRoute.tsx
│   └── RescueTimeline.tsx
├── context/                # React contexts (ThemeContext, ToastContext)
├── pages/                  # Role-based route view pages
│   ├── Admin/              # System admin dashboard, logs, users, heatmaps
│   ├── Barangay_Staff/     # Barangay dashboard, rescue, holding, adoptions
│   ├── Subd_Leaders/       # Subdivision dashboard, reports, alerts, transfers
│   └── citizen/            # Resident home, stray reporting, pet QR, adoptions
├── routes/                 # Route registry (AppRoutes.tsx)
└── utils/                  # API client, Cloudinary helpers, token management
```

### 6.2 Key Frontend Files & Pages

| File / Path | Component / Page | Purpose | Main Functions & Capabilities |
| :--- | :--- | :--- | :--- |
| `src/routes/AppRoutes.tsx` | `AppRoutes` | Main Route Registry | Configures public routes, role-guarded routes with `ProtectedRoute`, and 404 fallbacks. |
| `src/utils/api.ts` | Axios API Client | Centralized HTTP client | Handles automatic JWT Bearer token injection, automatic token refresh on 401, and auth storage cleanup. |
| `src/components/ProtectedRoute.tsx` | `ProtectedRoute` | RBAC Route Guard | Inspects stored user role ID against `allowedRoles`; redirects unauthorized users to their respective login portal. |
| `src/components/MapComponent.tsx` | `MapComponent` | Core Interactive Map | Renders Leaflet map with custom icons, polygon boundaries, radius circles, GPS location pickers, and markers. |
| `src/components/RescueTimeline.tsx` | `RescueTimeline` | Incident History Component | Visualizes chronological timeline of status updates, personnel involved, GPS locations, and uploaded evidence. |
| `src/components/AISuggestionPanel.tsx` | `AISuggestionPanel` | AI Copilot Display | Displays AI suggested animal breed, colors, size, risk level, priority reason, and behavioral analysis. |
| `src/components/AiImageVerificationBadge.tsx` | `AiImageVerificationBadge` | Photo Authenticity Badge | Shows AI confidence score and visual authenticity analysis (e.g., authentic mobile photo vs. synthetic/stock). |
| `src/components/Modals/QRScannerModal.tsx` | `QRScannerModal` | In-Browser Camera Scanner | Utilizes `html5-qrcode` to scan physical pet QR codes and redirect to the pet scan record. |
| `src/components/Modals/MergeReportModal.tsx` | `MergeReportModal` | Duplicate Merging Modal | Allows subdivision leaders to search and merge duplicate reports into a primary case with audit notes. |
| `src/pages/citizen/LandingPage.tsx` | `LandingPage` | Public Landing Portal | Introduces STRAY-SAFE 2.0 features, quick action links, public adoption showcases, and login entry points. |
| `src/pages/citizen/ResiHomePage.tsx` | `ResiHomePage` | Citizen Incident Feed | Active incident feed, map toggle, quick filter by category, real-time notification alerts, and report cards. |
| `src/pages/citizen/ReportStrayPage.tsx` | `ReportStrayPage` | Stray Report Wizard | Multi-step form for reporting strays with photo/video upload, live AI media analysis, and GPS map pin placement. |
| `src/pages/citizen/ResidentPet.tsx` | `ResidentPet` | Pet Management Page | Register owned pets, manage vaccine records, upload 3-side photos, and generate printable QR code tags. |
| `src/pages/citizen/PetQrCardPage.tsx` | `PetQrCardPage` | Printable Pet QR ID Tag | Renders printable pet identification card with emergency contacts and direct QR code linking to `/pet/scan/:token`. |
| `src/pages/citizen/PetScanPage.tsx` | `PetScanPage` | Public QR Scan Portal | Public landing page for finders who scan a lost pet tag; displays pet info and captures finder's GPS coordinates. |
| `src/pages/citizen/AdoptionCatalog.tsx` | `AdoptionCatalog` | Public Adoption Gallery | Grid of adoptable rescues with breed, age, temperament filters, and links to the interactive Animal Journey Map. |
| `src/pages/citizen/AnimalJourneyMap.tsx` | `AnimalJourneyMap` | Animal Journey Viewer | Visualizes the complete life journey of a rescued animal from initial sighting location to holding facility custody. |
| `src/pages/Subd_Leaders/SubdDashboard.tsx` | `SubdDashboard` | HOA Leader Dashboard | Key operational metrics (Unassigned, Active, Escalated, Resolved), incident heat map snippet, and quick queues. |
| `src/pages/Subd_Leaders/SubdReports.tsx` | `SubdReports` | Active Report Queue | Table and card view of incoming citizen reports with priority filtering, search, and bulk assignment tools. |
| `src/pages/Subd_Leaders/SubdViewReport.tsx` | `SubdViewReport` | Report Investigation View | Comprehensive case view: ground-truth verification, dispute review, case transfer, merging, and Barangay escalation. |
| `src/pages/Subd_Leaders/EndorsementArch.tsx` | `EndorsementArch` | Endorsement Archive | Repository of all digitized Endorsement Letters issued to Barangay authorities with downloadable PDFs. |
| `src/pages/Subd_Leaders/SubdHazardAlert.tsx` | `SubdHazardAlert` | Hazard Alert Publisher | Form and management table for publishing subdivision-wide safety warnings and stray pack alerts. |
| `src/pages/Barangay_Staff/BrgyDashboard.tsx` | `BrgyDashboard` | Municipal Command Center | High-level statistics on rescue requests, active missions, holding facility occupancy, and pending adoptions. |
| `src/pages/Barangay_Staff/BrgyRescueRequests.tsx`| `BrgyRescueRequests` | Rescue Mission Dispatch | Queue of escalated reports requiring dispatch; assignment of staff teams; real-time mission status controls. |
| `src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`| `BrgyHoldingFacility` | Shelter & Kennel Manager | Kennel slot occupancy grid, intake registry, medical timeline logging, stay-limit counter, and adoption promotion. |
| `src/pages/Barangay_Staff/BrgyAdoptions.tsx` | `BrgyAdoptions` | Adoption Review Desk | Review citizen adoption applications, verify applicant government IDs and living conditions, and execute handovers. |
| `src/pages/Admin/AdminDashboard.tsx` | `AdminDashboard` | System Admin Center | System-wide performance metrics, user distribution, monthly trends, and global audit summary. |
| `src/pages/Admin/AdminUserManagement.tsx` | `AdminUserManagement` | User Account Control | Manage accounts, create staff/leaders, assign Barangay Head Officers, reset passwords, and toggle Active/Inactive. |
| `src/pages/Admin/AdminHeatMap.tsx` | `AdminHeatMap` | Geospatial Analytics | Interactive full-screen heatmap rendering stray concentrations, rabies/bite clusters, and hazard hot spots. |
| `src/pages/Admin/AdminLogs.tsx` | `AdminLogs` | Forensics Audit Viewer | Searchable audit log table with filterable action types, IP addresses, actor IDs, and expandable JSON change diffs. |

---

## 7. Backend Documentation

### 7.1 Architecture & Application Entry Point
The backend application entry point is located at `backend/app/main.py`. It initializes the FastAPI application, mounts static asset directories, configures SlowAPI rate-limiting, attaches CORS middleware, defines sanitized database exception handlers, starts async background tasks via the `lifespan` context manager, and mounts 17 distinct API routers.

### 7.2 Backend Directory Structure
```text
backend/
├── app/
│   ├── database/           # SQLAlchemy database session & engine configuration
│   │   ├── __init__.py
│   │   └── session.py
│   ├── models/             # SQLAlchemy ORM database models (17 model files)
│   │   ├── announcement.py
│   │   ├── audit_log.py
│   │   ├── chat.py
│   │   ├── coverage.py
│   │   ├── landmark.py
│   │   ├── notification.py
│   │   ├── otp.py
│   │   ├── pet.py
│   │   ├── pet_claim.py
│   │   ├── pet_qr.py
│   │   ├── report.py
│   │   ├── report_dispute.py
│   │   ├── report_match.py
│   │   ├── revoked_token.py
│   │   ├── user.py
│   │   └── warning.py
│   ├── routes/             # FastAPI REST endpoint routers
│   │   ├── adoptions.py
│   │   ├── announcements.py
│   │   ├── audit_logs.py
│   │   ├── auth.py
│   │   ├── chat.py
│   │   ├── claims.py
│   │   ├── holding.py
│   │   ├── landmarks.py
│   │   ├── matches.py
│   │   ├── notifications.py
│   │   ├── pet_qr.py
│   │   ├── pets.py
│   │   ├── reports.py
│   │   ├── rescue.py
│   │   ├── users.py
│   │   └── warnings.py
│   ├── schemas/            # Pydantic request/response schemas
│   ├── tasks/              # Background workers (unassigned_checker.py)
│   ├── utils/              # Helper utilities (auth, ai_suggestions, uploads, etc.)
│   │   ├── ai_suggestions.py
│   │   ├── audit.py
│   │   ├── auth.py
│   │   ├── cloudinary_config.py
│   │   ├── color_detection.py
│   │   ├── model_loader.py
│   │   ├── uploads.py
│   │   └── video_processing.py
│   └── limiter.py          # SlowAPI rate limiter instance
├── uploads/                # Local uploads fallback directory
├── yolov8n.pt              # Local YOLOv8 Nano weights file (6.5 MB)
└── requirements.txt        # Python backend package dependencies
```

### 7.3 Backend Security & Infrastructure Services
1. **Sanitized Exception Handlers:** Handlers in `main.py` intercept `SQLAlchemyError` and 500-level `HTTPException` instances, scrubbing internal SQL queries, table names, and stack traces to prevent database fingerprinting.
2. **Dynamic Startup Schema Migrations:** Auto-executing schema migration routines in `main.py` verify and automatically provision required columns, foreign keys, and lookup rows (e.g., `report_status`, `facility_status`, `coverage_settings`) on server boot without manual SQL execution.
3. **Multi-Tenant Boundary Scoper:** `verify_subdivision_scope` in `app/utils/auth.py` prevents Insecure Direct Object References (IDOR) by validating that Subdivision Leaders and Barangay Staff can only mutate records belonging to their assigned jurisdiction.
4. **Audit Logging Service:** `log_activity` in `app/utils/audit.py` captures every critical operational and security event with IP address, user agent, actor ID, and JSON snapshots of old and new values.

---

## 8. API Documentation

### 8.1 Authentication & Profile Endpoints (`/auth`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/auth/subdivisions` | Get active subdivisions list | No | Public | None | `List[Subdivision]` |
| `POST` | `/auth/login` | Resident/Staff/Admin login | No (Rate limit: 5/min) | Public | `LoginRequest` (email, password) | `LoginResponse` + HttpOnly cookie |
| `POST` | `/auth/google` | Google OAuth login/register | No | Public | `GoogleAuthRequest` | `LoginResponse` |
| `POST` | `/auth/complete-profile` | Complete resident profile & send OTP | No | Public | `CompleteProfileRequest` | `CompleteProfileResponse` |
| `POST` | `/auth/verify-otp` | Verify 6-digit OTP & activate account | No | Public | `VerifyOtpRequest` (user_id/email, otp) | `LoginResponse` |
| `POST` | `/auth/resend-otp` | Resend OTP (30s cooldown) | No | Public | `ResendOtpRequest` | `CompleteProfileResponse` |
| `GET` | `/auth/verify-session` | Verify active JWT session | Bearer Token | All (1,2,3,4) | None | Session user metadata |
| `GET` | `/auth/me` | Fetch current user details | Bearer Token | All (1,2,3,4) | None | `UserPublicResponse` |
| `POST` | `/auth/refresh` | Refresh access token via cookie | Cookie | All (1,2,3,4) | HttpOnly `refresh_token` | `{ access_token, token_type }` |
| `POST` | `/auth/logout` | Revoke tokens & clear cookie | Bearer Token | All (1,2,3,4) | None | `{ message }` |

### 8.2 Stray Animal Report Endpoints (`/reports`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/reports/` | List reports (with role scoping) | Bearer Token | All (1,2,3,4) | Query: `status_id`, `subdivision_id`, `search` | `List[ReportResponse]` |
| `POST` | `/reports/` | Submit a new stray report | Bearer Token | All (1,2,3,4) | `ReportCreate` (coords, description, media) | `ReportResponse` |
| `GET` | `/reports/{report_id}` | Get report details | Bearer Token | All (1,2,3,4) | Path: `report_id` | `ReportResponse` |
| `DELETE` | `/reports/{report_id}` | Delete report (owner only) | Bearer Token | Citizen (1), Admin (4) | Path: `report_id` | `{ message }` |
| `PATCH` | `/reports/{report_id}/cancel` | Cancel report before verification | Bearer Token | Citizen (1) | Path: `report_id`, Body: `reason` | `ReportResponse` |
| `PATCH` | `/reports/{report_id}` | Update report metadata | Bearer Token | Subd (2), Brgy (3), Admin (4) | `ReportUpdate` | `ReportResponse` |
| `POST` | `/reports/analyze-media` | Run YOLOv8 & Gemini on media | Bearer Token | All (1,2,3,4) | `UploadFile` (image or video) | Media AI analysis JSON |
| `POST` | `/reports/validate-images` | Verify photo authenticity | Bearer Token | All (1,2,3,4) | Body: `{ image_url }` | Photo authenticity verdict |
| `POST` | `/reports/{report_id}/claim` | Leader claims unassigned report | Bearer Token | Subd Leader (2) | Path: `report_id` | `ReportResponse` |
| `POST` | `/reports/{report_id}/take-over` | Direct takeover by Head Officer | Bearer Token | Head Officer (3), Admin (4) | Path: `report_id`, Body: `{ reason }` | `ReportResponse` |
| `POST` | `/reports/{report_id}/transfer/request` | Request case transfer | Bearer Token | Subd Leader (2) | Path: `report_id`, Body: `{ target_leader_id }` | `ReportResponse` |
| `POST` | `/reports/{report_id}/transfer/accept` | Accept case transfer | Bearer Token | Subd Leader (2) | Path: `report_id` | `ReportResponse` |
| `POST` | `/reports/{report_id}/transfer/reject` | Reject case transfer | Bearer Token | Subd Leader (2) | Path: `report_id` | `ReportResponse` |
| `POST` | `/reports/{report_id}/verify-incident` | Record investigation findings | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: bite/chase/injury booleans | `ReportResponse` |
| `POST` | `/reports/{report_id}/mark-false-alarm` | Dismiss as false alarm | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ reason, notes }` | `ReportResponse` |
| `POST` | `/reports/{report_id}/merge` | Merge duplicate report | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ duplicate_report_id, notes }` | `ReportResponse` |
| `POST` | `/reports/{report_id}/unmerge` | Unmerge report | Bearer Token | Subd (2), Brgy (3), Admin (4) | Path: `report_id` | `ReportResponse` |
| `POST` | `/reports/{report_id}/endorse` | Escalate with Endorsement PDF | Bearer Token | Subd Leader (2) | FormData: `title`, `content`, `file` | `ReportResponse` |
| `POST` | `/reports/{report_id}/direct-resolve`| Resolve non-escalated report | Bearer Token | Subd Leader (2) | Body: `{ resolution_notes }` | `ReportResponse` |
| `POST` | `/reports/{report_id}/disputes` | File dispute on false alarm tag | Bearer Token | Citizen (1) | Body: dispute reason, evidence URLs | `ReportDisputeResponse` |
| `POST` | `/reports/disputes/{id}/resolve` | Resolve filed dispute | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ status, reviewer_notes }` | `ReportDisputeResponse` |
| `GET` | `/reports/coverage-area` | Fetch subdivision boundary | Bearer Token | All (1,2,3,4) | Query: `subdivision_id` | `CoverageAreaResponse` |
| `PUT` | `/reports/coverage-area` | Update coverage boundary | Bearer Token | Admin (4) | `CoverageAreaUpdate` | `CoverageAreaResponse` |

### 8.3 Rescue & Field Dispatch Endpoints (`/rescue`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/rescue/` | List all rescue missions | Bearer Token | Brgy Staff (3), Admin (4) | Query: `status_id`, `barangay_id` | `List[RescueRequestResponse]` |
| `GET` | `/rescue/report/{report_id}` | Get rescue by report ID | Bearer Token | Subd (2), Brgy (3), Admin (4) | Path: `report_id` | `RescueRequestResponse` |
| `GET` | `/rescue/{rescue_id}` | Get rescue details | Bearer Token | Subd (2), Brgy (3), Admin (4) | Path: `rescue_id` | `RescueRequestResponse` |
| `POST` | `/rescue/assign-team` | Dispatch staff team to mission | Bearer Token | Brgy Staff (3), Admin (4) | Body: `{ rescue_id, staff_ids, remarks }` | `RescueRequestResponse` |
| `PATCH`| `/rescue/{rescue_id}/status` | Update rescue status & relocation | Bearer Token | Brgy Staff (3), Admin (4) | Body: `{ status_id, notes, lat, lng, facility_id }` | `RescueRequestResponse` |

### 8.4 Holding Facility & Shelter Endpoints (`/holding`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/holding/animals` | List animals in holding facility | Bearer Token | Subd (2), Brgy (3), Admin (4) | Query: `facility_status`, `subdivision_id` | `List[HoldingAnimalResponse]` |
| `POST` | `/holding/admit` | Admit animal to holding | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `report_id`, `kennel_slot`, `medical_notes` | `HoldingAnimalResponse` |
| `GET` | `/holding/animals/{holding_id}`| Get animal details & medical log | Bearer Token | Subd (2), Brgy (3), Admin (4) | Path: `holding_id` | `HoldingAnimalResponse` |
| `PATCH`| `/holding/animals/{id}/status` | Update kennel status & condition | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ facility_status, kennel_slot, notes }` | `HoldingAnimalResponse` |
| `POST` | `/holding/animals/{id}/timeline`| Add medical/observation entry | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ event_type, title, notes, media_url }` | `HoldingTimelineEntry` |
| `POST` | `/holding/animals/{id}/promote-adoption` | Promote to Adoption Catalog | Bearer Token | Brgy Staff (3), Admin (4) | Body: `{ adoption_catalog_notes }` | `HoldingAnimalResponse` |
| `GET` | `/holding/stats` | Facility occupancy & stay stats | Bearer Token | Subd (2), Brgy (3), Admin (4) | Query: `barangay_id`, `subdivision_id` | Facility statistics JSON |

### 8.5 Digital Pet Registry & Pet QR Endpoints (`/pets` & `/pet-qr`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/pets/my-pets` | List current user's pets | Bearer Token | Citizen (1) | None | `List[PetResponse]` |
| `POST` | `/pets/` | Register a new pet | Bearer Token | All (1,2,3,4) | `PetCreate` (photos, health, rabies info) | `PetResponse` |
| `GET` | `/pets/{pet_id}` | Get pet profile | Bearer Token | All (1,2,3,4) | Path: `pet_id` | `PetResponse` |
| `PUT` | `/pets/{pet_id}` | Update pet profile | Bearer Token | Owner, Staff, Admin | `PetUpdate` | `PetResponse` |
| `DELETE`| `/pets/{pet_id}` | Archive/remove pet record | Bearer Token | Owner, Staff, Admin | Path: `pet_id` | `{ message }` |
| `POST` | `/pets/{pet_id}/vaccinations` | Log vaccination record | Bearer Token | Owner, Staff, Admin | Body: vaccine name, date, clinic | `VaccinationResponse` |
| `POST` | `/pet-qr/{pet_id}/generate` | Generate unique QR token | Bearer Token | Owner, Staff, Admin | Path: `pet_id` | `PetQRCodeResponse` |
| `GET` | `/pet-qr/token/{token}` | Resolve QR token to pet | No | Public | Path: `token` | Public Pet details |
| `POST` | `/pet-qr/scan/{token}` | Record finder scan with GPS | No | Public | Body: `{ finder_name, finder_contact, lat, lng }` | Scan confirmation |
| `GET` | `/pet-qr/{pet_id}/scans` | View pet scan history | Bearer Token | Owner, Staff, Admin | Path: `pet_id` | `List[PetQRScanResponse]` |

### 8.6 Public Adoption Endpoints (`/adoptions`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/adoptions/catalog` | Browse adoptable animals | No | Public | Query: `animal_type`, `search` | `List[AdoptionCatalogItem]` |
| `GET` | `/adoptions/journey/{holding_id}`| Get animal journey map points | No | Public | Path: `holding_id` | Journey coordinates & logs |
| `POST` | `/adoptions/apply` | Submit adoption application | Bearer Token | All (1,2,3,4) | `AdoptionApplyRequest` + ID photo | `AdoptionResponse` |
| `GET` | `/adoptions/my-applications` | View user's submitted apps | Bearer Token | Citizen (1) | None | `List[AdoptionResponse]` |
| `GET` | `/adoptions/applications` | List pending applications | Bearer Token | Brgy Staff (3), Admin (4) | Query: `status` | `List[AdoptionResponse]` |
| `PATCH`| `/adoptions/applications/{id}/review`| Approve or reject application | Bearer Token | Brgy Staff (3), Admin (4) | Body: `{ status, review_notes }` | `AdoptionResponse` |
| `POST` | `/adoptions/applications/{id}/handover`| Finalize adoption & create Pet | Bearer Token | Brgy Staff (3), Admin (4) | Body: `{ handover_notes }` | `AdoptionResponse` |

### 8.7 Pet Ownership Claims Endpoints (`/claims`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/claims/` | List claims | Bearer Token | Subd (2), Brgy (3), Admin (4) | Query: `status` | `List[PetClaimResponse]` |
| `POST` | `/claims/` | Submit pet ownership claim | Bearer Token | Citizen (1) | Body: `report_id`, `pet_id`, evidence URLs | `PetClaimResponse` |
| `PATCH`| `/claims/{claim_id}/status` | Review claim (Approve/Reject) | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ status, remarks }` | `PetClaimResponse` |
| `POST` | `/claims/{claim_id}/handover` | Complete pet return handover | Bearer Token | Subd (2), Brgy (3), Admin (4) | Body: `{ remarks }` | `PetClaimResponse` |

### 8.8 Owner Violation Warnings Endpoints (`/warnings`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/warnings/my-warnings` | Get warnings issued to user | Bearer Token | Citizen (1) | None | `List[WarningResponse]` |
| `GET` | `/warnings/` | List all issued warnings | Bearer Token | Subd (2), Brgy (3), Admin (4) | Query: `user_id`, `subdivision_id` | `List[WarningResponse]` |
| `POST` | `/warnings/` | Issue new warning notice | Bearer Token | Subd (2), Brgy (3), Admin (4) | `WarningCreate` (level, fine, violation) | `WarningResponse` |
| `PATCH`| `/warnings/{id}/acknowledge` | Acknowledge receipt of warning | Bearer Token | Citizen (1) | Path: `warning_id` | `WarningResponse` |

### 8.9 Direct & Incident Messaging Endpoints (`/chat`)

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/chat/threads` | List user chat threads | Bearer Token | All (1,2,3,4) | None | `List[ChatThreadResponse]` |
| `GET` | `/chat/threads/{thread_id}/messages` | Get messages in thread | Bearer Token | Participant | Path: `thread_id` | `List[ChatMessageResponse]` |
| `POST` | `/chat/threads/{thread_id}/messages` | Send message in thread | Bearer Token | Participant | Body: `{ message_text, media_url }` | `ChatMessageResponse` |
| `PATCH`| `/chat/threads/{thread_id}/read` | Mark thread messages as read | Bearer Token | Participant | Path: `thread_id` | `{ success: true }` |
| `GET` | `/chat/unread-count` | Get unread message count | Bearer Token | All (1,2,3,4) | None | `{ unread_count }` |

### 8.10 User Management, Landmarks & Audit Logs

| Method | Endpoint | Purpose | Auth Required | Allowed Roles | Request Body / Query | Response |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GET` | `/users/` | List all user accounts | Bearer Token | Admin (4) | Query: `role_id`, `subdivision_id` | `List[UserResponse]` |
| `POST` | `/users/` | Create staff/leader account | Bearer Token | Admin (4) | `UserCreate` | `UserResponse` |
| `PATCH`| `/users/{user_id}/status` | Toggle user status (Active/Inactive)| Bearer Token | Admin (4) | Body: `{ status }` | `UserResponse` |
| `POST` | `/users/barangay/{id}/assign-head` | Assign Barangay Head Officer | Bearer Token | Admin (4) | Body: `{ user_id }` | `UserResponse` |
| `GET` | `/landmarks/` | List community landmarks | Bearer Token | All (1,2,3,4) | Query: `subdivision_id` | `List[LandmarkResponse]` |
| `POST` | `/landmarks/` | Create landmark / facility | Bearer Token | Admin (4) | `LandmarkCreate` | `LandmarkResponse` |
| `GET` | `/audit-logs/` | Query forensic audit logs | Bearer Token | Admin (4) | Query: `action`, `user_id`, `date` | `List[AuditLogResponse]` |
| `GET` | `/audit-logs/stats` | Audit metrics & security summary | Bearer Token | Admin (4) | None | Audit statistics JSON |

---

## 9. Database Documentation

The database is built on MySQL 8.0 with InnoDB tables using UTF8MB4 encoding.

| Model / Table Name | Purpose | Primary Key | Important Fields | Relationships |
| :--- | :--- | :--- | :--- | :--- |
| **`roles`** | User role lookup | `role_id` (INT) | `role_name` (Citizen, Subd Leader, Brgy Staff, Admin) | Referenced by `users` |
| **`positions`** | Staff position lookup | `position_id` (INT) | `position_name` (e.g., Security Chief, Desk Officer) | Referenced by `users` |
| **`barangays`** | Barangay LGU entity | `barangay_id` (INT) | `barangay_name`, `city`, `hq_lat`, `hq_lng` | Has many `subdivisions`, `landmarks`, `users` |
| **`subdivisions`** | Subdivision HOA entity | `subdivision_id` (INT) | `subdivision_name`, `barangay_id` (FK) | Belongs to `barangays`; Has many `reports`, `users` |
| **`users`** | User credentials & profiles | `user_id` (INT) | `name`, `email`, `password`, `phone`, `role_id` (FK), `is_verified`, `is_head_officer`, `status` | Belongs to `roles`, `positions`, `subdivisions`, `barangays` |
| **`otp_verifications`** | Resident phone/email OTPs | `otp_id` (INT) | `user_id` (FK), `otp_code`, `is_used`, `attempts`, `expires_at` | Belongs to `users` |
| **`revoked_tokens`** | JWT Blacklist for logout | `id` (INT) | `jti`, `token_type`, `user_id`, `expires_at` | Tracks revoked token identifiers |
| **`report_categories`** | Incident categories | `category_id` (INT) | `category_name` (e.g., Stray Animal, Aggressive, Injured) | Referenced by `reports` |
| **`report_status`** | Incident status lookup | `status_id` (INT) | `status_name` (IDs 1 through 18) | Referenced by `reports`, `status_history` |
| **`reports`** | Stray animal incidents | `report_id` (INT) | `user_id`, `subdivision_id`, `category_id`, `current_status_id`, `latitude`, `longitude`, `priority_level`, `ai_*` fields, `assigned_leader_id`, `duplicate_of_report_id` | Belongs to `users`, `subdivisions`, `report_categories`, `report_status`, `landmarks`; Has many `report_media`, `status_history`, `rescues`, `comments`, `report_matches`, `disputes` |
| **`report_media`** | Incident photos & videos | `media_id` (INT) | `report_id` (FK), `file_url`, `media_type`, `animal_type`, `dominant_color`, `ai_photo_likelihood` | Belongs to `reports`, `status_history`, `holding_timeline` |
| **`status_history`** | Chronological case audit | `history_id` (INT) | `report_id` (FK), `rescue_id` (FK), `report_status_id`, `latitude`, `longitude`, `facility_id`, `remarks` | Belongs to `reports`, `rescues`, `users`, `landmarks` |
| **`endorsement_letters`**| HOA Escalation letters | `letter_id` (INT) | `report_id` (FK, unique), `leader_id` (FK), `title`, `letter_content`, `file_url` | Belongs to `reports`, `users` |
| **`report_disputes`** | False alarm dispute appeals | `dispute_id` (INT) | `report_id` (FK), `resident_user_id` (FK), `pet_id` (FK), `dispute_reason`, `status`, `reviewer_id` | Belongs to `reports`, `users`, `pets` |
| **`rescues`** | Barangay rescue missions | `rescue_id` (INT) | `report_id` (FK), `staff_id` (FK), `status_id` (FK), `notes`, `started_at`, `completed_at` | Belongs to `reports`, `users`, `rescue_status`; Has many `rescue_assignments` |
| **`rescue_assignments`**| Staff assigned to mission | `assignment_id` (INT)| `rescue_id` (FK), `user_id` (FK), `assignment_status` | Belongs to `rescues`, `users` |
| **`facility_status`** | Shelter status lookup | `status_id` (INT) | `status_name` (1=Need Treatment, 2=Healthy, 3=Claimed, 4=Deceased, 5=Transferred, 6=For Adoption, 7=Adopted, 8=Impounded) | Referenced by `holding_animals` |
| **`holding_animals`** | Shelter custody records | `holding_id` (INT) | `report_id` (FK), `animal_name`, `facility_status` (FK), `kennel_slot`, `medical_notes`, `intake_date`, `discharge_date`, `overdue_notified` | Belongs to `reports`, `facility_status`, `users`; Has many `holding_timeline`, `adoptions` |
| **`holding_timeline`** | Medical/custody audit logs | `log_id` (INT) | `holding_id` (FK), `event_type`, `title`, `notes`, `logged_by` (FK) | Belongs to `holding_animals`, `users` |
| **`pets`** | Registered owned pets | `pet_id` (INT) | `owner_id` (FK), `pet_name`, `pet_type`, `breed`, `color_markings`, `photo_url`, `is_vaccinated`, `vaccine_card_url`, `status`, `bite_incident_count` | Belongs to `users`; Has many `pet_vaccinations`, `pet_qr_codes` |
| **`pet_vaccinations`** | Vaccine & rabies shots | `vaccination_id` (INT)| `pet_id` (FK), `vaccine_name`, `administered_date`, `expiry_date`, `clinic_name` | Belongs to `pets` |
| **`pet_qr_codes`** | Scannable QR ID tags | `qr_id` (INT) | `pet_id` (FK, unique), `qr_token` (unique), `is_active`, `scan_count`, `last_scanned_at` | Belongs to `pets`; Has many `pet_qr_scans` |
| **`pet_qr_scans`** | Public finder scan logs | `scan_id` (INT) | `qr_id` (FK), `pet_id` (FK), `finder_name`, `finder_contact`, `scan_lat`, `scan_lng`, `street_address` | Belongs to `pet_qr_codes`, `pets`, `users` |
| **`pet_claims`** | Owner claim requests | `claim_id` (INT) | `report_id` (FK), `pet_id` (FK), `status`, `evidence_url`, `distinctive_markings`, `match_score` | Belongs to `reports`, `pets` |
| **`report_matches`** | Stray-to-pet match pairs | `match_id` (INT) | `source_report_id` (FK), `matched_report_id` (FK), `matched_pet_id` (FK), `similarity_score`, `status`, `ai_explanation` | Belongs to `reports`, `pets`, `users` |
| **`adoptions`** | Public adoption requests | `adoption_id` (INT) | `holding_id` (FK), `applicant_id` (FK), `status`, `full_name`, `address`, `contact_no`, `living_space`, `id_photo_url`, `is_handed_over`, `created_pet_id` | Belongs to `holding_animals`, `users`, `pets` |
| **`owner_warnings`** | Municipal owner notices | `warning_id` (INT) | `user_id` (FK), `pet_id` (FK), `report_id` (FK), `issued_by` (FK), `warning_level`, `violation_type`, `fine_amount`, `status` | Belongs to `users`, `pets`, `reports` |
| **`chat_threads`** | Scoped messaging threads | `thread_id` (INT) | `thread_type` (Report/Pet_Claim/Direct), `related_id`, `created_by` (FK), `recipient_id` (FK), `is_closed` | Belongs to `users`; Has many `chat_messages` |
| **`chat_messages`** | Individual chat messages | `message_id` (INT) | `thread_id` (FK), `sender_id` (FK), `message_text`, `media_url`, `is_read`, `is_system` | Belongs to `chat_threads`, `users` |
| **`landmarks`** | Geofence landmarks & pens| `landmark_id` (INT) | `name`, `category`, `subdivision_id` (FK), `barangay_id` (FK), `latitude`, `longitude`, `is_holding_facility`, `capacity` | Belongs to `subdivisions`, `barangays` |
| **`coverage_settings`**| Subdivision boundary | `id` (INT) | `subdivision_id`, `center_latitude`, `center_longitude`, `radius_meters`, `boundary_polygon` (JSON), `is_active` | Configures geographic boundary |
| **`audit_logs`** | Security & ops forensic log| `log_id` (INT) | `user_id` (FK), `action`, `target_table`, `target_id`, `ip_address`, `user_agent`, `old_values` (JSON), `new_values` (JSON) | Belongs to `users` |
| **`notifications`** | In-app alerts & reminders | `notification_id` (INT)| `user_id` (FK), `title`, `message`, `type`, `is_read`, `is_archived`, `related_id` | Belongs to `users` |

---

## 10. Database Relationships

```mermaid
erDiagram
    BARANGAYS ||--o{ SUBDIVISIONS : contains
    BARANGAYS ||--o{ USERS : employs
    BARANGAYS ||--o{ LANDMARKS : operates
    SUBDIVISIONS ||--o{ USERS : resides_in
    SUBDIVISIONS ||--o{ REPORTS : scopes
    SUBDIVISIONS ||--o{ LANDMARKS : bounds
    
    USERS ||--o{ REPORTS : reports
    USERS ||--o{ PETS : owns
    USERS ||--o{ RESCUES : assigned_to
    USERS ||--o{ AUDIT_LOGS : triggers
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ CHAT_THREADS : participates
    USERS ||--o{ OWNER_WARNINGS : receives_or_issues
    USERS ||--o{ ADOPTIONS : applies_or_reviews

    REPORTS ||--o{ REPORT_MEDIA : contains
    REPORTS ||--o{ STATUS_HISTORY : tracks
    REPORTS ||--o{ RESCUES : initiates
    REPORTS ||--o{ HOLDING_ANIMALS : admits
    REPORTS ||--o{ REPORT_DISPUTES : disputed_by
    REPORTS ||--o{ REPORT_MATCHES : paired_with
    REPORTS ||--o{ PET_CLAIMS : claimed_by
    REPORTS ||--o| ENDORSEMENT_LETTERS : endorsed_by

    PETS ||--o{ PET_VACCINATIONS : receives
    PETS ||--|| PET_QR_CODES : identified_by
    PET_QR_CODES ||--o{ PET_QR_SCANS : logs

    HOLDING_ANIMALS ||--o{ HOLDING_TIMELINE : logs_medical
    HOLDING_ANIMALS ||--o{ ADOPTIONS : available_for

    CHAT_THREADS ||--o{ CHAT_MESSAGES : contains
```

---

## 11. Authentication and Security

### 11.1 Implemented Security Architecture
1. **Password Security:** Salted hashing using `bcrypt` (work factor 12) via Python's native `bcrypt` library.
2. **Dual-Token JWT Architecture:**
   - Short-lived Access Token: 60-minute expiration containing `user_id`, `role_id`, `email`, and unique `jti` (UUIDv4).
   - Long-lived Refresh Token: 7-day expiration stored exclusively in a secure, `HttpOnly`, `SameSite=Lax` cookie.
3. **Cryptographic Token Revocation (Blacklist):** Revoked tokens are tracked in `revoked_tokens` table by their `jti`. Logout immediately revokes both access and refresh tokens server-side.
4. **Multi-Factor OTP Onboarding:** Resident accounts must pass 6-digit cryptographic OTP verification (`otp_verifications`) before account activation (`is_verified = True`).
5. **SlowAPI Rate Limiting:** Brute-force protection on `/auth/login` (limited to 5 requests per minute per IP address) and `/auth/resend-otp` (30-second cooldown).
6. **Multi-Tenant Scoping & IDOR Prevention:** The backend dynamically validates that Subdivision Leaders only access resources within their `subdivision_id`, and Barangay Staff only access resources within their `barangay_id`.
7. **Strict File Upload Hardening:**
   - 10MB maximum file size limit.
   - MIME-type allowlist (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/pdf`).
   - Magic Byte Signature Verification (verifying actual file binary headers e.g. `\xff\xd8\xff` for JPEG, `%PDF` for PDF).
   - Cloudinary unsigned URL domain and path validation (`validate_cloudinary_url`).
8. **SQL Exception Masking:** Production error handlers sanitize raw database errors and hide schema details from client responses.

### 11.2 Recommended Security Improvements
- Enable `secure=True` on refresh cookies when deployed to HTTPS production environments.
- Implement Redis-based distributed token blacklisting for high-concurrency multi-instance horizontal scaling.
- Integrate WebAuthn / Passkeys for hardware-backed biometric login on mobile browsers.

---

## 12. AI and Machine Learning

STRAY-SAFE 2.0 incorporates a multi-tiered artificial intelligence and computer vision pipeline designed for real-time animal detection, color extraction, photo authenticity verification, narrative behavioral safety analysis, and bidirectional lost-and-found pet matching.

```
┌─────────────────┐     ┌─────────────────────────────────────────────────────────────┐
│  Upload Image/  │────▶│ 1. OpenCV Frame Extractor (if video)                        │
│  Video Evidence │     │    - Samples up to 8 distributed frames across timeline     │
└─────────────────┘     │ 2. Local Ultralytics YOLOv8 Nano (yolov8n.pt)               │
                        │    - Detects Dog / Cat bounding boxes & confidence          │
                        │    - Frame scoring: Score = Conf * 0.7 + Min(Area, 0.5)*0.6 │
                        │ 3. Pillow RGB Color Extraction Engine                       │
                        │    - Crops bounding box, removes background vegetation/sky  │
                        │    - Maps pixel frequencies to dominant fur color names     │
                        │ 4. Multimodal Google Gemini Generative AI                   │
                        │    - Contextual Narrative NLP & Negation Analysis           │
                        │    - Synthetic / Downloaded Stock Image Authenticity Check  │
                        │    - Estimated Size, Breed, Risk Level & Priority Reason    │
                        │ 5. Rule-Based Regex Fallback Engine                         │
                        │    - English/Tagalog/Taglish negation & near-miss parsing   │
                        │ 6. Bidirectional Lost & Found Similarity Matcher            │
                        │    - Multi-attribute weighted scoring (0–100%)              │
                        └─────────────────────────────────────────────────────────────┘
```

### 12.1 Local Computer Vision: Ultralytics YOLOv8 Nano
- **Model:** `ultralytics` YOLOv8 Nano (`yolov8n.pt`, 6.5 MB local weights).
- **Execution Architecture:** Thread-safe singleton lazy loader (`app.utils.model_loader.get_yolo_model()`). Prevents memory leaks and re-instantiation overhead on concurrent HTTP requests.
- **Target Classes:** Filters exclusively for COCO class labels `dog` (Class ID 16) and `cat` (Class ID 15).
- **Input:** RGB image binary stream or extracted video frames.
- **Processing:** Performs bounding box regression and confidence thresholding. Calculates relative bounding box area against total image canvas ($Area_{rel} = \frac{(x_2 - x_1) \times (y_2 - y_1)}{Width \times Height}$).
- **Output:** Label (`Dog`, `Cat`), normalized bounding coordinates `[x1, y1, x2, y2]`, and detection confidence float.

### 12.2 Video Frame Extraction & Optimal Frame Scoring
- **Module:** `app/utils/video_processing.py` utilizing OpenCV (`cv2`).
- **Processing:**
  1. Identifies video formats by extension (`.mp4`, `.mov`, `.webm`, `.avi`) or binary container magic bytes (`ftyp`, `RIFF....AVI`, EBML header).
  2. Samples up to 8 evenly distributed timestamps across total duration ($Index_i = \text{step} \times (i + 1)$).
  3. Executes YOLOv8 across all sample frames and computes an optimal animal visual prominence score:
     $$\text{Frame Score} = (\text{Confidence} \times 0.7) + (\min(\text{Relative Area}, 0.5) \times 0.6)$$
  4. Yields the top-scoring frame containing the clearest animal detection for subsequent color extraction and Gemini multimodal reasoning. If no animal is recognized by YOLO, it falls back to the middle timeline frame.

### 12.3 Fur Color Extraction & Hue Mapping Engine
- **Module:** `app/utils/color_detection.py` utilizing Pillow (`PIL.Image`).
- **Processing:**
  1. Crops image to YOLO-detected bounding box coordinates $[x_1, y_1, x_2, y_2]$.
  2. Resizes cropped matrix to $100 \times 100$ pixels and converts to RGB color space.
  3. Evaluates pixel clusters and filters out non-animal background noise (e.g., foliage greens where $G > R \text{ and } G > B$, or sky blues where $B > R \text{ and } B > G$).
  4. Maps RGB tuples $(R, G, B)$ to standard domestic coat color categories:
     - **White / Light:** $R > 185 \land G > 185 \land B > 185$
     - **Black / Dark:** $R < 85 \land G < 85 \land B < 85$
     - **Gray:** $|R - G| < 25 \land |G - B| < 25 \land \frac{R+G+B}{3} < 170$
     - **Brown / Golden / Orange:** Red-channel dominant hues mapped according to green/blue ratios.
  5. Sorts accumulated frequencies to produce a ranked comma-separated string (e.g., `"Brown, White"`).

### 12.4 Google Gemini Copilot & Multi-Model Fallback Chain
- **Primary AI Engine:** Google Generative AI Python SDK (`google-generativeai`).
- **Automatic Multi-Model Failover (`call_gemini_with_fallback`):** To ensure zero downtime if rate limits (HTTP 429 Quota Exceeded) are encountered, the engine systematically iterates through a 6-tier model hierarchy:
  1. `gemini-2.5-flash` (Primary high-speed multimodal)
  2. `gemini-3.6-flash` (Secondary failover)
  3. `gemini-3.7-flash` (Advanced reasoning failover)
  4. `gemini-3.5-flash` (Tertiary failover)
  5. `gemini-2.5-pro` (High-capacity fallback)
  6. `gemini-flash-latest` (Final fallback)

#### A. Prompt Engineering & Behavioral Understanding
The Gemini prompt enforces whole-narrative semantic understanding across English, Tagalog, and Taglish. It evaluates preceding/succeeding sentences, timing, and linguistic negations to prevent false classifications:
- **Negation Handling:** Recognizes phrases like *"hindi naman nangagat"*, *"wala namang kinagat"*, *"never bit anyone"*, *"di naman nanghahabol"*, ensuring calm strays are not misclassified as aggressive.
- **Near-Miss vs Actual Bite:** Differentiates *"muntikan na akong makagat pero hindi ako natamaan"* (`ai_behavior_attempted_bite = True, ai_behavior_actual_bite = False, ai_behavior_injury = False`) from confirmed bite attacks.
- **Physical Harm:** Checks whether skin punctures or bleeding occurred (`ai_behavior_injury`).

```json
{
  "ai_animal_type": "Dog",
  "ai_dominant_color": "Brown, White",
  "ai_coat_pattern": "Bicolor",
  "ai_estimated_size": "Medium",
  "ai_possible_breed": "Aspin",
  "ai_suggested_risk_level": "Medium Risk",
  "ai_suggested_priority": "Medium Priority",
  "ai_suggested_priority_reason": "Roaming near main gate causing vehicular distraction.",
  "ai_behavior_chasing": false,
  "ai_behavior_attempted_bite": false,
  "ai_behavior_actual_bite": false,
  "ai_behavior_injury": false,
  "ai_behavior_aggressive": false,
  "ai_behavior_explanation": "Animal observed resting near road; no aggressive or biting behavior exhibited."
}
```

#### B. Local Rule-Based Heuristic Fallback Engine
When external API keys are missing or connectivity is interrupted, `app/utils/ai_suggestions.py` activates an on-premise regex heuristic engine:
- **Keywords Scanned:**
  - Dog: `["dog", "puppy", "canine", "bark", "aso", "tuta", "tahol", "kahol"]`
  - Cat: `["cat", "kitten", "feline", "meow", "pusa", "kuting", "calico", "siamese"]`
  - High Risk: `["bite", "nangangagat", "nakagat", "attack", "sugat", "dugo", "rabid", "aggressive"]`
  - Negation Regex: `(hindi\s+(naman\s+)?(nangagat|kumagat|nakagat)|never\s+bit|wala\s+namang\s+kinagat)`

### 12.5 AI Image Authenticity & Deepfake/Stock Forensics
- **Endpoint:** `POST /reports/validate-images`
- **Technology:** Multimodal Gemini Vision analysis.
- **Detection Capabilities:**
  - Identifies watermarks, stock photo studio lighting, and compression artifacts typical of downloaded Google/Pinterest images.
  - Detects generative AI synthesis markers (anatomical warping, blurred claws/eyes, unnatural textures).
  - Confirms authentic smartphone camera traits (natural depth of field, outdoor community background, timestamp consistency).
- **Output:** Likelihood score (0–100%), status badge (`Likely Authentic`, `Suspicious / Stock Photo`, `Synthetic / AI-Generated`), and staff advisory notes.

### 12.6 Bidirectional Lost & Found Similarity Matcher
- **Module:** `app/routes/matches.py` (`report_matches` table).
- **Matching Mechanism:** Automatically cross-compares newly submitted stray animal sightings against all registered pets flagged with `status = 'Lost'` or registered in the neighborhood.
- **Weighted Multi-Attribute Scoring Formula:**
  $$\text{Score} = (W_{\text{type}} \times S_{\text{type}}) + (W_{\text{color}} \times S_{\text{color}}) + (W_{\text{size}} \times S_{\text{size}}) + (W_{\text{breed}} \times S_{\text{breed}}) + (W_{\text{geo}} \times S_{\text{geo}})$$
  - **Animal Type Match ($W_{\text{type}} = 0.30$):** Exact match = 100%, mismatch = 0% (immediate disqualification).
  - **Coat Color & Markings ($W_{\text{color}} = 0.25$):** Set intersection over union of dominant and secondary colors.
  - **Size Category ($W_{\text{size}} = 0.15$):** Small, Medium, Large alignment.
  - **Breed Similarity ($W_{\text{breed}} = 0.15$):** String distance / exact breed comparison.
  - **Geographic Proximity ($W_{\text{geo}} = 0.15$):** Haversine distance between last-seen coordinates and report coordinates (decaying with distance).
- **Result:** Generates actionable match cards (`/resident/reports/:id/match-review`) displaying similarity scores, side-by-side photo comparisons, and owner confirmation options.

---

## 13. Image and File Management

### 13.1 Media Pipeline
1. **Frontend Pre-validation:** Client inspects file extension and size (10MB limit) via `uploadValidation.ts`.
2. **Direct Cloudinary Upload (Optional):** Frontend uploads directly to Cloudinary using unsigned upload presets, then submits the resulting secure HTTPS URL to the backend.
3. **Backend Binary Verification:** For multipart uploads, `read_and_validate_upload` in `uploads.py` reads the binary stream, validates the file against MIME types and Magic Byte signatures, generates a collision-resistant UUID filename (`uuid.uuid4().hex`), and uploads to Cloudinary or saves locally.

---

## 14. Maps, Location and Geospatial Scoping

### 14.1 Geospatial Architecture & Data Representation
- **Coordinates:** Stored as high-precision decimals (`latitude DECIMAL(10,8)`, `longitude DECIMAL(11,8)`).
- **Mapping Library:** `Leaflet 1.9.4` and `React-Leaflet 5.0.0` with OpenStreetMap tile layers.
- **Landmarks & Facilities:** Maintained in the `landmarks` table, mapping gate guardhouses, temporary shelter pens, community parks, and Barangay Impound Facilities with custom category SVG icons.

### 14.2 Subdivision Geofence Coverage & Ray-Casting Point-in-Polygon Engine
STRAY-SAFE 2.0 enforces precise spatial boundaries to ensure incident reports fall within authorized neighborhood territory:
1. **Boundary Representation:** Subdivision boundaries are stored as JSON polygon coordinate arrays inside the `coverage_settings` table (e.g., Selera Homes 4-point bounding perimeter).
2. **Point-in-Polygon Ray-Casting Algorithm:** When an incident coordinate $(P_{\text{lat}}, P_{\text{lng}})$ is pinned, the backend casts a horizontal ray to infinity and calculates the intersection count with polygon edges:
   $$\text{Inside} \iff (\text{Intersections} \pmod 2) \equiv 1$$
3. **Haversine Center Radius Fallback:** For circular coverage zones, the system validates that the distance from the subdivision center does not exceed `radius_meters`:
   $$d = 2R \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)} \right)$$
4. **Out-of-Bounds Enforcement:** Reports placed outside the authorized boundary are flagged with geofence warnings or rejected before submission.

### 14.3 Turn-by-Turn OSRM Routing Control
- **Technology:** `leaflet-routing-machine 3.2.12`.
- **Purpose:** Automatically calculates driving transit paths from the Barangay Animal Welfare Desk / Impound Facility (`14.806906, 121.0039297`) to the incident's live GPS coordinates, estimating arrival times and turn instructions for field rescue staff.

### 14.4 Geospatial Incident Density Heatmap Layer
- **Technology:** `leaflet.heat 0.2.0` (`HeatmapLayer.tsx`).
- **Capabilities:** Dynamically aggregates active reports, historical bite reports, and stray sightings into a Gaussian-weighted heat intensity map. Allows administrators to pinpoint hot-spots requiring vaccination drives or animal control interventions.

---

## 15. System Workflows

### 15.1 End-to-End Stray Incident Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Citizen as Resident / Citizen
    participant Client as React Frontend
    participant API as FastAPI Backend
    participant AI as AI Engine (YOLO/Gemini)
    participant Subd as Subdivision Leader
    participant Brgy as Barangay Staff
    participant DB as MySQL Database

    Citizen->>Client: Upload Photo/Video & Description
    Client->>API: POST /reports/analyze-media
    API->>AI: Run YOLOv8 + Gemini Multimodal
    AI-->>API: Extracted Traits & Risk Behavior
    API-->>Client: Return AI Suggestions
    Citizen->>Client: Review & Submit Report
    Client->>API: POST /reports/
    API->>DB: Insert Report (Status 1: Reported)
    API-->>Client: Report Created

    Subd->>Client: Review Subd Dashboard
    Subd->>API: POST /reports/{id}/claim
    Subd->>API: POST /reports/{id}/verify-incident
    alt Report is False Alarm / Duplicate
        Subd->>API: POST /reports/{id}/mark-false-alarm
        API->>DB: Status 14 (False Alarm)
    else Case can be resolved locally
        Subd->>API: POST /reports/{id}/direct-resolve
        API->>DB: Status 11 (Resolved)
    else Case requires municipal rescue
        Subd->>API: POST /reports/{id}/endorse (Upload PDF)
        API->>DB: Status 4 (Escalated to Barangay)
        API->>Brgy: Send Escalation Notification
        
        Brgy->>API: POST /rescue/assign-team
        Brgy->>API: PATCH /rescue/{id}/status (In Transit -> Picked Up)
        API->>DB: Status 6 (Picked Up)
        
        Brgy->>API: POST /holding/admit
        API->>DB: Status 8 (Impounded in Facility)
    end
```

---

## 16. Frontend-to-Backend Data Flow

1. **User Interaction:** A user interacts with a React UI component (e.g., submitting an adoption application in `AdoptionApplyForm.tsx`).
2. **Client State & Validation:** The component validates required fields and dispatches an asynchronous call via `api.post('/adoptions/apply', payload)` in `src/utils/api.ts`.
3. **Axios Request Interceptor:** Injects the active JWT Bearer token into the `Authorization` header.
4. **FastAPI Route Handler:** `backend/app/routes/adoptions.py` receives the request, validates the payload against Pydantic schema `AdoptionApplyRequest`, and injects the authenticated `current_user`.
5. **Multi-Tenant Scope Verification:** The backend verifies user permissions and validates foreign keys against the database.
6. **SQLAlchemy ORM Execution:** A transaction commits the record to the `adoptions` table in MySQL 8.0.
7. **Audit & Notifications:** The backend triggers an `AuditLog` entry and pushes a notification to Barangay staff.
8. **JSON Serialization:** The backend returns an `AdoptionResponse` Pydantic model with HTTP status 200 OK.
9. **UI Render:** The React component receives the response and displays a confirmation modal with navigation to `MyAdoptionApplications.tsx`.

---

## 17. Project Structure

```text
Straysafe2.0/
├── .env.example                                # Sample environment variables configuration
├── Database3.3.txt                             # Database migration scripts & SQL reference
├── FALSE_REPORT_AND_DISPUTE_MANAGEMENT.md      # False report and dispute technical guide
├── SYSTEM_AUDIT_AND_COMPLETION_REPORT.md       # Audit completion report
├── SYSTEM_FLOW_DOCUMENTATION.md                # System workflow planning documentation
├── USER_ROLES_AND_REPORT_CONNECTION.md         # Role connection documentation
├── WARNING_AND_MESSAGING_IMPLEMENTATION_GUIDE.md # Warning and chat guide
├── STRAYSAFE_DOCUMENTATION.md                  # Complete technical documentation
├── backend/
│   ├── app/
│   │   ├── database/
│   │   │   └── session.py                      # SQLAlchemy database engine & session maker
│   │   ├── models/                             # 17 SQLAlchemy ORM models
│   │   ├── routes/                             # 16 FastAPI endpoint routers
│   │   ├── schemas/                            # Pydantic data schemas
│   │   ├── tasks/
│   │   │   └── unassigned_checker.py           # Async background report and holding watcher
│   │   ├── utils/                              # Auth, AI, Uploads, Color & Video utils
│   │   ├── limiter.py                          # SlowAPI rate limiting configuration
│   │   └── main.py                             # Backend application entry point
│   ├── uploads/                                # Local file uploads storage directory
│   ├── yolov8n.pt                              # YOLOv8 Nano weights file
│   └── requirements.txt                        # Python dependencies
├── frontend/
│   ├── public/                                 # Static web assets
│   ├── src/
│   │   ├── assets/                             # Image assets and illustrations
│   │   ├── components/                         # Reusable UI components & modals
│   │   ├── context/                            # React ThemeContext & ToastContext
│   │   ├── pages/                              # Role-based pages (Admin, Brgy, Subd, Citizen)
│   │   ├── routes/
│   │   │   └── AppRoutes.tsx                   # Main React Router configuration
│   │   ├── utils/                              # Axios API client & token utilities
│   │   ├── App.tsx                             # Main App entry component
│   │   ├── index.css                           # Global styles & Tailwind CSS imports
│   │   └── main.tsx                            # React DOM root mounting
│   ├── package.json                            # Frontend Node dependencies & build scripts
│   ├── tsconfig.json                           # TypeScript configuration
│   └── vite.config.ts                          # Vite bundler configuration
└── package.json                                # Workspace package metadata
```

---

## 18. Dependencies

### 18.1 Frontend Dependencies (`frontend/package.json`)
- `react` (`^19.2.4`) & `react-dom` (`^19.2.4`): Core UI library.
- `react-router-dom` (`^7.14.1`): Declarative client-side routing.
- `axios` (`^1.15.0`): Promise-based HTTP client.
- `leaflet` (`^1.9.4`) & `react-leaflet` (`^5.0.0`): Interactive mapping engine.
- `leaflet.heat` (`^0.2.0`): Heatmap rendering plugin.
- `leaflet-routing-machine` (`^3.2.12`): Turn-by-turn routing control.
- `html5-qrcode` (`^2.3.8`): Camera-based QR code reader.
- `lucide-react` (`^1.28.0`): Icon library.
- `tailwindcss` (`^4.2.2`) & `@tailwindcss/postcss` (`^4.2.2`): CSS styling.
- `vite` (`^8.0.4`) & `typescript` (`~6.0.2`): Build system and type checker.

### 18.2 Backend Dependencies (`backend/requirements.txt`)
- `fastapi` (`>=0.110.0`): Asynchronous web framework.
- `uvicorn` (`>=0.27.1`): ASGI server.
- `sqlalchemy` (`>=2.0.27`): Database ORM.
- `pymysql` (`>=1.1.0`) & `cryptography` (`>=42.0.5`): MySQL database driver.
- `passlib[bcrypt]` (`>=1.7.4`) & `bcrypt` (`<4`): Password hashing.
- `pyjwt` (`>=2.8.0`): JWT token management.
- `slowapi` (`>=0.1.9`): Rate limiting.
- `pydantic` (`>=2.6.3`) & `pydantic-settings` (`>=2.2.1`): Data validation.
- `ultralytics` (`>=8.1.0`): YOLOv8 object detection.
- `google-generativeai` (`>=0.3.0`): Gemini AI API.
- `Pillow` (`>=9.0.0`): Image processing.
- `qrcode` (`>=7.4.2`): QR code generation.
- `cloudinary` (`>=1.38.0`): Cloud media management.

---

## 19. Configuration and Environment

### 19.1 Required Environment Variables (`.env`)

```ini
# Database Connection URL (MySQL 8.0)
DATABASE_URL=mysql+pymysql://root:yourpassword@localhost/straysafe_db
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=straysafe_db

# JWT & Cryptographic Secret Keys
JWT_SECRET_KEY=your_64_character_random_jwt_secret_key
SECRET_KEY=your_64_character_random_secret_key

# Cloudinary Cloud Media Storage
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_UPLOAD_PRESET=your_upload_preset
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

# Frontend Vite Cloudinary Configuration
VITE_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
VITE_API_BASE_URL=http://localhost:8000

# Google Gemini API Key (Multimodal AI & Authenticity Verification)
GEMINI_API_KEY=your_google_gemini_api_key

# CORS Allowed Origins (JSON array format)
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

---

## 20. Current Implementation Status

### 20.1 Fully Implemented
- Complete JWT bearer authentication with HttpOnly refresh cookies, token rotation, and blacklisting.
- Multi-step resident registration with 6-digit OTP email/phone verification.
- Stray reporting with GPS coordinate capture, polygon boundary validation, and photo/video upload.
- Local YOLOv8 Nano animal detection and RGB fur color extraction.
- Context-aware Gemini AI report suggestions with whole-narrative Tagalog/English behavioral analysis.
- AI photo authenticity verification detecting synthetic and downloaded stock images.
- Subdivision Leader incident verification, false alarm dismissal, and case transfer workflows.
- Case escalation with digitized Endorsement Letter PDF attachments.
- Barangay rescue team dispatch, status tracking, and turn-by-turn OSRM map routing.
- Holding facility kennel management, intake registration, and medical timeline auditing.
- Automated background workers for 30-minute unassigned reports and 3-day holding stay limits.
- Digital Pet Registry with 3-angle photo uploads and vaccination history tracking.
- Pet QR code generation and public finder scanning with automatic GPS capture.
- Bidirectional lost/found similarity matcher comparing reports with registered pets.
- Multi-stage pet ownership claims with proof-of-ownership verification.
- Public adoption catalog with interactive Animal Journey Map and adoption application processing.
- Official municipal owner warning notices with penalty fines and violation tracking.
- Scoped in-app chat messaging between residents, HOA leaders, and Barangay staff.
- Admin dashboard, user account management, forensic audit logs with JSON diffs, and incident heatmaps.

### 20.2 Partially Implemented
- Real-time WebSockets for chat (currently using reactive polling with unread badge counters).
- Native mobile push notifications (currently uses in-app notifications and email/SMS OTP dispatch).

### 20.3 Planned / Not Implemented
- Direct integration with municipal veterinary rabies laboratory databases.
- Integration with external physical RFID microchip scanners.

---

## 21. Technical Limitations

1. **Hardware & Camera Dependency for QR Scanning:** In-browser camera scanning via `html5-qrcode` requires HTTPS or `localhost` context to access device video streams.
2. **External AI API Quotas:** Google Gemini API calls are subject to external rate limits; the system includes automatic multi-model failover (`gemini-2.5-flash` → `gemini-3.6-flash` → `gemini-3.7-flash`) and local heuristic fallback.
3. **Database Concurrency Limits:** Configured with a SQLAlchemy connection pool of 15 connections (max overflow 25).
4. **Cloudinary Upload Preset:** Direct frontend unsigned uploads depend on correctly configured Cloudinary preset permissions.

---

## 22. Technical Summary

STRAY-SAFE 2.0 is a robust, production-ready full-stack system designed to modernize community animal welfare and stray incident management. 

By combining a reactive **React 19** frontend, an asynchronous **FastAPI** backend, and a **MySQL 8.0** persistence layer with **YOLOv8** computer vision and **Google Gemini** generative AI, STRAY-SAFE 2.0 automates the detection, validation, rescue, shelter monitoring, and protection of stray and owned animals. Its strict role-based access control, cryptographic pet QR identification, turn-by-turn routing, automated background workers, and transparent forensic audit logging establish a reliable, auditable standard for smart community safety and animal care.
