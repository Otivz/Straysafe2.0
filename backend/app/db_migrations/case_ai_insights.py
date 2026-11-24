"""
Cached case AI insights (2026-11-24): the schema this release needs.

Applied by backend/migrations/2026-11-24_case_ai_insights.sql (the table) and 2026-11-24_case_ai_insights_evidence.sql (the evidence_check
column), each run once by hand. The application never alters the database at start-up: main.py only checks, read-only, and refuses to
start with the file's name when something is missing.
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-24_case_ai_insights.sql"
EVIDENCE_MIGRATION_FILE = "backend/migrations/2026-11-24_case_ai_insights_evidence.sql"
TABLE = "case_ai_insights"
EVIDENCE_COLUMN = "evidence_check"


class CaseAiInsightsSchemaMissing(RuntimeError):
    """The database has not had the 2026-11-24 case AI insights migration(s) applied."""


def missing(engine) -> List[str]:
    insp = inspect(engine)
    if TABLE not in insp.get_table_names():
        return [f"table {TABLE}", f"column {TABLE}.{EVIDENCE_COLUMN}"]
    cols = {c["name"] for c in insp.get_columns(TABLE)}
    return [] if EVIDENCE_COLUMN in cols else [f"column {TABLE}.{EVIDENCE_COLUMN}"]


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        files = [MIGRATION_FILE, EVIDENCE_MIGRATION_FILE] if f"table {TABLE}" in gone else [EVIDENCE_MIGRATION_FILE]
        lines = [f'    mysql -u <user> -p <database> -e "source {f}"' for f in files]
        raise CaseAiInsightsSchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migration(s) once, in this order, then start the backend again:\n"
            + "\n".join(lines))
