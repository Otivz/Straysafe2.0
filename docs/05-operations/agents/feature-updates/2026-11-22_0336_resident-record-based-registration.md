# Resident record-based registration with e-mailed code

- **Date:** 2026-11-22 03:36 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/models/resident_registry.py`, `backend/app/models/__init__.py`, `backend/app/db_migrations/resident_registry.py`, `backend/migrations/2026-11-22_resident_registry.sql`, `backend/app/main.py`, `backend/app/services/resident_registry.py`, `backend/app/routes/resident_records.py`, `backend/app/routes/resident_registration.py`, `backend/app/utils/registration_policy.py`, `backend/app/routes/users.py`, `backend/app/routes/auth.py`, `backend/tests/test_resident_registry.py`, `backend/tests/test_auth_google_otp.py`, `backend/tests/test_password_policy.py`, `backend/tests/test_barangay_provisioning_retired.py`, `backend/tests/test_account_self_edit.py`, `frontend/src/admin/live/residentRecords.ts`, `frontend/src/admin/pages/ResidentRecordsPage.tsx`, `frontend/src/admin/AdminApp.tsx`, `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/resident/auth/recordRegistration.ts`, `frontend/src/resident/pages/auth/RegisterPage.tsx`, `docs/01-system/RESIDENT_RECORD_REGISTRATION.md`, `docs/README.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/05-operations/agents/feature-updates/2026-11-22_0336_resident-record-based-registration.md`
- **Authorization:** User request: "STRAYSAFE 2.0 — Official Resident Record-Based Registration with Email OTP Verification" (FREEZE is OFF).
- **Type:** `Feature`

## Intent

Replace open resident self-registration with registration against the official resident list the Subdivision Leader uploads, so onboarding scales to thousands of residents without the Leader creating accounts by hand.

## Key changes

- Four new tables (additive SQL migration, startup read-only check): import batches, per-row validation results, official resident records, registration attempts (hashed code and tokens).
- Leader API and screen (**Resident Records**): template download, .xlsx/.csv upload, validation summary with row and reason, preview, one-click import applied once, search, edit, deactivate/reactivate, import history.
- Resident API and 4-step screen: match name + email + block + lot, code e-mailed to the record's own address, verify, choose password, account created and linked in one transaction. Uniform refusal message; code never returned or logged.
- Public `POST /users/` and first-time Google sign-in no longer create accounts unless `OPEN_SELF_REGISTRATION=true`. Four older tests that exercise those paths now set that flag.
- No new dependency: .xlsx is read and the template written with the standard library.

## Validation

- `python backend/tests/test_resident_registry.py`: 91 checks pass (offline, SQLite, mail sender replaced).
- `test_auth_google_otp` (22), `test_password_policy` (19), `test_barangay_provisioning_retired`, `test_admin_invite` (28), `test_session_security` (16) pass. `test_account_self_edit` (5 failures) and `test_admin_003_admin_create_user` (1) fail identically without this change (retired Barangay accounts).
- `npx tsc -b` and eslint on the new frontend files are clean. `tests/residentRegistration.test.mjs` fails identically with and without this change.
- **Not done:** real SMTP delivery, running the migration on MySQL, a browser walk-through, and `npx @ghostbyte/agent-docs-kit ... audit documentation --strict`.

## Manual steps

Apply `backend/migrations/2026-11-22_resident_registry.sql` once; configure SMTP in `.env`; send a real code to an inbox before relying on it.
