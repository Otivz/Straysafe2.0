"""
A test never touches the configured database (app/database/connection_guard.py, tests/_isolated_db.py).

Two independent barriers, plus a lint so a new test cannot forget:
  1. tests/_isolated_db.py replaces DATABASE_URL with a throwaway SQLite file and disables the MySQL driver;
  2. the application's engine refuses to OPEN a non-SQLite connection when the process is a test (connection_guard.py).
Offline: the MySQL URLs used here point at an unreachable canary (127.0.0.1:9) and are never connected to: the guard refuses
first, and the driver is disabled behind it. Run from the backend folder:  python tests/test_database_connection_guard.py
"""
import ast
import glob
import os
import subprocess
import sys
import tempfile
import types

import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite, no outside services, MySQL disabled)

from sqlalchemy import create_engine, text

from app.database import connection_guard as G
from app.database import engine as app_engine

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
CANARY = "mysql+pymysql://canary:canary@127.0.0.1:9/canary"
REFUSAL = "Refusing to open a mysql connection from a test process"
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


# ============================================================================================================
# 1. When is a process "a test"?
# ============================================================================================================
class Pretend:
    """Temporarily change what the guard looks at: the entry script, the marker variable, pytest."""

    def __init__(self, entry=None, marker=None, pytest=False, has_file=True):
        self.entry, self.marker, self.pytest, self.has_file = entry, marker, pytest, has_file

    def __enter__(self):
        main = sys.modules["__main__"]
        self.saved = (getattr(main, "__file__", None), os.environ.get("STRAYSAFE_TEST_PROCESS"), sys.modules.get("pytest"))
        if self.has_file:
            main.__file__ = self.entry
        elif hasattr(main, "__file__"):
            del main.__file__
        if self.marker is None:
            os.environ.pop("STRAYSAFE_TEST_PROCESS", None)
        else:
            os.environ["STRAYSAFE_TEST_PROCESS"] = self.marker
        if self.pytest:
            sys.modules["pytest"] = types.ModuleType("pytest")
        else:
            sys.modules.pop("pytest", None)
        return self

    def __exit__(self, *exc):
        main = sys.modules["__main__"]
        if self.saved[0] is not None:
            main.__file__ = self.saved[0]
        if self.saved[1] is None:
            os.environ.pop("STRAYSAFE_TEST_PROCESS", None)
        else:
            os.environ["STRAYSAFE_TEST_PROCESS"] = self.saved[1]
        if self.saved[2] is None:
            sys.modules.pop("pytest", None)
        else:
            sys.modules["pytest"] = self.saved[2]


check("this script is a test process", G.is_test_process())
with Pretend(entry=os.path.join("C:\\srv", "app", "run.py")):
    check("a server script outside any tests folder, no marker, no pytest: NOT a test process", not G.is_test_process())
with Pretend(entry=os.path.join("C:\\repo", "backend", "tests", "test_x.py")):
    check("an entry script inside a folder called tests: a test process", G.is_test_process())
with Pretend(entry=os.path.join("C:\\srv", "uvicorn", "__main__.py"), marker="1"):
    check("the STRAYSAFE_TEST_PROCESS marker makes any process a test process", G.is_test_process())
with Pretend(entry=os.path.join("C:\\srv", "run.py"), pytest=True):
    check("pytest loaded: a test process", G.is_test_process())
with Pretend(has_file=False):
    check("no entry script at all (python -c, a REPL): NOT a test process", not G.is_test_process())

# ============================================================================================================
# 2. The tripwire
# ============================================================================================================
guarded = create_engine(CANARY)         # building an engine opens nothing
G.install_connection_guard(guarded)
try:
    guarded.connect()
    refusal = None
except RuntimeError as exc:
    refusal = str(exc)
check("a MySQL engine is refused in a test process, before any connection", refusal is not None and REFUSAL in refusal, refusal)
check("...and the refusal does not leak the URL, host, user or password",
      refusal is not None and not any(s in refusal for s in ("canary", "127.0.0.1", "password")), refusal)
check("...and it says what to do instead", refusal is not None and "_isolated_db" in refusal and "DATABASE_URL" in refusal)

unguarded = create_engine(CANARY)       # the second barrier on its own: the driver itself is disabled
try:
    unguarded.connect()
    second = None
except AssertionError as exc:
    second = str(exc)
check("independently, the disabled MySQL driver refuses an unguarded engine", second is not None and "MySQL connection" in second, second)

lite = create_engine("sqlite://")
G.install_connection_guard(lite)
with lite.connect() as conn:
    one = conn.execute(text("SELECT 1")).scalar()
check("a SQLite engine is never affected", one == 1)

outside = create_engine(CANARY)
G.install_connection_guard(outside)
with Pretend(entry=os.path.join("C:\\srv", "app", "run.py")):
    try:
        outside.connect()
        reached = "connected"
    except RuntimeError:
        reached = "guard"
    except AssertionError:
        reached = "driver"
check("outside a test process the guard stays out of the way (the disabled driver was reached; the server is unaffected)", reached == "driver", reached)
check("the application's own engine is the throwaway SQLite file made by _isolated_db",
      app_engine.dialect.name == "sqlite" and os.path.normpath(str(app_engine.url.database)) == os.path.normpath(_isolated_db.DATABASE_FILE))

# ============================================================================================================
# 3. A hostile environment
# ============================================================================================================
hostile = dict(os.environ, DATABASE_URL=CANARY)
hostile.pop("STRAYSAFE_TEST_PROCESS", None)
probe = (
    "import sys\n"
    f"sys.path.insert(0, {HERE!r})\n"
    "import _isolated_db\n"
    "from app.database import engine\n"
    "import pymysql\n"
    "try:\n"
    "    pymysql.connect(host='127.0.0.1', port=9)\n"
    "    print('CONNECTED')\n"
    "except AssertionError:\n"
    "    print('blocked')\n"
    "print(engine.dialect.name)\n"
)
out = subprocess.run([sys.executable, "-c", probe], env=hostile, capture_output=True, text=True, timeout=180).stdout.split()
check("a hostile DATABASE_URL in the shell is replaced by SQLite and the MySQL driver is disabled", out == ["blocked", "sqlite"], out)

# a test that FORGETS _isolated_db, run as a real script in a folder called tests, with a MySQL URL in the environment
forgetful_dir = os.path.join(tempfile.mkdtemp(), "tests")
os.makedirs(forgetful_dir)
forgetful = os.path.join(forgetful_dir, "test_forgetful.py")
with open(forgetful, "w", encoding="utf-8") as f:
    f.write(f"import sys\nsys.path.insert(0, {BACKEND!r})\nfrom app.database import engine\nengine.connect()\nprint('CONNECTED')\n")
ran = subprocess.run([sys.executable, forgetful], env=hostile, capture_output=True, text=True, timeout=180)
check("a test that forgets to isolate itself is stopped at its first connection", ran.returncode != 0 and REFUSAL in ran.stderr
      and "CONNECTED" not in ran.stdout, (ran.returncode, ran.stderr[-300:]))

# ============================================================================================================
# 4. The lint: no test imports app.main, and every test that binds the database layer isolates first
# ============================================================================================================
DB_BINDING = ("app.database", "app.models", "app.routes", "app.services", "app.db_migrations", "app.main")
ISOLATORS = ("_isolated_db", "scripts.evaluate_ai")     # scripts/evaluate_ai.py assigns a throwaway SQLite URL (checked below)


def imported_names(node):
    if isinstance(node, ast.Import):
        return [a.name for a in node.names]
    if isinstance(node, ast.ImportFrom):
        return [node.module or ""] + [f"{node.module}.{a.name}" for a in node.names]
    return []


def assigns_sqlite_url(node, source):
    """os.environ["DATABASE_URL"] = <something with sqlite in it>; setdefault is NOT accepted: a value already set would win."""
    if not isinstance(node, ast.Assign) or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Subscript):
        return False
    target = node.targets[0]
    return (ast.get_source_segment(source, target.value) == "os.environ" and isinstance(target.slice, ast.Constant)
            and target.slice.value == "DATABASE_URL" and "sqlite" in (ast.get_source_segment(source, node.value) or ""))


def lint_source(source):
    tree = ast.parse(source)
    problems = []
    for node in ast.walk(tree):
        if any(n == "app.main" or n.startswith("app.main.") for n in imported_names(node)):
            problems.append(f"line {node.lineno}: imports app.main (its start-up is MySQL only and changes the configured database)")
    isolation = binding = None
    for node in tree.body:
        names = imported_names(node)
        if isolation is None and (any(n in ISOLATORS for n in names) or assigns_sqlite_url(node, source)):
            isolation = node.lineno
        if binding is None and any(n.startswith(DB_BINDING) for n in names):
            binding = node.lineno
    if binding is not None and (isolation is None or isolation > binding):
        problems.append(f"line {binding}: imports the application's database layer before the test isolates itself "
                        f"(import _isolated_db first, or assign os.environ['DATABASE_URL'] a sqlite URL)")
    return problems


check("lint: importing app.main is caught", lint_source("from app.main import app\n") != [])
check("lint: importing app.main through 'from app import main' is caught", lint_source("from app import main\n") != [])
check("lint: the database layer imported before any isolation is caught", lint_source("from app.database import engine\n") != [])
check("lint: os.environ.setdefault is NOT isolation (a value already in the shell would win)",
      lint_source("import os\nos.environ.setdefault('DATABASE_URL', 'sqlite://')\nfrom app.models import user\n") != [])
check("lint: _isolated_db first is accepted", lint_source("import _isolated_db\nfrom app.database import engine\n") == [])
check("lint: assigning a sqlite URL first is accepted",
      lint_source("import os\nos.environ['DATABASE_URL'] = 'sqlite:///x.db'\nfrom app.database import engine\n") == [])
check("lint: assigning a MySQL URL is not isolation",
      lint_source("import os\nos.environ['DATABASE_URL'] = 'mysql+pymysql://u:p@h/db'\nfrom app.database import engine\n") != [])
check("lint: a test that imports only schemas or helpers is not flagged", lint_source("from app.utils import local_time\n") == [])

evaluate_ai = open(os.path.join(BACKEND, "scripts", "evaluate_ai.py"), encoding="utf-8").read()
check("the 'scripts.evaluate_ai' isolator really assigns a throwaway sqlite URL",
      any(assigns_sqlite_url(n, evaluate_ai) for n in ast.parse(evaluate_ai).body))

files = sorted(glob.glob(os.path.join(HERE, "test_*.py")))
found = {os.path.basename(p): lint_source(open(p, encoding="utf-8").read()) for p in files}
violations = {name: problems for name, problems in found.items() if problems}
check(f"every one of the {len(files)} test files isolates itself before touching the database layer, and none imports app.main",
      not violations, violations)

# ============================================================================================================
# 5. The server wiring the failure handling relies on is still there (app.main is only READ, never imported)
# ============================================================================================================
main_tree = ast.parse(open(os.path.join(BACKEND, "app", "main.py"), encoding="utf-8").read())
calls = [n for n in ast.walk(main_tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "run_case_alignment"]
check("app/main.py runs the case alignment with strict=True, so a critical failure stops the application starting",
      len(calls) == 1 and any(k.arg == "strict" and isinstance(k.value, ast.Constant) and k.value.value is True for k in calls[0].keywords))
session_source = open(os.path.join(BACKEND, "app", "database", "session.py"), encoding="utf-8").read()
check("the application's engine has the connection guard installed", "install_connection_guard(engine)" in session_source)

print(f"\n{PASSED} checks passed")
