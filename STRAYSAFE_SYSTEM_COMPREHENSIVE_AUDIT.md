# STRAYSAFE 2.0 — MASTER COMPREHENSIVE SYSTEM AUDIT
**Dokumentasyon ng Buong Arkitektura, Functionalities, Features, Koneksyon, Technicalities, at Business Processes**

---

| Metadatos | Detalye |
| :--- | :--- |
| **Proyekto** | **StraySafe 2.0** — Smart Community Animal Welfare & Stray Management System |
| **Uri ng Dokumento** | Master System Architecture, Technical & Functional Audit Report |
| **Petsa ng Pagsusuri** | Oktubre 2026 |
| **Saklaw ng Audit** | Frontend (React 19), Backend (FastAPI), Database (MySQL 55 Tables), AI/CV Pipeline, Security, Network Connections, at End-to-End Processes |
| **Target Audience** | System Architects, Developers, Project Managers, LGU/Barangay Stakeholders, Capstone/Thesis Evaluators |

---

## TALAHANAYAN NG MGA NILALAMAN (TABLE OF CONTENTS)

1. [Pangkalahatang Pananaw ng Sistema (Executive System Overview)](#1-pangkalahatang-pananaw-ng-sistema-executive-system-overview)
2. [Arkitektura at Topology ng Koneksyon (Architecture & System Connections)](#2-arkitektura-at-topology-ng-koneksyon-architecture--system-connections)
3. [Buong Tech Stack at Technicalities (Complete Tech Stack & Specifications)](#3-buong-tech-stack-at-technicalities-complete-tech-stack--specifications)
4. [Audit ng Buong Functionalities at Features ayon sa Role (Role-Based Features Audit)](#4-audit-ng-buong-functionalities-at-features-ayon-sa-role-role-based-features-audit)
   - 4.1 Citizen / Resident Portal (Role 1)
   - 4.2 Subdivision Leader Portal (Role 2)
   - 4.3 Barangay Staff & Rescue Team Portal (Role 3)
   - 4.4 System Administrator Portal (Role 4)
5. [AI, Machine Learning, at Computer Vision Engine (AI Pipeline Deep-Dive)](#5-ai-machine-learning-at-computer-vision-engine-ai-pipeline-deep-dive)
6. [Mga Pangunahing Proseso ng Sistema (End-to-End System Lifecycles & Processes)](#6-mga-pangunahing-proseso-ng-sistema-end-to-end-system-lifecycles--processes)
   - Proseso 1: User Onboarding, Authentication, at Profile Verification
   - Proseso 2: Stray Animal Incident Reporting at AI Auto-Triaging
   - Proseso 3: Case Escalation at Barangay Rescue Dispatch
   - Proseso 4: Holding Facility Intake, Care, at Countdown Lifecycle
   - Proseso 5: 9-Stage Adoption Lifecycle at Verifiable Certificate Issuance
   - Proseso 6: Pet Registration, Smart QR Tagging, at Lost Pet Recovery
   - Proseso 7: Ordinance Enforcement, Citizen Warnings, at Citations
7. [Database Schema at Data Dictionary (Database Architecture - 55 Tables)](#7-database-schema-at-data-dictionary-database-architecture---55-tables)
8. [Seguridad, Data Privacy, at Compliance Audit (Security & Compliance)](#8-seguridad-data-privacy-at-compliance-audit-security--compliance)
9. [Pagsusuri ng Kalakasan, Kahinaan (Technical Debt), at Rekomendasyon](#9-pagsusuri-ng-kalakasan-kahinaan-technical-debt-at-rekomendasyon)

---

## 1. PANGKALAHATANG PANANAW NG SISTEMA (EXECUTIVE SYSTEM OVERVIEW)

Ang **StraySafe 2.0** ay isang enterprise-grade, localized animal welfare governance platform na idinisenyo para sa komunidad sa Pilipinas (Barangay at Homeowners Association / Subdivisions). Nilulutas nito ang tradisyunal na suliranin sa pagkalat ng mga ligaw na hayop (stray dogs and cats), banta ng rabies, kawalan ng koordinasyon sa pagitan ng mga subdivision at barangay hall, at mabagal na proseso ng pet recovery at legal adoption alinsunod sa **Republic Act 8485 (Animal Welfare Act of 1998)** at **Republic Act 9482 (Anti-Rabies Act of 2007)**.

### Pangunahing Layunin ng System:
1. **Mabilisang Pag-uulat at Pagtugon (Real-time Reporting & Response):** Pagbibigay-daan sa mga residente na mag-ulat ng stray animals na may geolocation at visual evidence.
2. **AI-Assisted Triaging & Visual Matching:** Paggamit ng lokal na Computer Vision (YOLOv8) at Multimodal AI (Google Gemini) upang suriin ang uri, kulay, sukat, agresyon, at i-match ito sa rehistradong mga alagang hayop.
3. **Multi-Tier Administrative Governance:** Malinaw na separation of duties sa pagitan ng mga Residente, Subdivision HOA Officers, Barangay Rescuers/Tanod, at Municipal/System Admins.
4. **Transparent Holding & Adoption Pipeline:** 9-stage adoption lifecycle na may task delegation, tamper-proof audit trails, at cryptographic verification certificates.
5. **Smart Pet QR Registry:** Digital identification tag para sa bawat rehistradong alaga na may instant GPS ping pabalik sa may-ari kapag na-scan ng publiko.

---

## 2. ARKITEKTURA AT TOPOLOGY NG KONEKSYON (ARCHITECTURE & SYSTEM CONNECTIONS)

Ang StraySafe 2.0 ay sumusunod sa isang **Decoupled Client-Server Service-Oriented Architecture (SOA)** na may micro-task workers para sa mabibigat na proseso (AI inference at email dispatching).

### 2.1 High-Level Architecture Diagram

```mermaid
graph TD
    subgraph ClientLayer ["Client Presentation Layer (Browser / Mobile)"]
        ResidentUI["Citizen Portal\n(React 19 + Vite)"]
        SubdUI["Subdivision Portal\n(React 19 + Vite)"]
        BrgyUI["Barangay Staff Portal\n(React 19 + Vite)"]
        AdminUI["System Admin Portal\n(React 19 + Vite)"]
        PublicScanUI["Public QR Scanner\n(Mobile Browser)"]
    end

    subgraph GatewayMiddleware ["Network & Transport Layer"]
        ViteProxy["Vite Dev Reverse Proxy\n(:5173 /api -> :8000)"]
        CORSMiddleware["FastAPI CORS Middleware\n(Dynamic Regex Origins)"]
        RateLimiter["SlowAPI Rate Limiter\n(Memory/Redis Bucket)"]
        AuthInterceptor["Axios Bearer / Cookie Interceptor\n(Auto-refresh & Activity Tracker)"]
    end

    subgraph BackendLayer ["Application & Backend Layer (FastAPI :8000)"]
        FastAPIApp["FastAPI REST Engine\n(Uvicorn ASGI)"]
        AuthService["Auth & RBAC Service\n(JWT + Bcrypt + Blacklist)"]
        ReportService["Reporting & Triage Service\n(Geofenced Visibility)"]
        AdoptionService["Adoption 9-Stage Engine\n(Authority & Task Assignor)"]
        HoldingService["Holding Facility & Logs"]
        QRService["Pet QR & GPS Telemetry"]
        NotificationEngine["Notification Dispatcher & Chat"]
    end

    subgraph BackgroundWorkers ["Async Background Workers (Lifespan Tasks)"]
        UnassignedWatcher["Unassigned Reports Watcher\n(30-min escalation timer)"]
        EmailWorker["Email Queue & Retry Worker\n(SMTP Task Queue)"]
        AIWorker["AI Embedded/Subprocess Runner\n(ai_worker.py)"]
    end

    subgraph StorageDataAI ["External Services, AI & Database Layer"]
        MySQLDB[("MySQL 8.0+ Database\n(InnoDB - 55 Tables)")]
        LocalYOLO["YOLOv8n Neural Net\n(Local PyTorch / Ultralytics)"]
        GeminiCloud["Google Gemini 2.5 Flash\n(Google GenAI Cloud API)"]
        CloudinaryCDN["Cloudinary Storage\n(Media CDN)"]
        LocalUploads["Local Static Mount\n(/uploads Directory)"]
        SMTPServer["SMTP Mail Server\n(Gmail/Sendgrid TLS)"]
    end

    %% Client to Network
    ResidentUI --> AuthInterceptor
    SubdUI --> AuthInterceptor
    BrgyUI --> AuthInterceptor
    AdminUI --> AuthInterceptor
    PublicScanUI --> AuthInterceptor
    AuthInterceptor --> ViteProxy
    ViteProxy --> CORSMiddleware
    CORSMiddleware --> RateLimiter
    RateLimiter --> FastAPIApp

    %% FastAPI to Services
    FastAPIApp --> AuthService
    FastAPIApp --> ReportService
    FastAPIApp --> AdoptionService
    FastAPIApp --> HoldingService
    FastAPIApp --> QRService
    FastAPIApp --> NotificationEngine

    %% Services to DB
    AuthService --> MySQLDB
    ReportService --> MySQLDB
    AdoptionService --> MySQLDB
    HoldingService --> MySQLDB
    QRService --> MySQLDB
    NotificationEngine --> MySQLDB

    %% Background Workers
    FastAPIApp -.-> UnassignedWatcher
    FastAPIApp -.-> EmailWorker
    FastAPIApp -.-> AIWorker
    UnassignedWatcher --> MySQLDB
    EmailWorker --> SMTPServer
    EmailWorker --> MySQLDB
    AIWorker --> MySQLDB

    %% AI & Media Connections
    ReportService --> LocalYOLO
    ReportService --> GeminiCloud
    ReportService --> CloudinaryCDN
    ReportService --> LocalUploads
    AdoptionService --> CloudinaryCDN
    QRService --> CloudinaryCDN
```

### 2.2 Paano Nagkokonekta ang Bawat Component (Component Interactions):

1. **Frontend to Backend (API Connection):**
   - Ginagamit ng frontend ang **Axios instance** (`frontend/src/utils/api.ts`).
   - Sa development mode, dumadaan ang request sa `/api` na pinapasa ng Vite Dev Server proxy patungo sa FastAPI backend (`http://localhost:8000`).
   - Awtomatikong nag-iinject ang Axios request interceptor ng `Authorization: Bearer <token>` mula sa `sessionStorage`/`localStorage`.
   - Kapag nakatanggap ng `401 Unauthorized`, may interceptor na sumusubok mag-refresh ng token o agad na naglilinis ng session gamit ang `clearAuthStorage()` at inililipat ang user sa tamang login screen.
2. **Backend to Database (ORM Connection):**
   - Ginagamit ang **SQLAlchemy 2.0** na konektado sa MySQL sa pamamagitan ng `PyMySQL` driver (`mysql+pymysql://root:password@localhost/straysafe_db?charset=utf8mb4`).
   - Ang database connection pool ay pinapamahalaan ng `engine` sa `backend/app/database.py`, at bawat request ay tumatanggap ng scoped session gamit ang FastAPI dependency `get_db()`.
3. **Backend to AI / Computer Vision:**
   - **Local Inference:** Ang `ultralytics` YOLOv8n model (`yolov8n.pt`) ay niloload nang minsan sa memory sa pamamagitan ng `backend/app/utils/model_loader.py` gamit ang PyTorch CPU thread limit (`AI_TORCH_THREADS=2`) upang hindi mababad ang server.
   - **Cloud Multimodal API:** Ang `google-genai` client ay kumokonekta sa Google Gemini Cloud API gamit ang `GEMINI_API_KEY`. Mayroon itong tiered fallback (`gemini-2.5-flash` ➔ `gemini-flash-lite-latest` ➔ `gemini-flash-latest`) na may mahigpit na timeout budget (15s per-call, 35s kabuuan).
4. **Backend to Media Storage:**
   - Sinusubukan muna ng backend na i-upload ang mga larawan at video sa **Cloudinary** gamit ang SDK (`cloudinary.uploader.upload`).
   - Kung sakaling walang internet o mag-fail ang Cloudinary credentials, awtomatikong magfa-fallback ang system sa pag-save sa lokal na folder (`backend/uploads/`) na naka-mount bilang static files sa FastAPI (`/uploads`).
5. **Background Workers (FastAPI Lifespan):**
   - Pagka-start ng server (`lifespan` context manager sa `main.py`), tatlong asynchonous background tasks ang pinapagana:
     1. `start_unassigned_reports_watcher`: Tumatakbo kada 60 segundo; kapag ang isang ulat ay higit 30 minuto nang walang pumapansing opisyal, awtomatiko itong binibigyan ng escalation alert.
     2. `start_email_queue_worker`: Tumatakbo kada 60 segundo upang iproseso ang mga nabinbing transactional emails sa `email_logs`.
     3. `start_embedded_runner`: Nagpoproseso ng asynchronous AI jobs kung hindi pinapatakbo ang standalone CLI worker (`python -m app.ai_worker`).

---

## 3. BUONG TECH STACK AT TECHNICALITIES (COMPLETE TECH STACK & SPECIFICATIONS)

| Layer / Kategorya | Teknolohiya / Library | Bersyon | Teknikal na Papel at Paggamit sa StraySafe 2.0 |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React** | `19.0.0` | Declarative UI library, component-based rendering, hooks (`useState`, `useEffect`, `useMemo`). |
| **Frontend Tooling** | **Vite** | `8.x` | Ultra-fast HMR bundler, code splitting, reverse proxy middleware. |
| **Language (Client)** | **TypeScript** | `5.6+` | Type-safety, DTO interfaces, strict typing sa routes at payloads. |
| **Styling & Design** | **Tailwind CSS** | `4.2+` | Utility-first CSS, custom design tokens, dark mode/light mode responsive styles. |
| **Icons & Visuals** | **Lucide React** | Latest | Modern, lightweight SVG iconography sa lahat ng dashboards at modals. |
| **Interactive Maps** | **Leaflet & React-Leaflet** | `1.9.4` | OpenStreetMap rendering, custom pin markers, boundary polygon rendering, heatmaps (`Leaflet.heat`). |
| **Routing** | **React Router DOM** | `7.x` | Client-side routing, protected role routes (`ProtectedRoute`), code-splitting via `React.lazy`. |
| **HTTP Client** | **Axios** | `1.7+` | Promise-based HTTP client, request/response interceptors, dynamic bearer token handling. |
| **Backend Framework**| **FastAPI** | `>= 0.110` | High-performance Python ASGI web framework, automatic OpenAPI documentation. |
| **Language (Server)** | **Python** | `3.12+` | Modern backend runtime na may native type hints at asynchronous coroutines (`asyncio`). |
| **ASGI Server** | **Uvicorn** | `Standard` | Lightning-fast ASGI web server implementation para sa FastAPI. |
| **Database Engine** | **MySQL** | `8.0+` | Relational DBMS, InnoDB storage engine, foreign keys, ACID compliance, Spatial/JSON columns. |
| **Database Driver** | **PyMySQL** | Latest | Pure-Python MySQL client library. |
| **ORM** | **SQLAlchemy** | `>= 2.0.27` | Python SQL toolkit at Object-Relational Mapper na may mapped columns at explicit relationships. |
| **Data Validation** | **Pydantic** | `v2` | Request body validation, data parsing, serialization, schema enforcement. |
| **Authentication** | **PyJWT / Jose** | `>= 2.8` | Cryptographic JSON Web Tokens (HS256) na may access/refresh token pattern. |
| **Password Hashing** | **Passlib (Bcrypt)** | Latest | Secure salted password hashing para sa lahat ng user accounts. |
| **Rate Limiting** | **SlowAPI** | Latest | Proteksyon laban sa brute force, spamming, at DDoS sa auth at reporting endpoints. |
| **Object Detection** | **YOLOv8n (Ultralytics)**| `>= 8.1` | Local lightweight deep learning model para sa dog/cat detection at automatic bounding-box cropping. |
| **Generative Vision** | **Google Gemini** | `2.5 Flash` | Cloud Multimodal LLM para sa breed detection, animal risk scoring, photo authenticity, at visual matching. |
| **Image Processing** | **Pillow (PIL) & OpenCV** | `>= 4.8` | Frame extraction sa video (OpenCV), HSV dominant fur color quantization, ID redaction (Pillow). |
| **Cloud Media Storage**| **Cloudinary** | `>= 1.38` | Cloud-based media storage, image optimization, dynamic transformations. |
| **Email Service** | **Python smtplib** | Standard | Transactional email delivery (OTP, alerts, adoption updates) na may HTML email templates. |
| **Mobile Runtime** | **Capacitor** | `8.5.2` | Mobile wrapper na nagbibigay-daan sa React app na tumakbo bilang native Android APK. |

---

## 4. AUDIT NG BUONG FUNCTIONALITIES AT FEATURES AYON SA ROLE

Mayroong **Apat (4) na Pangunahing User Roles** sa StraySafe 2.0:
- **Role 1:** Citizen / Resident
- **Role 2:** Subdivision Leader (HOA Officer / Sector Head)
- **Role 3:** Barangay Staff (Tanod, Animal Rescuer, Health Officer, Admin Staff, Captain)
- **Role 4:** System Administrator (City/Municipal Veterinary Officer, Super Admin)

```mermaid
graph LR
    subgraph Roles ["Mga Gumagamit ng StraySafe 2.0"]
        R1["Role 1: Citizen / Resident"]
        R2["Role 2: Subdivision Leader"]
        R3["Role 3: Barangay Staff"]
        R4["Role 4: System Admin"]
    end

    R1 -->|"Ulat ng Ligaw, Pet QR, Pag-aampon"| Portal1["/resident/* & /adopt/*"]
    R2 -->|"Triage, Subd Holding, Endorsement"| Portal2["/subd/*"]
    R3 -->|"Rescue Dispatch, Brgy Holding, 9-Stage Adoption"| Portal3["/brgy/*"]
    R4 -->|"Heatmaps, Audit Logs, Users, System Config"| Portal4["/admin/*"]
```

---

### 4.1 Citizen / Resident Portal (Role 1)
*File paths: `frontend/src/pages/citizen/`*

Ang portal na ito ay dinisenyo para sa pangkalahatang publiko at mga residente ng komunidad.

#### 1. Public Landing Page & Catalog (`LandingPage.tsx`, `AdoptionCatalog.tsx`)
- **Public Hero & Stats:** Ipinapakita ang bilang ng matagumpay na na-rescue, na-claim ng may-ari, at napag-ampon na mga hayop.
- **Animal Adoption Catalog:** Maaaring tingnan ng sinumang bisita ang mga hayop sa holding facility na kwalipikado nang ampunin (`Ready for Adoption`), kumpleto sa larawan, tinatayang edad, kasarian, breed, at ugali.
- **Animal Journey Story (`AnimalJourneyMap.tsx`):** Timeline ng pinagdaanan ng hayop mula nang ma-rescue hanggang sa makarating sa holding facility.
- **Certificate Verification Portal (`VerifyAdoptionCertificate.tsx`):** Pampublikong verification tool kung saan maaaring i-type ang Certificate Number o i-scan ang QR code upang patotohanan kung lehitimo ang adoption paper.

#### 2. Authentication & Profile Management (`ResidentsLogin.tsx`, `ResiProfile.tsx`, `ResidentSettings.tsx`)
- **Dual Sign-In:** Suportado ang tradisyunal na Email/Password at Google One-Tap Sign-In (`GoogleSignInButton.tsx`).
- **OTP Email Verification:** Pagpapadala ng 6-digit numeric OTP para sa pagpapatunay ng email bago ma-activate ang account.
- **Password Policy Enforcer:** Pagpapatupad ng minimum 12 characters na may uppercase, lowercase, number, at special symbol.
- **Profile & Proof of Residency:** Pag-upload ng Government ID o Barangay ID na awtomatikong pino-protektahan ng ID encryption at masking module.

#### 3. Stray Incident Reporting (`ReportStrayPage.tsx`)
- **Multi-Step Guided Form:** 
  1. *Lokasyon:* Interactive Leaflet Map picker na may automatic GPS geolocation at snapping sa pinakamalapit na landmark/subdivision boundary.
  2. *Detalye:* Uri ng hayop (Aso / Pusa), kondisyon (Malusog, Sugatan, Agresibo, Nanghahabol), kulay, sukat.
  3. *Media Upload:* Pag-upload ng hanggang 5 larawan o video clip.
- **Client-Side Image Optimization:** Awtomatikong kino-compress ang malalaking larawan bago i-upload (`imageCompress.ts`).
- **Real-Time AI Auto-Analysis:** Pagka-upload ng larawan, sinusuri agad ng backend (YOLOv8 + Gemini) ang imahe at nagmumungkahi ng kulay, breed, at risk level.

#### 4. Stray Report Tracking & Community Feed (`ResiHomePage.tsx`, `ResiViewReport.tsx`)
- **Personal & Community Feeds:** Maaaring i-filter ang mga ulat sa pagitan ng "Aking mga Ulat" at "Mga Ulat sa Aking Subdivision/Barangay".
- **Dynamic Case Status Badge:** Real-time visibility sa katayuan ng ulat (Pending Review, Investigating, Scheduled for Rescue, Rescued, Claimed, False Alarm).
- **Incident Timeline:** Detalyadong audit logs kung kailan natanggap, sino ang humawak, at ano ang kasalukuyang aksyon.
- **Report Dispute Module:** Kakayahan ng residente na maghain ng dispute kung sa tingin niya ay mali ang impormasyon o aksyon sa ulat.

#### 5. Registered Pet Management & Smart QR System (`ResidentPet.tsx`, `PetQrCardPage.tsx`, `PetScanHistoryPage.tsx`)
- **Pet Profiling:** Pagrerehistro ng sariling alaga (Pangalan, Uri, Breed, Kulay, Kapanganakan, Microchip Number, Katangian).
- **Vaccination Records:** Pag-upload ng anti-rabies vaccination certificate at petsa ng expiration.
- **AI Pet Photo Verification:** Pagsusuri kung tunay at malinaw na larawan ng hayop ang in-upload (`AiImageVerificationBadge.tsx`).
- **Dynamic Pet QR Tag:** Awtomatikong paglikha ng natatanging QR code para sa bawat alaga. Maaaring i-download o i-print bilang collar tag.
- **Public Lost Pet Scan Page (`PetScanPage.tsx`):** Kapag may nakakita sa nawawalang alaga at iniscan ang collar QR gamit ang cellphone:
  - Humihingi ang scanner ng GPS location sa browser ng nakakita.
  - Maaaring iwan ng finder ang kanyang pangalan at numero.
  - Awtomatikong nagpapadala ng agarang notification at GPS coordinate alert sa may-ari ng alaga!
- **Scan Telemetry Log:** Kasaysayan ng bawat scan event, petsa, oras, at mapa kung saan na-scan ang alaga.

#### 6. AI Match Review & Pet Recovery (`PetMatchReview.tsx`, `PetClaimsDashboard.tsx`)
- **Automatic Look-Alike Notifications:** Kapag may nai-report na ligaw na aso o pusa na kahawig ng rehistradong alaga ng residente, makakatanggap siya ng match alert na may similarity score (e.g., 85% Match).
- **Side-by-Side Visual Comparison:** Magkatabing pagsusuri ng larawan ng alaga at ng nai-report na stray.
- **Claim Submission:** Pagsusumite ng pormal na Pet Claim na may kalakip na patunay ng pagmamay-ari (mga lumang larawan, vaccination card, resibo ng vet).

#### 7. 9-Stage Adoption Application Portal (`AdoptionApplyForm.tsx`, `MyAdoptionApplications.tsx`)
- **Application Submission:** Pagsagot sa komprehensibong adoption form (Housing conditions, bakod, ibang alaga, budget, income proof).
- **Interactive Stage Tracker (`AdoptionStageStepper.tsx`):** Pagsubaybay sa 6 consolidated / 9 internal stages ng aplikasyon.
- **In-App Adoption Chat (`adoption_chat.py`):** Direktang pakikipag-ugnayan sa nakatalagang Barangay Adoption Officer.
- **Digital Adoption Certificate Download:** Kapag naaprubahan, makakakuha ang adopter ng official downloadable PDF/QR-verified Adoption Certificate.

---

### 4.2 Subdivision Leader Portal (Role 2)
*File paths: `frontend/src/pages/Subd_Leaders/`*

Nakalaan para sa mga HOA Presidents, Security Heads, at Subdivision Coordinators na namumuno sa lokal na komunidad bago umabot ang kaso sa munisipyo o barangay hall.

#### 1. Subdivision Executive Dashboard (`SubdDashboard.tsx`)
- **KPI Metrics:** Bilang ng mga aktibong ulat sa loob ng subdivision, nakabinbing beripikasyon, mga asong nasa subdivision holding area, at na-escalate sa barangay.
- **Subdivision Boundary Geofenced Feed:** Awtomatikong sinasala ang mga insidente upang tanging ang mga nasa loob lamang ng geographic polygon ng subdivision ang makikita.

#### 2. Report Triage, Review & Verification (`SubdReports.tsx`, `SubdViewReport.tsx`)
- **Verification Workflow:** Pagsusuri sa bawat ulat ng residente. Maaaring i-marka bilang *Verified*, *False Alarm*, o *Under Investigation*.
- **Duplicate Detection & Case Merging (`case_groups.py`):** Kapag 3 residente ang nag-ulat sa parehong ligaw na aso, maaaring pagsamahin ang mga ito sa iisang Case Group upang maiwasan ang redundant missions.
- **AI Suggestion Panel (`AISuggestionPanel.tsx`):** Pagsusuri sa AI priority recommendation (Low, Medium, High) at mabilisang pag-override kung kinakailangan.

#### 3. Escalation & Endorsement to Barangay (`EndorsementArch.tsx`)
- **Formal Endorsement Generation:** Kung ang ligaw na hayop ay agresibo, may hinalang rabies, o walang kapasidad ang subdivision na hulihin ito, naglalabas ang lider ng digital Endorsement Letter papunta sa Barangay Rescue Unit.
- **Inter-Agency Handover Tracking:** Pagsubaybay sa katayuan ng endorsed report hanggang sa tanggapin ito ng Barangay Staff.

#### 4. Subdivision Holding Facility Management (`SubdHoldingFacility.tsx`)
- **Local Holding Cages:** Pamamahala sa mga temporary impoundment pens sa loob ng subdivision para sa mga bagong huling ligaw.
- **Mandatory Holding Period Clock:** Countdown timer (karaniwang 3-5 araw) bago ilipat ang hayop sa Barangay o buksan para sa adoption alinsunod sa batas.
- **Daily Care Logs:** Pagtatala ng pakain, pag-inom, at kondisyong medikal ng bawat hayop.

#### 5. Local Pet Claims Settlement (`SubdPetClaims.tsx`)
- **Neighbor Claim Processing:** Pagre-review ng mga apela ng mga kapitbahay na naghahanap sa kanilang nakawalang alaga.
- **Proof Validation & Release:** Pagpapalabas ng Release Order kapag napatunayang sa residente nga ang hayop, kalakip ang paniningil ng holding fee o pagbibigay ng babala.

#### 6. Hazard Alerts & Citizen Warnings (`SubdHazardAlert.tsx`)
- **Subdivision Broadcasts:** Pagpapadala ng agarang alerto sa lahat ng residente ng subdivision (e.g., "Mag-ingat: May gala at agresibong aso sa Phase 2 Block 5").

---

### 4.3 Barangay Staff & Rescue Team Portal (Role 3)
*File paths: `frontend/src/pages/Barangay_Staff/`*

Para sa Barangay Tanod, Animal Rescuers, Barangay Health Workers, at Barangay Officials na may mandato sa pagpapatupad ng batas at rescue operations.

#### 1. Barangay Command Dashboard (`BrgyDashboard.tsx`)
- **Barangay-wide Operational View:** Kabuuang bilang ng active rescues, holding facility occupancy rate, monthly bite statistics, at pending adoptions.
- **Interactive Operational Map (`MapComponent.tsx`):** Live map na nagpapakita ng lahat ng naiulat na stray locations, holding facilities, at dispatch units.

#### 2. Rescue Mission Dispatch & Field Tracking (`BrgyRescueRequests.tsx`, `BrgyReportView.tsx`)
- **Mission Assignment:** Pagpili at pagtatalaga ng rescue team / tanod para sa isang partikular na insidente.
- **Field Status Lifecycle:** Pag-usad ng misyon:
  $$\text{Pending} \longrightarrow \text{Dispatched} \longrightarrow \text{En Route} \longrightarrow \text{On Scene} \longrightarrow \text{Captured / Animal Not Found / Deceased}$$
- **Field Evidence Capture:** Pag-upload ng mga larawan bilang patunay ng matagumpay na rescue bago dalhin ang hayop sa pasilidad.

#### 3. Barangay Holding Facility & Veterinary Care (`BrgyHoldingFacility.tsx`)
- **Cage & Pen Allocation:** Pagpapares ng bawat na-rescue na hayop sa isang partikular na cage ID sa pasilidad.
- **Health & Behavioral Categorization:** 
  - *Need Treatment:* Nangangailangan ng agarang gamot o operasyon.
  - *Healthy:* Ligtas at maayos ang kalagayan.
  - *Claimed by Owner:* Naibalik sa may-ari.
  - *Transferred to Shelter / Ready for Adoption:* Tapos na ang impoundment period at bukas na sa publiko.
- **Mandatory Holding Countdown:** Mahigpit na pagsubaybay sa holding days bago ang legal na paglipat ng kustodiya.

#### 4. End-to-End 9-Stage Adoption Management (`BrgyAdoptions.tsx`, `BrgyAdoptionTasks.tsx`)
- **Application Pre-screening:** Pagsusuri sa kwalipikasyon ng nag-apply.
- **Task Delegation Engine (`adoption_tasks.py`):**
  - Pag-assign ng staff para mag-interview (Virtual o F2F).
  - Pag-assign ng field officer para sa Home Visit Inspection (pagsusuri sa bakod, espasyo, at kaligtasan).
- **Consolidated Case Review:** Pagsasama-sama ng interview ratings, home visit photos, at ID background check bago ang pinal na pagpapasya.
- **Official Handover & Certificate Issuance:** Pag-isyu ng legal na Adoption Certificate na may digital security hash at signature ng Barangay.

#### 5. Community Alerts & Ordinance Enforcement (`BrgyCommunityAlerts.tsx`, `BrgyPetClaims.tsx`)
- **Barangay-Wide Public Alerts:** Pagpapakalat ng opisyal na paalala ukol sa Anti-Rabies Vaccination drive o mga lugar na may mataas na insidente ng kagat ng hayop.
- **Owner Citation & Warning Issuance:** Pag-isyu ng opisyal na Notice of Violation / Warning sa mga iresponsableng may-ari ng aso na hinahayaang gumala ang kanilang alaga sa kalsada.

---

### 4.4 System Administrator Portal (Role 4)
*File paths: `frontend/src/pages/Admin/`*

Nakalaan para sa Municipal Veterinary Office, IT Administrators, at City Governance para sa pangkalahatang kontrol at pagsusuri ng buong sistema.

#### 1. Executive Intelligence Dashboard (`AdminDashboard.tsx`)
- **Cross-Barangay Analytics:** Pagsusuri ng kabuuang performance ng iba't ibang barangay at subdivision.
- **Resolution Velocity:** Pagsukat kung gaano kabilis maaksyunan ang isang ulat mula sa filing hanggang sa rescue o pagka-claim.

#### 2. Spatial Heatmap Analytics (`AdminHeatMap.tsx`)
- **Incident Density Heatmap:** Paggamit ng `Leaflet.heat` upang ilatag ang density ng mga insidente ng stray animals at agresibong hayop.
- **Corridor Identification:** Pagtukoy sa mga kalsada at bakanteng lote na karaniwang pinamumugaran ng mga ligaw na aso para sa targeted spay-and-neuter (kapon) drives.

#### 3. User & Role Governance (`AdminUserManagement.tsx`)
- **RBAC Administration:** Pag-apruba, pag-edit, pag-suspend, o pag-deactivate ng mga account ng Barangay Staff, Subdivision Leaders, at Residente.
- **Position & Department Assignment:** Pagtatalaga ng mga opisyal na titulo (e.g., Barangay Captain, Rescuer, HOA President).

#### 4. Ordinance Violations & Citations Management (`AdminWarnings.tsx`)
- **Warning Master Registry:** Pagsubaybay sa lahat ng inisyung warnings (Notice, 1st Warning, 2nd Warning, Final Notice / Escalation) alinsunod sa City/Barangay ordinances.
- **Repeat Offender Tracking:** Paglista sa mga residenteng paulit-ulit na nahuhulihan ng nakawalang alaga kalakip ang multang dapat bayaran.

#### 5. Master Audit Trail & Security Logs (`AdminLogs.tsx`)
- **Non-Repudiation Logging:** Detalyadong talaan ng bawat aktibidad sa system:
  - Sinong user ang gumawa (`user_id`, pangalan, role).
  - Petsa at eksaktong timestamp.
  - IP Address at Device User-Agent.
  - Uri ng operasyon (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `STATUS_CHANGE`).
  - JSON snapshots ng dating datos (`old_values`) at bagong datos (`new_values`).

#### 6. System Configuration & AI Controls (`AdminAccountSettings.tsx`)
- **AI Matching Sensitivity:** Pag-toggle sa paggamit ng Google Gemini API o pagpapanatili lamang sa lokal na rule-based matching engine.
- **Geofence & Boundary Settings:** Pagtatakda ng geographic boundaries ng bawat nasasakupang barangay at subdivision.

---

## 5. AI, MACHINE LEARNING, AT COMPUTER VISION ENGINE (AI PIPELINE DEEP-DIVE)

Ang StraySafe 2.0 ay nagpapatupad ng isang **Hybrid Local-Cloud Multi-Stage Computer Vision & AI Architecture**.

```mermaid
flowchart TD
    RawMedia["Uploaded Photo / Video"] --> InputCheck{"Uri ng Media?"}
    
    InputCheck -- "Video File" --> OpenCV["OpenCV (cv2)<br/>Keyframe Extraction (Up to 8 frames)"]
    InputCheck -- "Still Image" --> Preprocess["Pillow (PIL)<br/>EXIF Normalization & Resizing"]
    OpenCV --> Preprocess

    Preprocess --> YOLO["YOLOv8n Local Model<br/>Animal Detection (Dog / Cat)<br/>Box Conf Threshold: 0.35"]
    
    YOLO --> DetectionCheck{"May nakitang Aso/Pusa?"}
    
    DetectionCheck -- "Oo (Bounding Box)" --> Crop["Pillow Crop to Animal ROI"]
    DetectionCheck -- "Wala / Mababa" --> FullImage["Gamitin ang Buong Larawan"]
    
    Crop --> ColorEngine["Pillow HSV Engine<br/>Dominant Coat Color Quantization<br/>(White, Black, Brown, Tan, Gray, etc.)"]
    FullImage --> ColorEngine
    
    ColorEngine --> GeminiAnalysis["Google Gemini 2.5 Flash API<br/>Multimodal Analysis & Reasoning"]
    
    subgraph GeminiTasks ["Mga Gawain ng Gemini Multimodal"]
        Task1["Animal Classification (Type, Breed, Size)"]
        Task2["Behavior & Risk Scoring (Injury, Aggression)"]
        Task3["Photo Authenticity & Deepfake/AI Likelihood (0-1)"]
    end
    GeminiAnalysis --> GeminiTasks
    
    GeminiTasks --> DualMatching["Dual-Engine Matching Core"]
    
    subgraph DualMatching ["Pares-Pares na Paghahambing (Comparison Engine)"]
        RuleEngine["Heuristic Rule Engine (Weight 40%)<br/>- Species Match (Hard Filter)<br/>- Breed & Coat Color Similarity<br/>- Spatiotemporal Proximity (Distance & Time)"]
        VisionEngine["Gemini Vision Comparison (Weight 60%)<br/>Pairwise Visual Feature Similarity (0-100)"]
    end
    
    DualMatching --> StaffDecision["AI Confidence & Match Score<br/>Ipinapakita bilang Suhestiyon sa Dashboard"]
    StaffDecision --> HumanReview{"Human Staff Decision<br/>(Lider / Barangay Officer)"}
    HumanReview -- "Kumpirmahin" --> MatchAccepted["Opisyal na Match / Duplicate"]
    HumanReview -- "Tanggihan" --> MatchDismissed["Dismissed Suggestion"]
```

### Mga Komponent ng AI Pipeline:

1. **YOLOv8n (Local Object Detection):**
   - **Tungkulin:** Mabilisang pag-detect kung may aso o pusa sa larawan, paglikha ng bounding box coordinates, at pag-crop sa subject.
   - **Threshold:** `0.35` minimum confidence upang maiwasan ang mga maling detection (false positives).
   - **Bentahe:** Tumatakbo nang libre sa lokal na server CPU nang walang API cost.
2. **OpenCV (`cv2` Video Processing):**
   - **Tungkulin:** Kapag video clip ang in-upload ng residente, kumukuha ang OpenCV ng hanggang 8 representative keyframes sa buong haba ng video.
   - **Seleksyon:** Pinipili ang frame na may pinakamalaking bounding box at pinakamataas na YOLO confidence score para sa masusing pagsusuri.
3. **Pillow HSV Color Detection:**
   - **Tungkulin:** Pagsusuri sa kulay ng balahibo (coat color) sa loob ng bounding box gamit ang HSV (Hue-Saturation-Value) color space mapping.
   - **Background Filtering:** Awtomatikong binabale-wala ang kulay berde (damo/halaman) at asul (langit) upang hindi masama sa kulay ng hayop.
4. **Google Gemini 2.5 Flash (Multimodal Analysis):**
   - **Tungkulin:** Masusing pagsusuri sa uri ng hayop, posibleng lahi (e.g., Aspin, Shih Tzu, Golden Retriever, Puspin), laki, kondisyong medikal (sugatan, payat), at antas ng agresyon (nanghahabol, nangangagat).
   - **Photo Authenticity Check:** Sinusuri kung ang larawan ay totoong kuha sa lansangan o binuo lamang ng AI image generators (DALL-E, Midjourney) o galing sa internet stock photos.
5. **Dual-Engine Matching Algorithm:**
   - **Bakit Dalawa?** Kung walang internet o naubos ang Gemini quota, patuloy pa ring gagana ang system gamit ang **Heuristic Rule Engine**.
   - Pinagsasama ang spatial distance (kung gaano kalapit ang ulat sa bahay ng nawawalang alaga), agwat ng oras, lahi, at kulay ng balahibo.
6. **Mahalagang Prinsipyo: "Human-in-the-Loop" (Walang Autonomong Desisyon):**
   - **HINDI** nagpapasya ang AI nang mag-isa. Ang lahat ng marka ng AI ay tinatawag na **Suggestions**. Tanging ang tao (Subdivision Leader, Barangay Staff, at Rehistradong May-ari) ang may pinal na kapangyarihan na aprubahan ang match o magsara ng kaso.

---

## 6. MGA PANGUNAHING PROSESO NG SISTEMA (END-TO-END SYSTEM LIFECYCLES)

Dito nakadetalye ang buong daloy (step-by-step processes) ng StraySafe 2.0.

---

### PROSESO 1: User Onboarding, Authentication, at Profile Verification

```mermaid
sequenceDiagram
    autonumber
    actor User as Citizen / Residente
    participant Front as Frontend (React)
    participant Back as Backend (FastAPI)
    participant DB as MySQL Database
    participant SMTP as SMTP Mailer

    User->>Front: Magrehistro gamit ang Form (Pangalan, Email, Password, Barangay, Subd)
    Front->>Back: POST /auth/register (Payload na may Password Policy Check)
    Back->>DB: I-save ang user bilang status='Inactive'
    Back->>Back: Gumawa ng 6-Digit Numeric OTP Code
    Back->>DB: I-save sa otp_verifications (Expire: 10 mins)
    Back->>SMTP: Magpadala ng Verification Email na may OTP
    SMTP-->>User: Matanggap ang OTP sa Inbox
    User->>Front: I-type ang 6-digit OTP
    Front->>Back: POST /auth/verify-otp (Email + Code)
    Back->>DB: I-validate ang OTP at i-update ang user status='Active'
    Back-->>Front: Ibalik ang Access Token (JWT) at Refresh Cookie
    Front->>Front: I-save sa SessionStorage at i-redirect sa /resident-home
```

---

### PROSESO 2: Stray Animal Incident Reporting at AI Auto-Triaging

```mermaid
sequenceDiagram
    autonumber
    actor Resi as Residente
    participant Front as Resident Portal
    participant Back as FastAPI Backend
    participant AI as AI Engine (YOLO + Gemini)
    participant DB as MySQL DB
    participant Subd as Subd Leader Portal

    Resi->>Front: Mag-upload ng Larawan/Video + Piliin ang GPS Location sa Mapa
    Front->>Back: POST /reports (FormData na may Media)
    Back->>DB: I-save ang paunang ulat (status_id = 1: 'Pending Verification')
    Back->>AI: Ipadala ang media sa AI Pipeline
    AI->>AI: 1. YOLOv8 crop animal ROI<br/>2. Pillow HSV reads dominant color<br/>3. Gemini generates description, risk, photo check
    AI-->>Back: Ibalik ang AI suggestions (Dog, Brown, High Risk, Authentic)
    Back->>DB: I-update ang report (ai_animal_type, ai_suggested_risk_level, ai_possible_breed)
    Back->>Back: Patakbuhin ang Matching Engine laban sa Lost Pets & Reports
    Back->>DB: I-save ang mga natuklasang matches sa report_matches
    Back-->>Subd: Magpadala ng In-App & Email Notification sa Subd Leader
    Subd->>Subd: Bubuksan ng Lider ang /subd/reports/:id upang suriin
```

---

### PROSESO 3: Case Escalation at Barangay Rescue Dispatch

```mermaid
sequenceDiagram
    autonumber
    actor Subd as Subd Leader
    participant Back as Backend
    participant DB as MySQL DB
    actor Brgy as Barangay Staff / Rescuer

    Subd->>Back: POST /reports/:id/escalate (Dahilan: Agresibo / Walang gamit)
    Back->>DB: I-update ang status_id = 'Escalated to Barangay'
    Back->>DB: Gumawa ng record sa endorsement_letters
    Back-->>Brgy: Notification: "Bagong Endorsed Report mula sa Subdivision"
    Brgy->>Back: POST /rescue/dispatch (report_id, assigned_rescuers, target_time)
    Back->>DB: Gumawa ng rescue_operations record (status='Dispatched')
    Note over Brgy: Sasadyain ng Rescue Team ang Lokasyon
    Brgy->>Back: PATCH /rescue/:id/status (status='Captured', upload capture photo)
    Back->>DB: I-update ang report status = 'Rescued' at rescue status = 'Completed'
    Back-->>Subd: Notification: "Matagumpay na Nahuli ang Hayop"
```

---

### PROSESO 4: Holding Facility Intake, Care, at Countdown Lifecycle

Kapag nahuli ang hayop, dadalhin ito sa Holding Facility (Barangay o Subdivision):

```mermaid
stateDiagram-v2
    [*] --> Intake: Nahuling Hayop dinala sa Pasilidad
    Intake --> CageAssigned: Magtalaga ng Cage ID at Holding Status
    
    state HoldingCountdown {
        [*] --> Day1: Day 1 Intake & Health Check
        Day1 --> Day2: Pakain, Tubig, Medical Log
        Day2 --> Day3: Mandatory Claim Window
        Day3 --> Expired: Natapos ang Holding Period nang Walang Nagke-claim
    }
    
    CageAssigned --> HoldingCountdown
    
    HoldingCountdown --> OwnerClaimed: Dumating ang May-ari na may Katibayan
    OwnerClaimed --> Released: Na-verify ang Claim & Nagbayad ng Fee -> Rehistrado muli
    
    Expired --> TransitionToAdoption: Legal Custody pumasok sa Pamahalaan
    TransitionToAdoption --> ReadyForAdoption: I-post sa Pampublikong Adoption Catalog
    ReadyForAdoption --> [*]
```

---

### PROSESO 5: 9-Stage Adoption Lifecycle at Verifiable Certificate Issuance

Ang proseso ng pag-aampon sa StraySafe 2.0 ay sumusunod sa **9 Internal Stages** (na ipinapakita bilang 6 Consolidated Stages sa UI para sa madaling pag-unawa ng residente):

```mermaid
flowchart TD
    S1["Stage 1: Application Submitted<br/>(Pagsusumite ng Form at Valid ID)"] --> S2["Stage 2: Pre-Screening & Verification<br/>(Pagsusuri sa Kwalipikasyon at ID Check)"]
    S2 --> S3["Stage 3: Interview Scheduled & Conducted<br/>(Virtual o F2F Q&A sa Aplikante)"]
    S3 --> S4["Stage 4: Home Visit Inspection<br/>(Pagsusuri sa Bahay, Bakod, at Kapaligiran)"]
    S4 --> S5["Stage 5: Consolidated Review<br/>(Pagsusuri ng Barangay Case Authority)"]
    S5 --> S6["Stage 6: Official Approval & Certification<br/>(Pag-apruba at Paglikha ng Digital Certificate)"]
    S6 --> S7["Stage 7: Adoption Agreement & Fee<br/>(Paglagda sa Kasunduan at Resibo)"]
    S7 --> S8["Stage 8: Animal Handover<br/>(Pisikal na Paglipat ng Hayop sa Bagong May-ari)"]
    S8 --> S9["Stage 9: Post-Adoption Monitoring<br/>(Pag-upload ng Larawan kada Buwan / Kumpletong Kaso)"]
```

#### Ang Mekanismo ng Digital Certificate Verification:
Kapag pumasok sa **Stage 6**:
1. Ang backend router (`adoption_certificates.py`) ay lumilikha ng isang natatanging **Certificate Number** (Format: `CERT-YYYY-XXXXX`).
2. Bumubuo ang system ng **SHA-256 digital fingerprint** mula sa pinagsamang `certificate_number + adopter_id + animal_id + issued_date + secret_salt`.
3. Lumilikha ng **QR Code** na nakadirekta sa pampublikong URL:
   `https://straysafe.gov.ph/verify/certificate/CERT-2026-00123`
4. Sinumang opisyal o mamamayan na mag-scan sa QR code ay dadalhin sa `VerifyAdoptionCertificate.tsx` kung saan ipapakita ang opisyal na Barangay seal, pangalan ng adopter, detalye ng hayop, at petsa ng pagkaka-isyu nang walang panganib ng pamemeke.

---

### PROSESO 6: Pet Registration, Smart QR Tagging, at Lost Pet Recovery

```mermaid
sequenceDiagram
    autonumber
    actor Owner as May-ari ng Alaga
    participant Front as Resident Portal
    participant Back as FastAPI Backend
    participant DB as MySQL DB
    actor Finder as Nakakita sa Kalsada (Publiko)

    Owner->>Front: Magrehistro ng Alaga sa /resident/pets (Pangalan, Breed, Bakuna, Larawan)
    Front->>Back: POST /pets (Data + Vaccine Card + Photos)
    Back->>DB: I-save ang pet record
    Back->>Back: Gumawa ng natatanging Cryptographic QR Token
    Back->>DB: I-save sa pet_qr_codes (qr_token, is_active=True)
    Back-->>Front: Ibalik ang QR Code Image
    Owner->>Front: I-print o ikabit ang QR Tag sa Kwelyo ng Aso
    
    Note over Owner, Finder: Nakawala ang aso at nakita ng ibang tao sa kalsada
    
    Finder->>Finder: I-scan ang QR Collar Tag gamit ang Camera ng Cellphone
    Finder->>Front: Bumukas ang /pet/scan/:token sa Mobile Browser
    Front->>Finder: Humingi ng pahintulot sa GPS Location ("Allow Location")
    Finder->>Front: Pinayagan ang GPS + Nag-iwan ng contact number
    Front->>Back: POST /pet-qr/public-scan/:token (Lat, Lng, Finder Info)
    Back->>DB: I-record sa pet_qr_scans table
    Back->>Back: Gumawa ng High-Priority Notification sa May-ari
    Back-->>Owner: Instant Alert sa Cellphone: "Na-scan ang iyong alaga sa [Address / Mapa]!"
    Owner->>Front: Bubuksan ang Mapa sa /resident/pet/:id/scan-history para sunduin ang alaga
```

---

### PROSESO 7: Ordinance Enforcement, Citizen Warnings, at Citations

Para sa pagpapatupad ng responsableng pag-aalaga ng hayop:
1. Kapag ang isang alaga ay paulit-ulit na nahuhuli sa kalsada nang walang tali (Free-Roaming Unleashed) o walang bakuna laban sa rabies:
2. Ang Barangay Staff o Subdivision Leader ay naglalabas ng opisyal na **Owner Warning** sa pamamagitan ng `POST /warnings`:
   - *1st Offense:* **Notice / 1st Warning** (Paalala sa Ordinansa).
   - *2nd Offense:* **2nd Warning** (Pataw ng Administrative Fine / Multa).
   - *3rd Offense:* **Final Notice / Legal Escalation** (Paghahain ng reklamo sa Barangay Lupon o City Prosecutor).
3. Ang may-ari ay makakatanggap ng in-app warning banner at kailangang mag-click ng **"Acknowledge Violation"** na may timestamp bilang patunay ng pagkakatanggap.

---

## 7. DATABASE SCHEMA AT DATA DICTIONARY (DATABASE ARCHITECTURE)

Ang database ng StraySafe 2.0 (`straysafe_db`) ay binubuo ng **55 Tables** na naka-organisa sa 8 lohikal na domain:

```mermaid
erDiagram
    USERS ||--o{ REPORTS : files
    USERS ||--o{ PETS : owns
    USERS ||--o{ ADOPTIONS : applies
    USERS ||--o{ AUDIT_LOGS : performs
    BARANGAYS ||--o{ SUBDIVISIONS : contains
    SUBDIVISIONS ||--o{ USERS : resides_in
    REPORTS ||--o{ REPORT_MEDIA : contains
    REPORTS ||--o{ RESCUE_OPERATIONS : initiates
    REPORTS ||--o{ REPORT_MATCHES : compares
    PETS ||--o{ PET_QR_CODES : has
    PET_QR_CODES ||--o{ PET_QR_SCANS : logs
    RESCUE_OPERATIONS ||--o{ HOLDING_ANIMALS : impounds
    HOLDING_ANIMALS ||--o{ ADOPTIONS : transitions_to
    ADOPTIONS ||--o{ ADOPTION_CERTIFICATES : issues
    ADOPTIONS ||--o{ ADOPTION_TASKS : assigns
```

### Buod ng 55 Tables ayon sa Domain:

| # | Domain / Kategorya | Mga Talahanayan (Tables) | Teknikal na Deskripsyon |
| :--- | :--- | :--- | :--- |
| **1** | **User & Organization Management** | `roles`, `positions`, `barangays`, `subdivisions`, `users`, `coverage_settings` | Pinamamahalaan ang 4 na antas ng RBAC, heograpiya ng barangay at subdivision, boundary coordinates, at profile ng bawat user. |
| **2** | **Authentication & Security** | `revoked_tokens`, `otp_verifications`, `system_settings`, `audit_logs` | JWT blacklist para sa agarang pag-logout, 6-digit email OTPs, global system configuration, at non-repudiation audit trails. |
| **3** | **Reporting & Incident Dispatch** | `reports`, `report_media`, `report_categories`, `report_status`, `report_status_history`, `behavior_tags`, `endorsement_letters`, `report_disputes` | Puso ng reporting engine. Dito nakaimbak ang bawat ulat ng stray, media links, AI suggested risk/priority, mga status changes, at inter-agency endorsement letters. |
| **4** | **Rescue Operations & Field Units** | `rescue_operations`, `rescue_status`, `rescue_responders` | Pagpapadala ng rescue team, field assignment ng tanods, koordinasyon sa operasyon, at oras ng deployment. |
| **5** | **Holding Facility & Animal Welfare** | `holding_animals`, `holding_logs`, `holding_timeline`, `cages`, `facility_status`, `facility_inspections`, `landmarks` | Pamamahala sa impoundment facility, pagtatala ng mga hawla (cages), intake/release logs, countdown ng holding window, at GPS landmarks. |
| **6** | **Pet Registry & Smart QR Code** | `pets`, `pet_vaccinations`, `pet_qr_codes`, `pet_qr_scans`, `pet_history`, `pet_claims`, `pet_owner_confirmations` | Master pet registry ng komunidad, anti-rabies records, QR tokens, scan telemetry (GPS logs ng nakakita), at mga claim disputes. |
| **7** | **Adoption Engine (9 Stages)** | `adoptions`, `adoption_status`, `adoption_status_history`, `adoption_verifications`, `adoption_interviews`, `adoption_home_visits`, `adoption_certificates`, `adoption_monitoring_logs`, `adoption_timeline_logs`, `adoption_assignments` | Kumpletong suporta para sa 9-stage adoption lifecycle, task assignments, interview logs, inspection proof, at QR verifiable legal certificates. |
| **8** | **Comms, AI & Ordinances** | `chat_threads`, `chat_messages`, `notifications`, `notification_preferences`, `email_logs`, `announcements`, `announcement_likes`, `announcement_comments`, `owner_warnings`, `report_matches`, `ai_jobs`, `ai_vision_comparisons` | Multichannel communication (in-app chat threads, email logs), public alerts/announcements, ordinance citations, AI comparison caches, at async job queues. |

---

## 8. SEGURIDAD, DATA PRIVACY, AT COMPLIANCE AUDIT (SECURITY & COMPLIANCE)

Sinuri ang buong codebase laban sa mga pamantayan ng cybersecurity at **Republic Act 10173 (Data Privacy Act of 2012)**:

### 1. Proteksyon sa Sensitibong Impormasyon (Government ID Redaction & Encryption)
- **Implementasyon:** `backend/app/utils/id_security.py` at `MaskedIdDisplay.tsx`.
- **Mekanismo:** Kapag nag-upload ang residente ng valid ID (Driver's License, Passport, PhilSys ID), ang sensitibong bahagi ng larawan ay awtomatikong pino-protektahan, at ang mga ID numbers ay ine-encrypt gamit ang **Fernet symmetric encryption** bago isulat sa disk o database.
- Sa screen ng staff, ipinapakita lamang ang masked version (e.g., `PHIL-****-****-1234`) upang maiwasan ang identity theft ng mga kawani.

### 2. Authentication & Token Lifecycle Management
- **Password Security:** Pagpapatupad ng `passlib[bcrypt]` na may automatic salt generation. Hindi kailanman nag-iimbak ng plain text password.
- **Session Revocation Blacklist:** Ang bawat pag-logout ay nagtatala ng JTI token sa `revoked_tokens` table. Ang anumang lumang token na ginamit muli ay agad na tatanggihan kahit hindi pa expired ang oras nito.
- **Automatic Inactivity Logout:** May timer sa frontend (`inactivity.ts`) na nagmo-monitor ng galaw ng mouse at keyboard. Kapag walang aktibidad sa loob ng 15 minuto, awtomatikong magsasagawa ng logout upang maiwasan ang unauthenticated physical access.

### 3. API Abuse & Rate Limiting Defense
- **Implementasyon:** `slowapi` limiter na nakakabit sa `FastAPI.state.limiter`.
- **Saklaw:** 
  - Login at OTP endpoints: nililimitahan sa **5 requests per minute** upang pigilan ang credential stuffing at brute force attacks.
  - Report submission at public QR scans: protektado laban sa bot spamming.

### 4. Database & Error Sanitization
- **Masked Exception Handlers (`backend/app/main.py`):**
  Lahat ng hindi inaasahang 500-level errors o SQLAlchemy errors ay sinasala ng custom middleware. Kung may keywords tulad ng `SELECT`, `UPDATE`, `pymysql`, o `foreign key`, tinatanggal ito sa tugon sa user at pinapalitan ng:
  `"An internal server error occurred. Internal details have been masked for security."`
  Pinipigilan nito ang mga hacker na makakuha ng schema footprints o SQL injection clues.

---

## 9. PAGSUSURI NG KALAKASAN, KAHINAAN (TECHNICAL DEBT), AT REKOMENDASYON

### 9.1 Mga Pangunahing Kalakasan ng Sistema (System Strengths):
1. **Komprehensibong Localization:** Angkop na angkop sa totoong kalakaran ng pamahalaang lokal sa Pilipinas (Subdivision ➔ Barangay ➔ Munisipyo).
2. **Matatag na AI Architecture:** Ang paggamit ng local YOLOv8 para sa bilis at privacy na sinamahan ng cloud-based Gemini para sa malalim na pagsusuri ay nagbibigay ng pinakamainam na balanse ng gastos at talino.
3. **Mataas na Integridad sa Pag-aampon:** Ang 9-stage adoption workflow na may cryptographically verifiable certificates ay pumipigil sa ilegal na pagbebenta at muling pagpapabaya sa mga hayop.
4. **Smart QR Pet Protection:** Napakahusay na feature para sa agarang pagkakakilanlan ng nawawalang alaga nang hindi nangangailangan ng mamahaling microchip scanner sa kalsada.

### 9.2 Mga Kahinaan at Technical Debt na Natukoy (Audit Findings & Gaps):
1. **Lokal na Storage Fallback:** Bagama't may Cloudinary, kapag walang internet connection ay naiipon ang mga larawan sa local disk (`uploads/`). Sa produksyon (tulad ng Render o Vercel), ang local disk ay ephemeral at maaaring mabura kapag nag-restart ang container.
2. **Background AI Worker Decoupling:** Sa kasalukuyan, ang AI jobs ay tumatakbo sa loob ng iisang application process sa pamamagitan ng embedded runner (`ai_jobs.start_embedded_runner`). Sa malawakang deployment na may daan-daang ulat kada araw, mas mainam na hiwalay na process o Redis-backed Celery worker ang humawak nito.
3. **Long Polling sa Sidebars:** Ang ilang notification counters sa sidebars ay gumagamit ng HTTP polling kada 15 segundo. Mas mainam na i-upgrade ito sa WebSockets o Server-Sent Events (SSE) para sa mas mababang network overhead.

### 9.3 Rekomendasyon para sa Production Readiness (Actionable Roadmap):

| Prayoridad | Aksyon | Detalye ng Rekomendasyon |
| :---: | :--- | :--- |
| **MATAAS** | **S3 / Cloudflare R2 Migration** | Tiyaking permanente ang media storage gamit ang S3-compatible bucket (Cloudflare R2 o AWS S3) sa halip na umasa sa local ephemeral container disk. |
| **MATAAS** | **WebSockets para sa Live Chat & Alerts** | Palitan ang 15-second polling sa `SubdSidebar` at `BrgySidebar` ng WebSockets (`FastAPI WebSocketEndpoint`) para sa tunay na instant messaging at real-time telemetry. |
| **KATAMTAMAN**| **Redis Task Queue** | Ihiwalay ang email queue at AI inference queue gamit ang Redis + Celery / ARQ para sa mas mataas na fault tolerance. |
| **KATAMTAMAN**| **Automated AI Accuracy Benchmark** | Kolektahin ang mga nasuring larawan upang pormal na masukat ang Precision, Recall, at F1-score ng YOLOv8 at Gemini matching engine batay sa `ai_test_set/` dataset. |

---

## 10. KONKLUSYON (AUDIT CONCLUSION)

Ang **StraySafe 2.0** ay isang ganap, moderno, at napakahusay na naisagawang software engineering solution para sa pamamahala ng mga ligaw at alagang hayop. Ang koneksyon sa pagitan ng React 19 frontend, FastAPI backend, 55-table MySQL relational database, at ng YOLO/Gemini hybrid AI engine ay maayos na pinag-isa at may mataas na antas ng data privacy at architectural security. Handa na ang sistema para sa pinal na staging at live field pilot testing sa mga target na barangay at subdivision.

---
*Ulat inihanda para sa StraySafe 2.0 Project Repository.*
