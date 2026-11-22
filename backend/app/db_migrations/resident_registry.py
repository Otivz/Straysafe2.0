"""
Official resident records and record-based registration (2026-11-22): the schema this release needs.

It is applied by the SQL migration backend/migrations/2026-11-22_resident_registry.sql, which is run once. The application never
creates or alters these at start-up: main.py only checks, read-only, and refuses to start with this file's name when something is
missing (docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md).
"""
from typing import List

from sqlalchemy import inspect

MIGRATION_FILE = "backend/migrations/2026-11-22_resident_registry.sql"
INVITATIONS_FILE = "backend/migrations/2026-11-22_resident_invitations.sql"
APPLICATIONS_FILE = "backend/migrations/2026-11-22_resident_applications.sql"
TABLES = ("resident_import_batches", "resident_import_rows", "official_resident_records", "resident_invitations", "resident_applications")


class ResidentRegistrySchemaMissing(RuntimeError):
    """The database has not had the 2026-11-22 resident registry migration applied."""


def missing(engine) -> List[str]:
    """What the database lacks (empty when the migration is applied). Read-only."""
    tables = set(inspect(engine).get_table_names())
    return [f"table {t}" for t in TABLES if t not in tables]


def require(engine) -> None:
    gone = missing(engine)
    if gone:
        raise ResidentRegistrySchemaMissing(
            f"The database is missing {', '.join(gone)}. Apply the migrations once, in this order, then start the backend again:\n"
            f"    mysql -u <user> -p <database> -e \"source {MIGRATION_FILE}\"\n"
            f"    mysql -u <user> -p <database> -e \"source {INVITATIONS_FILE}\"\n"
            f"    mysql -u <user> -p <database> -e \"source {APPLICATIONS_FILE}\"")
