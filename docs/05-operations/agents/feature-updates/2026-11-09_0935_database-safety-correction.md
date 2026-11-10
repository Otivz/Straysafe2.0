# Database safety correction: tests kept off the application database, read-only verification, migration failure handling

- **Date:** 2026-11-09 09:35 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/database/connection_guard.py`, `backend/app/database/session.py`, `backend/app/db_migrations/case_alignment.py`, `backend/app/main.py`, `backend/tests/_isolated_db.py`, `backend/tests/_migration_fixtures.py`, `backend/tests/test_admin_001_users_rbac.py`, `backend/tests/test_admin_002_notifications_rbac.py`, `backend/tests/test_admin_003_admin_create_user.py`, `backend/tests/test_admin_010_direct_action.py`, `backend/tests/test_admin_011_warnings.py`, `backend/tests/test_admin_012_gemini_governance.py`, `backend/tests/test_admin_013_real_metrics.py`, `backend/tests/test_case_alignment_failure_handling.py`, `backend/tests/test_case_alignment_migrations.py`, `backend/tests/test_database_connection_guard.py`, `backend/tests/test_phase_2_stability.py`, `backend/tests/test_report_original_location.py`, `docs/01-system/CASE_WORKFLOW_BACKEND.md`, `docs/05-operations/agents/feature-updates/2026-11-09_0935_database-safety-correction.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: the brief "StraySafe 2.0 — Database Safety Correction Before Integration". It asked for the configuration to be inspected locally without printing secrets, and for read-only queries against the configured database where a read-only connection could be guaranteed. FREEZE was OFF. Nothing was committed or pushed.
- **Type:** Fix

## Intent

A follow-up to `2026-11-09_0643_database-backend-alignment.md`, whose first section records that older tests ran start-up migrations on the configured database. Four goals: keep every test off that database; find out what state the accidental migration left it in without changing anything; make a failed migration impossible to miss; keep the alignment work as it was.

## The configured database

Only derived facts were printed. The URL, host, user and password were not printed, logged or stored.

- **Where the app reads it:** the `.env` at the **repository root** (`backend/app/database/session.py` and `main.py` load it from there). There is no `backend/.env`. `DATABASE_URL` was not set in the shell.
- **Engine:** MySQL through PyMySQL; the server reports MySQL 8.0.
- **Local or remote:** local. The host is `localhost`, so the server runs on this machine.
- **Name:** `straysafe_subdivision` (the same name as the ignored dump `straysafe_subdivision.sql`).
- **Environment label:** none. The config has no variable that says development, staging or production. The word "local" hints at nothing beyond the host name.
- **Classification: unknown (appears local).** Its small size (3 reports, 1 referral) is not treated as evidence that it is disposable.

## Read-only verification of the accidental migration

Method: a separate script, never the application. It reads the URL from `.env` in memory, connects with `SET SESSION TRANSACTION READ ONLY` so the **server itself** refuses writes, reads `@@session.transaction_read_only` back and stops unless it is 1, and sends only fixed `SELECT` and `SHOW` statements (22, each checked against the script's own guard beforehand). Nothing was modified, restored or rolled back. Results:

- the four new tables exist with 15, 10, 10 and 15 columns, matching the reference schema, and are empty;
- every new column is there: `reports` 27 of 27, `barangay_referrals` 11 of 11, `barangay_referral_updates` 1 of 1, `owner_warnings` 5 of 5, `lost_pet_alerts` 1 of 1; no column differs from `Database3.4_subdivision.sql`;
- `barangay_referrals` has no unique key on `report_id`, has the plain index `ix_barangay_referrals_report_id`, allows an empty `barangay_id`, and keeps its foreign key from `report_id` to `reports`;
- `reports` has `ix_reports_case_status`, the five foreign keys to `users`, and an `animal_type` ENUM of nine members including the six added; `barangay_referrals.status_updated_by` has its foreign key;
- 11 report categories, including all six expected names;
- row counts: reports 3, referrals 1, referral updates 3, owner warnings 1, lost-pet alerts 0;
- the backfill is complete and consistent: no empty `case_status` or `identity_status`, no report whose `case_status` disagrees with its legacy status, no empty `org_type`, `org_name`, `referral_status` or `alert_type`; no subdivision settings rows yet.

So the accidental run completed every step and nothing is half-applied. Still the developer's decision: whether that database should be kept or restored from a backup (see "Remaining risks and decisions").

A second read-only run executed only the new `check_case_schema` against that server (41 `SELECT` statements, no step, no migration, no application start-up): critical none, degraded none, so the next application start would say `ok`.

## Tests that can no longer reach the application database

Two independent barriers, so one mistake is not enough:

1. **In the tests:** `backend/tests/_isolated_db.py`, imported first, replaces `DATABASE_URL` with a brand-new throwaway SQLite file (a value in the shell or in `.env` is replaced, not respected), blanks the outside-service credentials, disables the MySQL driver for the process, and marks the process as a test.
2. **In the application:** `backend/app/database/connection_guard.py`, installed on the engine by `backend/app/database/session.py`, refuses to OPEN a non-SQLite connection when the process is a test (its entry script is in a folder called `tests`, pytest is loaded, or `STRAYSAFE_TEST_PROCESS=1`). It checks at connection time, so a test that only imports schemas is unaffected, and the server never matches. A test that forgets barrier 1 stops at its first connection with a message saying what to do.

The eight older tests no longer import `app.main`, which cannot be imported on SQLite at all (its start-up runs MySQL-only SQL). Following the repository convention they build the app from the routers they test (`_isolated_db.build_app`) and seed the minimum a developer's own database used to hold (`_isolated_db.create_schema_and_seed`: four roles, two subdivisions, the 18 statuses, the `gemini_vision_matching` setting, one user per role, one report). Their assertions are unchanged, with two things to know:

- `test_phase_2_stability.py`: its MySQL index check cannot run on SQLite (`information_schema`, `DATABASE()`). It now checks that `ensure_performance_indexes()` in `main.py` declares the three required indexes, runs their `CREATE INDEX` statements on the throwaway database, and reads SQLite's catalog. A real MySQL server's index state is no longer inspected by any test.
- `test_admin_003_admin_create_user.py` creates a Barangay account, which the Subdivision-only gate refuses unless `BARANGAY_WORKFLOWS_ENABLED=1`, like the other legacy-account tests. In default mode it stops at that step with the gate's 403; the other seven pass in both modes. This is not caused by the isolation: the gate is older.

Also: `test_report_original_location.py` used `os.environ.setdefault('DATABASE_URL', ...)`, which a `DATABASE_URL` already in the shell would override; it now assigns. The new `test_database_connection_guard.py` (27 checks) proves both barriers, runs a deliberately forgetful test as a real script, and lints every test file: none may import `app.main`, and each must isolate itself before it imports the database layer (`setdefault` does not count).

Proof against the real thing: the **original** versions of all eight tests, taken from Git byte for byte, were run with an unreachable canary MySQL URL in the environment. The guard refused every one of them at its first connection, before anything was sent.

Not protected, by design: scripts that are not tests (`backend/scripts/`, ad-hoc probes) legitimately work on the configured database. They must set `DATABASE_URL` themselves.

## Migration failure handling

`run_case_alignment(engine, strict=False)` in `backend/app/db_migrations/case_alignment.py` (details in `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`):

- a step that fails does not stop the others and is **tried once more** (another process starting at the same moment may have done the work; every step is idempotent);
- the schema is then **verified** against what the code needs (`check_case_schema`, read-only), and the verified schema, not the step's exit status, decides the status: `ok`; `degraded` (an index, a foreign key, the wider ENUM, the old unique key, `barangay_id` still required, or a category is missing: the application starts and logs one ERROR per gap saying what it costs); `failed` (a table or column the models read is missing, or the schema cannot be inspected);
- `backend/app/main.py` now calls it with `strict=True`: a `failed` status raises `CaseAlignmentError` with a message naming what is missing, the failed step and the MySQL error number, and **the application does not start**, instead of running against tables its own queries cannot read;
- every step's connection gives up on a metadata lock after 60 seconds (MySQL's default is a year), so a long transaction elsewhere makes start-up fail visibly instead of hanging; the setting is put back afterwards because the connection returns to the application's pool;
- foreign keys are now found by their column, not their name: a table made by `create_all` (auto-named keys) no longer gets a duplicate key from this migration on its first start;
- the result keeps `actions` and `errors` and adds `recovered`, `critical`, `degraded` and `status`.

Not changed: the older `ensure_*` functions, and the `Base.metadata.create_all` call at the top of `main.py`.

## Corrections to the earlier record

The earlier record stays as written; these corrections are recorded here.

- The application reads the `.env` at the repository root, not `backend/.env`.
- "logs a failing step without stopping start-up" is superseded by the section above.
- "Fix the eight tests" is done.
- That record said the database "held 3 reports, which suggests a development copy". A small size is not evidence of that. Its environment is unknown.

## Validation evidence

All on throwaway SQLite files or the simulated MySQL connection, with a hostile unreachable MySQL URL exported for the suite runs. Nothing ran against the configured database except the read-only verification above.

- **New and updated tests:** `test_database_connection_guard.py` 27 checks, `test_case_alignment_failure_handling.py` 42 (healthy, cannot ALTER, lost race, degraded but starts, drift repaired, unreachable database, and the same on the simulated MySQL), `test_case_alignment_migrations.py` still 52 (its exact-dictionary assertions on the result now assert what matters; its fixtures moved to `_migration_fixtures.py`).
- **Mutation check:** the migration module was broken four ways (strict never raises, no second attempt, status always ok, a foreign-key check blind to auto-named keys); the failure-handling test caught every one; the module was restored byte for byte.
- **The eight converted tests,** with an unreachable MySQL URL in the environment: all eight pass with `BARANGAY_WORKFLOWS_ENABLED=1`; seven pass without it (`test_admin_003` stops at the Barangay step).
- **Whole suite, nothing skipped,** 134 test files in each mode with the unreachable URL exported: 134 test files in each mode, nothing skipped, an unreachable MySQL URL exported. **None got worse** than the earlier full run, and none reached for MySQL (no guard refusal, no connection attempt). With `BARANGAY_WORKFLOWS_ENABLED=1` the only failures are the three that failed before this work (`test_monitoring_logs.py`, `test_multi_animal_split.py`, `test_session_security.py`); everything else passes, including the eight converted tests and the two new ones. Without it, 49 files fail: the 48 that need the Barangay accounts, as before, plus `test_admin_003_admin_create_user.py` (run for the first time, see above). `test_case_privacy_scope.py` shows 59 checks instead of 54 because the earlier full run predated five checks added later.
- **Documentation audit** (`npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`): the same 12 failures as before this work and nothing new: 8 broken links (to ERD, DFD and audit documents that do not exist yet, in `docs/01-system/overview.md` and `docs/README.md`) and 4 missing agent pointer files (`CODEX.md`, `CLAUDE.md`, `CURSOR.md`, `COPILOT.md`). None comes from the new or changed documents.

## Remaining risks and decisions

1. **Its environment is unknown.** Say what that database is (development, staging, production) and, if it must be restored, restore it from a backup taken before about 05:28 UTC on 2026-11-09. I did not edit `.env`, and nothing reads an environment label yet.
2. **Scripts outside `tests/` are not guarded** (`backend/scripts/`, ad-hoc probes). That is deliberate (they are meant to act on the configured database); each should set its own `DATABASE_URL` when it is not.
3. **Two application processes starting at the same moment** can still make one fail in the older `create_all` call (MySQL error 1050); a restart fixes it. The case workflow steps themselves recover from the same race.
4. **MySQL-only steps are still not run by any test against a real server.** They are covered by the simulated MySQL, by the accidental run's log and the read-only checks above. A disposable MySQL server would close this, with a deliberate change to the guard.
5. **`test_admin_003` needs `BARANGAY_WORKFLOWS_ENABLED=1`** and `test_phase_2_stability` no longer checks a real server's indexes (see above).
6. **Recommended review before release,** unchanged from the earlier record, plus one for this change: `npx @ghostbyte/agent-docs-kit@latest engineering worksheet testing-types` (why: the isolation rules and the guard are test infrastructure the suite now depends on; evidence: a deliberately forgetful test, the lint and the byte-for-byte originals run above), and the `api-layer` and `database-backend` security worksheets named there.

## Not done

No commit, push, dependency change, `.env` change, restore, rollback or frontend work. The configured database was only read, under a server-enforced read-only session.
