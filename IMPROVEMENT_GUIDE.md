# StraySafe 2.0 — Improvement Guide (What to Fix, In What Order)

**Date:** 2026-10-05
**Based on:** [STRAYSAFE_SYSTEM_AUDIT.md](STRAYSAFE_SYSTEM_AUDIT.md), with the top findings re-checked against the code.

Work top to bottom. Each step is small enough to finish and test in one sitting.
Effort: **S** = under 30 min, **M** = 1–3 hours, **L** = half a day or more.

---

## Before you start: take a backup

| # | Task | Effort |
|---|------|--------|
| 0 | Dump the live database before touching anything: `mysqldump -u root -p straysafe_db > backups/straysafe_db_2026-10-05.sql`. Add `backups/` to `.gitignore`. Repeat before every step that changes data or auth. | S |

If a step breaks something, restore with `mysql -u root -p straysafe_db < backups/<file>.sql`.

---

## Step 1 — Close the open doors (security, all small)

These let anyone, without logging in, read or change data. Fix them first: each is a few lines, and together they close the biggest gaps.

| # | Task | Where | Effort |
|---|------|-------|--------|
| 1.1 | **Lock down announcements.** These routes have no login check: `PATCH /{id}/status` (defined **twice**, lines 150 and 398, both unauthenticated), `PUT /{id}` (line 441), `POST /{id}/media` (line 290), `POST /{id}/comments` (line 318), `POST /{id}/react` (line 359). Delete one of the duplicate status routes. Add `get_current_staff_or_admin` to status/edit/media, and `get_current_user` to comments/react (use the logged-in user as the author instead of trusting the request body). | `backend/app/routes/announcements.py` | M |
| 1.2 | **Require login to read cases.** Add `get_current_user` and subdivision scoping to `GET /reports/`, `GET /reports/{id}/comments`, `GET /rescue-requests/` (+ `/{id}`, `/report/{id}`), `GET /claims/` (+ `/{id}`). Check every page that calls these still works after the change. | `reports.py`, `rescue.py`, `claims.py` | M |
| 1.3 | **Remove the hardcoded `password123`** for staff-created resident accounts. Generate a random temporary password on the backend, or skip creating an account (Assign Owner already supports owners without accounts). Remove the "Default password: password123" hint in the UI. | `frontend/src/components/PetRecords/AddPetModal.tsx` lines 93, 414, 1428 | S |
| 1.4 | **Remove the hardcoded encryption-key fallback.** If `SECRET_KEY`/`JWT_SECRET_KEY` is missing, fail at startup instead of using `"straysafe_default_secure_salt_key_2026"`. | `backend/app/utils/id_security.py` line 53 | S |
| 1.5 | **Stop trusting the `X-User-Id` header.** Remove the interceptor in `frontend/src/main.tsx` (lines 9–37), make `log_activity()` take the actor only from the logged-in user, and delete the unused `get_actor_user` helpers. | `backend/app/utils/audit.py`, `pets.py` line 305, `matches.py` line 276 | S |

**Test after Step 1:** log in as each of the 4 roles and click through home, reports, announcements, claims and rescue. Then call `GET /reports/` without a token and confirm you get a 401.

---

## Step 2 — Make OTP real (Gmail SMTP)

Right now the OTP code is sent back in the API response (`dev_otp`), so anyone can verify any email. Fix delivery first, then remove the leak.

| # | Task | Where | Effort |
|---|------|-------|--------|
| 2.1 | Create the StraySafe Gmail account, turn on 2-Step Verification, create an **App Password**. Add `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` to `.env` and `.env.example` (placeholders only). | `.env` | S |
| 2.2 | Add a small `send_email()` helper using Python's built-in `smtplib`. Send the OTP email from the 4 places that generate OTPs. Run sending as a background task so the request isn't slowed down. | new `backend/app/utils/email.py`, `routes/auth.py` lines 196, 450, 519, 689 | M |
| 2.3 | **Remove `dev_otp`** from responses and from the schemas. Optional: keep it only when an `APP_ENV=development` variable is set. | `routes/auth.py`, `schemas/auth.py` lines 33, 67 | S |
| 2.4 | Add rate limits to `/auth/verify-otp` and `/auth/resend-otp` (e.g. 5/minute) and to public registration `POST /users/`. | `routes/auth.py`, `routes/users.py` | S |

**Test:** register with a real email, receive the code, verify. Wrong code 6 times should be blocked.

---

## Step 3 — Google Sign-In

You already have `/auth/google`, `/auth/complete-profile` and the OTP screens, so this is mostly configuration and checking the Google token properly.

| # | Task | Effort |
|---|------|--------|
| 3.1 | In Google Cloud Console (using the StraySafe Gmail account), create an OAuth Client ID (Web). Add your dev origins: `http://localhost:5173`, and your LAN `https://<ip>:5173` if you test on a phone. | S |
| 3.2 | Make the backend **verify the Google ID token** (`google-auth` library, `id_token.verify_oauth2_token`) rather than trusting the email/name the browser sends. Check `/auth/google` for this specifically. | M |
| 3.3 | Use the official Google Identity Services button on the login page. Put `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` in `.env`. | M |

---

## Step 4 — Quick performance and cleanup wins

| # | Task | Where | Effort |
|---|------|-------|--------|
| 4.1 | **Slow down polling.** Sidebars poll every 4 seconds; change to 30s. Navbars at 8–10s → 20–30s. Chat drawers can stay at 5s while open. | `SubdSidebar.tsx` line 90, `BrgySidebar.tsx` line 112, `ResiNavbar.tsx` line 167, `BrgyNavbar.tsx` line 95 | S |
| 4.2 | Skip polling while the browser tab is hidden (`document.visibilityState`). | same files | S |
| 4.3 | Add `opencv-python-headless` to `requirements.txt` (video analysis imports it). | `backend/requirements.txt` | S |
| 4.4 | Add `GET /health` returning `{"status": "ok"}` plus a DB ping, for demos and future deployment. | `backend/app/main.py` | S |
| 4.5 | Delete or ignore the stray SQLite files `backend/straysafe.db` and `backend/stray_safe.db`. | — | S |

---

## Step 5 — Before your defense / any real deployment

| # | Task | Effort |
|---|------|--------|
| 5.1 | Change `ADMIN_PASSWORD`, `SEED_PASSWORD` and the MySQL root password from `password123`/`password`. | S |
| 5.2 | Make the refresh cookie `secure` depend on HTTPS (env var `COOKIE_SECURE=true` in production). | `backend/app/utils/auth.py` line 119 | S |
| 5.3 | Restrict CORS to your real domain(s) in production instead of every private IP range. | `backend/app/main.py` | S |
| 5.4 | Replace the 3 real Gmail addresses in `Database3.3.txt` with `@straysafe.test` placeholders if the repo is public or shared (update `.env` to match). | S |
| 5.5 | Write a short `README.md`: setup, `.env` keys, how to run backend/frontend/phone mode, how to back up and restore. | M |
| 5.6 | Rotate the Cloudinary secret, Gemini key and JWT secret if `.env` was ever committed or shared. | S |

---

## Step 6 — Quality improvements (do when the features are stable)

| # | Task | Effort |
|---|------|--------|
| 6.1 | Replace `print()` with Python `logging` in the backend. | M |
| 6.2 | Accessibility: `role="dialog"` + `aria-modal` on all modals, Escape to close, replace deprecated `onKeyPress` (~8 places). | M |
| 6.3 | Add a React error boundary so one crashing page doesn't blank the whole app. | S |
| 6.4 | Fix duplicate routes in `frontend/src/routes/AppRoutes.tsx` (`/adopt/journey/:id`, `/brgy/adoptions`). | S |
| 6.5 | Rename `EscelatedMissions.tsx` → `EscalatedMissions.tsx`. | S |
| 6.6 | Add a daily cap on Gemini calls (counter in `system_settings`) to avoid surprise costs. | M |
| 6.7 | Reduce `any` types file by file, starting with the shared utils, then the biggest pages. | L |

---

## Not now (revisit after the thesis)

These are real, but the cost is high and the benefit only shows up in long-term production:

- **Alembic migrations / rollback.** Your startup `ensure_*` migrations are safe to re-run; the backup in Step 0 covers rollback for now.
- **TypeScript `strict` mode across the whole app.**
- **WebSockets instead of polling.** Step 4.1–4.2 removes most of the load.
- **Docker, CI/CD, frontend test suite, E2E tests.**
- **SMS gateway / push notifications.**

---

## Corrections to the audit

Found while re-checking the code for this guide:

- **Announcements is worse than listed.** Both `PATCH /{id}/status` definitions are unauthenticated (the audit said the second one required login), and `POST /{id}/media` is also open.
- **`X-User-Id` impersonation is limited.** The `get_actor_user` helpers in `pets.py` and `matches.py` are not called anywhere, so the forged header only affects audit-log attribution, not permissions.
- **"Migrations are MySQL-specific"** doesn't affect you. SQLite is only used by test scripts, which create tables directly and never run the startup migrations.

---

## Progress checklist

- [ ] 0 — Database backup taken
- [ ] 1.1 — Announcements locked down
- [ ] 1.2 — Report / rescue / claim reads require login
- [ ] 1.3 — Hardcoded `password123` removed
- [ ] 1.4 — Encryption-key fallback removed
- [ ] 1.5 — `X-User-Id` header no longer trusted
- [ ] 2.1 — Gmail account + App Password in `.env`
- [x] 2.2 — OTP emails sending (code done; needs `SMTP_PASSWORD`)
- [x] 2.3 — `dev_otp` removed
- [x] 2.4 — OTP / registration rate limits
- [ ] 3.1 — Google OAuth client created (Client ID pasted into `.env`)
- [x] 3.2 — Backend verifies Google ID token
- [x] 3.3 — Google button on login page (appears once the Client ID is set)

Details and remaining login/email issues: [AUTH_EMAIL_SECURITY_AUDIT.md](audit%20report%20and%20remediation/AUTH_EMAIL_SECURITY_AUDIT.md)
- [ ] 4.1 — Polling slowed
- [ ] 4.2 — Polling paused on hidden tabs
- [ ] 4.3 — opencv added to requirements
- [ ] 4.4 — `/health` endpoint
- [ ] 4.5 — Stray SQLite files removed
- [ ] 5.1 — Default passwords changed
- [ ] 5.2 — Secure cookie in production
- [ ] 5.3 — CORS tightened for production
- [ ] 5.4 — Seed emails replaced (if repo is shared)
- [ ] 5.5 — README written
- [ ] 5.6 — Secrets rotated (if exposed)
- [ ] 6.1 – 6.7 — Quality improvements
