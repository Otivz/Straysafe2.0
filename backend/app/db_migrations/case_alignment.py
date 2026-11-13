"""
Database alignment for the Subdivision Admin case workflow.

This follows the project's own migration convention (no Alembic): small `ensure_*` functions that are safe to run on
every start. Each one checks what is already there, adds only what is missing, never drops or rewrites existing data,
and returns what it did. `run_case_alignment()` runs them all; `app/main.py` calls it after the older ensure_* functions.

Why it lives here and not in main.py: importing app.main changes the configured database, so nothing in it can be
tested safely. This module takes the engine as an argument, so the tests run it against throwaway databases.

What it does (docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md lists the same):
  reports               + case_status, assessment, identity, ownership, closure, reopen and sensitivity columns, and
                        pet_snapshot (2026-11-11: the pet of a Lost Pet report as it was when filed) and client_request_id
                        (2026-11-11: a Lost Pet submission's retry key);
                        animal_type accepts more animals (MySQL: ENUM members appended in place)
  barangay_referrals    + organisation, contact, urgency, own status and outcome columns; barangay_id may be empty;
                        the "one referral per report" unique key is replaced by a plain index (MySQL)
  barangay_referral_updates  + status_after
  owner_warnings        + policy and observation columns
  lost_pet_alerts       + alert_type (existing rows are 'lost_pet'), and (2026-11-11) the recovery record: recovered_at,
                        recovery_source, recovery_confirmed_by, recovery_recorded_by, recovery_recorded_at, recovery_note
  lost_pet_sightings    + (2026-11-11) sighting_type (existing rows are 'seen') and care_note
  case_followups, case_contact_logs, case_links, ownership_claims   new tables (created from the models), and (2026-11-11)
                        lost_pet_coordinations, lost_pet_coordination_messages
  report_categories     the six categories are added by name when missing (existing rows are kept)
  data                  case_status and identity_status are filled from what the rows already say; referral rows get an
                        organisation and a status. Only rows where the new column is still empty are touched.

MySQL is the production database; the SQLite path exists so the tests can run offline. Steps that SQLite cannot do
(ENUM change, unique-key drop, nullability change, foreign keys) are MySQL only and are skipped elsewhere.

When a step fails (what happens, in order):
  1. every other step still runs, and a failed step is tried ONE more time (another process starting at the same moment may
     have changed the schema in between; every step is idempotent, so the second attempt is a no-op if it did);
  2. whatever the steps reported, the schema is then VERIFIED against what the code needs (check_case_schema), because the
     schema, not the step's exit status, is what decides whether the application can run:
       critical  a table or column the models read is missing. Every query on that table fails, so the status is "failed";
       degraded  something the code can live without is missing (an index, a foreign key, the wider ENUM, the unique key still
                 in the way of a second referral, a category). The status is "degraded" and each gap says what it costs;
  3. app/main.py calls run_case_alignment(engine, strict=True): "failed" raises CaseAlignmentError and the application does
     NOT start. "degraded" starts, with one ERROR line per gap. Nothing is rolled back and nothing is dropped.
Each step's connection also gives up on a metadata lock after LOCK_WAIT_TIMEOUT_SECONDS (MySQL's default is a year), so a
long transaction held elsewhere makes start-up fail visibly instead of hanging.
"""
import contextlib
import logging
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import inspect, text

from app.utils import case_vocab as V

logger = logging.getLogger("uvicorn.error")

LOCK_WAIT_TIMEOUT_SECONDS = 60


class CaseAlignmentError(RuntimeError):
    """The schema cannot support the case workflow code and the migration could not fix it. `result` is the full report."""

    def __init__(self, message: str, result: Dict[str, Any]):
        super().__init__(message)
        self.result = result

REPORT_COLUMNS: List[Tuple[str, str]] = [
    ("case_status", "VARCHAR(20) NULL"),
    ("incident_verification", "VARCHAR(20) NULL"),
    ("incident_basis", "TEXT NULL"),
    ("evidence_sufficiency", "VARCHAR(20) NULL"),
    ("evidence_reviewed", "JSON NULL"),
    ("urgency_level", "VARCHAR(20) NULL"),
    ("urgency_note", "TEXT NULL"),
    ("assessment_notes", "TEXT NULL"),
    ("assessed_at", "DATETIME NULL"),
    ("assessed_by", "INT NULL"),
    ("identity_status", "VARCHAR(20) NULL"),
    ("identity_note", "TEXT NULL"),
    ("ownership_status", "VARCHAR(20) NULL"),
    ("ownership_owner_id", "INT NULL"),
    ("ownership_evidence", "JSON NULL"),
    ("ownership_note", "TEXT NULL"),
    ("ownership_decided_by", "INT NULL"),
    ("ownership_decided_at", "DATETIME NULL"),
    ("closure_disposition", "VARCHAR(40) NULL"),
    ("closure_reason", "TEXT NULL"),
    ("closed_at", "DATETIME NULL"),
    ("closed_by", "INT NULL"),
    ("reopened_count", "INT NOT NULL DEFAULT 0"),
    ("last_reopened_at", "DATETIME NULL"),
    ("last_reopened_by", "INT NULL"),
    ("last_reopen_reason", "TEXT NULL"),
    ("is_sensitive", "BOOLEAN NOT NULL DEFAULT 0"),
    # Registration-first Lost Pet reports (2026-11-11): the pet as it was when the report was filed + the last-seen details
    ("pet_snapshot", "JSON NULL"),
    # Lost Pet submissions are retry-safe (2026-11-11)
    ("client_request_id", "VARCHAR(64) NULL"),
]
REPORT_USER_FKS = ("assessed_by", "ownership_owner_id", "ownership_decided_by", "closed_by", "last_reopened_by")

REFERRAL_COLUMNS: List[Tuple[str, str]] = [
    ("org_type", "VARCHAR(20) NULL"),
    ("org_name", "VARCHAR(150) NULL"),
    ("contact_person", "VARCHAR(150) NULL"),
    ("contact_detail", "VARCHAR(255) NULL"),
    ("is_urgent", "BOOLEAN NOT NULL DEFAULT 0"),
    # No default on purpose: the backfill below tells an old completed referral from a new one by the NULL.
    ("referral_status", "VARCHAR(20) NULL"),
    ("status_updated_at", "DATETIME NULL"),
    ("status_updated_by", "INT NULL"),
    ("external_outcome", "TEXT NULL"),
    ("remaining_follow_up", "TEXT NULL"),
    ("follow_up_at", "DATETIME NULL"),
]
REFERRAL_UPDATE_COLUMNS: List[Tuple[str, str]] = [("status_after", "VARCHAR(20) NULL")]
WARNING_COLUMNS: List[Tuple[str, str]] = [
    ("policy_id", "VARCHAR(60) NULL"),
    ("policy_title", "VARCHAR(200) NULL"),
    ("policy_reference", "VARCHAR(200) NULL"),
    ("observation_days", "INT NULL"),
    ("follow_up_at", "DATETIME NULL"),
]
ALERT_COLUMNS: List[Tuple[str, str]] = [
    ("alert_type", "VARCHAR(20) NOT NULL DEFAULT 'lost_pet'"),
    # The owner's confirmation that the pet is home (2026-11-11): who, how and when (services/lost_pet_lifecycle.py)
    ("recovered_at", "DATETIME NULL"),
    ("recovery_source", "VARCHAR(20) NULL"),
    ("recovery_confirmed_by", "INT NULL"),
    ("recovery_recorded_by", "INT NULL"),
    ("recovery_recorded_at", "DATETIME NULL"),
    ("recovery_note", "TEXT NULL"),
]
ALERT_USER_FKS = ("recovery_confirmed_by", "recovery_recorded_by")
# 2026-11-11: a possible-recovery report ("I may have this pet safely with me") is a sighting of another type
SIGHTING_COLUMNS: List[Tuple[str, str]] = [
    ("sighting_type", "VARCHAR(20) NOT NULL DEFAULT 'seen'"),
    ("on_behalf", "BOOLEAN NOT NULL DEFAULT 0"),
    ("care_note", "TEXT NULL"),
]
COORDINATION_MESSAGE_COLUMNS: List[Tuple[str, str]] = [("client_request_id", "VARCHAR(64) NULL")]
CASE_TABLES = ("case_followups", "case_contact_logs", "case_links", "ownership_claims",
               "lost_pet_coordinations", "lost_pet_coordination_messages", "lost_found_matches",
               "case_message_threads", "case_message_members", "case_messages")


# ------------------------------------------------------------------------------------------------------- helpers
def _is_mysql(conn) -> bool:
    return conn.dialect.name in ("mysql", "mariadb")


def _has_table(conn, table: str) -> bool:
    if _is_mysql(conn):
        return bool(conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"),
            {"t": table}).scalar())
    return inspect(conn).has_table(table)


def _columns(conn, table: str) -> set:
    if _is_mysql(conn):
        rows = conn.execute(text(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"),
            {"t": table}).all()
        return {r[0] for r in rows}
    return {c["name"] for c in inspect(conn).get_columns(table)}


def _add_columns(conn, table: str, columns: Iterable[Tuple[str, str]], actions: List[str]) -> None:
    """
    Add the columns that are missing. On MySQL they go in ONE statement: it is a single metadata change (MySQL 8 keeps
    only 64 "instant" additions per table, and one statement counts once). SQLite takes one column per statement.
    """
    if not _has_table(conn, table):
        return
    present = _columns(conn, table)
    missing = [(name, ddl) for name, ddl in columns if name not in present]
    if not missing:
        return
    if _is_mysql(conn):
        conn.execute(text(f"ALTER TABLE {table} " + ", ".join(f"ADD COLUMN {n} {d}" for n, d in missing)))
    else:
        for name, ddl in missing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
    actions.extend(f"{table}.{name} added" for name, _ in missing)


def _user_fk_exists(conn, table: str, column: str) -> bool:
    """
    Is there a foreign key from table.column to users, WHATEVER IT IS CALLED? A table made by create_all from the models gets
    auto-named keys (reports_ibfk_3), one added by this migration is called fk_<table>_<column>; looking at the column, not
    the name, keeps a second run (and a fresh database) from adding a duplicate.
    """
    return bool(conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() "
        "AND TABLE_NAME = :t AND COLUMN_NAME = :c AND REFERENCED_TABLE_NAME = 'users'"),
        {"t": table, "c": column}).scalar())


def _add_user_fks(conn, table: str, columns: Iterable[str], actions: List[str]) -> None:
    """
    MySQL only: the model declares these foreign keys, so an existing table gets them too (one statement). SQLite
    cannot add a foreign key to an existing table, and a fresh SQLite table already has them from the model.
    """
    if not _is_mysql(conn) or not _has_table(conn, table):
        return
    present = _columns(conn, table)
    missing = [c for c in columns if c in present and not _user_fk_exists(conn, table, c)]
    if not missing:
        return
    conn.execute(text(f"ALTER TABLE {table} " + ", ".join(
        f"ADD CONSTRAINT fk_{table}_{c} FOREIGN KEY ({c}) REFERENCES users (user_id) ON DELETE SET NULL"
        for c in missing)))
    actions.extend(f"{table}.{c} foreign key added" for c in missing)


def _index_exists(conn, table: str, index: str) -> bool:
    if _is_mysql(conn):
        return bool(conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = :t AND INDEX_NAME = :i"), {"t": table, "i": index}).scalar())
    return any(ix["name"] == index for ix in inspect(conn).get_indexes(table))


def _ids(values: Iterable[int]) -> str:
    return ", ".join(str(int(v)) for v in sorted(values))


def _text(value) -> str:
    return value.decode() if isinstance(value, (bytes, bytearray)) else str(value)


def _unique_key_names_on(conn, table: str, column: str) -> List[str]:
    """MySQL: the unique keys (never the primary key) that cover exactly this one column, whatever they are called."""
    rows = conn.execute(text(
        "SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND NON_UNIQUE = 0 "
        "AND INDEX_NAME <> 'PRIMARY' GROUP BY INDEX_NAME"), {"t": table}).all()
    return [_text(name) for (name, cols) in rows if _text(cols) == column]


def _animal_type_members(conn) -> Optional[List[str]]:
    """MySQL: the members of reports.animal_type when it is an ENUM, else None (nothing to widen)."""
    column_type = conn.execute(text(
        "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
        "AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'animal_type'")).scalar()
    if not column_type or not str(column_type).lower().startswith("enum("):
        return None
    return [m.replace("''", "'") for m in re.findall(r"'((?:[^']|'')*)'", str(column_type))]


def _barangay_id_is_required(conn) -> bool:
    """MySQL: is barangay_referrals.barangay_id still NOT NULL?"""
    return conn.execute(text(
        "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
        "AND TABLE_NAME = 'barangay_referrals' AND COLUMN_NAME = 'barangay_id'")).scalar() == "NO"


def _describe(exc: BaseException) -> str:
    """One short line about an error: its class, the database's error number when there is one, and the start of its message."""
    inner = getattr(exc, "orig", None) or exc
    args = getattr(inner, "args", ()) or ()
    code = args[0] if args and isinstance(args[0], int) else None
    message = str(args[1]) if code is not None and len(args) > 1 else str(inner)
    return f"{type(exc).__name__}{f' (error {code})' if code is not None else ''}: {' '.join(message.split())[:160]}"


def _names(columns: List[str], limit: int = 8) -> str:
    shown = ", ".join(columns[:limit])
    return f"{'column' if len(columns) == 1 else 'columns'} {shown}" + (f" and {len(columns) - limit} more" if len(columns) > limit else "")


@contextlib.contextmanager
def _migration_connection(engine):
    """
    One transaction on a connection that will not wait a year for a metadata lock (MySQL's default). The setting is put back
    afterwards: the connection returns to the application's pool and must not keep it.
    """
    with engine.begin() as conn:
        bounded = _is_mysql(conn)
        if bounded:
            conn.execute(text(f"SET SESSION lock_wait_timeout = {int(LOCK_WAIT_TIMEOUT_SECONDS)}"))
        try:
            yield conn
        finally:
            if bounded:
                try:
                    conn.execute(text("SET SESSION lock_wait_timeout = DEFAULT"))
                except Exception:  # noqa: BLE001  (the step failed and the connection may be unusable; the pool discards it)
                    pass


# ----------------------------------------------------------------------------------------------------- the steps
def ensure_report_case_columns(conn) -> List[str]:
    """New columns on reports, an index on case_status, the user foreign keys, and the wider animal_type list."""
    actions: List[str] = []
    if not _has_table(conn, "reports"):
        return actions
    _add_columns(conn, "reports", REPORT_COLUMNS, actions)
    if not _index_exists(conn, "reports", "ix_reports_case_status"):
        conn.execute(text("CREATE INDEX ix_reports_case_status ON reports (case_status)"))
        actions.append("reports.case_status index added")
    _add_user_fks(conn, "reports", REPORT_USER_FKS, actions)
    _widen_animal_type(conn, actions)
    return actions


def _widen_animal_type(conn, actions: List[str]) -> None:
    """
    MySQL: append the new animal types to reports.animal_type's ENUM. Members are added at the END of the list, in
    the existing order, so MySQL changes it in place without rebuilding the table or touching a stored value.
    SQLite stores the column as text, so there is nothing to change.
    """
    if not _is_mysql(conn):
        return
    existing = _animal_type_members(conn)
    if existing is None:
        return
    missing = [label for label in V.ANIMAL_TYPE_LABELS if label not in existing]
    if not missing:
        return
    members = ",".join("'" + v.replace("'", "''") + "'" for v in existing + missing)
    conn.execute(text(f"ALTER TABLE reports MODIFY COLUMN animal_type ENUM({members}) NULL DEFAULT 'Unknown'"))
    actions.append("reports.animal_type accepts " + ", ".join(missing))


def backfill_report_case_state(conn) -> List[str]:
    """
    Fill case_status and identity_status from what each row already says. Rows that already have a value are not
    touched, so running it again changes nothing. current_status_id and every other column are left as they are.
    """
    actions: List[str] = []
    if not _has_table(conn, "reports") or "case_status" not in _columns(conn, "reports"):
        return actions
    result = conn.execute(text(
        "UPDATE reports SET case_status = CASE "
        f"WHEN current_status_id IN ({_ids(V.CLOSED_LEGACY_IDS)}) THEN '{V.CLOSED}' "
        f"WHEN current_status_id IN ({_ids(V._IN_PROGRESS_LEGACY)}) THEN '{V.IN_PROGRESS}' "
        f"WHEN current_status_id IN ({_ids(V._UNDER_REVIEW_LEGACY)}) THEN '{V.UNDER_REVIEW}' "
        f"ELSE '{V.REPORTED}' END WHERE case_status IS NULL"))
    if result.rowcount:
        actions.append(f"reports.case_status filled for {result.rowcount} rows")
    result = conn.execute(text(
        "UPDATE reports SET identity_status = CASE "
        "WHEN pet_id IS NOT NULL AND (pet_inherited_from_match_id IS NULL OR identity_rechecked_at IS NOT NULL) "
        "THEN 'identified' WHEN pet_id IS NOT NULL THEN 'possible_match' ELSE 'unidentified' END "
        "WHERE identity_status IS NULL"))
    if result.rowcount:
        actions.append(f"reports.identity_status filled for {result.rowcount} rows")
    return actions


def ensure_referral_columns(conn) -> List[str]:
    """Several referrals per case, to any organisation, each with its own status. Old rows keep every value."""
    actions: List[str] = []
    if not _has_table(conn, "barangay_referrals"):
        return actions
    _add_columns(conn, "barangay_referrals", REFERRAL_COLUMNS, actions)
    _add_columns(conn, "barangay_referral_updates", REFERRAL_UPDATE_COLUMNS, actions)
    _add_user_fks(conn, "barangay_referrals", ("status_updated_by",), actions)
    if _is_mysql(conn):
        _referral_constraints(conn, actions)
    _backfill_referrals(conn, actions)
    return actions


def _referral_constraints(conn, actions: List[str]) -> None:
    """MySQL: barangay_id may be empty (not every organisation is a Barangay) and a report may have several referrals."""
    if _barangay_id_is_required(conn):
        conn.execute(text("ALTER TABLE barangay_referrals MODIFY COLUMN barangay_id INT NULL"))
        actions.append("barangay_referrals.barangay_id may be empty")
    # The unique key that allowed one referral per report, whatever it is called. It also backs the report foreign
    # key, so a plain index goes in first and only then is the unique key dropped.
    unique_on_report = _unique_key_names_on(conn, "barangay_referrals", "report_id")
    if unique_on_report:
        if not _index_exists(conn, "barangay_referrals", "ix_barangay_referrals_report_id"):
            conn.execute(text("CREATE INDEX ix_barangay_referrals_report_id ON barangay_referrals (report_id)"))
            actions.append("barangay_referrals.report_id index added")
        for name in unique_on_report:
            conn.execute(text(f"ALTER TABLE barangay_referrals DROP INDEX {name}"))
            actions.append(f"barangay_referrals unique key {name} dropped (several referrals per report)")


def _backfill_referrals(conn, actions: List[str]) -> None:
    cols = _columns(conn, "barangay_referrals")
    if not {"org_type", "org_name", "referral_status"} <= cols:
        return
    result = conn.execute(text(
        "UPDATE barangay_referrals SET org_type = 'barangay' WHERE org_type IS NULL AND barangay_id IS NOT NULL"))
    if result.rowcount:
        actions.append(f"barangay_referrals.org_type filled for {result.rowcount} rows")
    pending = conn.execute(text(
        "SELECT r.referral_id, b.barangay_name FROM barangay_referrals r "
        "JOIN barangays b ON b.barangay_id = r.barangay_id WHERE r.org_name IS NULL")).all()
    for referral_id, barangay_name in pending:
        conn.execute(text("UPDATE barangay_referrals SET org_name = :n WHERE referral_id = :i AND org_name IS NULL"),
                     {"n": f"Barangay {barangay_name}", "i": referral_id})
    if pending:
        actions.append(f"barangay_referrals.org_name filled for {len(pending)} rows")
    result = conn.execute(text(
        "UPDATE barangay_referrals SET referral_status = CASE "
        "WHEN final_outcome IS NOT NULL THEN 'completed' "
        "WHEN EXISTS (SELECT 1 FROM barangay_referral_updates u WHERE u.referral_id = barangay_referrals.referral_id) "
        "THEN 'in_progress' ELSE 'sent' END WHERE referral_status IS NULL"))
    if result.rowcount:
        actions.append(f"barangay_referrals.referral_status filled for {result.rowcount} rows")


def ensure_warning_policy_columns(conn) -> List[str]:
    actions: List[str] = []
    _add_columns(conn, "owner_warnings", WARNING_COLUMNS, actions)
    return actions


def ensure_alert_type_column(conn) -> List[str]:
    actions: List[str] = []
    _add_columns(conn, "lost_pet_alerts", ALERT_COLUMNS, actions)
    _add_user_fks(conn, "lost_pet_alerts", ALERT_USER_FKS, actions)
    return actions


def ensure_sighting_columns(conn) -> List[str]:
    """A sighting's type (seen or secured) and the private care note. Existing sightings read 'seen'."""
    actions: List[str] = []
    _add_columns(conn, "lost_pet_sightings", SIGHTING_COLUMNS, actions)
    return actions


def ensure_coordination_message_columns(conn) -> List[str]:
    """Also supports an existing partial implementation; no message is rewritten or removed."""
    actions: List[str] = []
    table = "lost_pet_coordination_messages"
    _add_columns(conn, table, COORDINATION_MESSAGE_COLUMNS, actions)
    if _has_table(conn, table) and not _index_exists(conn, table, "uq_lost_pet_coordination_message_request"):
        conn.execute(text("CREATE UNIQUE INDEX uq_lost_pet_coordination_message_request ON lost_pet_coordination_messages (client_request_id)"))
        actions.append("lost_pet_coordination_messages request-id unique index added")
    return actions


def ensure_case_record_tables(conn) -> List[str]:
    """Case records, matching and participant messages. Create missing tables without replacing existing records."""
    import app.models  # noqa: F401  (registers every table in CASE_TABLES)
    from app.database import Base
    missing = [t for t in CASE_TABLES if not _has_table(conn, t)]
    if missing:
        Base.metadata.create_all(bind=conn, tables=[Base.metadata.tables[t] for t in missing])
    return [f"{t} created" for t in missing]


def seed_case_categories(conn) -> List[str]:
    """The six categories, added by name when missing. Existing categories (and their ids) are never changed."""
    actions: List[str] = []
    if not _has_table(conn, "report_categories"):
        return actions
    has_description = "description" in _columns(conn, "report_categories")
    for key, name in V.CATEGORY_FAMILIES.items():
        found = conn.execute(text("SELECT COUNT(*) FROM report_categories WHERE category_name = :n"), {"n": name}).scalar()
        if found:
            continue
        if has_description:
            conn.execute(text("INSERT INTO report_categories (category_name, description) VALUES (:n, :d)"),
                         {"n": name, "d": V.CATEGORY_DESCRIPTIONS[key]})
        else:
            conn.execute(text("INSERT INTO report_categories (category_name) VALUES (:n)"), {"n": name})
        actions.append(f"report category '{name}' added")
    return actions


STEPS = (
    ("case_record_tables", ensure_case_record_tables),
    ("report_columns", ensure_report_case_columns),
    ("report_case_state", backfill_report_case_state),
    ("referral_columns", ensure_referral_columns),
    ("warning_policy_columns", ensure_warning_policy_columns),
    ("alert_type_column", ensure_alert_type_column),
    ("sighting_columns", ensure_sighting_columns),
    ("coordination_message_columns", ensure_coordination_message_columns),
    ("case_categories", seed_case_categories),
)


# What the models read: a missing table or column here makes every query on that table fail.
REQUIRED_COLUMNS: Tuple[Tuple[str, List[Tuple[str, str]]], ...] = (
    ("reports", REPORT_COLUMNS),
    ("barangay_referrals", REFERRAL_COLUMNS),
    ("barangay_referral_updates", REFERRAL_UPDATE_COLUMNS),
    ("owner_warnings", WARNING_COLUMNS),
    ("lost_pet_alerts", ALERT_COLUMNS),
    ("lost_pet_sightings", SIGHTING_COLUMNS),
    ("lost_pet_coordination_messages", COORDINATION_MESSAGE_COLUMNS),
)


def check_case_schema(engine) -> Dict[str, List[str]]:
    """
    Read-only: compare the database with what the case workflow code needs. Changes nothing.
    Returns {"critical": [...], "degraded": [...]}, each line saying what is wrong and what it costs.
    """
    import app.models  # noqa: F401  (registers every table)
    from app.database import Base

    critical: List[str] = []
    degraded: List[str] = []
    with engine.connect() as conn:
        mysql = _is_mysql(conn)
        for table, columns in REQUIRED_COLUMNS:
            if not _has_table(conn, table):
                critical.append(f"table {table} is missing")
                continue
            present = _columns(conn, table)
            missing = [name for name, _ in columns if name not in present]
            if missing:
                critical.append(f"{table} lacks {_names(missing)}")
        for table in CASE_TABLES:
            if not _has_table(conn, table):
                critical.append(f"table {table} is missing")
                continue
            present = _columns(conn, table)
            missing = [c.name for c in Base.metadata.tables[table].columns if c.name not in present]
            if missing:
                critical.append(f"{table} lacks {_names(missing)}")

        if _has_table(conn, "reports") and not _index_exists(conn, "reports", "ix_reports_case_status"):
            degraded.append("reports has no index on case_status (ix_reports_case_status): filtering by status will be slower")
        if mysql and _has_table(conn, "reports"):
            present = _columns(conn, "reports")
            no_fk = [c for c in REPORT_USER_FKS if c in present and not _user_fk_exists(conn, "reports", c)]
            if no_fk:
                degraded.append(f"reports has no foreign key to users on {', '.join(no_fk)}: deleting a user would leave their id behind in those columns")
            members = _animal_type_members(conn)
            lacking = [a for a in V.ANIMAL_TYPE_LABELS if members is not None and a not in members]
            if lacking:
                degraded.append(f"reports.animal_type does not accept {', '.join(lacking)}: reports about those animals are refused by the database")
        if mysql and _has_table(conn, "barangay_referrals"):
            if _barangay_id_is_required(conn):
                degraded.append("barangay_referrals.barangay_id is still required: a referral to an organisation that is not a Barangay is refused by the database")
            if _unique_key_names_on(conn, "barangay_referrals", "report_id"):
                degraded.append("barangay_referrals still has a unique key on report_id: a second referral for the same case is refused by the database")
            if "status_updated_by" in _columns(conn, "barangay_referrals") and not _user_fk_exists(conn, "barangay_referrals", "status_updated_by"):
                degraded.append("barangay_referrals has no foreign key to users on status_updated_by")
        if _has_table(conn, "report_categories"):
            absent = [name for name in V.CATEGORY_FAMILIES.values() if not conn.execute(
                text("SELECT COUNT(*) FROM report_categories WHERE category_name = :n"), {"n": name}).scalar()]
            if absent:
                degraded.append(f"report categories missing: {', '.join(absent)}; they cannot be chosen when reporting")
    return {"critical": critical, "degraded": degraded}


def _failure_message(result: Dict[str, Any]) -> str:
    lines = ["The case workflow migration could not complete, so the application was NOT started: its code needs database "
             "objects that are missing."]
    lines += [f"  - {item}" for item in result["critical"]]
    lines += [f"  - step {item}" for item in result["errors"]]
    lines.append("Fix the cause (usually the database user lacks ALTER or CREATE rights, or another session holds a lock on the "
                 "table) and start again; the migration is safe to repeat. To apply it by hand see "
                 "docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md.")
    return "\n".join(lines)


def run_case_alignment(engine=None, *, strict: bool = False) -> Dict[str, Any]:
    """
    Run every step against `engine` (default: the application's engine), then verify the schema. Each step runs in its own
    transaction, so one failing step is reported and does not stop the others or undo them; a failed step is tried once more.

    Returns {"actions": what was changed, "errors": steps that failed twice, "recovered": steps that failed once and then
    worked, "critical": missing things the code cannot run without, "degraded": missing things it can run without,
    "status": "ok" | "degraded" | "failed"}. A second run on an up-to-date database changes nothing and returns "ok".
    With strict=True a "failed" status raises CaseAlignmentError (what app/main.py asks for); otherwise the caller decides.
    """
    if engine is None:
        from app.database import engine as default_engine
        engine = default_engine

    actions: List[str] = []
    recovered: List[str] = []
    errors: List[str] = []
    failed_once = []
    for name, step in STEPS:
        try:
            with _migration_connection(engine) as conn:
                actions.extend(step(conn))
        except Exception as exc:  # noqa: BLE001  (every other step must still run)
            failed_once.append((name, step, exc))
            logger.warning("case_alignment step %s failed (%s); it will be tried once more", name, _describe(exc))
    for name, step, first in failed_once:
        try:
            with _migration_connection(engine) as conn:
                actions.extend(step(conn))
            recovered.append(f"{name}: failed once ({_describe(first)}) and worked on the second attempt")
            logger.warning("case_alignment step %s worked on the second attempt (another process may have changed the schema)", name)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {_describe(exc)}")
            logger.error("case_alignment step %s failed twice: %s", name, _describe(exc))

    try:
        verdict = check_case_schema(engine)
    except Exception as exc:  # noqa: BLE001  (a schema that cannot even be inspected cannot be called compatible)
        verdict = {"critical": [f"the schema could not be verified ({_describe(exc)})"], "degraded": []}
    status = "failed" if verdict["critical"] else "degraded" if (verdict["degraded"] or errors) else "ok"
    result = {"actions": actions, "errors": errors, "recovered": recovered, "critical": verdict["critical"],
              "degraded": verdict["degraded"], "status": status}

    for line in actions:
        logger.info("case_alignment: %s", line)
    if status == "ok":
        logger.info("case_alignment: schema verified (%d change(s) made this start)", len(actions))
    elif status == "degraded":
        logger.error("case_alignment: the application will start, but the case workflow schema is DEGRADED:")
        for issue in verdict["degraded"] + [f"step {e}" for e in errors]:
            logger.error("case_alignment:   - %s", issue)
    else:
        logger.critical("case_alignment: FAILED. The schema cannot support the case workflow code:")
        for issue in verdict["critical"] + [f"step {e}" for e in errors]:
            logger.critical("case_alignment:   - %s", issue)
    if strict and status == "failed":
        raise CaseAlignmentError(_failure_message(result), result)
    return result
