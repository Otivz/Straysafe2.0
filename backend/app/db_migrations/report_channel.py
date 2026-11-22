"""
Who reported a case and how (2026-11-23): the schema this release needs.

Applied by backend/migrations/2026-11-23_report_channel.sql, run once by hand. The application never alters the table at start-up:
main.py only checks, read-only, and refuses to start with this file's name when a column is missing.
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-23_report_channel.sql"
COLUMNS = ("report_channel", "reported_by_name", "reported_by_contact", "reported_on_behalf_of")


class ReportChannelSchemaMissing(RuntimeError):
    """The database has not had the 2026-11-23 report channel migration applied."""


def missing(engine) -> List[str]:
    cols = {c["name"] for c in inspect(engine).get_columns("reports")}
    return [f"column reports.{c}" for c in COLUMNS if c not in cols]


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        raise ReportChannelSchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migration once, then start the backend again:\n"
            f"    mysql -u <user> -p <database> -e \"source {MIGRATION_FILE}\"")
