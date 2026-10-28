# Local database reset to the seed (all test data cleared)

- **Date:** 2026-10-28 09:21 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/05-operations/agents/feature-updates/2026-10-28_0921_local-database-reset.md` (no code change; local MySQL database only)
- **Authorization:** the developer's "you know what just clear the data", then "b" to the option "Clear all the test data: reset the database to the starting data in `Database3.3.txt`".
- **Type:** Fix (local data)

## Intent

Clear all local test data, including the adoption records the panel did not approve, and start again from the seed.

## Key changes

- Checked first: `Database3.3.txt` was built into a separate scratch database and compared with the live `straysafe_db`: 63 tables on both sides, no missing columns, no type differences. The scratch database was then dropped.
- Backup: every live table copied into a separate database **`straysafe_backup_20261028`** (63 tables, 1,376 rows, every table's row count matched). It is not touched by the reset and can be dropped once no longer needed.
- Reset: `Database3.3.txt` run against the local server (it drops and recreates `straysafe_db`). Result: 63 tables; 5 seed users (2 residents, 1 Subdivision Leader, 1 Barangay staff, 1 administrator); 6 categories with category 4 now "Roaming Animal"; 0 reports, pets, adoptions, holding animals and owner follow-ups.
- Not touched: photos already uploaded to Cloudinary and local files in `backend/uploads` and `backend/ai_cache` (now unreferenced).

## Validation evidence

- Seed vs live schema comparison: identical. Backup row counts equal to the live counts for every table before the reset ran. Post-reset counts as listed above.
- The running backend must be restarted: its open database connections pointed to the dropped database.
