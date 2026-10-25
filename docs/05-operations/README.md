# Operations

Status: Current for local development; **no production operations exist yet** (baseline written 2026-10-25 from repository evidence)

Only a local development setup is documented and has been used. Hosting, monitoring, incident response and recovery for a public deployment are planned in [DEPLOYMENT_GUIDE](../../DEPLOYMENT_GUIDE.md) and are **not started**.

## Setup (local)

The step-by-step instructions are in [setup.md](../../setup.md). Verified against the code on 2026-10-25, these parts of it are **stale**: it tells you to set `STRAYSAFE_DB_URL` (the API reads `DATABASE_URL`) and to import `Database.txt` (the schema file in the repository is `Database3.3.txt`; the API also creates missing tables itself at startup with `create_all`). Follow `setup.md` for the Python, Node and phone-testing steps, and use the names below for configuration.

| Item | Requirement | Evidence |
|---|---|---|
| Python | 3.12+ in a root `.venv`; `pip install -r backend/requirements.txt` | `setup.md`, `backend/requirements.txt` |
| Node | 20+ (the APK workflow uses 22); `npm install` in `frontend/` | `setup.md`, `.github/workflows/build-apk.yml` |
| MySQL | Local server and an empty database; schema from `Database3.3.txt` or created by the API at startup | `backend/app/database/session.py`, `backend/app/main.py` |
| Configuration | One root `.env` (git-ignored; the frontend reads it too through `envDir: '../'`); a template is `.env.example` | `.gitignore`, `frontend/vite.config.ts` |

### Configuration names

Values are never recorded here. `.env.example` lists the names it knows; the code reads more, so a deployment needs the second list as well.

- **In `.env.example`:** `DATABASE_URL` (or `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`), `JWT_SECRET_KEY`, `SECRET_KEY`, `CLOUDINARY_*`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `SMTP_*`, `OTP_DEBUG`, `COOKIE_SECURE`, `VAPID_*`, `AI_WORKER_EMBEDDED`, seed-account names, and the browser-side `VITE_*` values.
- **Read by the code but missing from `.env.example`:** `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `ID_ENCRYPTION_KEY`, `RESEND_API_KEY`, `GEMINI_TIMEOUT_SECONDS`, `GEMINI_TOTAL_BUDGET_SECONDS`, `AI_TORCH_THREADS`, `AI_IMAGE_CACHE_DIR`, `AI_JOB_FILES_DIR`, `AI_JOB_STALE_MINUTES`, `AI_FOLLOW_UP_DELAY_SECONDS`, `REPORTS_DEFAULT_PAGE_SIZE`, `REPORTS_MAX_PAGE_SIZE`, `SMTP_FROM_EMAIL`, `VAPID_SUBJECT`. Evidence: `grep os.getenv backend/app`.
- `ID_ENCRYPTION_KEY` protects stored identity data. Losing it makes that data unreadable. Its backup is **Unverified** (it is not described anywhere in the repository).

## Run (local)

Three processes ([setup.md](../../setup.md)):

1. API: from `backend/`, `..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000` (add `--reload` while coding).
2. AI worker: from `backend/`, `..\.venv\Scripts\python.exe -m app.ai_worker`. If it is not running, the API runs AI jobs itself, more slowly (`AI_WORKER_EMBEDDED` controls this).
3. Web client: from `frontend/`, `npm run dev`, or `npm run dev:https` for phones (camera, QR scanner and GPS need https). The dev server forwards `/api/*` to port 8000.

Seed accounts: `backend/scripts/seed_admin.py` (account names and the shared password it prints come from `setup.md` and `.env`; do not use them outside local development).

## Validate (local)

Only commands that exist in the repository:

| Check | Command | Notes |
|---|---|---|
| Frontend type check and build | `npm --prefix frontend run build` | runs `tsc -b` then `vite build`; the large-bundle warning is known |
| Frontend lint | `npm --prefix frontend run lint` | ESLint; last result **Unverified** |
| Backend tests | `.venv\Scripts\python.exe backend/tests/<file>.py` | each file is a standalone script that checks itself; there is no test runner or aggregate command |
| Frontend unit and browser checks | `node frontend/tests/<file>.test.mjs` and `<file>.browser.mjs` | the browser ones need Vite on port 5173 and local Chrome |
| Documentation | `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` | no side effects |

Backend tests use throwaway SQLite files, not the application database. Do not point a test at the live database. A full run of all 95 backend test scripts has not been recorded.

## Build and release

- **Android app:** [`.github/workflows/build-apk.yml`](../../.github/workflows/build-apk.yml) builds a **debug** APK on manual run and on pushes that change `frontend/`. It needs the repository variable `VITE_API_BASE_URL` and the secrets for the browser-side keys. The APK is an artifact kept for 30 days. A signed release build and store publishing: **none**.
- **Web client and API:** no pipeline, container image or hosting configuration exists in the repository. Release is **manual and undocumented** beyond [DEPLOYMENT_GUIDE](../../DEPLOYMENT_GUIDE.md) (a plan).
- **Branching:** work is merged through pull requests (up to #92 on 2026-10-24). Branch protection and required checks: **Unverified** (a GitHub setting, not visible in the repository).

## Observability

| Capability | State | Evidence |
|---|---|---|
| Application logs | Python `logging` and `print` to the process output; no log shipping | `grep logging backend/app` |
| Audit trail | `audit_logs` table (actor, action, target, IP, user agent, old/new values) and an admin view | `backend/app/models/audit_log.py`, `backend/app/routes/audit_logs.py` |
| AI queue | `GET /admin/ai-jobs` shows queued and stale jobs | `backend/app/routes/ai_jobs.py` |
| Health check | None dedicated; `GET /` returns a welcome message | `backend/app/main.py` |
| Metrics, alerts, error tracking | **None found** | no configuration in the repository |
| Error responses | Sensitive database error text is masked before it reaches the client | `backend/app/main.py` (`SENSITIVE_ERROR_KEYWORDS`) |

## Incident response

**None documented.** There is no on-call contact, severity scale or runbook in the repository. The first useful entries to write, once a deployment exists: how to revoke sessions (tokens are stored in `revoked_tokens`), rotate `JWT_SECRET_KEY` (this signs everyone out), and disable email, push or AI when a provider fails.

## Backup and recovery

**No automated backup exists.** The database and the local `backend/uploads/` folder live on one development machine.

- Planned procedure before any deployment: [DEPLOYMENT_GUIDE](../../DEPLOYMENT_GUIDE.md), phase 0 (database dump, uploads copy, `.env` copy including `ID_ENCRYPTION_KEY`, a commit).
- Restore procedure: **not written and not tested**.
- Data-repair scripts in `backend/scripts/` (for example `repair_adopted_animal_whereabouts.py`, `backfill_*`) change live data. Take a dump first and read the script before running it.
- Media on Cloudinary has no undo outside Cloudinary's own account settings (**Unverified**).

## Agent operations

- [Change freeze guide](agents/CHANGE_FREEZE_GUIDE.md)
- [Feature updates and change records](agents/feature-updates/README.md)
- Agent rules: [AGENTS.md](../../AGENTS.md) (change records ON, freeze OFF at the time of writing)
