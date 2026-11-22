# Resident registry migration: quote reserved word

- **Date:** 2026-11-22 03:44 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/migrations/2026-11-22_resident_registry.sql`, `docs/05-operations/agents/feature-updates/2026-11-22_0344_resident-registry-migration-reserved-word.md`
- **Authorization:** User request "can you run it" (apply the 2026-11-22 migration to the local database).
- **Type:** `Fix`

## Intent

The migration failed on MySQL 8 because `row_number` is a reserved word (SQLite, used by the tests, accepts it).

## Key changes

- Backticks around `row_number` in the column and index definitions. The SQLAlchemy model already quotes it (checked by compiling for the MySQL dialect).
- The migration was then applied to the local `straysafe_subdivision` database; the startup check reports no missing tables.
