"""
case_status <-> legacy status sync (app/utils/case_status_sync.py) and the read helpers (app/utils/case_state.py).

Whichever generation a code path changes, the other follows, once, in a flush hook; the existing closure hook still
closes rescues and alerts. Offline: throwaway SQLite, no app.main. Run from the backend folder:
    python tests/test_case_status_sync.py
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "case_status_sync.db")
os.environ.setdefault("JWT_SECRET_KEY", "case-status-sync-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.utils import case_state as S  # noqa: E402
from app.utils import case_vocab as V  # noqa: E402

PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


Base.metadata.create_all(bind=engine)
db = SessionLocal()
for rid, name in [(1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")]:
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(User(user_id=1, name="Resident", email="r@x.test", password="x", role_id=1, subdivision_id=1, barangay_id=1, status="Active", is_verified=True))
db.add(ReportCategory(category_id=1, category_name="Injured"))
for i, n in enumerate(["Reported", "Verified", "Rejected", "Referred", "Rescue", "Picked", "Observation", "Impounded", "Claimed", "Released",
                       "Resolved", "Deceased", "Approved", "False Alarm", "Disputed", "Investigation", "Cannot Find", "Merged"], 1):
    db.add(ReportStatus(status_id=i, status_name=n))
db.commit()


def mk(**kw):
    base = dict(user_id=1, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=1)
    base.update(kw)
    r = Report(**base)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ---- new reports ----------------------------------------------------------------------------------------
r = mk()
check("a new report starts 'reported' and 'unidentified'", (r.case_status, r.identity_status) == ("reported", "unidentified"), (r.case_status, r.identity_status))
check("defaults: not reopened, not sensitive", (r.reopened_count, r.is_sensitive) == (0, False))
r_pet = mk(pet_id=5)
check("a new report that names a pet reads as identified (an explicit link)", r_pet.identity_status == "identified")
r_closed = mk(current_status_id=11)
check("a report created already closed is stamped closed, with a closed_at", r_closed.case_status == "closed" and r_closed.closed_at is not None)
r_case = mk(case_status="in_progress", current_status_id=None)
check("a report created with only case_status gets its legacy status", r_case.current_status_id == 7, r_case.current_status_id)

# ---- legacy path -> case_status --------------------------------------------------------------------------
r = mk()
for legacy, expected in [(2, "under_review"), (7, "in_progress"), (4, "in_progress"), (15, "under_review"), (16, "under_review"), (13, "in_progress")]:
    r.current_status_id = legacy
    db.commit()
    check(f"legacy status {legacy} -> case_status {expected}", r.case_status == expected, r.case_status)

r.current_status_id = 11
db.commit()
check("a legacy closure closes the case, stamps closed_at and keeps the legacy status", r.case_status == "closed" and r.closed_at is not None and r.current_status_id == 11)
stamped = r.closed_at

# ---- a legacy reopen --------------------------------------------------------------------------------------
r.closure_disposition, r.closure_reason, r.closed_by = "resolved_intervention", "done", 1
db.commit()
r.current_status_id = 16
db.commit()
audit = db.query(AuditLog).filter(AuditLog.action == "CASE_REOPENED_LEGACY", AuditLog.target_id == r.report_id).all()
check("a legacy path that reopens a closed case: back to under_review, closure cleared, counted once",
      r.case_status == "under_review" and r.closed_at is None and r.closure_disposition is None and r.closure_reason is None
      and r.closed_by is None and r.reopened_count == 1 and r.last_reopened_at is not None, (r.case_status, r.reopened_count))
check("...and the closure it cleared is in the audit log", len(audit) == 1 and audit[0].old_values["closure_disposition"] == "resolved_intervention" and audit[0].old_values["closed_at"] == stamped.isoformat(), audit[0].old_values if audit else None)

# ---- case path -> legacy ----------------------------------------------------------------------------------
r = mk()
r.case_status = "under_review"
db.commit()
check("case_status alone -> the matching legacy status (under_review -> 2)", r.current_status_id == 2, r.current_status_id)
r.case_status = "in_progress"
db.commit()
check("in_progress -> 7", r.current_status_id == 7)
r.current_status_id = 4          # already reads as in_progress: a case_status write must not replace it
r.case_status = "in_progress"
db.commit()
check("a legacy status that already reads as the target is kept (Referred stays 4)", r.current_status_id == 4)

# the closure hook still fires when only case_status said "closed"
r = mk(case_status="in_progress", current_status_id=7)
db.add(LostPetAlert(report_id=r.report_id, subdivision_id=1, status="active", alert_type="lost_pet"))
db.commit()
r.closure_disposition = "pet_recovered"
r.case_status = "closed"
db.commit()
alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == r.report_id).one()
check("closing by case_status writes the disposition's legacy status (pet_recovered -> 9)", r.current_status_id == 9 and r.closed_at is not None, r.current_status_id)
check("...and the existing closure hook closes the alert", alert.status == "closed" and alert.close_outcome == "reunited", (alert.status, alert.close_outcome))

r = mk(case_status="reported")
r.closure_disposition = "invalid_report"
r.case_status = "closed"
db.commit()
check("invalid_report -> legacy 14, duplicate_report -> 14, unresolved -> 17",
      r.current_status_id == 14 and V.DISPOSITIONS["duplicate_report"][1] == 14 and V.DISPOSITIONS["handed_off"][1] == 17)

# both changed and they disagree: the legacy status wins
r = mk()
r.current_status_id = 7
r.case_status = "closed"
db.commit()
check("both changed and disagreeing: the legacy status wins", (r.current_status_id, r.case_status) == (7, "in_progress"), (r.current_status_id, r.case_status))
r.current_status_id = 2
r.case_status = "under_review"
db.commit()
check("both changed and agreeing: untouched", (r.current_status_id, r.case_status) == (2, "under_review"))

# ---- verification and identity ---------------------------------------------------------------------------
r = mk()
check("verification: unverified reads as not_reviewed", S.incident_of(r) == "not_reviewed" and not S.incident_is_verified(r))
r.incident_verification = "partial"
r.verification_status = "unverified"
db.commit()
check("a new decision written with the legacy column is kept", r.incident_verification == "partial")
r.verification_status = "verified_true"
db.commit()
check("a legacy verification clears the new decision, so the legacy value reads through", r.incident_verification is None and S.incident_of(r) == "verified" and S.incident_is_verified(r))
r.verification_status = "false_alarm"
db.commit()
check("a legacy false alarm reads as invalid", S.incident_of(r) == "invalid")

r = mk()
r.pet_id = 9
db.commit()
check("a pet link makes the animal identified", r.identity_status == "identified")
r.pet_inherited_from_match_id = 3
db.commit()
check("an inherited link nobody re-checked is only a possible match", r.identity_status == "possible_match")
from datetime import datetime  # noqa: E402
r.identity_rechecked_at = datetime.now()
db.commit()
check("re-checking the link makes it identified", r.identity_status == "identified")
r.pet_id = None
r.pet_inherited_from_match_id = None
db.commit()
check("removing the link makes it unidentified", r.identity_status == "unidentified")
r.pet_id = 9
r.identity_status = "possible_match"
db.commit()
check("an identity decision written together with the link is kept", r.identity_status == "possible_match")

# ---- the read helpers over empty columns -----------------------------------------------------------------
class Bare:   # an old row: none of the case columns, only the legacy ones
    current_status_id = 11
    verification_status = "verified_true"
    pet_id = None
    priority_level = "High"


b = Bare()
check("read helpers: an old closed row reads closed, verified, unidentified, unknown, high",
      (S.case_status_of(b), S.incident_of(b), S.identity_of(b), S.ownership_of(b), S.priority_of(b), S.urgency_of(b), S.sufficiency_of(b))
      == ("closed", "verified", "unidentified", "unknown", "high", "not_assessed", "not_assessed"))
check("read helpers: its closure is derived from the legacy status and says so",
      S.closure_of(b)["disposition"] == "resolved_intervention" and S.closure_of(b)["derived_from_legacy_status"] is True and S.closure_of(b)["outcome"] == "resolved")
b.current_status_id = 7
check("read helpers: an open row has no closure", S.closure_of(b) is None and S.case_status_of(b) == "in_progress")

print(f"\n{PASSED} checks passed")
