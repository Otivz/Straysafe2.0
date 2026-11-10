"""
Case alignment migrations (app/db_migrations/case_alignment.py): idempotent, non-destructive, history-preserving.

Offline only: a legacy-shaped SQLite database built by hand (the schema BEFORE this change, with historical rows),
a fresh database made from the models, and a state-driven fake MySQL connection that checks the MySQL-only statements
(ENUM widening, unique-key drop, nullability, foreign keys, batching) without a MySQL server.
Never imports app.main. Run from the backend folder:  python tests/test_case_alignment_migrations.py
"""
import contextlib
import os
import re
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)

_TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP, "scratch_app.db")   # app.database needs one; unused here
os.environ.setdefault("JWT_SECRET_KEY", "case-alignment-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect, text  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base  # noqa: E402
from app.db_migrations import case_alignment as M  # noqa: E402
from app.utils import case_vocab as V  # noqa: E402

PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


# ============================================================================================================
# 1. A legacy-shaped database with historical rows
# ============================================================================================================
from _migration_fixtures import LEGACY_DDL  # noqa: E402


def build_legacy(path):
    eng = create_engine("sqlite:///" + path)
    with eng.begin() as c:
        for ddl in LEGACY_DDL:
            c.execute(text(ddl))
        c.execute(text("INSERT INTO barangays VALUES (1, 'San Isidro', 'Quezon City, Metro Manila')"))
        for cid, name, desc in [(1, "Injured", "hurt"), (2, "Aggressive", "dangerous"), (3, "Rabies Risk", "rabies"),
                                (4, "Roaming Animal", "roaming"), (5, "Rescue Needed", "rescue"), (6, "Lost Pet", "missing pet")]:
            c.execute(text("INSERT INTO report_categories VALUES (:i, :n, :d)"), {"i": cid, "n": name, "d": desc})
        # one report per legacy status id, plus pet-linked variants
        for sid in range(1, 19):
            c.execute(text(
                "INSERT INTO reports (report_id, user_id, subdivision_id, category_id, animal_type, description, latitude, longitude, "
                "current_status_id, verification_status, created_at) VALUES (:r, 5, 1, 1, 'Dog', :d, 14.8, 121.0, :s, :v, '2026-01-01 08:00:00')"),
                {"r": sid, "d": f"historical report {sid}", "s": sid, "v": "verified_true" if sid == 2 else "unverified"})
        c.execute(text("UPDATE reports SET pet_id = 77 WHERE report_id = 1"))                               # linked, trusted
        c.execute(text("UPDATE reports SET pet_id = 78, pet_inherited_from_match_id = 9 WHERE report_id = 2"))  # inherited, not rechecked
        c.execute(text("UPDATE reports SET pet_id = 79, pet_inherited_from_match_id = 9, identity_rechecked_at = '2026-01-02 10:00:00' WHERE report_id = 3"))
        c.execute(text("INSERT INTO barangay_referrals (referral_id, report_id, barangay_id, referred_by, reason, reference_no, contact_method, final_outcome, outcome_date, outcome_note) "
                       "VALUES (1, 9, 1, 5, 'Stray dog needs pickup', 'REF-1', 'call', 'claimed', '2026-01-05', 'Owner came')"))
        c.execute(text("INSERT INTO barangay_referrals (referral_id, report_id, barangay_id, referred_by, reason, contact_method) "
                       "VALUES (2, 4, 1, 5, 'Aggressive dog', 'visit')"))
        c.execute(text("INSERT INTO barangay_referrals (referral_id, report_id, barangay_id, referred_by, reason, contact_method) "
                       "VALUES (3, 5, 1, 5, 'Needs rescue', 'letter')"))
        c.execute(text("INSERT INTO barangay_referral_updates (referral_id, update_type, update_date, note) VALUES (2, 'acknowledged', '2026-01-03', 'Received')"))
        c.execute(text("INSERT INTO owner_warnings (warning_id, user_id, report_id, issued_by, warning_level, violation_type, description, fine_amount, status, created_at) "
                       "VALUES (1, 8, 4, 5, '1st Warning', 'Free-Roaming Unleashed', 'Keep your dog in', 0, 'Acknowledged', '2026-01-04 09:00:00')"))
        c.execute(text("INSERT INTO lost_pet_alerts (alert_id, report_id, subdivision_id, status) VALUES (1, 1, 1, 'active')"))
    return eng


def snapshot(eng):
    """Every legacy column of every historical row, for comparison before and after."""
    with eng.connect() as c:
        return {
            "reports": c.execute(text("SELECT report_id, user_id, subdivision_id, category_id, pet_id, pet_inherited_from_match_id, identity_rechecked_at, animal_type, description, current_status_id, verification_status, created_at FROM reports ORDER BY 1")).all(),
            "referrals": c.execute(text("SELECT referral_id, report_id, barangay_id, referred_by, reason, reference_no, contact_method, final_outcome, outcome_date, outcome_note FROM barangay_referrals ORDER BY 1")).all(),
            "updates": c.execute(text("SELECT update_id, referral_id, update_type, source, update_date, note FROM barangay_referral_updates ORDER BY 1")).all(),
            "warnings": c.execute(text("SELECT warning_id, user_id, report_id, issued_by, warning_level, violation_type, description, fine_amount, status, created_at FROM owner_warnings ORDER BY 1")).all(),
            "alerts": c.execute(text("SELECT alert_id, report_id, subdivision_id, status FROM lost_pet_alerts ORDER BY 1")).all(),
            "categories": c.execute(text("SELECT category_id, category_name, description FROM report_categories WHERE category_id <= 6 ORDER BY 1")).all(),
        }


legacy_eng = build_legacy(os.path.join(_TMP, "legacy.db"))
before = snapshot(legacy_eng)
check("legacy fixture: 18 historical reports, 3 referrals, 1 warning, 1 alert", len(before["reports"]) == 18 and len(before["referrals"]) == 3 and len(before["warnings"]) == 1 and len(before["alerts"]) == 1)

first = M.run_case_alignment(legacy_eng)
check("first run: no errors", first["errors"] == [], first["errors"])
check("first run: did work", len(first["actions"]) > 40, len(first["actions"]))
after = snapshot(legacy_eng)
check("historical reports: every legacy column unchanged", after["reports"] == before["reports"])
check("historical referrals and their updates: unchanged", after["referrals"] == before["referrals"] and after["updates"] == before["updates"])
check("historical warnings (incl. fine amount and status): unchanged", after["warnings"] == before["warnings"])
check("historical alert: unchanged", after["alerts"] == before["alerts"])
check("existing categories keep their ids, names and descriptions", after["categories"] == before["categories"])

insp = inspect(legacy_eng)
rcols = {c["name"] for c in insp.get_columns("reports")}
check("reports gained the case columns", {name for name, _ in M.REPORT_COLUMNS} <= rcols)
check("referrals gained the organisation columns", {name for name, _ in M.REFERRAL_COLUMNS} <= {c["name"] for c in insp.get_columns("barangay_referrals")})
check("referral updates gained status_after", "status_after" in {c["name"] for c in insp.get_columns("barangay_referral_updates")})
check("warnings gained the policy columns", {name for name, _ in M.WARNING_COLUMNS} <= {c["name"] for c in insp.get_columns("owner_warnings")})
check("alerts gained alert_type", "alert_type" in {c["name"] for c in insp.get_columns("lost_pet_alerts")})
check("the four case tables exist", all(insp.has_table(t) for t in M.CASE_TABLES))
check("case_status is indexed", any(ix["name"] == "ix_reports_case_status" for ix in insp.get_indexes("reports")))

with legacy_eng.connect() as c:
    status_by_legacy = {r[0]: r[1] for r in c.execute(text("SELECT current_status_id, case_status FROM reports")).all()}
    identity = {r[0]: r[1] for r in c.execute(text("SELECT report_id, identity_status FROM reports")).all()}
    refs = {r[0]: r[1:] for r in c.execute(text("SELECT referral_id, org_type, org_name, referral_status, is_urgent FROM barangay_referrals")).all()}
    alert_type = c.execute(text("SELECT alert_type FROM lost_pet_alerts")).scalar()
    cats = [r[0] for r in c.execute(text("SELECT category_name FROM report_categories ORDER BY category_id")).all()]
    reopened = {r[0] for r in c.execute(text("SELECT reopened_count FROM reports")).all()}
    sensitive = {r[0] for r in c.execute(text("SELECT is_sensitive FROM reports")).all()}

expected = {sid: V.case_status_from_legacy(sid) for sid in range(1, 19)}
check("every legacy status reads as one of the four, as the vocabulary says", status_by_legacy == expected, status_by_legacy)
check("legacy 1 -> reported, 2/15/16 -> under_review, 4-8/13 -> in_progress, closed ids -> closed",
      status_by_legacy[1] == "reported" and all(status_by_legacy[s] == "under_review" for s in (2, 15, 16))
      and all(status_by_legacy[s] == "in_progress" for s in (4, 5, 6, 7, 8, 13))
      and all(status_by_legacy[s] == "closed" for s in (3, 9, 10, 11, 12, 14, 17, 18)))
check("identity: trusted link -> identified; inherited -> possible_match; rechecked -> identified; none -> unidentified",
      identity[1] == "identified" and identity[2] == "possible_match" and identity[3] == "identified" and identity[4] == "unidentified")
check("referral 1 (had an outcome) -> completed; 2 (had an update) -> in_progress; 3 -> sent",
      refs[1][2] == "completed" and refs[2][2] == "in_progress" and refs[3][2] == "sent", refs)
check("referrals are read as Barangay referrals, named after the barangay", all(r[0] == "barangay" and r[1] == "Barangay San Isidro" for r in refs.values()), refs)
check("existing alert is a lost-pet alert", alert_type == "lost_pet")
check("the six categories exist, 'Lost Pet' is not duplicated, the old ones stay",
      set(V.CATEGORY_FAMILIES.values()) <= set(cats) and cats.count("Lost Pet") == 1 and {"Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed"} <= set(cats), cats)
check("defaults: reopened_count 0, is_sensitive false", reopened == {0} and sensitive == {0})

# ---- second run: nothing to do, nothing changes ---------------------------------------------------------
second = M.run_case_alignment(legacy_eng)
check("second run: no errors and no actions, status ok (idempotent)",
      second["actions"] == [] and second["errors"] == [] and second["status"] == "ok", second)
check("second run changes no data", snapshot(legacy_eng) == after)

# ---- values a person set after the migration are never overwritten ---------------------------------------
with legacy_eng.begin() as c:
    c.execute(text("UPDATE reports SET case_status = 'closed', identity_status = 'identified' WHERE report_id = 1"))
    c.execute(text("UPDATE barangay_referrals SET referral_status = 'declined', org_type = 'veterinary', org_name = 'City Vet' WHERE referral_id = 3"))
third = M.run_case_alignment(legacy_eng)
with legacy_eng.connect() as c:
    r1 = c.execute(text("SELECT case_status, identity_status FROM reports WHERE report_id = 1")).one()
    r3 = c.execute(text("SELECT referral_status, org_type, org_name FROM barangay_referrals WHERE referral_id = 3")).one()
check("a re-run keeps a case status and a referral status set after the migration", tuple(r1) == ("closed", "identified") and tuple(r3) == ("declined", "veterinary", "City Vet") and third["actions"] == [], (r1, r3, third))

# ============================================================================================================
# 2. A fresh database made from the models: nothing to add except the categories
# ============================================================================================================
fresh_eng = create_engine("sqlite:///" + os.path.join(_TMP, "fresh.db"))
Base.metadata.create_all(bind=fresh_eng)
fresh = M.run_case_alignment(fresh_eng)
check("fresh database: no errors", fresh["errors"] == [], fresh)
check("fresh database: only the six categories are added (no column or table work)",
      all(a.startswith("report category") for a in fresh["actions"]) and len(fresh["actions"]) == 6, fresh["actions"])
fresh_second = M.run_case_alignment(fresh_eng)
check("fresh database: second run is empty and the schema verifies",
      fresh_second["actions"] == [] and fresh_second["errors"] == [] and fresh_second["status"] == "ok", fresh_second)

# several referrals per report work on a database made from the models
with fresh_eng.begin() as c:
    c.execute(text("INSERT INTO barangays (barangay_id, barangay_name, city) VALUES (1, 'B', 'C')"))
    for i in (1, 2):
        c.execute(text("INSERT INTO barangay_referrals (report_id, barangay_id, reason, contact_method, org_type, org_name, referral_status) "
                       "VALUES (1, NULL, 'r', 'call', 'veterinary', 'City Vet', 'sent')"))
with fresh_eng.connect() as c:
    two = c.execute(text("SELECT COUNT(*) FROM barangay_referrals WHERE report_id = 1 AND barangay_id IS NULL AND org_type = 'veterinary'")).scalar()
check("a report can have several referrals, with no Barangay on a veterinary one", two == 2, two)


# ============================================================================================================
# 3. The MySQL-only statements, against a state-driven fake MySQL connection
# ============================================================================================================
from _migration_fixtures import FakeEngine, FakeMySQL, legacy_mysql  # noqa: E402


my = legacy_mysql()
run1 = M.run_case_alignment(FakeEngine(my))
check("MySQL path: first run has no errors", run1["errors"] == [], run1["errors"])
reports_alters = [s for s in my.ddl if s.startswith("ALTER TABLE reports ADD COLUMN")]
check("MySQL path: all reports columns go in ONE statement (one instant row version)", len(reports_alters) == 1 and reports_alters[0].count("ADD COLUMN") == len(M.REPORT_COLUMNS), len(reports_alters))
fk_alters = [s for s in my.ddl if "ADD CONSTRAINT" in s]
check("MySQL path: the five user foreign keys on reports + one on referrals, batched per table",
      len(fk_alters) == 2 and fk_alters[0].count("FOREIGN KEY") == len(M.REPORT_USER_FKS) and "ON DELETE SET NULL" in fk_alters[0], fk_alters)
enum_stmt = [s for s in my.ddl if "MODIFY COLUMN animal_type" in s]
check("MySQL path: animal_type ENUM keeps Dog, Cat, Unknown first and appends the rest (in-place change)",
      len(enum_stmt) == 1 and enum_stmt[0].startswith("ALTER TABLE reports MODIFY COLUMN animal_type ENUM('Dog','Cat','Unknown','Bird','Small mammal','Reptile','Livestock','Wildlife','Other')"), enum_stmt)
check("MySQL path: barangay_id becomes nullable", my.tables["barangay_referrals"]["columns"]["barangay_id"]["nullable"] is True)
create_ix = next(i for i, s in enumerate(my.ddl) if s.startswith("CREATE INDEX ix_barangay_referrals_report_id"))
drop_ix = next(i for i, s in enumerate(my.ddl) if "DROP INDEX uq_barangay_referrals_report_id" in s)
check("MySQL path: the plain report_id index is created BEFORE the unique key is dropped (it backs the foreign key)", create_ix < drop_ix)
check("MySQL path: the one-referral-per-report unique key is gone, the plain index remains",
      "uq_barangay_referrals_report_id" not in my.tables["barangay_referrals"]["indexes"] and "ix_barangay_referrals_report_id" in my.tables["barangay_referrals"]["indexes"])
destructive = [s for s in my.log if re.search(r"\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|RENAME|DROP DATABASE|DROP SCHEMA)\b", s, re.I)]
check("MySQL path: no table drop, column drop, truncate, delete or rename is ever issued", destructive == [], destructive)
check("MySQL path: the missing categories are added, existing ones are not re-added",
      my.categories == {"Injured", "Aggressive", "Lost Pet", *V.CATEGORY_FAMILIES.values()} and len([a for a in run1["actions"] if a.startswith("report category")]) == 5)
ddl_before = len(my.ddl)
run2 = M.run_case_alignment(FakeEngine(my))
check("MySQL path: second run issues no DDL at all and reports nothing (idempotent)",
      run2["actions"] == [] and run2["errors"] == [] and run2["status"] == "ok" and len(my.ddl) == ddl_before, (run2, my.ddl[ddl_before:]))

# an auto-named unique key (what SQLAlchemy creates for unique=True) is found by what it covers, not by its name
my2 = legacy_mysql(unique_name="report_id")
M.run_case_alignment(FakeEngine(my2))
check("MySQL path: a unique key named after the column is found and dropped too", "report_id" not in my2.tables["barangay_referrals"]["indexes"] and any("DROP INDEX report_id" in s for s in my2.ddl))

# a unique key that is NOT on report_id alone is never touched
my3 = legacy_mysql()
my3.tables["barangay_referrals"]["indexes"]["uq_pair"] = (True, ["report_id", "barangay_id"])
M.run_case_alignment(FakeEngine(my3))
check("MySQL path: a composite unique key is left alone", "uq_pair" in my3.tables["barangay_referrals"]["indexes"])

# an ENUM that already has the new members is left alone
my4 = legacy_mysql()
my4.tables["reports"]["columns"]["animal_type"]["type"] = "enum('Dog','Cat','Unknown','Bird','Small mammal','Reptile','Livestock','Wildlife','Other')"
M.run_case_alignment(FakeEngine(my4))
check("MySQL path: an already-wide animal_type is not altered again", not [s for s in my4.ddl if "MODIFY COLUMN animal_type" in s])

# a failing step is reported and does not stop the others
class Boom(FakeMySQL):
    def execute(self, clause, params=None):
        if "ix_reports_case_status" in str(clause):
            raise RuntimeError("simulated lock timeout")
        return super().execute(clause, params)


boom = legacy_mysql()
boom.__class__ = Boom
res = M.run_case_alignment(FakeEngine(boom))
check("a step that fails is reported, and the other steps still run",
      len(res["errors"]) == 1 and "report_columns" in res["errors"][0] and any("referral" in a for a in res["actions"]) and any(a.startswith("report category") for a in res["actions"]), res)

# ============================================================================================================
# 4. The vocabulary agrees with the code it mirrors
# ============================================================================================================
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS  # noqa: E402

check("closed legacy ids match utils/case_closure.CLOSED_REPORT_STATUS_IDS", set(V.CLOSED_LEGACY_IDS) == set(CLOSED_REPORT_STATUS_IDS))
check("every disposition closes with a legacy status that reads as closed", all(legacy in V.CLOSED_LEGACY_IDS for (_g, legacy, _l) in V.DISPOSITIONS.values()))
check("every open status has a legacy status that reads back as the same status",
      all(V.case_status_from_legacy(V.LEGACY_FOR_OPEN_STATUS[s]) == s for s in (V.REPORTED, V.UNDER_REVIEW, V.IN_PROGRESS)))
check("no manual move leaves 'closed' (reopening is its own action) and none enters it", V.MANUAL_MOVES[V.CLOSED] == frozenset() and all(V.CLOSED not in m for m in V.MANUAL_MOVES.values()))
check("legacy and new categories read as one of the six",
      [V.category_family(n) for n in ("Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed", "Lost Pet", "Something else")]
      == [V.INJURED, V.SAFETY, V.SAFETY, V.NUISANCE, V.INJURED, V.LOST_PET, V.OTHER_CONCERN]
      and all(V.category_family(n) == k for k, n in V.CATEGORY_FAMILIES.items()))
check("animal types beyond dog and cat are accepted, by id or label", [V.normalize_animal_type(x) for x in ("bird", "Small mammal", "small_mammal", "RABBIT", "wildlife", "livestock", "reptile", "other", "Unknown", "dragon")]
      == ["Bird", "Small mammal", "Small mammal", "Small mammal", "Wildlife", "Livestock", "Reptile", "Other", "Unknown", None])
check("urgent is an assessed immediate risk, not a stored level", V.priority_of("Medium", "immediate") == "urgent" and V.priority_of("High", None) == "high" and V.priority_of("Medium", None) == "normal" and V.priority_of("Low", "none") == "low" and V.level_for_priority("urgent") == "High")
check("a legacy closure is read as a derived disposition; a stored one wins",
      V.effective_disposition(None, 17) == ("no_further_sightings", True) and V.effective_disposition("handed_off", 17) == ("handed_off", False) and V.effective_disposition(None, 2) == (None, False))

print(f"\n{PASSED} checks passed")
