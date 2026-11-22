# Bulk resident account creation and account claiming (replaces record-based registration)

- **Date:** 2026-11-22 10:21 (UTC)
- **AI tool:** Claude Code (Sonnet 5.5)
- **Files changed:** `backend/migrations/2026-11-22_resident_invitations.sql`, `backend/app/models/resident_registry.py`, `backend/app/models/__init__.py`, `backend/app/db_migrations/resident_registry.py`, `backend/app/services/resident_registry.py`, `backend/app/services/resident_invitations.py`, `backend/app/routes/resident_records.py`, `backend/app/routes/resident_activation.py`, `backend/app/routes/resident_registration.py` (removed), `backend/app/utils/mailer.py`, `backend/app/utils/registration_policy.py`, `backend/app/main.py`, `backend/tests/test_resident_registry.py`, `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/auth/activation.ts`, `frontend/src/resident/auth/recordRegistration.ts` (removed), `frontend/src/resident/pages/auth/ActivatePage.tsx`, `frontend/src/resident/pages/auth/RegisterPage.tsx` (removed), `frontend/src/resident/pages/auth/WelcomePage.tsx`, `frontend/src/resident/pages/auth/LoginPage.tsx`, `frontend/src/resident/pages/auth/VerifyPage.tsx`, `frontend/src/admin/live/residentRecords.ts`, `frontend/src/admin/pages/ResidentRecordsPage.tsx`, `docs/01-system/RESIDENT_RECORD_REGISTRATION.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** Developer request in session: implement the "Bulk Resident Account Creation and Account Claiming System" specification, replacing the existing record-based registration, and treat already-registered residents as Active.
- **Type:** Feature

## Intent

Remove self-registration. The Subdivision Leader imports the official list once; STRAYSAFE creates a locked account per valid row and e-mails a single-use activation link; the resident claims the account and sets their own password. Only Active accounts can sign in or report.

## Key changes

- Import confirmation now creates a resident account (Inactive, no usable password) and a record `Pending Activation` per valid row, plus one invitation row; existing resident accounts are linked as `Active`.
- New `resident_invitations` table (hashed single-use token, 24 h expiry, delivery state, send count). Migration `2026-11-22_resident_invitations.sql` also renames status `Registered` to `Active` and drops `resident_registration_attempts`. Apply by hand, after `2026-11-22_resident_registry.sql`.
- Invitations are e-mailed in a background task, one at a time, each claimed by a conditional update; failed sends are recorded as `Delivery Failed` and retried from the Leader's page. Leader can resend (60 s cooldown) and see delivery state, totals and activation history.
- New public `resident-activation` endpoints (check, complete, request-link) replace `resident-registration/*` (removed). Activation is atomic and single-winner.
- Deactivate / reactivate block or restore sign-in through `users.status`; data is kept.
- Resident app: new `ActivatePage`; register routes and "Create an account" links removed or redirected.
- Backend still refuses public `POST /users/` and first Google sign-in (unchanged).
- `.env` was not changed: `FRONTEND_URL` (used for the link) and the SMTP settings must be set by the developer.

## Validation evidence

- `python tests/test_resident_registry.py`: 105 checks passed (SQLite, mail sender replaced): account creation, locked accounts, link single-use / expiry / replacement, double submit, failed delivery and retry, resend cooldown, deactivate / reactivate, history, no-leak responses, 5,000-row import.
- `npx tsc --noEmit -p .` in `frontend/`: no errors.
- `test_auth_google_otp` 22/22, `test_password_policy` 19/19, `test_barangay_provisioning_retired` pass. `test_account_self_edit` is 20/25 both with and without these changes (existing failures about retired Barangay accounts).
- **Not verified:** real e-mail delivery, a MySQL run of the migration, the screens in a browser, and the documentation audit (`npx @ghostbyte/agent-docs-kit ... audit`, not run).
