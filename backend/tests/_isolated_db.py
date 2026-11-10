"""
Import this FIRST in any test that imports the application, before every `app` import.

The application's database is whatever DATABASE_URL says, and the application loads the repository's .env when the
variable is not set, so a test that forgets this runs against the real database. This module makes that impossible:

  1. DATABASE_URL is pointed at a brand-new throwaway SQLite file, whatever the shell or .env says. An inherited MySQL
     URL is replaced, not respected.
  2. Every credential that could reach an outside service is blanked (_offline_env).
  3. The MySQL driver is disabled for the process, so even a test that builds its own engine cannot open a connection.
  4. The process is marked as a test (STRAYSAFE_TEST_PROCESS=1), which arms the application's own connection guard
     (app/database/connection_guard.py) as a second, independent barrier.

app.main can NOT be imported in a test: its start-up code is MySQL only and changes the configured database. The older
"whole application" tests therefore use build_app(): a FastAPI app with just the routers a test needs, which is the same
wiring app.main uses. create_schema_and_seed() then builds every table on the throwaway file and gives it the minimum
the older tests used to find in the developer's own database (the four roles, two subdivisions, the 18 statuses, the
Gemini setting, one user per role and one report).
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_FILE = os.path.join(tempfile.mkdtemp(prefix="straysafe-test-"), "test.db")

os.environ["DATABASE_URL"] = "sqlite:///" + DATABASE_FILE
os.environ.setdefault("JWT_SECRET_KEY", "isolated-test-secret-key-0123456789-0123456789")
os.environ["STRAYSAFE_TEST_PROCESS"] = "1"
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)


def _refuse_mysql(*args, **kwargs):
    raise AssertionError("A test tried to open a MySQL connection. Tests may only use their throwaway SQLite file.")


try:
    import pymysql
    import pymysql.connections
except ImportError:      # not installed: nothing to disable
    pass
else:
    pymysql.connect = _refuse_mysql
    pymysql.Connect = _refuse_mysql
    pymysql.connections.Connection.__init__ = _refuse_mysql


def build_app(*routers):
    """A FastAPI app with just these routers (the wiring app.main uses, without its MySQL-only start-up)."""
    from fastapi import FastAPI
    api = FastAPI()
    for router in routers:
        api.include_router(router)
    return api


def create_schema_and_seed():
    """
    Create every table registered so far (call it AFTER importing the routers a test uses) and seed the minimum.
    Returns the ids it made: {"resident": 1, "leader": 2, "staff": 3, "admin": 4, "report": 1}.
    """
    from decimal import Decimal

    import app.models  # noqa: F401
    # The session hooks app.main has registered before its first request. Some of these modules are otherwise imported
    # lazily, inside a handler, which registers their listeners in the middle of a flush ("deque mutated during iteration").
    import app.services.push_service  # noqa: F401
    import app.utils.case_closure  # noqa: F401
    import app.utils.case_groups  # noqa: F401
    import app.utils.report_split  # noqa: F401
    import app.utils.report_visibility  # noqa: F401
    from app.database import Base, SessionLocal, engine
    from app.db_migrations.case_alignment import run_case_alignment
    from app.models.report import Report, ReportCategory, ReportStatus
    from app.models.system_setting import SystemSetting
    from app.models.user import Barangay, Role, Subdivision, User

    Base.metadata.create_all(bind=engine)
    outcome = run_case_alignment(engine)          # also adds the six report categories to the empty table
    assert outcome["errors"] == [], outcome
    db = SessionLocal()
    try:
        for role_id, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
            db.add(Role(role_id=role_id, role_name=name))
        db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Test City"))
        db.flush()
        db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
                    Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
        for status_id in range(1, 19):
            db.add(ReportStatus(status_id=status_id, status_name=f"Status {status_id}"))
        # The row app.main's ensure_system_settings_table() seeds on a real database.
        db.add(SystemSetting(setting_key="gemini_vision_matching", setting_value="vision", is_enabled=True,
                             description="Toggle between Google Gemini Vision AI Biometrics and Free-Tier Attribute Rule-Based Matching"))
        ids = {}
        for label, role_id in (("resident", 1), ("leader", 2), ("staff", 3), ("admin", 4)):
            user = User(name=f"Seed {label.title()}", email=f"seed.{label}@isolated.test", password="x", role_id=role_id,
                        is_verified=True, status="Active", subdivision_id=1, barangay_id=1,
                        is_head_officer=(role_id == 3))
            db.add(user)
            db.flush()
            ids[label] = user.user_id
        category = db.query(ReportCategory).order_by(ReportCategory.category_id).first()
        report = Report(user_id=ids["resident"], subdivision_id=1, category_id=category.category_id if category else 1,
                        current_status_id=1, animal_type="Dog", description="Seed report", landmark="Gate 2",
                        latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), priority_level="Medium")
        db.add(report)
        db.flush()
        ids["report"] = report.report_id
        db.commit()
        return ids
    finally:
        db.close()
