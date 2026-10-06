# StraySafe 2.0 — Full System Audit

**Date:** 2026-10-05
**Auditor:** Claude Opus 4.6 (automated)
**Scope:** Backend, Frontend, Database, Security, Infrastructure

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Audit](#2-database-audit)
3. [Backend Audit](#3-backend-audit)
4. [Frontend Audit](#4-frontend-audit)
5. [Security Audit](#5-security-audit)
6. [AI / ML Audit](#6-ai--ml-audit)
7. [Infrastructure & DevOps Audit](#7-infrastructure--devops-audit)
8. [Master Checklist](#8-master-checklist)

---

## 1. System Overview

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | FastAPI + SQLAlchemy + MySQL | FastAPI >=0.110, SQLAlchemy >=2.0.27 |
| Frontend | React + TypeScript + Vite + Tailwind | React 19, TS 6, Vite 8, Tailwind 4.2 |
| AI/ML | YOLOv8n (local) + Google Gemini (cloud) | ultralytics >=8.1, google-generativeai >=0.3 |
| Media Storage | Cloudinary | cloudinary >=1.38 |
| Mobile | Capacitor (Android) | @capacitor/core 8.5.2 |
| Auth | JWT (HS256) + bcrypt + OTP | pyjwt >=2.8, passlib[bcrypt] |

### Roles

| ID | Role | Portal |
|----|------|--------|
| 1 | Resident / Citizen | `/resident/*` |
| 2 | Subdivision Leader | `/subd/*` |
| 3 | Barangay Staff | `/brgy/*` (+ `is_head_officer` flag) |
| 4 | Admin | `/admin/*` |

### Core Workflow Chain

```
Report → Rescue → Holding Facility → Adoption → Certificate → Monitoring
```

---

## 2. Database Audit

**Engine:** MySQL InnoDB, charset utf8mb4, collation utf8mb4_unicode_ci
**Database:** `straysafe_db`
**Schema file:** `Database3.3.txt` (revision 2026-10-03)
**Total tables:** 55

### 2.1 Table Inventory

| # | Table | Purpose |
|---|-------|---------|
| 1 | `roles` | 4 user roles |
| 2 | `positions` | Staff positions (President, Secretary, Tanod, Animal Rescuer, etc.) |
| 3 | `barangays` | Barangay geographic data with HQ coordinates |
| 4 | `subdivisions` | Subdivisions within barangays, with boundary polygon (JSON) |
| 5 | `landmarks` | Landmarks and holding facilities with GPS |
| 6 | `users` | All user accounts |
| 7 | `coverage_settings` | Geofence settings |
| 8 | `revoked_tokens` | JWT blacklist |
| 9 | `otp_verifications` | One-time password codes |
| 10 | `report_categories` | 6 report types |
| 11 | `report_status` | 18 statuses |
| 12 | `rescue_status` | 6 statuses |
| 13 | `letter_status` | Draft / Sent / Approved |
| 14 | `facility_status` | 8 holding statuses |
| 15 | `announcement_categories` | 6 announcement types |
| 16 | `behavior_tags` | 5 behavior classifications |
| 17 | `pets` | Registered pets (40+ columns, 4 photo slots, AI photo checks) |
| 18 | `pet_vaccinations` | Vaccination records |
| 19 | `pet_qr_codes` | QR codes per pet |
| 20 | `pet_qr_scans` | QR scan events with GPS |
| 21 | `pet_history` | Pet timeline events |
| 22 | `reports` | Incident reports (60+ columns, 14 AI fields) |
| 23 | `status_history` | Report status audit trail |
| 24 | `rescues` | Rescue operations |
| 25 | `rescue_assignments` | Rescue team assignments |
| 26 | `holding_timeline` | Observation logs for held animals |
| 27 | `holding_animals` | Animals in holding facilities |
| 28 | `adoptions` | 9-stage adoption lifecycle |
| 29 | `adoption_verifications` | ID match, residency, blacklist checks |
| 30 | `adoption_assignments` | Task assignments |
| 31 | `adoption_ownership_history` | Case owner changes |
| 32 | `adoption_interviews` | Scheduled interviews with scoring |
| 33 | `adoption_home_visits` | Home inspections with checklists |
| 34 | `adoption_certificates` | Certificates with verification hash + QR |
| 35 | `adoption_monitoring_logs` | Day 7/14/30 check-ins |
| 36 | `adoption_timeline_logs` | Per-adoption audit trail |
| 37 | `pet_owner_confirmations` | Staff-assigned ownership acceptance |
| 38 | `report_returns` | Return-to-owner records with proof |
| 39 | `report_media` | Media files linked to reports/status/holding |
| 40 | `report_verifications` | Leader verification of reports |
| 41 | `comments` | Threaded comments on reports |
| 42 | `endorsement_letters` | Subdivision-to-barangay letters |
| 43 | `pet_claims` | Pet ownership claims with evidence |
| 44 | `announcements` | Community announcements |
| 45 | `announcement_media` | Announcement attachments |
| 46 | `announcement_comments` | Threaded announcement comments |
| 47 | `announcement_reactions` | Announcement likes |
| 48 | `notifications` | In-app notifications |
| 49 | `audit_logs` | System-wide audit trail |
| 50 | `report_matches` | AI-suggested pet matches |
| 51 | `report_disputes` | Pet owner disputes |
| 52 | `owner_warnings` | Citations / violations with fines |
| 53 | `chat_threads` | Messaging threads (Report/Claim/Direct/Adoption) |
| 54 | `chat_messages` | Individual chat messages |
| 55 | `system_settings` | Feature flags and config |

### 2.2 Migration Approach

- **No Alembic** — no formal migration tool
- ~30 `ensure_*` functions in `main.py` run at every startup via raw SQL
- MySQL-specific (`INFORMATION_SCHEMA.COLUMNS`, `ALTER TABLE`)
- Idempotent (checks existence before adding)
- No rollback mechanism, no version tracking

### 2.3 Database Checklist

- [x] All tables have primary keys
- [x] Foreign keys defined for all relationships
- [x] Indexes on frequently queried columns (qr_token, email, etc.)
- [x] JSON columns for flexible data (boundary_polygon, ai_evidence, ownership_proof_urls)
- [x] Timestamps (created_at, updated_at) on core tables
- [x] Enum constraints on status fields
- [ ] **No Alembic or formal migration tool** — risky for production deployments
- [ ] **No rollback mechanism** for failed migrations
- [x] ~~Migrations are MySQL-specific~~ — not an issue: SQLite is only used by tests, which never run the startup migrations
- [ ] **Seed data in Database3.3.txt contains real email addresses** (tracked in git)
- [ ] **No database backup strategy documented**

---

## 3. Backend Audit

**Framework:** FastAPI
**ORM:** SQLAlchemy 2.0+
**File:** `backend/app/main.py` (1,537 lines)
**Route files:** 22
**Model files:** 20
**Utility files:** 17
**Schema files:** 19
**Test files:** 20+

### 3.1 Route Inventory (All Endpoints)

#### Auth (`/auth`) — 11 endpoints
| Method | Path | Auth | Rate Limit |
|--------|------|------|------------|
| GET | /auth/subdivisions | None | None |
| POST | /auth/login | None | 5/min |
| POST | /auth/google | None | None |
| POST | /auth/complete-profile | None | None |
| POST | /auth/verify-otp | None | None |
| POST | /auth/resend-otp | None | None |
| GET | /auth/verify-session | JWT | None |
| GET | /auth/verify-session/{user_id} | JWT | None |
| GET | /auth/me | JWT | None |
| POST | /auth/refresh | Cookie | None |
| POST | /auth/logout | Cookie/Header | None |

#### Users (`/users`) — 10 endpoints
| Method | Path | Auth | Rate Limit |
|--------|------|------|------------|
| GET | /users/positions/list | **None** | None |
| GET | /users/ | JWT | None |
| POST | /users/barangay/{id}/assign-head | Admin | None |
| GET | /users/{user_id} | JWT | None |
| POST | /users/ | **None** (public reg) | None |
| POST | /users/admin-create | Admin | None |
| PUT | /users/{user_id} | JWT | None |
| PATCH | /users/{user_id}/status | Staff/Admin | None |
| DELETE | /users/{user_id} | Admin | None |
| POST | /users/{user_id}/profile-picture | JWT | None |

#### Reports (`/reports`) — 17 endpoints
| Method | Path | Auth | Rate Limit |
|--------|------|------|------------|
| GET | /reports/admin-badge-counts | Staff/Admin | None |
| GET | /reports/ | **None** | None |
| GET | /reports/coverage-area | **None** | None |
| PUT | /reports/coverage-area | Staff/Admin | None |
| POST | /reports/analyze-media | JWT | 20/min |
| POST | /reports/ | JWT | None |
| GET | /reports/{report_id} | Optional JWT | None |
| PUT | /reports/{report_id} | JWT | None |
| PATCH | /reports/{report_id}/status | Staff/Admin | None |
| POST | /reports/{report_id}/media | JWT | None |
| POST | /reports/{report_id}/comments | JWT | None |
| GET | /reports/{report_id}/comments | **None** | None |
| POST | /reports/{report_id}/verify | JWT | None |
| POST | /reports/{report_id}/dispute | JWT | None |
| PATCH | /reports/{report_id}/dispute/{id} | Staff/Admin | None |
| POST | /reports/{report_id}/validate-images | JWT | None |
| DELETE | /reports/{report_id} | Admin | None |

#### Pets (`/pets`) — 20 endpoints
All require JWT auth. No rate limiting.

#### Rescue (`/rescue-requests`) — 7 endpoints
| Method | Path | Auth |
|--------|------|------|
| POST | /rescue-requests/ | Staff/Admin |
| GET | /rescue-requests/ | **None** |
| GET | /rescue-requests/report/{id} | **None** |
| GET | /rescue-requests/{id} | **None** |
| PATCH/PUT | /rescue-requests/{id} | Staff/Admin |
| PATCH | /rescue-requests/{id}/status | Staff/Admin |
| POST | /rescue-requests/assign-team | Staff/Admin |

#### Claims (`/claims`) — 6 endpoints
| Method | Path | Auth |
|--------|------|------|
| GET | /claims/ | **None** |
| GET | /claims/{id} | **None** |
| POST | /claims/ | JWT |
| POST | /claims/{id}/evidence | JWT |
| PATCH | /claims/{id}/status | JWT |
| DELETE | /claims/{id} | JWT |

#### Announcements (`/announcements`) — 10 endpoints
| Method | Path | Auth |
|--------|------|------|
| GET | /announcements/subdivision/{id} | **None** |
| GET | /announcements/barangay/{id} | **None** |
| PATCH | /announcements/{id}/status (1st) | **None** |
| GET | /announcements/feed/resident/{id} | **None** |
| POST | /announcements/{id}/comments | **None** |
| POST | /announcements/{id}/react | **None** |
| PUT | /announcements/{id} | **None** |
| POST | /announcements/ | Staff/Admin |
| DELETE | /announcements/{id} | JWT |
| PATCH | /announcements/{id}/status (2nd) | JWT |

#### Chat (`/chat`) — 14+ endpoints (all require JWT)
#### Matches (`/matches`) — 13 endpoints (JWT/Staff required)
#### Landmarks (`/landmarks`) — 8 endpoints (4 public, 4 auth)
#### Warnings (`/warnings`) — 8 endpoints (all JWT)
#### Notifications (`/notifications`) — all JWT
#### Audit Logs (`/audit-logs`) — Admin only
#### Pet QR (`/pet-qr`, `/pet/scan`) — mixed (scan is public)
#### Holding (`/holding`) — Staff/Admin
#### Adoptions (`/adoptions`) — mixed
#### Adoption Tasks — Staff/Admin
#### Adoption Certificates (`/certificates`) — public verify (30/min)
#### Report Returns (`/report-returns`) — 2 endpoints (JWT)
#### Pet Ownership (`/pet-ownership`) — 5 endpoints (JWT)

### 3.2 Backend Checklist

- [x] JWT auth with refresh token rotation
- [x] Token revocation blacklist
- [x] Role-based access control (4 roles)
- [x] Subdivision scoping for multi-tenant isolation
- [x] Password hashing with bcrypt
- [x] Government ID encryption (Fernet AES-256)
- [x] EXIF metadata stripping on uploads
- [x] Forensic watermarking on ID photos
- [x] Upload validation (extension, MIME, magic bytes, size)
- [x] SQL error sanitization in global exception handlers
- [x] Audit log system
- [x] Background tasks (unassigned report checker, AI backfill)
- [x] Case closure auto-close for rescue requests
- [x] Rate limiting on login (5/min) and media analysis (20/min)
- [ ] **Many endpoints missing auth** (see Security section)
- [ ] **Only 3 of 130+ endpoints have rate limiting**
- [ ] **OTP codes returned in API response (`dev_otp`)** — defeats OTP security
- [ ] **No email/SMS sending** — OTP delivery not implemented
- [ ] **Refresh cookie `secure=False`** — vulnerable over HTTP
- [ ] **`x-user-id` header trusted** in audit logging — forgeable
- [ ] **Duplicate route** for `PATCH /announcements/{id}/status` — unauthenticated version wins
- [ ] **`print()` statements** used for logging instead of structured logging
- [ ] **`opencv-python` used but not in requirements.txt**
- [ ] **No health check endpoint** (`/health` or `/ready`)
- [ ] **No API versioning** (`/api/v1/...`)
- [ ] **No request/response logging middleware**
- [ ] **SQLite .db files present** in backend directory (development artifacts)

---

## 4. Frontend Audit

**Framework:** React 19 + TypeScript 6 + Vite 8
**CSS:** Tailwind 4.2 + custom CSS (563 lines in index.css)
**State:** React Context + hooks (no global store)
**Icons:** Lucide React
**Maps:** Leaflet + react-leaflet
**QR:** html5-qrcode + jsqr

### 4.1 Page Inventory

| Portal | Pages | Key Features |
|--------|-------|--------------|
| Public | 9 | Landing, login, QR scan, adoption catalog, certificate verify |
| Resident | 8+ | Home feed, report stray, manage pets, claims, matches |
| Subdivision Leader | 15 | Dashboard, reports, pet records, claims, holding, alerts |
| Barangay Staff | 15 | Dashboard, rescue, reports, adoptions, holding, tasks |
| Admin | 9 | Dashboard, users, pets, reports, heatmap, warnings, logs |

### 4.2 Component Inventory

| Category | Count | Examples |
|----------|-------|---------|
| Navbars/Sidebars | 12 | AdminSidebar, BrgySidebar, ResiNavbar, ResiMobileNav |
| Modals | 19 | ConfirmationModal, QRScannerModal, AIMatchReviewModal |
| Chat | 4 | ReportChatDrawer, MessagesDrawer |
| Maps | 4 | MapComponent, HeatmapLayer, RoutingControl |
| Adoption | 4 | AdoptionCasePanel, CertificateDocument, StageStepper |
| Pet Records | 5 | PetTable, PetDetailPanel, AddPetModal |
| AI/ML | 3 | AISuggestionPanel, AIPotentialMatchesList, AiImageVerificationBadge |
| Auth | 2 | ProtectedRoute, InactivityManager |
| UI Primitives | 8+ | Button, DataTable, Dropdown, StatusBadge, MediaPreview |

### 4.3 Polling Intervals (No WebSocket/SSE)

| Component | Interval | Data |
|-----------|----------|------|
| SubdSidebar | **4s** | Report/claim counts |
| BrgySidebar | **4s** | Report/claim/adoption counts |
| ReportChatDrawer | 5s | Chat messages |
| SubdMessages / BrgyMessages | 5s | Thread list + messages |
| EndorsementArch | 5s | Documents |
| EscalatedMissions | 5s | Missions |
| ResiNavbar | 8s | Notifications |
| BrgyAdoptions | 8s | Adoption sync |
| MyAdoptionApplications | 8s | Application sync |
| BrgyNavbar | 10s | Notifications |
| useUnreadMessageCount | 10s | Chat thread unread |
| useAdoptionChatUnread | 10s | Adoption chat unread |
| BrgyHoldingFacility | 10s | Stay duration |
| AdminSidebar | 30s | Report counts |
| SubdNavbar | 30s | Notifications |
| AdminDashboard / BrgyDashboard | 30s | Dashboard stats |

**Concern:** A Brgy staff member has ~10+ simultaneous polling intervals, generating 5-10 API requests/second.

### 4.4 Frontend Checklist

- [x] Role-based route protection with server-side session verification
- [x] Token refresh with request queuing
- [x] Cross-tab inactivity management (30 min timeout)
- [x] Client-side upload validation mirroring backend rules
- [x] Image compression before upload (1920px max, 2MB target)
- [x] Responsive design with mobile-specific navbars
- [x] Capacitor Android integration
- [x] Dark mode support per portal
- [x] Per-user-per-portal theme isolation
- [x] Toast notification system with accessibility (`aria-live`, `role="alert"`)
- [x] Loading states with ARIA attributes
- [ ] **1,001 `any` type usages across 100 files** — weak TypeScript safety
- [ ] **TypeScript `strict` mode NOT enabled**
- [ ] **No frontend test suite** — zero testing dependencies
- [ ] **No form validation library** (no Zod, Yup, react-hook-form)
- [ ] **No client-side email regex validation** on registration
- [ ] **No password strength enforcement** on client side
- [ ] **Aggressive polling** (4s sidebar) — could stress backend
- [ ] **Fragile dark mode CSS** — 200+ `!important` overrides targeting Tailwind class names
- [ ] **Most modals lack `role="dialog"`** and focus trapping
- [ ] **No skip-to-content navigation link**
- [ ] **Deprecated `onKeyPress`** used in ~8 places (should be `onKeyDown`)
- [ ] **Leaflet map focus outlines suppressed** — breaks keyboard navigation
- [ ] **File typo:** `EscelatedMissions.tsx` should be `EscalatedMissions.tsx`
- [ ] **Duplicate route definitions** in AppRoutes.tsx
- [ ] **`@types/leaflet-routing-machine`** incorrectly in `dependencies` instead of `devDependencies`
- [ ] **Redundant QR libraries** — both `html5-qrcode` and `jsqr`
- [ ] **Inconsistent API patterns** — login pages use raw `fetch()`, everything else uses `api` Axios instance
- [ ] **No error boundary components** for graceful crash recovery

---

## 5. Security Audit

### 5.1 CRITICAL Issues

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S1 | **OTP codes returned in API response** (`dev_otp` field) | `auth.py` lines 197, 451, 519, 689 | Completely defeats OTP verification security. Anyone calling the API can read the OTP without email/SMS access. |
| S2 | **Weak admin/seed passwords** (`password123`) | `.env` lines 20-25 | Trivially guessable. Database root password is also `password`. |
| S3 | **Hardcoded password in frontend** (`password123`) | `AddPetModal.tsx` line 93 | Staff-created resident accounts get known password. |
| S4 | **Refresh cookie `secure=False`** | `auth.py` line 119 | Refresh token sent over HTTP, vulnerable to interception. |
| S5 | **Real API keys/secrets in `.env`** | `.env` | Cloudinary secret, Gemini key, JWT secret, encryption key all in one file. If ever committed to git history, permanently exposed. |

### 5.2 HIGH Issues

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S6 | **Unauthenticated endpoints exposing data** | Multiple routes | `GET /reports/`, `/rescue-requests/`, `/claims/` — all system data accessible without login |
| S7 | **Announcement modification without auth** | `announcements.py` | Anyone can POST comments, reactions, PUT updates, and PATCH status on announcements |
| S8 | **Public QR scan exposes owner PII** | `pet_qr.py` | Unauthenticated scan returns owner name, phone, email, address |
| S9 | **`x-user-id` header trusted for audit** | `audit.py` lines 22-28 | Clients can forge audit log attribution (the `get_actor_user` helpers in pets.py/matches.py also read it but are never called, so permissions are not affected) |
| S10 | **No email/SMS for OTP delivery** | `auth.py` | OTP system exists but has no delivery mechanism — only works via `dev_otp` API leak |
| S11 | **Duplicate route, both unauthenticated** | `announcements.py` lines 150, 398 | `PATCH /announcements/{id}/status` is defined twice and neither version requires login; `POST /{id}/media` is also open |

### 5.3 MEDIUM Issues

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S12 | **CORS allows all private IPs** | `main.py` | Any device on any private network can make authenticated requests |
| S13 | **Only 3 endpoints rate-limited** | Multiple routes | 130+ endpoints unprotected from brute force / abuse |
| S14 | **f-string SQL in migrations** | `main.py` ensure_* functions | Risky pattern; safe now but fragile |
| S15 | **Hardcoded fallback encryption key** | `id_security.py` line 53 | If env var missing, uses publicly visible fallback key |
| S16 | **No HTTPS enforcement** | Backend | No redirect from HTTP to HTTPS |
| S17 | **Hardcoded subdivision_id: 1** | `ResiHomePage.tsx` line 1414 | Demo/MVP shortcut still in code |

### 5.4 Security Checklist

- [x] JWT tokens with expiration
- [x] Token blacklist for logout
- [x] bcrypt password hashing
- [x] Government ID encryption (Fernet AES-256)
- [x] EXIF stripping on uploads
- [x] Magic byte validation on uploads
- [x] Double-extension attack prevention
- [x] SQL error message sanitization
- [x] Certificate verification with constant-time hash comparison
- [x] Signed ephemeral URLs for ID photos (5-min TTL)
- [ ] **Remove `dev_otp` from API responses** before production
- [ ] **Implement email/SMS OTP delivery**
- [ ] **Add auth to all data-reading endpoints**
- [ ] **Fix duplicate announcement status route**
- [ ] **Set refresh cookie `secure=True`** for HTTPS
- [ ] **Set refresh cookie `SameSite=Strict`**
- [ ] **Change default passwords** (admin, seed, database root)
- [ ] **Remove hardcoded password** from AddPetModal.tsx
- [ ] **Remove hardcoded fallback encryption key**
- [ ] **Add rate limiting** to critical endpoints (user creation, password change, OTP)
- [ ] **Don't trust `x-user-id` header** — always derive from JWT
- [ ] **Tighten CORS** for production (specific origins only)
- [ ] **Remove hardcoded subdivision_id: 1**
- [ ] **Add Content-Security-Policy headers**
- [ ] **Add HSTS headers**
- [ ] **Rotate all secrets** that may have been in git history

---

## 6. AI / ML Audit

### 6.1 YOLOv8 (Local Object Detection)

| Aspect | Details |
|--------|---------|
| Model | `yolov8n.pt` (nano — smallest, fastest) |
| Loading | Thread-safe singleton (`model_loader.py`) |
| Confidence | 0.35 threshold |
| Used for | Dog/cat detection in images, bounding box extraction for color analysis, video frame analysis |
| Risk | Model file (~6MB) tracked in git — binary in repo |

### 6.2 Google Gemini (Cloud AI)

| Aspect | Details |
|--------|---------|
| Models | `gemini-2.5-flash` → `gemini-flash-latest` → `gemini-flash-lite-latest` (cascading fallback) |
| Toggle | Global on/off via `system_settings` table (`gemini_vision_matching` key) |
| Rate handling | Catches 429 errors, falls back to next model |
| Cost | Per-call billing by Google; no usage caps in code |

### 6.3 AI Features

| Feature | File | Description |
|---------|------|-------------|
| Report Analysis | `ai_suggestions.py` | 14-field behavioral analysis from text + media |
| Animal Matching | `ai_matching.py` | Forensic biometric comparison (face, ears, coat, markings) |
| Photo Authenticity | `photo_checks.py` | AI-generated image detection |
| Duplicate Detection | `matches.py` | Same-animal detection within time/distance window |
| Rule-Based Fallback | `ai_suggestions.py`, `ai_matching.py` | Heuristic scoring when Gemini unavailable |

### 6.4 Matching Pipeline

```
Reports → Rule-based scoring (all candidates)
       → Top 10 candidates → Gemini Vision re-scoring
       → Results stored in report_matches table
```

Thresholds:
- Pet match minimum score: 50
- Duplicate minimum score: 65
- Duplicate radius: 1.5 km
- Duplicate time window: 7 days

### 6.5 AI Checklist

- [x] Thread-safe model loading
- [x] Multi-model fallback for Gemini quota errors
- [x] Global AI toggle (admin can disable)
- [x] Rule-based fallback when AI unavailable
- [x] AI-generated photo detection with 3-tier classification
- [x] Background task for matching (non-blocking)
- [x] Bilingual text analysis (English + Tagalog)
- [x] Removed example scores from Gemini prompts (honest outputs)
- [ ] **No Gemini usage cap / budget limit** — unbounded API costs
- [ ] **YOLOv8 model binary in git** — should use Git LFS or download on deploy
- [ ] **opencv-python not in requirements.txt** — video processing may fail on fresh install
- [ ] **No model versioning** — can't roll back to previous model
- [ ] **No AI output validation** — trusts Gemini JSON output without schema validation

---

## 7. Infrastructure & DevOps Audit

### 7.1 Environment

| Aspect | Status |
|--------|--------|
| Docker | **Not configured** — no Dockerfile or docker-compose |
| CI/CD | **Not configured** — no GitHub Actions, no pipeline |
| Deployment | Manual — `uvicorn` (backend) + `vite dev` (frontend) |
| HTTPS | Dev only via `@vitejs/plugin-basic-ssl` (self-signed) |
| Database backups | **Not configured** |
| Monitoring | **Not configured** — no APM, no health checks |
| Logging | `print()` statements, no structured logging |

### 7.2 Dev Server Configuration

| Setting | Value |
|---------|-------|
| Frontend | `http://0.0.0.0:5173` (Vite) |
| Backend | `http://127.0.0.1:8000` (uvicorn) |
| Proxy | Vite `/api` → backend port 8000 |
| HTTPS mode | `npm run dev:https` (self-signed, for phone camera/location) |
| Phone access | Requires Private network profile for Node.js in Windows Firewall |

### 7.3 File Structure Quality

| Aspect | Status |
|--------|--------|
| `.gitignore` | Covers `.env`, `node_modules`, `__pycache__`, `venv/` |
| `.env.example` | Exists with placeholder values |
| `CLAUDE.md` | **Missing** — no project-level config for AI assistants |
| `README.md` | Only default Vite template in frontend |
| Architecture docs | `architectural_design.txt`, `project_structure.txt` exist |

### 7.4 Notification System

| Channel | Status |
|---------|--------|
| In-app notifications | Working — database-backed, REST API |
| Email | **Not implemented** |
| SMS | **Not implemented** |
| Push notifications | **Not implemented** |
| WebSocket / SSE | **Not implemented** — all real-time uses polling |

### 7.5 Infrastructure Checklist

- [x] `.gitignore` properly excludes secrets
- [x] `.env.example` template exists
- [x] Vite proxy configured for dev
- [x] HTTPS dev mode for phone testing
- [x] Capacitor Android configuration
- [x] Background tasks for async processing
- [ ] **No Docker configuration** — no reproducible deployments
- [ ] **No CI/CD pipeline** — no automated testing or deployment
- [ ] **No production deployment guide**
- [ ] **No database backup strategy**
- [ ] **No health check endpoint**
- [ ] **No structured logging** (uses print statements)
- [ ] **No monitoring / APM**
- [ ] **No WebSocket** — aggressive polling instead
- [ ] **No email sending** (SMTP not configured)
- [ ] **No SMS gateway** integration
- [ ] **No push notification** service
- [ ] **No CLAUDE.md** project configuration
- [ ] **No README** with setup instructions
- [ ] **SQLite .db files** left in backend directory

---

## 8. Master Checklist

### Legend
- [x] = Done / Passing
- [ ] = Needs attention

---

### 8.1 Authentication & Authorization

- [x] JWT-based authentication with expiration
- [x] Refresh token rotation
- [x] Token blacklist for logout
- [x] bcrypt password hashing (cost factor default)
- [x] Role-based access control (4 roles)
- [x] Subdivision-scoped multi-tenancy
- [x] Session verification on route navigation
- [x] Inactivity auto-logout (30 min)
- [x] Cross-tab session management
- [ ] Remove `dev_otp` from API responses
- [ ] Implement real OTP delivery (email/SMS)
- [ ] Add auth to 20+ unauthenticated data endpoints
- [ ] Fix duplicate announcement status route (unauthenticated wins)
- [ ] Set refresh cookie `secure=True` + `SameSite=Strict`
- [ ] Stop trusting `x-user-id` header in audit logging
- [ ] Add Google Sign-In (planned)

### 8.2 Data Protection

- [x] Government ID encryption (Fernet AES-256)
- [x] EXIF metadata stripping
- [x] Forensic watermarking on ID photos
- [x] Signed ephemeral URLs for sensitive media (5-min TTL)
- [x] PII redaction for residents viewing matches
- [x] Masked ID display component
- [x] SQL error message sanitization
- [ ] Remove hardcoded `password123` from AddPetModal.tsx
- [ ] Remove hardcoded fallback encryption key
- [ ] Change all default passwords
- [ ] Add Content-Security-Policy headers
- [ ] Public QR scan should not expose full owner PII

### 8.3 Input Validation

- [x] Backend upload validation (extension, MIME, magic bytes, size)
- [x] Frontend upload validation mirroring backend
- [x] Image compression before upload
- [x] Double-extension attack prevention
- [x] Dangerous extension blacklist (35+ extensions)
- [x] Cloudinary URL validation
- [ ] Add client-side email validation
- [ ] Add client-side password strength requirements
- [ ] Add phone number format validation
- [ ] Consider adding a form validation library (Zod/react-hook-form)
- [ ] Add rate limiting to more endpoints

### 8.4 Frontend Quality

- [x] Role-based routing with guards
- [x] Responsive design (3,154 responsive class usages)
- [x] Mobile-specific navigation components
- [x] Dark mode with role-specific theming
- [x] Toast notification system
- [x] Loading states
- [x] Utility layer (api, cache, exports, etc.)
- [ ] Enable TypeScript `strict` mode
- [ ] Reduce 1,001 `any` type usages
- [ ] Add frontend testing (Vitest + Testing Library)
- [ ] Fix accessibility gaps (modal roles, focus trapping, skip nav)
- [ ] Replace deprecated `onKeyPress` with `onKeyDown`
- [ ] Refactor dark mode CSS (use Tailwind `dark:` variants)
- [ ] Fix duplicate route definitions
- [ ] Rename `EscelatedMissions.tsx` → `EscalatedMissions.tsx`
- [ ] Add error boundary components
- [ ] Move `@types/leaflet-routing-machine` to devDependencies
- [ ] Reduce polling frequency (4s sidebar → 15-30s)

### 8.5 Backend Quality

- [x] Pydantic v2 schemas for validation
- [x] Global exception handlers with error sanitization
- [x] Audit logging system
- [x] Background async tasks
- [x] Case closure auto-close hook
- [x] Multi-model AI fallback
- [ ] Add `opencv-python` to requirements.txt
- [ ] Replace `print()` with structured logging
- [ ] Add health check endpoint
- [ ] Add API versioning
- [ ] Consider proper migration tool (Alembic)
- [ ] Remove SQLite .db files from backend directory
- [ ] Add request/response logging middleware

### 8.6 AI / Machine Learning

- [x] Thread-safe YOLOv8 singleton
- [x] Gemini multi-model fallback
- [x] Admin toggle for AI features
- [x] Rule-based fallback scoring
- [x] AI-generated photo detection
- [x] Background matching (non-blocking)
- [x] Honest AI likelihood display (bands, not fake percentages)
- [ ] Add Gemini API usage cap / budget limit
- [ ] Move YOLOv8 model to Git LFS or download-on-deploy
- [ ] Add AI output schema validation
- [ ] Add model versioning strategy

### 8.7 Infrastructure & Deployment

- [x] `.gitignore` covers secrets
- [x] `.env.example` exists
- [x] Dev proxy configured
- [x] HTTPS dev mode for mobile testing
- [x] Capacitor Android setup
- [ ] Create Dockerfile + docker-compose
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Write production deployment guide
- [ ] Implement database backup strategy
- [ ] Add structured logging + monitoring
- [ ] Implement WebSocket for real-time (replace polling)
- [ ] Set up email sending (Gmail SMTP — in progress)
- [ ] Set up SMS gateway
- [ ] Write project README with setup instructions
- [ ] Create CLAUDE.md project configuration

### 8.8 Testing

- [x] 20+ backend test files exist (SQLite + TestClient)
- [ ] No frontend tests at all
- [ ] No end-to-end tests
- [ ] No load/performance tests
- [ ] No CI test runner
- [ ] Consider adding Vitest for frontend unit tests
- [ ] Consider Playwright/Cypress for E2E tests

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Database tables | 55 |
| Backend endpoints | ~130+ |
| Backend route files | 22 |
| Backend model files | 20 |
| Backend utility files | 17 |
| Backend test files | 20+ |
| Frontend pages | ~56 |
| Frontend components | ~60+ |
| Frontend utility files | 18 |
| Frontend test files | 0 |
| Lines in reports.py | 5,310 |
| Lines in main.py | 1,537 |
| `any` type usages | 1,001 |
| Polling intervals | 16+ |
| Endpoints without auth | ~20+ |
| Endpoints with rate limiting | 3 |
| Critical security issues | 5 |
| High security issues | 6 |
| Medium security issues | 6 |
| Checklist items passing | 52 |
| Checklist items needing work | 58 |

---

*Generated by Claude Opus 4.6 — 2026-10-05*
