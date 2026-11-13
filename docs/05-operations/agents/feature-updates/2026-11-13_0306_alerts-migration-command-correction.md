# Correction: the command to apply the lost & found alerts migration

- **Date:** 2026-11-13 03:06 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/migrations/2026-11-12_lost_found_alerts.sql` (header comment only), `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** The developer ran the documented command and it failed in Windows PowerShell; corrects record 2026-11-12_1804.
- **Type:** Fix

## Intent

The documented command (`mysql -u <user> -p straysafe_db < backend/migrations/...`) did not work: Windows PowerShell has no `<` input redirection, and the local database is `straysafe_subdivision` (from `DATABASE_URL`), not `straysafe_db`.

## Key changes

- The SQL file's header and the migrations document now give `mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-12_lost_found_alerts.sql"`, which works in PowerShell, and say to use the database named in `DATABASE_URL`. No SQL statement changed.

## Validation evidence

- Read-only check of the configured database (`db_migrations.lost_found_alerts.missing`): the two tables and the column are still missing, so the migration has not been applied yet; the database name and user were read from the engine URL (no credential printed). The migration was not run by the agent.
