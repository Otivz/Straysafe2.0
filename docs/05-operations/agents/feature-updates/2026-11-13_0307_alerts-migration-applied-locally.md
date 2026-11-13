# Lost & found alerts migration applied to the local database

- **Date:** 2026-11-13 03:07 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** none in the repository besides this record and `docs/README.md`; the local MySQL database `straysafe_subdivision` (from `DATABASE_URL`) was changed
- **Authorization:** The developer's explicit request "apply for me", after the documented command failed in PowerShell.
- **Type:** Fix

## Intent

Apply `backend/migrations/2026-11-12_lost_found_alerts.sql` so the backend can start with the notification alerts.

## Key changes

- Backup first: `C:\StraySafe-db-backups\straysafe_subdivision_20261113_110727_before-lost-found-alerts.sql` (373 KB, `mysqldump --single-transaction --routines --triggers`), outside the repository.
- Applied with the MySQL 8.0 client (`source`), the password passed from the backend's own configuration through the environment, never printed or written.
- Added: tables `case_alerts` and `case_alert_sends` (empty), column `user_notification_preferences.push_lost_found_alerts` (default on; the 5 existing rows read 1). Nothing dropped or rewritten.

## Validation evidence

- The client exited 0. Read-only check afterwards: `db_migrations.lost_found_alerts.missing` returns nothing and `require` (the start-up check) passes.
- To undo: restore the backup into an empty database, or drop the two tables and the column (no other table depends on them).
