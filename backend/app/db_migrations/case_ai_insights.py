"""
Cached case AI insights (2026-11-24, guidance 2026-11-25): the schema this release needs.

Applied by backend/migrations/2026-11-24_case_ai_insights.sql (the table), 2026-11-24_case_ai_insights_evidence.sql (the evidence_check
column) and 2026-11-25_case_ai_insights_guidance.sql (the guidance column), each run once by hand. The application never alters the
database at start-up: main.py only checks, read-only, and refuses to start with the file names when something is missing.
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-24_case_ai_insights.sql"
EVIDENCE_MIGRATION_FILE = "backend/migrations/2026-11-24_case_ai_insights_evidence.sql"
GUIDANCE_MIGRATION_FILE = "backend/migrations/2026-11-25_case_ai_insights_guidance.sql"
TABLE = "case_ai_insights"
EVIDENCE_COLUMN = "evidence_check"
GUIDANCE_COLUMN = "guidance"
# column -> the file that adds it, in the order they must be applied
COLUMN_FILES = ((EVIDENCE_COLUMN, EVIDENCE_MIGRATION_FILE), (GUIDANCE_COLUMN, GUIDANCE_MIGRATION_FILE))


class CaseAiInsightsSchemaMissing(RuntimeError):
    """The database has not had the case AI insights migration(s) applied."""


def missing(engine) -> List[str]:
    insp = inspect(engine)
    if TABLE not in insp.get_table_names():
        return [f"table {TABLE}"] + [f"column {TABLE}.{col}" for col, _ in COLUMN_FILES]
    cols = {c["name"] for c in insp.get_columns(TABLE)}
    return [f"column {TABLE}.{col}" for col, _ in COLUMN_FILES if col not in cols]


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        files = [MIGRATION_FILE] if f"table {TABLE}" in gone else []
        files += [f for col, f in COLUMN_FILES if f"column {TABLE}.{col}" in gone]
        lines = [f'    mysql -u <user> -p <database> -e "source {f}"' for f in files]
        raise CaseAiInsightsSchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migration(s) once, in this order, then start the backend again:\n"
            + "\n".join(lines))
