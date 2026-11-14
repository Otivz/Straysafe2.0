# System overview

Status: Current (baseline written 2026-10-25 from repository evidence; items marked **Unverified** or **Unknown** were not established)

StraySafe 2.0 is a web and Android application for managing stray and lost animals in a subdivision: residents report sightings, the Subdivision Leader verifies and manages each case, matches lost and found animals with the owners' confirmation, and records referrals to the Barangay (which works outside StraySafe). Rescue dispatch, the holding place, adoption and the old claim and fee handling were retired on 2026-11-10. It is a capstone project; the only documented deployment is a local development setup (see [Operations](../05-operations/README.md)).

## Boundary

| Part | Technology | Evidence |
|---|---|---|
| Web client | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Leaflet / React-Leaflet, Axios | `frontend/package.json` |
| Android app | The same web build wrapped with Capacitor 8 (`appId com.straysafe.app`); debug APK built by GitHub Actions | `frontend/capacitor.config.ts`, `.github/workflows/build-apk.yml` |
| API | FastAPI (Python 3.12+), SQLAlchemy 2, Pydantic 2, PyJWT, Passlib/bcrypt, slowapi rate limiting | `backend/requirements.txt`, `backend/app/main.py` |
| AI worker | Separate process (`python -m app.ai_worker`) that runs YOLOv8 (Ultralytics), Google Gemini and attribute scoring from a job queue; the API falls back to running jobs itself if the worker is down | `backend/app/ai_worker.py`, `backend/app/utils/ai_jobs.py`, [AI_TECHNOLOGIES](../AI_TECHNOLOGIES.md) |
| Database | MySQL through PyMySQL; the schema is created by SQLAlchemy `create_all` at startup, plus hand-run scripts in `backend/scripts/` | `backend/app/database/session.py`, `backend/app/main.py` (`Base.metadata.create_all`) |
| Media | Cloudinary (photos, video, documents). Some code paths still read a local `backend/uploads/` folder, which the API serves at `/uploads` | `backend/app/utils/cloudinary_config.py`, `backend/app/main.py` |
| Background jobs | In-process asyncio tasks started in the API lifespan: a watcher, an AI-suggestion backfill, an email queue and a push queue | `backend/app/main.py` (`lifespan`) |

## Users and roles

Role ids are stored on `users.role_id` and checked in the API (`backend/app/utils/auth.py`).

| Role id | Role | Scope |
|---|---|---|
| 1 | Resident | Own reports, pets and ownership claims; public map data without private reports |
| 2 | Subdivision Leader | Reports of their own subdivision; verification, case work, referrals, merge, visibility, matching and dispute decisions |
| 3 | Barangay Staff | Retired: no sign-in (the Barangay is contacted outside StraySafe); old accounts stay as records |
| 4 | Administrator | **Reserved for a future implementation:** no Admin account is seeded in the clean database and none is needed for current development. In the application, Subdivision Leader accounts can only be provisioned by an Admin; the first Leader of the local development database was created once by a local bootstrap script instead ([details](../05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md)). In the code: system-wide access, user and staff accounts, settings (including the reporting radius), audit logs, analytics |
| none | Public visitor | The Resident app's welcome, sign-in and sign-up screens (every other web address redirects there) |

Authorization is enforced in the backend (subdivision and barangay scope checks); the two interfaces guard their own routes by role (`RequireAuth` in `frontend/src/resident` and `frontend/src/admin`; a role that signs in at the wrong address is refused and its session closed). Whether every endpoint enforces scope is **Unverified** (no full authorization review has been done; see [Testing](../04-testing/README.md)).

## Main capabilities (as implemented)

- Stray and lost-animal **reports** with photos or video, location (geofenced to a configurable reporting radius), priority, status timeline, disputes, multi-animal split, and report visibility rules.
- **AI assistance** that only suggests (animal present, photo authenticity, colour/breed/size, risk, duplicate sightings, look-alike pet matches); staff confirm.
- **Manual matching**, which works with Gemini on or off: staff search and compare reports and registered pets, with no similarity scores. Registered-pet matches are owner-first: the owner must answer YES before staff can make the final decision ([MANUAL_REPORT_MATCHING](MANUAL_REPORT_MATCHING.md)).
- **Referrals**: the leader records referrals to the Barangay or another organisation and its outside updates ([BARANGAY_REFERRAL_LOG](BARANGAY_REFERRAL_LOG.md)). No rescue dispatch, holding place or custody is kept in StraySafe.
- **Pet registry** with ownership requests and records access. (The pet QR tags and their scan history were retired on 2026-11-09.)
- **Ownership claims and reunification** with proof and evidence review; the owner return (who the animal went back to, with the handover photo) is the authoritative record ([OWNER_WARNING_RULES](OWNER_WARNING_RULES.md) and the case workflow in [CASE_WORKFLOW_BACKEND](CASE_WORKFLOW_BACKEND.md)). The old pet-claim, claiming-fee and fine handling was retired; fines for a 3rd offense are now recorded under complaint management (amount from the confirmed rule; no payments in StraySafe).
- **Complaint management and progressive enforcement**: animal complaints stay cases; the Leader verifies, names the rule and confirms the person responsible with evidence; offenses are counted per person and per rule (suggested by StraySafe, confirmed by the Leader); letters with delivery tracking, the office summons, the fine and the Barangay meeting; owner leads; the complainant's private suggestion of the owner ([COMPLAINT_MANAGEMENT](COMPLAINT_MANAGEMENT.md)).
- **Owner observation and warnings**: 3-day owner observation with one extension; leader-only warnings to the pet's actual owner; verbal warnings for owners without an account; repeat incidents; leader identity verification ([OWNER_FOLLOWUP_RULES](OWNER_FOLLOWUP_RULES.md), [OWNER_WARNING_RULES](OWNER_WARNING_RULES.md)). Observation events appear on the report timeline without owner details ([ACTIVITY_TIMELINE_RULES](ACTIVITY_TIMELINE_RULES.md)).
- ~~Adoption pipeline~~ Retired 2026-11-10: adoption is handled by the Barangay outside StraySafe.
- **Communication**: chat, announcements, notifications, email (SMTP or Resend), web push.
- **Analytics** dashboards for administrators and subdivision leaders ([ANALYTICS_SPECIFICATION](../../ANALYTICS_SPECIFICATION.md)).

## External services

Google Gemini (AI), Cloudinary (media), an email service (SMTP, or Resend when `RESEND_API_KEY` is set), Google Sign-In, OpenStreetMap tiles and Nominatim (maps and addresses), the public OSRM server (directions), and browser/Web Push. Several are quota-limited free services; the Gemini free quota is noted in [AI_TODO](../../AI_TODO.md).

## Data and sessions

- **Authentication:** JWT access tokens (60 minutes) plus rotating refresh tokens in an httpOnly cookie, with per-role lifetimes; the installed app uses a header instead of the cookie. Revoked tokens are stored in the database. Evidence: `backend/app/utils/auth.py`, `backend/app/routes/auth.py`, `backend/tests/test_session_security.py`, `backend/tests/test_app_stay_signed_in.py`.
- **Audit:** an `audit_logs` table records actor, action, target, IP and old/new values.
- **Database design records:** [ERD](../ERD/00_ERD_MODULE_OVERVIEW.md), [DFD](../DFD/00_DFD_OVERVIEW.md), and `Database3.4_subdivision.sql` at the repository root (its 51 tables were compared with the models on 2026-11-10; the older `Database3.3.*` snapshots were retired).

## Known gaps in the current record

- No Dockerfile, hosting configuration, or CI for the backend exists; the only workflow builds the APK.
- Older root notes disagree with the code and should not be used as sources: `tech_stack_details.txt` (names Cloudflare R2, OpenRouter/Groq and PostgreSQL), `architectural_design.txt` (names Jose and a `routers/` / `core/` layout), and `setup.md` (names `STRAYSAFE_DB_URL` and `Database.txt`; the code reads `DATABASE_URL`). See [project decisions](../02-project/README.md).
- Security headers (CSP, `X-Frame-Options`, HSTS) are not set by the API (none found in `backend/app`); a front proxy might add them. **Unverified** for any deployment.

## Authoritative sources

When documents disagree, trust in this order: code and configuration in the repository, then tests, then this folder, then the root-level notes.
