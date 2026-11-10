# Clean database rebuild: 51 tables, reference data only, no users

- **Date:** 2026-11-10 09:15 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/01-system/overview.md`, `docs/README.md`. No source, test or configuration file changed. The rebuild changed the local MySQL database `straysafe_subdivision`, which is not a repository file; the backup, the clean init file and an unused local helper script are in `C:\StraySafe-db-backups\`, outside the repository and OneDrive.
- **Authorization:** Developer requests in Claude Code: "Execute Approved Clean MySQL Rebuild", the follow-up choosing a local interactive Admin-password step (superseded), and "Correct Clean Initialization and Complete Database Rebuild", which set the role scope (Resident and Subdivision Leader active, Barangay Staff retired, System Admin reserved for a future implementation) and asked for no seeded Admin, Barangay or demo user.
- **Type:** Polish

## Intent

Replace the local development database with the canonical 51-table schema and its reference data only, after the legacy retirement, without any user, default credential or new account-management workflow.

## Key changes

- **Rebuild.** Only `localhost/straysafe_subdivision` was replaced (80 tables and 338 rows became 51 tables and 55 reference rows). The 11 other databases on the instance were checked unchanged. The backend, the AI worker and any tunnel were not running, and none was started against the real database.
- **Initialization.** The clean init is `Database3.4_subdivision.sql` minus its demo notification and activity rows and minus every user, with `coverage_settings.updated_by` set to `NULL` because the seeded row pointed at the removed Admin. A first attempt that kept that reference was caught by a foreign-key orphan scan in the dry run and discarded. The earlier Admin-only init (whose hash was the old default password's) was deleted.
- **Roles.** The four role definitions keep their ids (1 Citizen, 2 Subdivision Leader, 3 Barangay Staff, 4 Admin). No account of any role exists.
- **Documentation.** `DATABASE_FILES_AND_MIGRATIONS.md` has a new last section (backup, initialization, what is seeded, role scope, account provisioning, checks, known differences) and its old "unapproved rebuild" wording is corrected; `overview.md` marks role 4 as reserved; the index has a row.
- **Open decision (blocker, not worked around).** The application can create a Subdivision Leader only through an Admin: `POST /users/admin-create`, `POST /users/` as an Admin, or a role change by an Admin through `PUT /users/{id}`. Public sign-up forces the Resident role and the Barangay Head Officer path can only create the retired Barangay role. Without an Admin there is no supported way to provision a Leader, and no new workflow was invented.

## Validation evidence

No source change, so no test suite was run. Everything below was checked directly, read-only apart from the rebuild itself.

- **Backup:** written outside the repository and OneDrive, SHA-256 and size recorded in a manifest and re-checked after the replacement; restore-tested into a temporary database (80 tables, 338 rows, identical columns and 233 foreign keys), which was then dropped.
- **Safety gate (33 checks, all passed before the load):** target is localhost and exactly `straysafe_subdivision`; backend, AI worker and tunnel stopped; nobody connected to the database; backup checksum and restore test; live database still equal to the backup; the init file equals the snapshot minus its demo seeds and users (no hand edits), has no user, credential or e-mail address, keeps the four roles, names only `straysafe_subdivision` in its database statements, creates exactly the 51 model tables and none of the 21 retired ones, and is `utf8mb4` throughout.
- **Verification of the rebuilt database (19 checks, all passed):** 51 tables, none retired, equal to the backend models; reference data present; zero users, reports, pets, chats, notifications, activity records and `system_settings`; no foreign key to a removed table and no orphaned row; `utf8mb4` / `utf8mb4_unicode_ci` on the database, every table and every text column with correct UTF-8 seed text; every model column and enum present; `check_case_schema` with no critical and no degraded issue; the other databases unchanged. Noted, not failures: 3 snapshot columns no model uses, 32 NULL / NOT NULL differences, 1 model foreign key the snapshot lacks.
- **Throwaway clone (same init file, dropped afterwards, all mail senders replaced by in-process fakes, 22 checks passed):** the backend's start-up runs with no error and a second start changes nothing (the first adds 3 indexes and 4 foreign keys to `followup_contact_logs` and 2 `system_settings` rows); a Resident signs up, signs in, verifies with the e-mailed code and signs in again, and a wrong password is refused; with no Admin, public sign-up, `admin-create` (without a session and with a Resident session) and a self-promotion all fail to create or become a Leader; with a throwaway Admin that existed only in the clone, the supported flow creates a Leader who sets a password with the e-mailed code and signs in.
- Nothing was installed, built, tunnelled, committed or pushed; no dependency changed.
