# StraySafe 2.0 — DFD Overview

> **Status:** reviewed against the application source. See [DFD corrections](04_DFD_REVIEW.md). **Manuscript set:** [Context Diagram](01_CONTEXT_DIAGRAM.md) and
> [Level 1 DFDs by user role](02_LEVEL1_DFD_BY_ROLE.md) (Resident, Subdivision Leader, Barangay Staff, Administrator).
> **Optional reference (not used in the manuscript):** [system-wide Level 1 (1A, 1B)](02_LEVEL1_DFD.md) and
> [Level 2 (3.0–7.0)](03_LEVEL2_DFD.md).
> **Sources:** `backend/app/routes/*.py` (route modules), `backend/app/services`, `backend/app/utils` (AI, email,
> push, uploads), `frontend/src` (map services), and the ERD in `docs/ERD` (data stores). Documentation only.

## 1. Notation (Gane–Sarson style, drawn with Mermaid flowcharts)

| Symbol | Meaning | Mermaid shape |
|---|---|---|
| Rectangle | **External entity**: a human actor who sends or receives data | `["Resident"]` |
| Rounded rectangle | **Process**: work the system does, numbered (1.0, 1.1, …) | `("1.0 …")`, `("0 …")` |
| Open-ended rectangle with a separate ID compartment | **Data store**: a group of database tables, numbered D1–D11 | Native draw.io compartment shape; Mermaid preview uses a plain ID and name label |
| Labelled arrow | **Data flow**: the data that moves | `-->|"report details"|` |

The [native editable diagrams](drawio/README.md) provide the exact reference symbols: grey/yellow open-ended data
stores and rounded processes with a numbered top band, white name band and blank yellow bottom band. The `.mmd`
files and embedded Mermaid blocks use simplified, portable labels because HTML-table labels are not preserved by
some editable-shape importers. All versions retain the same process/store IDs, human entities and data flows.

## 2. External entities (verified in the code)

| Entity | Who / what | Evidence |
|---|---|---|
| **Resident** (role 1, Citizen) | Reports strays and lost pets, registers pets, claims pets, applies for adoption, chats | `reports.py`, `pets.py`, `claims.py`, `adoptions.py` |
| **Subdivision Leader** (role 2) | Claims, verifies, merges and endorses reports; reviews AI matches; registers pets for owners; posts alerts | `reports.py`, `matches.py`, `pets.py`, `announcements.py` |
| **Barangay Staff** (role 3, incl. Head Officer) | Rescue dispatch, holding facility, handovers, adoption processing, owner warnings | `rescue.py`, `holding.py`, `adoptions.py`, `warnings.py` |
| **Administrator** (role 4) | User accounts, system settings, dashboard, audit logs | `admin.py`, `users.py`, `audit_logs.py` |
| **Public Visitor** (no account) | Scans a pet's QR tag and submits where it was found; checks whether an adoption certificate is genuine. Neither needs a sign-in | `pet_qr.py` `POST /pet/scan/{token}/submit`; `adoption_certificates.py` `GET /verify/{certificate_number}` |

**System boundary:** only human actors are drawn as external entities. AI analysis, managed media storage,
email and push delivery, and mapping support are treated as internal supporting operations in this logical DFD.
Their providers are implementation details. The YOLO detector and AI worker remain within process 4.0.

## 3. Level 1 processes (one per functional area, aligned with the ERD modules)

| Process | Name | Main route modules | Data stores used |
|---|---|---|---|
| 1.0 | Manage User Accounts and Access | `auth.py`, `users.py` | D1 |
| 2.0 | Manage Pet Records | `pets.py`, `pet_qr.py`, `pet_ownership.py`, `warnings.py` | D3 |
| 3.0 | Process Stray and Lost-Pet Reports | `reports.py` | D2, D3, D4 |
| 4.0 | Perform AI Matching | `matches.py`, `ai_jobs.py` (+ AI worker) | D3, D4, D6, D11 |
| 5.0 | Manage Rescue and Holding Operations | `rescue.py`, `holding.py` | D1, D2, D4, D7 |
| 6.0 | Process Pet Claims and Reunification | `claims.py`, `report_returns.py` | D3, D4, D5, D7 |
| 7.0 | Manage Adoptions | `adoptions.py`, `adoption_tasks.py`, `adoption_certificates.py`, `adoption_chat.py` | D3, D7, D8 |
| 8.0 | Handle Communication and Notifications | `chat.py`, `notifications.py`, `push.py` | D1, D9 |
| 9.0 | Publish Announcements | `announcements.py` | D2, D10 |
| 10.0 | Administer System | `admin.py`, `audit_logs.py`, `landmarks.py` | D1, D2, D3, D4, D11 |

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

Lookup tables are included in the store they serve. Vaccination status is retained on pet records; legacy detailed
vaccination rows, when present, remain within D3 during pet-record consolidation. Verification findings belong to
D4 Reports rather than a separate verification store (`reports.py`, `pets.py`, `admin.py`).

## 5. Diagram sets

| # | Diagram | Content | Fits one page? |
|---|---|---|---|
| 0 | **Context Diagram** | The whole system as one process, with the five human external entities | Review at export size |
| 1 | **Level 1 DFD** | Processes 1.0–10.0, data stores D1–D11, main flows | Two system views: 1A core operations and 1B support. Use the split role views for manuscript figures |
| 2 | **Level 2 DFDs** for the main processes | 3.0 Reports, 4.0 AI Matching, 5.0 Rescue & Holding, 6.0 Claims & Reunification, 7.0 Adoptions | One page each |

Level 2 is proposed only for the five processes with real internal steps. The others (accounts, pets, communication,
announcements, administration) are simple enough at Level 1. More can be added if your adviser requires a Level 2
for every process.

## 6. Context Diagram (Level 0)

See [01_CONTEXT_DIAGRAM.md](01_CONTEXT_DIAGRAM.md). The external entity *Pet Finder* was widened to **Public Visitor**, because certificate verification is also open to the public.

## 7. Modeling choices

| # | Decision | Choice |
|---|---|---|
| A | Only human external entities | Resident, Subdivision Leader, Barangay Staff, Administrator and Public Visitor |
| B | Ten Level 1 processes as listed | Yes |
| C | Eleven data stores mapped to the ERD modules | Yes |
| D | Level 1 split over two pages (1A / 1B) | Yes |
| E | Level 2 only for 3.0, 4.0, 5.0, 6.0, 7.0 | Yes |
| F | Barangay Head Officer shown as part of Barangay Staff | Yes (same role in the system, `role_id = 3`) |

The `corrected/` folder is a separate logical alternative with nine processes and its own data-store dictionary.
Its numbers must not be combined with the ten-process `mermaid/` set. The `existing/` folder models the manual
workflow. Each set has its own context diagram and consistent store meanings.
