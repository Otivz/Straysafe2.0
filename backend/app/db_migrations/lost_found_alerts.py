"""
Lost & found notification alerts (2026-11-12): the schema this release needs.

It is applied by the SQL migration backend/migrations/2026-11-12_lost_found_alerts.sql, which the developer runs once. The application
never creates or alters these at start-up: main.py only checks, read-only, and refuses to start with this file's name when something is
missing (docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md).
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-12_lost_found_alerts.sql"
TABLES = ("case_alerts", "case_alert_sends")
COLUMNS = {"user_notification_preferences": ("push_lost_found_alerts",)}


class LostFoundAlertSchemaMissing(RuntimeError):
    """The database has not had the 2026-11-12 lost & found alerts migration applied."""


def missing(engine) -> List[str]:
    """What the database lacks (empty when the migration is applied). Read-only."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    out = [f"table {t}" for t in TABLES if t not in tables]
    for table, columns in COLUMNS.items():
        if table not in tables:
            out.append(f"table {table}")
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        out += [f"column {table}.{c}" for c in columns if c not in have]
    return out


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        raise LostFoundAlertSchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migration once, then start the backend again:\n"
            f"    mysql -u <user> -p <database> < {MIGRATION_FILE}")
