"""
Shared fixtures for the migration tests (test_case_alignment_migrations.py, test_case_alignment_failure_handling.py).

LEGACY_DDL      the schema BEFORE the case workflow change (the tables the migration touches), for SQLite
FakeMySQL       just enough MySQL to run the migration's MySQL-only branches without a server: DDL changes its state, data
                statements are recorded. FakeEngine wraps it the way run_case_alignment() uses an engine.
legacy_mysql()  a FakeMySQL holding that legacy schema.

Import this AFTER the test has set its throwaway DATABASE_URL (it imports the application's models).
"""
import contextlib
import re

import app.models  # noqa: F401
from app.database import Base
from app.db_migrations import case_alignment as M

LEGACY_DDL = [
    "CREATE TABLE barangays (barangay_id INTEGER PRIMARY KEY, barangay_name VARCHAR(100) NOT NULL, city VARCHAR(100))",
    "CREATE TABLE report_categories (category_id INTEGER PRIMARY KEY, category_name VARCHAR(100) UNIQUE NOT NULL, description TEXT)",
    """CREATE TABLE reports (
        report_id INTEGER PRIMARY KEY, user_id INT NOT NULL, subdivision_id INT NOT NULL, category_id INT NOT NULL,
        pet_id INT, pet_inherited_from_match_id INT, identity_rechecked_at DATETIME,
        animal_type VARCHAR(10) DEFAULT 'Unknown', description TEXT,
        latitude NUMERIC(10,8) NOT NULL, longitude NUMERIC(11,8) NOT NULL,
        current_status_id INT, verification_status VARCHAR(20) DEFAULT 'unverified', created_at DATETIME)""",
    """CREATE TABLE barangay_referrals (
        referral_id INTEGER PRIMARY KEY, report_id INT NOT NULL UNIQUE, barangay_id INT NOT NULL, referred_by INT,
        referred_at DATETIME DEFAULT CURRENT_TIMESTAMP, reason TEXT NOT NULL, reference_no VARCHAR(100),
        contact_method VARCHAR(20) NOT NULL, final_outcome VARCHAR(20), outcome_date DATE, outcome_note TEXT,
        outcome_recorded_by INT, outcome_recorded_at DATETIME)""",
    """CREATE TABLE barangay_referral_updates (
        update_id INTEGER PRIMARY KEY, referral_id INT NOT NULL, update_type VARCHAR(20) NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'barangay_reported', update_date DATE NOT NULL, note TEXT,
        evidence_url VARCHAR(500), recorded_by INT, recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP)""",
    """CREATE TABLE owner_warnings (
        warning_id INTEGER PRIMARY KEY, user_id INT NOT NULL, report_id INT, issued_by INT NOT NULL,
        warning_level VARCHAR(40) NOT NULL, violation_type VARCHAR(60) NOT NULL, description TEXT NOT NULL,
        fine_amount NUMERIC(10,2) DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'Pending', created_at TIMESTAMP)""",
    """CREATE TABLE lost_pet_alerts (
        alert_id INTEGER PRIMARY KEY, report_id INT NOT NULL UNIQUE, subdivision_id INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'requested')""",
]


class FakeResult:
    def __init__(self, rows=None, scalar=0, rowcount=0):
        self._rows, self._scalar, self.rowcount = rows or [], scalar, rowcount

    def all(self):
        return self._rows

    def scalar(self):
        return self._scalar


class FakeMySQL:
    """Just enough MySQL to run the migration's MySQL branches. DDL changes the state; data statements are recorded."""
    dialect = type("D", (), {"name": "mysql"})()

    def __init__(self):
        self.tables = {}        # table -> {"columns": {name: {"type", "nullable"}}, "indexes": {name: (unique, [cols])}, "fks": set()}
        self.categories = set()
        self.log = []           # every statement, in order
        self.ddl = []

    def table(self, name, columns, indexes=None):
        self.tables[name] = {"columns": {c: {"type": t, "nullable": n} for c, t, n in columns}, "indexes": dict(indexes or {}),
                             "fks": set(), "fk_cols": set()}

    @contextlib.contextmanager
    def begin(self):
        yield self

    def execute(self, clause, params=None):
        sql = " ".join(str(clause).split())
        p = params or {}
        self.log.append(sql)
        up = sql.upper()
        if up.startswith(("ALTER TABLE", "CREATE INDEX")):
            self.ddl.append(sql)
            return self._ddl(sql)
        if "FROM INFORMATION_SCHEMA.TABLES" in up:
            return FakeResult(scalar=1 if p["t"] in self.tables else 0)
        if "FROM INFORMATION_SCHEMA.COLUMNS" in up:
            t = self.tables.get(p.get("t") or re.search(r"TABLE_NAME = '(\w+)'", sql).group(1))
            if "SELECT COLUMN_NAME" in up:
                return FakeResult(rows=[(c,) for c in t["columns"]])
            if "SELECT COLUMN_TYPE" in up:
                return FakeResult(scalar=t["columns"]["animal_type"]["type"])
            if "SELECT IS_NULLABLE" in up:
                return FakeResult(scalar="YES" if t["columns"]["barangay_id"]["nullable"] else "NO")
        if "FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE" in up:       # a foreign key to users on this column, whatever it is called
            return FakeResult(scalar=1 if p["c"] in self.tables[p["t"]]["fk_cols"] else 0)
        if "FROM INFORMATION_SCHEMA.STATISTICS" in up:
            t = self.tables[p["t"]] if "t" in p else self.tables["barangay_referrals"]
            if "GROUP_CONCAT" in up:
                return FakeResult(rows=[(n, ",".join(cols)) for n, (uniq, cols) in t["indexes"].items() if uniq and n != "PRIMARY"])
            return FakeResult(scalar=1 if p["i"] in t["indexes"] else 0)
        if up.startswith("SELECT COUNT(*) FROM REPORT_CATEGORIES"):
            return FakeResult(scalar=1 if p["n"] in self.categories else 0)
        if up.startswith("INSERT INTO REPORT_CATEGORIES"):
            self.categories.add(p["n"])
            return FakeResult(rowcount=1)
        return FakeResult()     # UPDATE / SELECT of data: nothing to backfill in the fake

    def _ddl(self, sql):
        m = re.match(r"ALTER TABLE (\w+) (.*)", sql)
        if m:
            table, rest = m.group(1), m.group(2)
            t = self.tables[table]
            for col, ddl in re.findall(r"ADD COLUMN (\w+) ([^,]+?)(?=, ADD|$)", rest):
                assert col not in t["columns"], f"{table}.{col} added twice"
                t["columns"][col] = {"type": ddl, "nullable": "NOT NULL" not in ddl.upper()}
            for name, col in re.findall(r"ADD CONSTRAINT (\w+) FOREIGN KEY \((\w+)\)", rest):
                assert name not in t["fks"], f"{name} added twice"
                assert col not in t["fk_cols"], f"a second foreign key on {table}.{col}"
                t["fks"].add(name)
                t["fk_cols"].add(col)
            mm = re.match(r"MODIFY COLUMN animal_type (ENUM\(.*\)) NULL DEFAULT 'Unknown'", rest)
            if mm:
                t["columns"]["animal_type"]["type"] = "enum(" + mm.group(1)[5:]   # MySQL lower-cases the keyword, keeps the members
            if rest.startswith("MODIFY COLUMN barangay_id INT NULL"):
                t["columns"]["barangay_id"]["nullable"] = True
            md = re.match(r"DROP INDEX (\w+)", rest)
            if md:
                del t["indexes"][md.group(1)]
            return FakeResult()
        m = re.match(r"CREATE INDEX (\w+) ON (\w+) \((\w+)\)", sql)
        if m:
            self.tables[m.group(2)]["indexes"][m.group(1)] = (False, [m.group(3)])
        return FakeResult()


def legacy_mysql(unique_name="uq_barangay_referrals_report_id"):
    db = FakeMySQL()
    db.table("reports", [("report_id", "int", False), ("pet_id", "int", True), ("current_status_id", "int", True),
                         ("animal_type", "enum('Dog','Cat','Unknown')", True)], {"PRIMARY": (True, ["report_id"])})
    db.table("barangay_referrals", [("referral_id", "int", False), ("report_id", "int", False), ("barangay_id", "int", False),
                                    ("final_outcome", "varchar(20)", True)],
             {"PRIMARY": (True, ["referral_id"]), unique_name: (True, ["report_id"])})
    db.table("barangay_referral_updates", [("update_id", "int", False), ("referral_id", "int", False)])
    db.table("owner_warnings", [("warning_id", "int", False)])
    db.table("lost_pet_alerts", [("alert_id", "int", False)])
    db.table("report_categories", [("category_id", "int", False), ("category_name", "varchar(100)", False), ("description", "text", True)])
    for t in M.CASE_TABLES:                          # created by create_all from the models in a real run: every model column
        db.table(t, [(c.name, "int", True) for c in Base.metadata.tables[t].columns])
    db.categories = {"Injured", "Aggressive", "Lost Pet"}
    return db


class FakeEngine:
    def __init__(self, conn):
        self.conn = conn

    def begin(self):
        return self.conn.begin()

    def connect(self):                  # the read-only schema check
        return self.conn.begin()
