# StraySafe 2.0 — DFD Overview (Phase 1: analysis & proposed structure)

> **Status:** generated. **Manuscript set:** [Context Diagram](01_CONTEXT_DIAGRAM.md) and
> [Level 1 DFDs by user role](02_LEVEL1_DFD_BY_ROLE.md) (Resident, Subdivision Leader, Barangay Staff, Administrator).
> **Optional reference (not used in the manuscript):** [system-wide Level 1 (1A, 1B)](02_LEVEL1_DFD.md) and
> [Level 2 (3.0–7.0)](03_LEVEL2_DFD.md).
> **Sources:** `backend/app/routes/*.py` (28 route modules), `backend/app/services`, `backend/app/utils` (AI, email,
> push, uploads), `frontend/src` (map services), and the ERD in `docs/ERD` (data stores). Documentation only.

## 1. Notation (Gane–Sarson style, drawn with Mermaid flowcharts)

| Symbol | Meaning | Mermaid shape |
|---|---|---|
| Rectangle | **External entity**: a person or outside system that sends or receives data | `["Resident"]` |
| Rounded box / circle | **Process**: work the system does, numbered (1.0, 1.1, …) | `("1.0 …")`, `(("0 …"))` |
| Cylinder | **Data store**: a group of database tables, numbered D1–D11 | `[("D1 Users")]` |
| Labelled arrow | **Data flow**: the data that moves | `-->|"report details"|` |

Mermaid has no native DFD symbols. The shapes above are the common convention, and a legend is included under each
diagram. Every diagram uses the same white manuscript style as the ERDs.

## 2. External entities (verified in the code)

| Entity | Who / what | Evidence |
|---|---|---|
| **Resident** (role 1, Citizen) | Reports strays and lost pets, registers pets, claims pets, applies for adoption, chats | `reports.py`, `pets.py`, `claims.py`, `adoptions.py` |
| **Subdivision Leader** (role 2) | Claims, verifies, merges and endorses reports; reviews AI matches; registers pets for owners; posts alerts | `reports.py`, `matches.py`, `pets.py`, `announcements.py` |
| **Barangay Staff** (role 3, incl. Head Officer) | Rescue dispatch, holding facility, handovers, adoption processing, owner warnings | `rescue.py`, `holding.py`, `adoptions.py`, `warnings.py` |
| **Administrator** (role 4) | User accounts, system settings, dashboard, audit logs | `admin.py`, `users.py`, `audit_logs.py` |
| **Public Visitor** (no account) | Scans a pet's QR tag and submits where it was found; checks whether an adoption certificate is genuine. Neither needs a sign-in | `pet_qr.py` `POST /pet/scan/{token}/submit`; `adoption_certificates.py` `GET /verify/{certificate_number}` |
| **Google Gemini AI** | Compares photos and suggests animal details | `utils/ai_suggestions.py`, `utils/ai_matching.py` (`google.genai`) |
| **Cloudinary** | Stores uploaded photos, videos and documents | 116 references (`cloudinary`) |
| **Email Service** | Sends OTPs, password resets, invites, status emails (SMTP / Resend) | `utils/mailer.py`, `services/email_service.py` |
| **Web Push Service** | Delivers push notifications to browsers and phones (VAPID Web Push) | `services/push_service.py` |
| **OpenStreetMap Services** | Map tiles, address look-up (Nominatim), routing (OSRM) | `frontend/src` (`nominatim`, `router.project-osrm.org`) |

**Not shown as external entities:** the YOLO animal detector and the AI worker. These run **inside** StraySafe, so they
are part of process 4.0, not outside parties.

## 3. Proposed Level 1 processes (one per functional area, aligned with the ERD modules)

| Process | Name | Main route modules | Data stores used |
|---|---|---|---|
| 1.0 | Manage User Accounts and Access | `auth.py`, `users.py` | D1 |
| 2.0 | Manage Pet Records | `pets.py`, `pet_qr.py`, `pet_ownership.py`, `warnings.py` | D3, D1, D4 |
| 3.0 | Process Stray and Lost-Pet Reports | `reports.py` | D4, D2, D1 |
| 4.0 | Perform AI Matching | `matches.py`, `ai_jobs.py` (+ AI worker) | D6, D4, D3 |
| 5.0 | Manage Rescue and Holding Operations | `rescue.py`, `holding.py` | D7, D4 |
| 6.0 | Process Pet Claims and Reunification | `claims.py`, `report_returns.py` | D5, D4, D3, D7 |
| 7.0 | Manage Adoptions | `adoptions.py`, `adoption_tasks.py`, `adoption_certificates.py`, `adoption_chat.py` | D8, D7, D3 |
| 8.0 | Handle Communication and Notifications | `chat.py`, `notifications.py`, `push.py` | D9, D1 |
| 9.0 | Publish Announcements | `announcements.py` | D10, D2 |
| 10.0 | Administer System | `admin.py`, `audit_logs.py`, `landmarks.py` | D11, D2, D1 |

## 4. Data stores (each maps to tables in the ERD)

| Store | Name | Tables (ERD module) |
|---|---|---|
| D1 | Users | `users`, `roles`, `positions`, `otp_verifications`, `revoked_tokens` (01) |
| D2 | Locations | `barangays`, `subdivisions`, `landmarks`, `coverage_settings` (02) |
| D3 | Pets | `pets`, `pet_qr_codes`, `pet_qr_scans`, `pet_history`, `pet_owner_confirmations`, `owner_warnings` (03) |
| D4 | Reports | `reports`, `report_media`, `status_history`, `comments`, `endorsement_letters`, `report_disputes` (04) |
| D5 | Claims and Returns | `pet_claims`, `report_returns` (05) |
| D6 | AI Matches | `report_matches`, `ai_jobs`, `ai_vision_comparisons` (06) |
| D7 | Rescues and Holding | `rescues`, `rescue_assignments`, `holding_animals`, `holding_timeline` (07) |
| D8 | Adoptions | the nine `adoption*` tables (08) |
| D9 | Messages and Notifications | `chat_threads`, `chat_messages`, `notifications`, preferences, push tables, `email_logs` (09) |
| D10 | Announcements | `announcements` and its media, comments, reactions (10) |
| D11 | Audit and Settings | `audit_logs`, `system_settings` (11) |

Lookup tables (categories and statuses) are included in the store they serve. Unused tables (`pet_vaccinations`,
`report_verifications`) are not shown, because no process reads or writes them.

## 5. Proposed diagrams

| # | Diagram | Content | Fits one page? |
|---|---|---|---|
| 0 | **Context Diagram** | The whole system as one process, with all 10 external entities | Yes (drafted below) |
| 1 | **Level 1 DFD** | Processes 1.0–10.0, data stores D1–D11, main flows | Borderline. Proposed as **two pages**: 1A core operations (1.0–6.0) and 1B support (7.0–10.0) |
| 2 | **Level 2 DFDs** for the main processes | 3.0 Reports, 4.0 AI Matching, 5.0 Rescue & Holding, 6.0 Claims & Reunification, 7.0 Adoptions | One page each |

Level 2 is proposed only for the five processes with real internal steps. The others (accounts, pets, communication,
announcements, administration) are simple enough at Level 1. More can be added if your adviser requires a Level 2
for every process.

## 6. Context Diagram (Level 0)

See [01_CONTEXT_DIAGRAM.md](01_CONTEXT_DIAGRAM.md). The external entity *Pet Finder* was widened to **Public Visitor**, because certificate verification is also open to the public.

## 7. Decisions (approved with the proposed defaults)

| # | Decision | Proposed default |
|---|---|---|
| A | The 10 external entities, including the 5 outside services | Yes. Alternatively, show only the 5 user roles if your adviser wants a people-only context diagram |
| B | Ten Level 1 processes as listed | Yes |
| C | Eleven data stores mapped to the ERD modules | Yes |
| D | Level 1 split over two pages (1A / 1B) | Yes |
| E | Level 2 only for 3.0, 4.0, 5.0, 6.0, 7.0 | Yes |
| F | Barangay Head Officer shown as part of Barangay Staff | Yes (same role in the system, `role_id = 3`) |
