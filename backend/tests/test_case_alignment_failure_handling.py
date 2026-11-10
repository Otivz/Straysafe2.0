"""
Case alignment: what happens when a step FAILS (app/db_migrations/case_alignment.py, called from app/main.py).

  - a critical gap (a column or table the models read is missing)  ->  status "failed"; strict=True raises CaseAlignmentError
    and the application does NOT start;
  - a gap the code can live with (index, foreign key, wider ENUM, unique key, category)  ->  status "degraded"; it starts, and
    every gap is logged at ERROR with what it costs;
  - a step that fails once and works the second time (another process started at the same moment)  ->  recovered, status ok;
  - nothing here ever drops or rewrites data, and running again is always safe.

Offline: throwaway SQLite files, plus the simulated MySQL connection (tests/_migration_fixtures.py) for the MySQL-only steps.
Never imports app.main, never touches the configured database. Run from the backend folder:
    python tests/test_case_alignment_failure_handling.py
"""
import logging
import os
import tempfile

import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite, no outside services, MySQL disabled)

from sqlalchemy import create_engine, inspect, text

import app.models  # noqa: F401
from app.database import Base
from app.db_migrations import case_alignment as M
from _migration_fixtures import LEGACY_DDL, FakeEngine, FakeMySQL, legacy_mysql

TMP = tempfile.mkdtemp()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


class Capture(logging.Handler):
    """Collects what the migration logs, so the levels can be asserted."""

    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append((record.levelno, record.getMessage()))


capture = Capture()
logging.getLogger("uvicorn.error").addHandler(capture)
logging.getLogger("uvicorn.error").setLevel(logging.DEBUG)


def logged(since):
    return capture.records[since:]


def levels(since):
    return {level for level, _ in capture.records[since:]}


def fresh(name):
    """A database made from the models (what create_all gives a new install)."""
    eng = create_engine("sqlite:///" + os.path.join(TMP, name))
    Base.metadata.create_all(bind=eng)
    return eng


def legacy(name):
    """The schema BEFORE the case workflow change."""
    eng = create_engine("sqlite:///" + os.path.join(TMP, name))
    with eng.begin() as c:
        for ddl in LEGACY_DDL:
            c.execute(text(ddl))
    return eng


def columns(eng, table):
    return {c["name"] for c in inspect(eng).get_columns(table)}


NEW_REPORT_COLUMNS = {name for name, _ in M.REPORT_COLUMNS}

# ============================================================================================================
# 1. A healthy database
# ============================================================================================================
mark = len(capture.records)
healthy = fresh("healthy.db")
res = M.run_case_alignment(healthy, strict=True)
check("a healthy database: status ok, nothing critical, nothing degraded, no step errors, nothing recovered",
      res["status"] == "ok" and not res["critical"] and not res["degraded"] and not res["errors"] and not res["recovered"], res)
check("...and nothing above INFO is logged", max(levels(mark)) <= logging.INFO, logged(mark))
again = M.run_case_alignment(healthy, strict=True)
check("running it again changes nothing and is still ok", again["actions"] == [] and again["status"] == "ok", again)

# ============================================================================================================
# 2. The check is read-only and says what a legacy database lacks
# ============================================================================================================
old = legacy("old.db")
before = {t: columns(old, t) for t in ("reports", "barangay_referrals", "barangay_referral_updates", "owner_warnings", "lost_pet_alerts")}
verdict = M.check_case_schema(old)
check("a legacy database is critically incompatible: the reports columns are named",
      any(c.startswith("reports lacks columns case_status, incident_verification") for c in verdict["critical"]), verdict["critical"])
check("...as a short list (eight names and a count), not a wall of text", any("and 19 more" in c for c in verdict["critical"]))
check("...and the four case tables are reported missing", all(f"table {t} is missing" in verdict["critical"] for t in M.CASE_TABLES))
check("the check changed nothing", {t: columns(old, t) for t in before} == before and not inspect(old).has_table("case_followups"))

# ============================================================================================================
# 3. A critical failure: the database user cannot add the columns
# ============================================================================================================
real_add_columns = M._add_columns


def deny_reports(conn, table, columns_, actions):
    if table == "reports":
        raise PermissionError("ALTER command denied")
    return real_add_columns(conn, table, columns_, actions)


mark = len(capture.records)
M._add_columns = deny_reports
try:
    blocked = legacy("blocked.db")
    res = M.run_case_alignment(blocked)
finally:
    M._add_columns = real_add_columns
check("columns the models read stay missing: status failed", res["status"] == "failed", res)
check("...the missing columns and the failed step are both named",
      any(c.startswith("reports lacks columns case_status") for c in res["critical"]) and any(e.startswith("report_columns: PermissionError") for e in res["errors"]), res)
check("...the step was tried twice (warning, then ERROR) and the verdict is logged at CRITICAL",
      any(lvl == logging.WARNING and "tried once more" in msg for lvl, msg in logged(mark))
      and any(lvl == logging.ERROR and "failed twice" in msg for lvl, msg in logged(mark))
      and any(lvl == logging.CRITICAL and "FAILED" in msg for lvl, msg in logged(mark)), logged(mark))
check("...the other steps still ran: the referral and warning columns were added",
      {n for n, _ in M.REFERRAL_COLUMNS} <= columns(blocked, "barangay_referrals") and {n for n, _ in M.WARNING_COLUMNS} <= columns(blocked, "owner_warnings"))
check("...and nothing was dropped or rewritten: the reports table is still the legacy one", not (NEW_REPORT_COLUMNS & columns(blocked, "reports")))

M._add_columns = deny_reports
try:
    strict_db = legacy("strict.db")
    try:
        M.run_case_alignment(strict_db, strict=True)
        raised = None
    except M.CaseAlignmentError as exc:
        raised = exc
finally:
    M._add_columns = real_add_columns
message = str(raised) if raised else ""
check("strict: a failed status raises CaseAlignmentError, so the application does not start", raised is not None and raised.result["status"] == "failed")
check("...the message says it was NOT started, names the columns and the step, and says where to read how to fix it",
      "NOT started" in message and "case_status" in message and "step report_columns" in message and "DATABASE_FILES_AND_MIGRATIONS.md" in message, message)
check("...and it is safe to read: no more than a few short lines", len(message.splitlines()) <= 12 and max(len(l) for l in message.splitlines()) < 420, message)

fixed = M.run_case_alignment(blocked, strict=True)      # the cause is gone (rights granted): the same call completes the job
check("once the cause is fixed the same migration completes and strict passes", fixed["status"] == "ok" and NEW_REPORT_COLUMNS <= columns(blocked, "reports"), fixed)
check("...and a further run changes nothing", M.run_case_alignment(blocked)["actions"] == [])

# ============================================================================================================
# 4. A race: another process finishes the job between this process's check and its own ALTER
# ============================================================================================================
raced = legacy("raced.db")
state = {"calls": 0}


def lose_the_race(conn, table, columns_, actions):
    if table == "reports" and state["calls"] == 0:
        state["calls"] = 1
        with raced.begin() as other:                       # the other process adds the columns first...
            real_add_columns(other, table, columns_, [])
        raise RuntimeError("Duplicate column name 'case_status'")   # ...so this process's own ALTER is refused
    return real_add_columns(conn, table, columns_, actions)


mark = len(capture.records)
M._add_columns = lose_the_race
try:
    res = M.run_case_alignment(raced, strict=True)
finally:
    M._add_columns = real_add_columns
check("a step that loses the race is retried, finds the work done, and the start-up goes on",
      res["status"] == "ok" and res["errors"] == [] and len(res["recovered"]) == 1 and res["recovered"][0].startswith("report_columns: failed once"), res)
check("...it is logged as a WARNING (not an error), and nothing is missing afterwards",
      any(lvl == logging.WARNING and "second attempt" in msg for lvl, msg in logged(mark)) and max(levels(mark)) <= logging.WARNING and NEW_REPORT_COLUMNS <= columns(raced, "reports"))

# ============================================================================================================
# 5. A gap the code can live with: degraded, the application starts
# ============================================================================================================
original_steps = M.STEPS


def broken_categories(conn):
    raise RuntimeError("simulated failure while seeding")


M.STEPS = tuple((name, broken_categories if name == "case_categories" else step) for name, step in original_steps)
mark = len(capture.records)
try:
    soft = fresh("soft.db")
    res = M.run_case_alignment(soft, strict=True)          # strict, and it must NOT raise
finally:
    M.STEPS = original_steps
check("a failed seeding step is degraded, not failed: strict does not stop the application", res["status"] == "degraded" and res["critical"] == [], res)
check("...the line says what it costs and the step error is kept",
      any("report categories missing" in d and "cannot be chosen when reporting" in d for d in res["degraded"]) and any(e.startswith("case_categories:") for e in res["errors"]), res)
check("...logged at ERROR, never at CRITICAL", logging.ERROR in levels(mark) and logging.CRITICAL not in levels(mark))

# ============================================================================================================
# 6. Drift is found and put right on the next start
# ============================================================================================================
drift = fresh("drift.db")
M.run_case_alignment(drift)
with drift.begin() as c:
    c.execute(text("DROP INDEX ix_reports_case_status"))
verdict = M.check_case_schema(drift)
check("a missing index is degraded, not critical", verdict["critical"] == [] and any("no index on case_status" in d for d in verdict["degraded"]), verdict)
res = M.run_case_alignment(drift)
check("the next start recreates it and the schema is ok again", res["status"] == "ok" and "reports.case_status index added" in res["actions"], res)
with drift.begin() as c:
    c.execute(text("ALTER TABLE reports DROP COLUMN is_sensitive"))
verdict = M.check_case_schema(drift)
check("a column the models read going missing is critical", any(c.startswith("reports lacks column is_sensitive") for c in verdict["critical"]), verdict)
res = M.run_case_alignment(drift, strict=True)
check("...and the migration puts it back", res["status"] == "ok" and "reports.is_sensitive added" in res["actions"], res)

# ============================================================================================================
# 7. A database that cannot be reached cannot be called compatible
# ============================================================================================================
class Down:
    def begin(self):
        raise RuntimeError("the database is down")

    connect = begin


res = M.run_case_alignment(Down())
check("every step fails twice and the schema cannot be verified: status failed",
      res["status"] == "failed" and len(res["errors"]) == len(M.STEPS) and any("could not be verified" in c for c in res["critical"]), res)
try:
    M.run_case_alignment(Down(), strict=True)
    stopped = False
except M.CaseAlignmentError:
    stopped = True
check("...and strict stops the application", stopped)


# ============================================================================================================
# 8. The MySQL-only steps, on the simulated MySQL connection
# ============================================================================================================
class OperationalError(Exception):
    """Shaped like SQLAlchemy's wrapper: `.orig` is the driver error, whose first argument is the MySQL error number."""

    def __init__(self, code, message):
        super().__init__(f"({code}, {message!r})")
        self.orig = type("Orig", (Exception,), {})(code, message)


class Failing(FakeMySQL):
    """Raises for statements containing a rule's text. A rule may apply the statement first (as if another process ran it)."""

    def execute(self, clause, params=None):
        sql = " ".join(str(clause).split())
        for rule in self.rules:
            if rule["needle"] in sql and (rule.get("times") is None or rule["seen"] < rule["times"]):
                rule["seen"] += 1
                if rule.get("apply_first"):
                    super().execute(clause, params)
                raise rule["error"]()
        return super().execute(clause, params)


def failing_mysql(*rules):
    fm = legacy_mysql()
    fm.__class__ = Failing
    fm.rules = [{"seen": 0, **r} for r in rules]
    return fm


# ---- ALTER denied on reports -> critical ----------------------------------------------------------------------
fm = failing_mysql({"needle": "ALTER TABLE reports ADD COLUMN",
                    "error": lambda: OperationalError(1142, "ALTER command denied to user 'app'@'localhost' for table 'reports'")})
res = M.run_case_alignment(FakeEngine(fm))
check("MySQL: ALTER denied on reports -> failed, with the MySQL error number in the step error",
      res["status"] == "failed" and any(e.startswith("report_columns: OperationalError (error 1142): ALTER command denied") for e in res["errors"]), res)
check("MySQL: 27 missing columns are summarised as eight names and a count", any("case_status" in c and "and 19 more" in c for c in res["critical"]), res["critical"])
try:
    M.run_case_alignment(FakeEngine(failing_mysql({"needle": "ALTER TABLE reports ADD COLUMN", "error": lambda: OperationalError(1142, "ALTER command denied")})), strict=True)
    msg = ""
except M.CaseAlignmentError as exc:
    msg = str(exc)
check("MySQL: strict stops the application and the message carries the error number", "NOT started" in msg and "(error 1142)" in msg, msg)

# ---- the unique key cannot be dropped -> degraded -------------------------------------------------------------
fm = failing_mysql({"needle": "DROP INDEX uq_barangay_referrals_report_id",
                    "error": lambda: OperationalError(1553, "Cannot drop index needed in a foreign key constraint")})
res = M.run_case_alignment(FakeEngine(fm), strict=True)           # must not raise
check("MySQL: a unique key that cannot be dropped is degraded (the application starts) and says what it costs",
      res["status"] == "degraded" and res["critical"] == []
      and any("still has a unique key on report_id" in d and "second referral for the same case is refused" in d for d in res["degraded"]), res)
check("MySQL: ...with the step error kept", any(e.startswith("referral_columns: OperationalError (error 1553)") for e in res["errors"]), res["errors"])

# ---- the ENUM cannot be widened -> degraded -------------------------------------------------------------------
fm = failing_mysql({"needle": "MODIFY COLUMN animal_type", "error": lambda: OperationalError(1265, "Data truncated")})
res = M.run_case_alignment(FakeEngine(fm))
check("MySQL: an ENUM that cannot be widened is degraded, naming the animals the database would refuse",
      res["status"] == "degraded" and any("reports.animal_type does not accept Bird, Small mammal, Reptile, Livestock, Wildlife, Other" in d for d in res["degraded"]), res)

# ---- barangay_id cannot be made nullable -> degraded ----------------------------------------------------------
fm = failing_mysql({"needle": "MODIFY COLUMN barangay_id", "error": lambda: OperationalError(1205, "Lock wait timeout exceeded")})
res = M.run_case_alignment(FakeEngine(fm))
check("MySQL: a lock timeout on barangay_id is degraded and says a non-Barangay referral would be refused",
      res["status"] == "degraded" and any("barangay_id is still required" in d for d in res["degraded"]), res)

# ---- a lost race on MySQL -> recovered ------------------------------------------------------------------------
fm = failing_mysql({"needle": "ALTER TABLE reports ADD COLUMN", "times": 1, "apply_first": True,
                    "error": lambda: OperationalError(1060, "Duplicate column name 'case_status'")})
res = M.run_case_alignment(FakeEngine(fm), strict=True)
check("MySQL: 'Duplicate column name' from a lost race is recovered on the second attempt",
      res["status"] == "ok" and res["errors"] == [] and len(res["recovered"]) == 1 and "(error 1060)" in res["recovered"][0], res)

# ---- the metadata-lock wait is bounded, and put back ----------------------------------------------------------
fm = legacy_mysql()
res = M.run_case_alignment(FakeEngine(fm))
sets = [s for s in fm.log if s.startswith("SET SESSION lock_wait_timeout")]
check("MySQL: every step's connection bounds the metadata-lock wait (MySQL's default is a year) and restores it",
      M.LOCK_WAIT_TIMEOUT_SECONDS == 60 and sets.count("SET SESSION lock_wait_timeout = 60") == len(M.STEPS)
      and sets.count("SET SESSION lock_wait_timeout = DEFAULT") == len(M.STEPS) and fm.log[0] == "SET SESSION lock_wait_timeout = 60", sets)

# ---- the schema check never writes ----------------------------------------------------------------------------
mark_log, mark_ddl = len(fm.log), len(fm.ddl)
M.check_case_schema(FakeEngine(fm))
issued = fm.log[mark_log:]
check("MySQL: the schema check issues SELECT statements only", issued and all(s.upper().startswith("SELECT") for s in issued) and len(fm.ddl) == mark_ddl, issued[:3])

# ---- no duplicate foreign keys when the table was made from the models (auto-named keys) -----------------------
fm = legacy_mysql()
for name, ddl in M.REPORT_COLUMNS:                         # a create_all table already has the columns...
    fm.tables["reports"]["columns"][name] = {"type": ddl, "nullable": "NOT NULL" not in ddl.upper()}
for i, col in enumerate(M.REPORT_USER_FKS, start=1):       # ...and its keys, under the names MySQL gives them
    fm.tables["reports"]["fks"].add(f"reports_ibfk_{i}")
    fm.tables["reports"]["fk_cols"].add(col)
res = M.run_case_alignment(FakeEngine(fm))
constraint_statements = [s for s in fm.ddl if "ADD CONSTRAINT" in s]
check("MySQL: foreign keys are found by their column, not their name: none is added twice on a create_all table",
      res["status"] == "ok" and len(constraint_statements) == 1 and constraint_statements[0].startswith("ALTER TABLE barangay_referrals"), constraint_statements)

# ============================================================================================================
# 9. Error descriptions
# ============================================================================================================
check("an error is described by its class, the database error number and the start of its message",
      M._describe(OperationalError(1142, "ALTER command denied")) == "OperationalError (error 1142): ALTER command denied")
check("a plain exception has no number and its whitespace is tidied", M._describe(RuntimeError("a\n   b")) == "RuntimeError: a b")
check("a very long message is cut", len(M._describe(RuntimeError("x" * 1000))) < 200)

print(f"\n{PASSED} checks passed")
