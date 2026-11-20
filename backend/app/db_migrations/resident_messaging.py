"""
Resident-to-Administration messaging (2026-11-19): the schema this release needs.

It is applied by the SQL migration backend/migrations/2026-11-19_resident_messaging.sql, which is run once. The application never
alters these at start-up: main.py only checks, read-only, and refuses to start with this file's name when something is missing
(docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md).
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-19_resident_messaging.sql"
TABLE = "case_message_threads"
COLUMNS = ("subject", "close_trigger")


class ResidentMessagingSchemaMissing(RuntimeError):
    """The database has not had the 2026-11-19 resident messaging migration applied."""


def missing(engine) -> List[str]:
    """What the database lacks (empty when the migration is applied). Read-only."""
    insp = inspect(engine)
    if TABLE not in set(insp.get_table_names()):
        return [f"table {TABLE}"]
    cols = {c["name"]: c for c in insp.get_columns(TABLE)}
    out = [f"column {TABLE}.{c}" for c in COLUMNS if c not in cols]
    if "report_id" in cols and not cols["report_id"].get("nullable", True):
        out.append(f"nullable column {TABLE}.report_id")
    return out


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        raise ResidentMessagingSchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migration once, then start the backend again:\n"
            f"    mysql -u <user> -p <database> -e \"source {MIGRATION_FILE}\"")
