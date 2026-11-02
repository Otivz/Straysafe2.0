"""
Report status synchronization (docs/01-system/REPORT_STATUS_SYNC_RULES.md): resolving an observation case resolves
its report in the database, through both observation endpoints, for every viewer; history, audit, warnings and
notifications follow once; unrelated reports and other workflows' outcomes are untouched.
Run from the backend folder:  python tests/test_report_status_sync.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "report_status_sync_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-status-sync-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.models.warning import OwnerWarning  # noqa: E402
from app.routes import owner_followups, reports, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (owner_followups.router, reports.router, warnings.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.add(ReportCategory(category_id=4, category_name="Roaming Animal"))


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subd, barangay_id=1, phone="09171234567")
    db.add(u)
    db.flush()
    return u


owner, reporter, leader = mk("Pet Owner", 1), mk("Report Filer", 1), mk("Leader One", 2)
leader_b = mk("Leader Two", 2)
admin = mk("Admin User", 4, subd=None)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HO, HR, HL, HL2, HA = H(owner), H(reporter), H(leader), H(leader_b), H(admin)
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def pet(name):
    p = Pet(owner_id=owner.user_id, pet_name=name, pet_type="Dog", status="Active")
    db.add(p)
    db.commit()
    return p.pet_id


def report(pet_id, status_id=7, **kw):
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=4, animal_type="Dog", current_status_id=status_id,
               latitude=14.5, longitude=121.0, pet_id=pet_id, visibility="Public", visibility_decided_by=leader.user_id,
               assigned_leader_id=leader.user_id, landmark="Gate 2", **kw)
    db.add(r)
    db.commit()
    return r.report_id


def observe(rid, pet_id):
    f = OwnerFollowUp(report_id=rid, pet_id=pet_id, subdivision_id=1, leader_id=leader.user_id, owner_id=owner.user_id,
                      owner_name="Pet Owner", status="observing", duration_days=3,
                      due_at=datetime.now() + timedelta(days=3))
    db.add(f)
    db.commit()
    return f.followup_id


def status_of(rid):
    db.expire_all()
    return db.get(Report, rid).current_status_id


def notes(uid, rid=None, kind=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == uid)
    if rid is not None:
        q = q.filter(Notification.related_id == rid)
    if kind:
        q = q.filter(Notification.type == kind)
    return q.count()


# ── 1. "Confirm Owner Compliance" (/close complied): the path that used to leave the report Under Observation ──
pid = pet("Bantay")
r1 = report(pid)
unrelated = report(pid, status_id=2)                    # another report about the same dog
fu1 = observe(r1, pid)
db.add(OwnerWarning(user_id=owner.user_id, pet_id=pid, report_id=r1, issued_by=leader.user_id, warning_level="1st Warning",
                    violation_type="Free-Roaming Unleashed", description="Dog seen roaming twice", status="Pending"))
db.add(OwnerWarning(user_id=owner.user_id, pet_id=pid, report_id=r1, issued_by=leader.user_id, warning_level="Notice",
                    violation_type="Free-Roaming Unleashed", description="Owner appealed this one", status="Appealed"))
db.commit()
active_before = client.get("/owner-followups/active-count", headers=HL).json()
r = client.post(f"/owner-followups/{fu1}/close", headers=HL,
                json={"outcome": "complied", "reason": "Gate fixed", "compliance_notes": "Dog kept inside, gate repaired"})
check("close complied: 200", r.status_code == 200, r.text[:200])
check("close complied: the report itself is Incident Resolved in the database", status_of(r1) == 11, status_of(r1))
db.expire_all()
check("close complied: the observation keeps its own outcome (complied, not overwritten as closed)",
      db.get(OwnerFollowUp, fu1).status == "complied", db.get(OwnerFollowUp, fu1).status)

# 2-5: every module reads the same row
for label, h in (("resident who filed it", HR), ("subdivision leader", HL), ("admin", HA), ("pet owner", HO)):
    d = client.get(f"/reports/{r1}", headers=h)
    check(f"views: the {label} sees Resolved", d.status_code == 200 and d.json().get("status_id") == 11,
          (d.status_code, d.text[:150]))
lst = client.get("/reports/", headers=HL)
row = next((x for x in lst.json() if x.get("report_id") == r1), None) if lst.status_code == 200 else None
check("views: the subdivision report list shows Resolved", row is not None and row.get("status_id") == 11, (lst.status_code, row))
check("views: a fresh request (browser refresh / another account) still shows Resolved",
      client.get(f"/reports/{r1}", headers=HL).json().get("status_id") == 11)

# 6. dashboard counts
active_after = client.get("/owner-followups/active-count", headers=HL).json()
check("dashboard: the observation no longer counts as active", str(active_after) != str(active_before), (active_before, active_after))
obs = client.get(f"/reports/{r1}", headers=HR).json().get("observation") or {}
check("dashboard: the report's observation summary is closed with the outcome", obs.get("open") is False
      and obs.get("outcome") == "the owner complied", obs)

# 7. unrelated report untouched
check("scope: another report about the same dog is unchanged", status_of(unrelated) == 2)

# audit trail
db.expire_all()
hist = [h for h in db.query(StatusHistory).filter(StatusHistory.report_id == r1, StatusHistory.report_status_id == 11).all()
        if (h.remarks or "").startswith("✅ Case Resolved")]
check("audit: one resolution history row with previous status, observation, staff and remarks", len(hist) == 1
      and "Previous status: Under Observation" in hist[0].remarks and f"observation #{fu1}" in hist[0].remarks
      and "Leader One" in hist[0].remarks and "gate repaired" in hist[0].remarks and hist[0].updated_by == leader.user_id, hist)
ends = [h for h in db.query(StatusHistory).filter(StatusHistory.report_id == r1).all() if (h.remarks or "").startswith("Observation ended")]
check("audit: a single 'Observation ended' entry (no second 'closed with the case')", len(ends) == 1, [h.remarks for h in ends])
a = db.query(AuditLog).filter(AuditLog.action == "RESOLVE_OBSERVATION_CASE", AuditLog.target_id == r1).all()
check("audit: system log with previous/new status, observation id, remarks and time", len(a) == 1
      and a[0].old_values.get("status_id") == 7 and a[0].new_values.get("status_id") == 11
      and a[0].new_values.get("observation_id") == fu1 and a[0].new_values.get("remarks") and a[0].new_values.get("resolved_at"),
      [(x.old_values, x.new_values) for x in a])

# warnings follow the case
db.expire_all()
ws = {w.warning_level: w.status for w in db.query(OwnerWarning).filter(OwnerWarning.report_id == r1).all()}
check("warnings: the pending warning ends Resolved with the case", ws.get("1st Warning") == "Resolved", ws)
check("warnings: an appealed warning keeps its appeal", ws.get("Notice") == "Appealed", ws)

# notifications
check("notify: the resident who filed the report is told once", notes(reporter.user_id, r1, "status_update") == 1)
check("notify: the pet owner is told once", notes(owner.user_id, r1) == 1)

# 8. no duplicates
before = (notes(reporter.user_id), notes(owner.user_id))
r = client.post(f"/owner-followups/{fu1}/close", headers=HL, json={"outcome": "complied", "reason": "Second click"})
check("duplicate: closing again is refused", r.status_code == 409, r.text[:150])
r = client.post(f"/owner-followups/{fu1}/resolve", headers=HL, json={"verification_notes": "Third click"})
check("duplicate: resolving again is refused", r.status_code in (400, 409), r.text[:150])
db.expire_all()
check("duplicate: no extra notifications", (notes(reporter.user_id), notes(owner.user_id)) == before)
check("duplicate: no extra history or audit rows", db.query(AuditLog).filter(AuditLog.action == "RESOLVE_OBSERVATION_CASE",
      AuditLog.target_id == r1).count() == 1 and len([h for h in db.query(StatusHistory).filter(StatusHistory.report_id == r1).all()
                                                    if (h.remarks or "").startswith("✅ Case Resolved")]) == 1)

# ── The /resolve endpoint goes through the same rule ──
pid2 = pet("Tagpi")
r2 = report(pid2)
fu2 = observe(r2, pid2)
r = client.post(f"/owner-followups/{fu2}/resolve", headers=HL, json={"verification_notes": "Owner fenced the yard"})
check("/resolve: report Resolved, observation complied", r.status_code == 200 and status_of(r2) == 11
      and db.get(OwnerFollowUp, fu2).status == "complied", r.text[:200])
check("/resolve: the filer is notified too (it wasn't before)", notes(reporter.user_id, r2, "status_update") == 1)

# ── Merged case: an open report linked into the case follows; a merged duplicate keeps its link ──
pid3 = pet("Puti")
r3 = report(pid3)
linked_open = report(None, status_id=2, duplicate_of_report_id=r3)
merged_dup = report(None, status_id=18, duplicate_of_report_id=r3)
fu3 = observe(r3, pid3)
client.post(f"/owner-followups/{fu3}/close", headers=HL, json={"outcome": "complied", "reason": "Complied"})
check("case: an open report linked into the case is resolved with it", status_of(linked_open) == 11)
db.expire_all()
check("case: its history says which case resolved it", any(f"part of case #{r3}" in (h.remarks or "")
      for h in db.query(StatusHistory).filter(StatusHistory.report_id == linked_open).all()))
check("case: a merged duplicate keeps 'Merged' (it shows the main case)", status_of(merged_dup) == 18)

# ── Other outcomes and workflows are never overwritten ──
pid4 = pet("Itim")
r4 = report(pid4)
fu4 = observe(r4, pid4)
r = client.post(f"/owner-followups/{fu4}/close", headers=HL, json={"outcome": "closed", "reason": "Observation not needed"})
check("closed (not complied): the report status is left to its workflow", r.status_code == 200 and status_of(r4) == 7)

pid5 = pet("Bruno")
r5 = report(pid5, status_id=4)                          # escalated: the Barangay handles it
fu5 = observe(r5, pid5)
r = client.post(f"/owner-followups/{fu5}/close", headers=HL, json={"outcome": "complied", "reason": "Complied"})
db.expire_all()
check("barangay handling: refused, nothing changed", r.status_code == 409 and status_of(r5) == 4
      and db.get(OwnerFollowUp, fu5).status == "observing", r.text[:200])

pid6 = pet("Choco")
r6 = report(pid6, status_id=3)                          # rejected by its own workflow
fu6 = observe(r6, pid6)
r = client.post(f"/owner-followups/{fu6}/resolve", headers=HL, json={"verification_notes": "Complied"})
check("rejected report: refused, stays Rejected", r.status_code == 409 and status_of(r6) == 3, r.text[:200])

check("permissions: another subdivision's leader can't resolve", client.post(
    f"/owner-followups/{fu4}/close", headers=HL2, json={"outcome": "complied", "reason": "x" * 5}).status_code in (403, 409))
check("permissions: residents can't resolve", client.post(
    f"/owner-followups/{fu5}/resolve", headers=HR, json={"verification_notes": "Complied"}).status_code == 403)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
