# System overview

Status: Current (baseline written 2026-10-25 from repository evidence; items marked **Unverified** or **Unknown** were not established)

StraySafe 2.0 is a web and Android application for managing stray and lost animals in a community: residents report sightings, local officers verify and dispatch rescues, animals are held and either returned to an owner or, if unclaimed after the stay limit, impounded. Adoption was removed on 2026-10-28 (not approved by the panel). It is a capstone project; the only documented deployment is a local development setup (see [Operations](../05-operations/README.md)).

## Boundary

| Part | Technology | Evidence |
|---|---|---|
| Web client | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Leaflet / React-Leaflet, Axios | `frontend/package.json` |
| Android app | The same web build wrapped with Capacitor 8 (`appId com.straysafe.app`); debug APK built by GitHub Actions | `frontend/capacitor.config.ts`, `.github/workflows/build-apk.yml` |
| API | FastAPI (Python 3.12+), SQLAlchemy 2, Pydantic 2, PyJWT, Passlib/bcrypt, slowapi rate limiting | `backend/requirements.txt`, `backend/app/main.py` |
| AI worker | Separate process (`python -m app.ai_worker`) that runs YOLOv8 (Ultralytics), Google Gemini and attribute scoring from a job queue; the API falls back to running jobs itself if the worker is down | `backend/app/ai_worker.py`, `backend/app/utils/ai_jobs.py`, [AI_TECHNOLOGIES](AI_TECHNOLOGIES.md) |
| Database | MySQL through PyMySQL; the schema is created by SQLAlchemy `create_all` at startup, plus hand-run scripts in `backend/scripts/` | `backend/app/database/session.py`, `backend/app/main.py` (`Base.metadata.create_all`) |
| Media | Cloudinary (photos, video, documents). Some code paths still read a local `backend/uploads/` folder, which the API serves at `/uploads` | `backend/app/utils/cloudinary_config.py`, `backend/app/main.py` |
| Background jobs | In-process asyncio tasks started in the API lifespan: a watcher, an AI-suggestion backfill, an email queue and a push queue | `backend/app/main.py` (`lifespan`) |

## Users and roles

Role ids are stored on `users.role_id` and checked in the API (`backend/app/utils/auth.py`).

| Role id | Role | Scope |
|---|---|---|
| 1 | Resident | Own reports, pets and claims; public map data without private reports |
| 2 | Subdivision Leader | Reports of their own subdivision; verification, assignment, merge, visibility, endorsement and dispute decisions |
| 3 | Barangay Staff (one may be Head Officer) | Endorsed reports, rescue dispatch, holding facility, claims, impoundment, personnel |
| 4 | Administrator | System-wide access, user and staff accounts, settings (including the reporting radius), audit logs, analytics |
| none | Public visitor | Landing page, pet QR scan page |

Authorization is enforced in the backend (subdivision and barangay scope checks); the frontend routes use `ProtectedRoute` and the same role ids. Whether every endpoint enforces scope is **Unverified** (no full authorization review has been done; see [Testing](../04-testing/README.md)).

## Main capabilities (as implemented)

- Stray and lost-animal **reports** with photos or video, location (geofenced to a configurable reporting radius), priority, status timeline, disputes, multi-animal split, and report visibility rules.
- **AI assistance** that only suggests (animal present, photo authenticity, colour/breed/size, risk, duplicate sightings, look-alike pet matches); staff confirm.
- **Rescue and holding**: dispatch, holding facility records, care logs, stay limits; after the stay limit the only outcome offered is impoundment.
- **Pet registry** with QR tags, scan history, ownership requests and records access.
- **Claims and reunification** with proof and evidence review.
- **Communication**: chat, announcements, notifications, email (SMTP or Resend), web push.
- **Analytics** dashboards for administrators and subdivision leaders ([ANALYTICS_SPECIFICATION](ANALYTICS_SPECIFICATION.md)).

## External services

Google Gemini (AI), Cloudinary (media), an email service (SMTP, or Resend when `RESEND_API_KEY` is set), Google Sign-In, OpenStreetMap tiles and Nominatim (maps and addresses), the public OSRM server (directions), and browser/Web Push. Several are quota-limited free services; the Gemini free quota is noted in [AI_TODO](../03-development/AI_TODO.md).

## Data and sessions

- **Authentication:** JWT access tokens (60 minutes) plus rotating refresh tokens in an httpOnly cookie, with per-role lifetimes; the installed app uses a header instead of the cookie. Revoked tokens are stored in the database. Evidence: `backend/app/utils/auth.py`, `backend/app/routes/auth.py`, `backend/tests/test_session_security.py`, `backend/tests/test_app_stay_signed_in.py`.
- **Audit:** an `audit_logs` table records actor, action, target, IP and old/new values.
- **Database design records:** [ERD](ERD/00_ERD_MODULE_OVERVIEW.md), [DFD](DFD/00_DFD_OVERVIEW.md), and `Database3.3.txt` at the repository root. Whether `Database3.3.txt` matches the ORM models is **Unverified** (the file has uncommitted changes).

## Known gaps in the current record

- No Dockerfile, hosting configuration, or CI for the backend exists; the only workflow builds the APK.
- Older root notes disagree with the code and should not be used as sources: `tech_stack_details.txt` (names Cloudflare R2, OpenRouter/Groq and PostgreSQL), `architectural_design.txt` (names Jose and a `routers/` / `core/` layout), and `setup.md` (names `STRAYSAFE_DB_URL` and `Database.txt`; the code reads `DATABASE_URL`). See [project decisions](../02-project/README.md).
- Security headers (CSP, `X-Frame-Options`, HSTS) are not set by the API (none found in `backend/app`); a front proxy might add them. **Unverified** for any deployment.

## Authoritative sources

When documents disagree, trust in this order: code and configuration in the repository, then tests, then this folder, then the other notes under `docs/`.
