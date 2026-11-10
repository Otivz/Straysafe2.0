"""
A test process may only talk to SQLite.

The application's database is whatever DATABASE_URL says, and app/database/session.py fills that variable from the
repository's .env when the process did not set it. A test that forgets to point DATABASE_URL at a throwaway file therefore
runs against the real database. Eight older tests did exactly that: they imported app.main, which also runs every
start-up migration, on the database named in .env.

This is the tripwire that makes it impossible. It is installed on the application's engine and checked when a connection
is about to be OPENED, not when the engine is built, so a test that only imports schemas or helpers is not affected. If the
process is a test run and the engine is not SQLite, the connection is refused before any network traffic.

A process counts as a test run when
  - its entry script sits in a directory called "tests" (python tests/test_x.py, which is how this repository runs them),
  - or pytest is loaded,
  - or STRAYSAFE_TEST_PROCESS=1 is set (backend/tests/_isolated_db.py sets it).
The server (uvicorn, gunicorn, a management script) never matches. There is deliberately no override: a test that needs a
different database engine should be given one here, on purpose, not by an environment variable.
"""
import os
import sys

from sqlalchemy import event

MESSAGE = (
    "Refusing to open a {engine} connection from a test process. Tests may only use a throwaway SQLite file: set "
    "DATABASE_URL to one BEFORE importing anything from app (backend/tests/_isolated_db.py does it), and never import "
    "app.main in a test (its start-up code is MySQL only and changes the configured database)."
)


def is_test_process() -> bool:
    if os.environ.get("STRAYSAFE_TEST_PROCESS") == "1" or "pytest" in sys.modules:
        return True
    entry = getattr(sys.modules.get("__main__"), "__file__", None)
    if not entry:
        return False
    return os.path.basename(os.path.dirname(os.path.abspath(entry))).lower() == "tests"


def install_connection_guard(engine) -> None:
    """Arm the tripwire on `engine`. A SQLite engine is always allowed, so nothing is installed for it."""
    if engine.dialect.name == "sqlite":
        return

    @event.listens_for(engine, "do_connect")
    def _refuse_in_tests(dialect, conn_rec, cargs, cparams):  # noqa: ARG001  (signature fixed by SQLAlchemy)
        if is_test_process():
            raise RuntimeError(MESSAGE.format(engine=dialect.name))
