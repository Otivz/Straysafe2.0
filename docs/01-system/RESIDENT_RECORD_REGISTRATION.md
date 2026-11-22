# Official resident records, bulk account creation and account claiming

- **Status:** Current (2026-11-22).
- **Purpose:** How residents get a StraySafe account, in two ways that work side by side: (1) bulk account creation from the official list, below; (2) individual self-registration with residency verification, in the last section.
- **Bulk creation:** There is no open sign-up for it. The Subdivision Leader imports the official resident list; STRAYSAFE creates a locked account for every valid row and e-mails each resident a single-use activation link; the resident claims the account and chooses their own password.
- **Code:** `backend/app/models/resident_registry.py`, `backend/app/services/resident_registry.py` (file reading, validation, import), `backend/app/services/resident_invitations.py` (invitations and delivery), `backend/app/routes/resident_records.py` (Leader), `backend/app/routes/resident_activation.py` (resident, public), `backend/app/utils/registration_policy.py`, `backend/app/utils/mailer.py` (`send_activation_invitation_email`); screens `frontend/src/admin/pages/ResidentRecordsPage.tsx` and `frontend/src/resident/pages/auth/ActivatePage.tsx`.
- **Tests:** `python backend/tests/test_resident_registry.py` (105 checks, offline).

## The flow

1. The Subdivision Leader opens **Residents > Official list**, downloads the template and uploads the official `.xlsx` or `.csv` list.
2. STRAYSAFE validates every row and shows a summary (total, valid, duplicate, invalid, missing information) with the row number and reason of every problem, and a preview. Nothing is created yet.
3. The Leader confirms once. For every valid row STRAYSAFE creates a resident account (role Citizen, `users.status = 'Inactive'`, not verified, **no usable password**) and a record **Pending Activation**, and queues the invitation. A row whose e-mail already belongs to a resident account is linked to it and treated as **Active**; that account is not changed and gets no invitation. A batch is applied exactly once.
4. The invitations are e-mailed in the background (not inside the upload request). Each one shows **Pending Delivery**, **Sent**, **Delivery Failed**, **Invitation Expired** or **Claimed** on the Leader's list. A failed send is never shown as sent.
5. The resident opens the link (`/resident-app/activate?token=...`), which proves they have the mailbox on the record, chooses a password, and the account becomes **Active** and verified. They then sign in with the registered e-mail.

## Rules

| Area | Rule |
| --- | --- |
| Account states | Record: `Pending Activation`, `Active`, `Deactivated`. Account: Pending and Deactivated are `users.status = 'Inactive'`, which the existing sign-in, token and refresh checks already refuse on the server, so a Pending or Deactivated resident cannot sign in, report or use protected features. Active accounts work normally. |
| No password | The locked account gets the hash of a random secret that is never stored or shown (one hash is made per import so thousands of accounts are fast). Nobody can sign in with it, passwords are never in the file, never e-mailed, never set by the Leader. |
| Link | `secrets.token_urlsafe(32)`, created at the moment of sending; only its SHA-256 is stored. 24-hour expiry. Single use: claiming, sending again, a changed e-mail, or deactivation clears it. A new link replaces the old one. The token is never logged or returned by any API (the Leader's list has no link). |
| Claiming | `GET /resident-activation/check` says whether the link is usable (name and a masked e-mail only when it is). `POST /resident-activation/complete` takes the password; the invitation is claimed with a conditional `UPDATE`, so two simultaneous submits activate exactly once, and the account state changes in the same transaction. The e-mail on the record cannot be changed by the resident. |
| Password | The existing policy (`app/utils/password_policy.py`), checked on the server; hashed with the existing bcrypt helper. |
| Expired / used / unknown | Refused with a clear message and an option to e-mail a new link to the address on the list. `POST /resident-activation/request-link` always gives the same answer, so it never reveals who is on the list; 5 per hour per IP and a 5-minute per-resident cooldown. |
| Resend (Leader) | 60-second cooldown per resident, at most 20 sends per resident, 30 per hour per Leader. |
| Matching | Name: case, accents, `.` `,` and extra spaces ignored. E-mail: case and spaces ignored. Block/Lot: `Block 04`, `blk 4`, `4` are the same; `4A` is not `4`. Used to detect duplicates at import. |
| Duplicates | One record, one account: unique keys on `official_resident_records.user_id`, `(subdivision_id, email)`, `(subdivision_id, name_key, block_key, lot_key)`, and `resident_invitations.record_id`. Uploading the same file again reports every row as a duplicate and creates nothing. |
| Deactivation | Blocks the account and any link; pets, reports and messages are kept. Reactivating restores an account that was activated before (`Active`), or returns a never-activated one to `Pending Activation` for a new invitation. |
| Editing | Before activation the account follows the record (name, e-mail, phone, address) and a changed e-mail needs a new invitation. After activation the e-mail cannot change here and the resident's own profile is not rewritten. |
| Existing accounts | Treated as Active, linked at import. A staff/administrator e-mail is rejected. |
| Access | Every `/resident-records` endpoint requires a Subdivision Leader (role 2) assigned to a subdivision and is scoped to it on the server. Residents, staff and administrators get 403. |
| Old sign-ups | Public `POST /users/` and a first Google sign-in no longer create accounts. The old record-matching sign-up (`/resident-registration/*`) and its e-mailed code were removed. Administrator provisioning is unchanged. `OPEN_SELF_REGISTRATION=true` reopens the old paths (a rollback switch; not for a real deployment). |
| History | Import, invitation, activation, deactivation and edits are written to the audit log; `GET /resident-records/{id}/history` shows them. The audit log never contains a link or a password. |

## File rules and scale

- `.xlsx` and `.csv` only, up to 5 MB and 20,000 rows. Columns (any order): Full Name, Email Address, Block Number, Lot Number, Contact Number (optional). Contact numbers use the existing Philippine phone rules. Full name is limited to 100 characters.
- Parsing uses only the Python standard library. Workbook entries are size- and ratio-limited before they are read; formulas, macros and external links are not evaluated.
- Validation checks missing fields, e-mail format, duplicates inside the file, duplicates of stored records, and e-mails that belong to staff accounts. **Block/Lot validity against subdivision reference data is not checked: the system has no block/lot reference table.**
- Accounts and records are written in chunks of 1,000 inside one transaction; any error rolls everything back and leaves the batch ready to confirm again.
- E-mail sending runs after the response (FastAPI background task), one invitation at a time. Each is claimed by a conditional update, so two runners or a double click never send the same invitation twice. A server restart can drop a background run: the Leader's **Send waiting and failed invitations** button resumes it. There is no progress bar: the list shows each result when refreshed.

## API

Leader (all `Authorization: Bearer`, role 2):

| Method and path | Purpose |
| --- | --- |
| `GET /resident-records/template?format=xlsx\|csv` | Template download |
| `POST /resident-records/imports` (multipart `file`) | Validate; returns the batch summary |
| `GET /resident-records/imports` | Upload and import history |
| `GET /resident-records/imports/{id}?result=issues\|valid\|all&page=` | Rows (row number, reason) |
| `POST /resident-records/imports/{id}/confirm` | Create the accounts, queue the invitations, once |
| `POST /resident-records/imports/{id}/discard` | Throw the file away |
| `GET /resident-records?q=&status=&invitation=failed&page=` | Search, filter, status counts, failed-invitation count |
| `PATCH /resident-records/{id}` | Correct details |
| `POST /resident-records/{id}/resend-invitation` | A new link (the old one stops working) |
| `POST /resident-records/send-invitations` | Send the waiting and failed invitations in the background |
| `GET /resident-records/{id}/history` | Activation history |
| `POST /resident-records/{id}/deactivate` / `reactivate` | Block / restore the account |

Resident (public, rate limited): `GET /resident-activation/check?token=`, `POST /resident-activation/complete` (`token, password, confirm_password`), `POST /resident-activation/request-link` (`email`).

## E-mail configuration

The existing SMTP sender (`backend/app/utils/mailer.py`) is reused. Set in the root `.env` (never committed): `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (587, STARTTLS), `SMTP_USER`, `SMTP_PASSWORD` (a Google App Password for Gmail), `SMTP_FROM_NAME`, and **`FRONTEND_URL`**, the public address residents open, because the link is `FRONTEND_URL/resident-app/activate?token=...`. Without SMTP settings every invitation is recorded as **Delivery Failed** ("Email is not configured on the server") and can be retried once it is set. Gmail limits how many messages an account may send per day; large lists may need a transactional e-mail service, set through the same variables.

## Database

Two additive, idempotent migrations, applied once and in this order (the backend refuses to start, naming the file, until the tables exist):

1. `backend/migrations/2026-11-22_resident_registry.sql`: `resident_import_batches`, `resident_import_rows`, `official_resident_records`.
2. `backend/migrations/2026-11-22_resident_invitations.sql`: adds `resident_invitations`, renames status `Registered` to `Active` (existing registered residents are treated as Active), and drops the unused `resident_registration_attempts`.

`mysql -u <user> -p <database> -e "source backend/migrations/2026-11-22_resident_invitations.sql"`. `Database3.4_subdivision.sql` and `.txt` (the new-install snapshots) include the new table.

## Privacy and assumptions to confirm with the subdivision

- The list holds names, e-mails, addresses and phone numbers. Only the Subdivision Leader of that subdivision can upload or see it; residents cannot see each other. A visible privacy notice is on the activation page; the wording should be confirmed against the subdivision's data-privacy policy.
- The e-mail on the list is trusted as the resident's identity: anyone who controls that mailbox can claim the account. Wrong addresses on the list will send invitations to the wrong person; correct them before import.
- Assumed: Block and Lot are stored as text from the file and used only to tell residents apart.

## Known limits

- Real e-mail delivery and a MySQL run of the migrations were **not** exercised in development: the automated tests use SQLite and a replaced mail sender. Check both manually before relying on this.
- Row locking (`SELECT ... FOR UPDATE`) is a no-op on SQLite; on MySQL the single-activation guarantee rests on the conditional updates and unique keys above.
- A background send is lost if the server restarts mid-run; use **Send waiting and failed invitations**.
- Block/Lot are not validated against reference data (none exists).

## Individual self-registration with residency verification

Runs beside the bulk import (nothing above changes). Code: `backend/app/routes/resident_applications.py`, `routes/auth.py` (`/auth/login`, `/auth/verify-otp`), `utils/mailer.py`; screens `frontend/src/resident/pages/auth/RegisterPage.tsx`, `VerifyPage.tsx`, `RegistrationStatusPage.tsx`, `frontend/src/admin/pages/ResidentApplicationsPage.tsx` (Residents > Applications). Tests: `python backend/tests/test_resident_applications.py` (58 checks).

| Status (`resident_applications.status`) | Meaning | Account |
| --- | --- | --- |
| `PENDING_EMAIL_VERIFICATION` | Registered, e-mail code not entered yet | `users.status` Active but unverified: the existing checks refuse every resident feature |
| `PENDING_RESIDENCY_VERIFICATION` | E-mail verified, awaiting a Leader / Admin decision | `Inactive`: no session at all; sign-in shows the status |
| `ACTIVE` | Residency approved | `Active`, verified: every resident feature |
| `REJECTED` | Not approved; reason recorded and e-mailed | `Inactive`; sign-in shows the reason; can correct and resubmit (3 times) on the same account |
| Deactivated | An approved account later blocked | `Inactive` (the existing account deactivation) |

1. `POST /resident-applications/register` (public, 10/hour per IP): full name, e-mail, contact (optional), block, lot, password + confirmation. Same field rules as the official list, the password policy, and one account per e-mail (an e-mail already used, including a bulk-created one, is refused with a pointer to sign-in or the activation link).
2. Signing in e-mails the existing 6-digit code (5-minute expiry, 5 tries, 30-second resend cooldown). A right code verifies the e-mail only: the application moves to `PENDING_RESIDENCY_VERIFICATION`, the account is locked, and no session is opened.
3. Signing in afterwards returns a structured 403 (`RESIDENCY_PENDING` with the waiting message, or `RESIDENCY_REJECTED` with the reason) instead of a session. A wrong password reveals nothing.
4. A Subdivision Leader (own subdivision) or an Admin (all) reviews in Residents > Applications. The comparison with `official_resident_records` of the same subdivision shows **Match Found** (same name, block and lot), **Possible Match** (same block and lot, or same name) or **No Match Found**, with the candidate records. It never decides.
5. `POST /resident-applications/{id}/approve` -> `ACTIVE`; `POST /resident-applications/{id}/reject` with a reason (required) -> `REJECTED`. Reviewer and time are stored; both are audited and e-mailed (`send_residency_approved_email`, `send_residency_rejected_email`). Only a `PENDING_RESIDENCY_VERIFICATION` application can be decided.
6. `POST /resident-applications/resubmit` (e-mail + password + corrected details) sends a rejected application back for review.

Approved applicants are ordinary resident accounts and appear on the Registered tab. They are not added to the official list.
