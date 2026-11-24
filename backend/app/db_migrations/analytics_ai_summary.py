"""
Cached Analytics AI summary (2026-11-24): the schema this release needs.

Applied by backend/migrations/2026-11-24_analytics_ai_summary.sql, run once by hand. The application never creates the table at
start-up: main.py only checks, read-only, and refuses to start with this file's name when it is missing.
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-24_analytics_ai_summary.sql"
TABLE = "analytics_ai_summaries"


class AnalyticsAiSummarySchemaMissing(RuntimeError):
    """The database has not had the 2026-11-24 analytics AI summary migration applied."""


def missing(engine) -> List[str]:
    return [] if TABLE in inspect(engine).get_table_names() else [f"table {TABLE}"]


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        raise AnalyticsAiSummarySchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migration once, then start the backend again:\n"
            f'    mysql -u <user> -p <database> -e "source {MIGRATION_FILE}"')
