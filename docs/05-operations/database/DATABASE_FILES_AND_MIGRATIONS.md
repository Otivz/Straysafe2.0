# Database files and migration workflow

- **Status:** Current. Verified against the code and files on 2026-11-08.
- **Purpose:** One place that says where every database-related file lives, what state it is in, how the schema is changed today and where database work should connect. It describes the repository as it is; it changes no behaviour.
- **Not covered:** the column-level schema ([DATABASE_SCHEMA.md](../../01-system/DATABASE_SCHEMA.md)) and the business rules the schema supports.

## Files and their status

| Path | In Git | What it is |
|---|---|---|
| `backend/app/models/` | yes | SQLAlchemy models, 75 `__tablename__` declarations. The source of truth for the schema, as `DATABASE_SCHEMA.md` states. |
| `backend/app/database/session.py` | yes | Engine and `SessionLocal`. Reads `DATABASE_URL` and refuses to import without it. |
| `backend/app/main.py` | yes | Creates and upgrades the schema at start-up (next section). |
| `backend/scripts/` | yes | One-off scripts, run by hand from `backend/`: DDL (`add_*_column.py`, `alter_pet_status.py`, `migrate_adoption_9_stages.py`, `split_declared_behavior.py`), data repair and back-fill, seeding (`seed_admin.py`), inspection, AI evaluation. |
| `Database3.3.txt`, `Database3.3_subdivision.sql` | yes | Full schema and seed script, 76 tables. |
| `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt` | yes | The subdivision-only update of 3.3: the Barangay staff seed accounts removed, all 76 tables kept ([change record](../agents/feature-updates/2026-11-06_1314_database3-4-subdivision-schema.md)). The `.txt` is a byte-for-byte copy of the `.sql`. |
| `docs/01-system/DATABASE_SCHEMA.md` | yes | Generated column listing of the 76 tables, from the local `straysafe_db` on 2026-11-05. |
| `straysafe_subdivision.sql` | **no (untracked)** | `mysqldump` (client 8.0.42, server 8.0.41) of the local `straysafe_subdivision` database: structure and data. |

The root-level `Database3.*` files stay where they are: scripts and many permanent change records refer to them by name.

## The SQL dump

`straysafe_subdivision.sql` is the dump of the copy database that Phase 0 of the [subdivision-only plan](../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md) created. Compared by `CREATE TABLE` names on 2026-11-08:

- It has the same 76 tables as `Database3.4_subdivision.sql` and `DATABASE_SCHEMA.md`.
- 75 of them have a SQLAlchemy model. `behavior_tags` exists only in the SQL files.
- It holds data in 38 tables, including `users`, `reports`, `pets`, `notifications` and `audit_logs`. Review it, and remove personal data where needed, before anyone commits it.
- Columns were not compared, and no script in the repository reads or loads it.

Treat it as read-only input for the database alignment work. Do not edit it, and do not load it onto the application database without a backup.

## How the schema changes today

There is no Alembic or other versioned migration tool. A schema change touches four places:

1. **The model** in `backend/app/models/`. `Base.metadata.create_all(bind=engine)` in `main.py` creates tables that do not exist yet.
2. **An `ensure_*` function in `backend/app/main.py`** (55 of them) for databases that already exist. Each guards before it changes anything (an `information_schema` lookup, `IF NOT EXISTS` or `WHERE NOT EXISTS`), then runs `ALTER TABLE ... ADD COLUMN`, an enum change or an insert of seed rows (for example `ensure_report_status_rows`), so it is safe to run on every start. They are called in sequence when `main.py` is imported. The ones read here use `information_schema` and `DUAL`, which are MySQL.
3. **The schema snapshot** for new installs: `Database3.4_subdivision.sql` and its `.txt` copy, updated by hand.
4. **`DATABASE_SCHEMA.md`**, regenerated from the database after the change.

Each change also gets a change record under `docs/05-operations/agents/feature-updates/`.

## Where database refactoring connects

- Make the change in the model, add its `ensure_*` function to the start-up sequence in `main.py` following the pattern above, and update the snapshot and `DATABASE_SCHEMA.md`.
- Use the dump to compare columns against the models and the snapshot, not as the place to make changes.
- Adopting versioned migrations would be a separate decision. Nothing in the repository prepares for it.

## Cautions

- `backend/scripts/import_db.py` runs `DROP/CREATE DATABASE` SQL read from `database_query.md`. That file is gitignored and absent, so the script stops with "SQL file not found". Do not create the file unless a reset is intended.
- `backend/scripts/read_db_txt.py` and `find_tables_in_db.py` read `c:/Users/User/Desktop/Straysafe2.0/Database.txt`, a path from another machine.
- The comparison scripts in `scratch/` (`compare_all_db.py`, `audit_database_txt.py`, `check_details.py`, `check_fks.py`, `check_reports.py`) check a live database against `Database3.3.txt`. The first two hard-code the same Desktop path; the other three open `Database3.3.txt` from the working directory. They need their paths fixed before use.
- Backend tests use throwaway SQLite files. Never point a test at the application database.
