# Individual self-registration with residency verification

- **Date:** 2026-11-22 14:06 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/migrations/2026-11-22_resident_applications.sql`, `backend/app/models/resident_registry.py`, `backend/app/models/__init__.py`, `backend/app/db_migrations/resident_registry.py`, `backend/app/routes/resident_applications.py`, `backend/app/routes/auth.py`, `backend/app/schemas/auth.py`, `backend/app/utils/mailer.py`, `backend/app/utils/registration_policy.py`, `backend/app/main.py`, `backend/tests/test_resident_applications.py`, `backend/tests/test_resident_registry.py`, `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/auth/applications.ts`, `frontend/src/resident/auth/httpGateway.ts`, `frontend/src/resident/pages/auth/RegisterPage.tsx`, `frontend/src/resident/pages/auth/RegistrationStatusPage.tsx`, `frontend/src/resident/pages/auth/VerifyPage.tsx`, `frontend/src/resident/pages/auth/LoginPage.tsx`, `frontend/src/resident/pages/auth/WelcomePage.tsx`, `frontend/src/admin/live/residentApplications.ts`, `frontend/src/admin/pages/ResidentApplicationsPage.tsx`, `frontend/src/admin/pages/ResidentsTabs.tsx`, `frontend/src/admin/AdminApp.tsx`, `docs/01-system/RESIDENT_RECORD_REGISTRATION.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** Developer request in session ("Individual Self-Registration with Admin Residency Verification" specification), with the decisions: reviewers are the Subdivision Leader and the Admin; approved applicants go to the Registered accounts, not the official list.
- **Type:** Feature

## Intent

Let people register on their own beside the bulk import: e-mail OTP, then a residency decision by a Leader or Admin, helped by a comparison with the official resident list.

## Key changes

- New table `resident_applications` (migration applied by hand, third). `users` unchanged.
- `POST /resident-applications/register`, `/resubmit` (public); `GET /resident-applications`, `GET /{id}` with match result, `POST /{id}/approve`, `POST /{id}/reject` (Leader own subdivision, Admin all).
- `/auth/verify-otp`: for an applicant, verifies the e-mail only, locks the account and returns `residency_status` without a session. `/auth/login` and Google sign-in return a structured 403 (`RESIDENCY_PENDING` / `RESIDENCY_REJECTED`) for a locked applicant.
- Approval / rejection e-mails; audit entries for every step.
- Resident app: Register page (restored, new form), status page with resubmit; Login / Welcome link to it again. Admin: Residents > Applications tab with review dialog.
- The test fake for the invitation sender now accepts extra arguments (the sender gained a `subdivision_name` argument in a separate change).

## Validation evidence

- `python tests/test_resident_applications.py`: 58 checks passed (the 14 scenarios of the specification plus guards).
- `python tests/test_resident_registry.py`: 105 passed. `test_auth_google_otp` 22/22. `test_barangay_provisioning_retired` passes.
- `test_password_policy` 18/19: the failure comes from `backend/app/routes/users.py` ("You can't change full name here"), modified separately at 20:03 local and not part of this change.
- `npx tsc --noEmit -p .` in `frontend/`: no errors.
- Not verified: real e-mail delivery, the MySQL migration, the screens in a browser.
