# Resident registry tables added to the schema snapshot

- **Date:** 2026-11-22 04:12 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `docs/05-operations/agents/feature-updates/2026-11-22_0412_resident-registry-schema-snapshot.md`
- **Authorization:** User request "can you update my databs" (read as: update the database snapshot files).
- **Type:** `Polish`

## Intent

New installs built from the snapshot should include the four tables from `backend/migrations/2026-11-22_resident_registry.sql`.

## Key changes

- Appended DROP/CREATE for `resident_import_batches`, `resident_import_rows`, `official_resident_records`, `resident_registration_attempts` before the end marker of both files. Not run against any database; `Database3.4_subdivisiontry.txt` and `docs/01-system/DATABASE_SCHEMA.md` were not changed.
