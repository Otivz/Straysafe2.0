"""
Adoption authority matrix (ADO-A1 / ADO-A2).

Every staff adoption endpoint x 8 identities, on a throwaway SQLite DB, through the real JWT auth.
  - Decision endpoints  -> only the Head Officer of the application's barangay, or Admin.
  - Task endpoints      -> the task's (accepted) assignee, the Head Officer, or Admin; unassigned staff denied.
  - Detail reads        -> the applicant, the Head Officer, staff assigned to the case, or Admin.
  - Subdivision Leaders and other barangays -> denied everywhere.
  - Staff cannot act on their own application; unresolvable barangay fails closed.
Run from the backend folder:  python tests/test_adoption_authority.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "adoption_authority_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-authority-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Adoption, AdoptionAssignment, AdoptionMonitoringLog, HoldingAnimal, Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoptions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(adoptions.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add_all([Barangay(barangay_id=1, barangay_name="Brgy One", city="C"), Barangay(barangay_id=2, barangay_name="Brgy Two", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"), Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2")])
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


U = {
    "applicant": mk_user("Applicant", 1, subdivision_id=1, barangay_id=1),
    "other_resident": mk_user("Other Resident", 1, subdivision_id=1, barangay_id=1),
    "tanod_b1": mk_user("Tanod One", 3, barangay_id=1),
    "head_b1": mk_user("Head One", 3, barangay_id=1, is_head_officer=True),
    "tanod_b2": mk_user("Tanod Two", 3, barangay_id=2),
    "head_b2": mk_user("Head Two", 3, barangay_id=2, is_head_officer=True),
    "leader": mk_user("Leader", 2, subdivision_id=1, barangay_id=1),
    "admin": mk_user("Admin", 4),
}
db.commit()
TOK = {k: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})} for k, u in U.items()}


def mk_adoption(applicant_key="applicant", subdivision_id=1, stage="Interview", status="Approved"):
    rep = Report(user_id=U[applicant_key].user_id, subdivision_id=subdivision_id, category_id=1, latitude=1, longitude=1)
    db.add(rep)
    db.flush()
    animal = HoldingAnimal(report_id=rep.report_id, animal_name="Max", animal_type="Dog", facility_status=6)
    db.add(animal)
    db.flush()
    ad = Adoption(holding_id=animal.holding_id, applicant_id=U[applicant_key].user_id, status=status,
                  full_name=U[applicant_key].name, address="a", contact_no="0900", reason="r" * 25, current_stage=stage)
    db.add(ad)
    db.flush()
    log = AdoptionMonitoringLog(adoption_id=ad.adoption_id, milestone_name="Day_7", due_date=date.today(), status="Submitted")
    db.add(log)
    db.commit()
    return ad.adoption_id, log.log_id


WHEN = "2026-10-20T10:00:00"
DECISION = [
    ("POST", "/adoptions/{id}/application/approve", None),
    ("PUT", "/adoptions/review/{id}", {"decision": "Approved"}),
    ("POST", "/adoptions/{id}/approve", {"decision": "Approved"}),
    ("POST", "/adoptions/{id}/review/submit", {"review_notes": "ok"}),
    ("POST", "/adoptions/{id}/certificate/proceed", None),
    ("POST", "/adoptions/{id}/certificate/send", {}),
    ("POST", "/adoptions/{id}/monitoring/proceed", None),
    ("POST", "/adoptions/{id}/successful/proceed", None),
    ("POST", "/adoptions/monitoring/{log}/review", {"status": "Approved"}),
]
TASK = [  # (method, path, body, task_type)
    ("POST", "/adoptions/{id}/verify", {}, "Verification"),
    ("POST", "/adoptions/{id}/interview/schedule", {"scheduled_at": WHEN}, "Interview"),
    ("POST", "/adoptions/{id}/interview/evaluate", {}, "Interview"),
    ("POST", "/adoptions/{id}/home-visit/schedule", {"scheduled_date": WHEN}, "Home_Visit"),
    ("POST", "/adoptions/{id}/home-visit/evaluate", {}, "Home_Visit"),
    ("POST", "/adoptions/{id}/handover/proceed", None, "Handover"),
    ("POST", "/adoptions/{id}/handover/schedule", {"handover_date": WHEN}, "Handover"),
    ("POST", "/adoptions/{id}/handover/complete", {}, "Handover"),
    ("POST", "/adoptions/{id}/staff-confirm-handover", {}, "Handover"),
    ("POST", "/adoptions/{id}/monitoring/record", {}, "Monitoring"),
]
READS = [
    ("GET", "/adoptions/{id}/dossier", None),
    ("GET", "/adoptions/{id}/certificate", None),
    ("GET", "/adoptions/{id}/monitoring", None),
]
DENIED = {401, 403, 404}

results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def call(method, path, body, who, ad_id, log_id):
    url = path.replace("{id}", str(ad_id)).replace("{log}", str(log_id))
    return client.request(method, url, json=body, headers=TOK[who])


def run_group(name, endpoints, allowed, denied):
    for method, path, body in endpoints:
        ad_id, log_id = mk_adoption()
        # Denied identities first (authorization must reject before any state change)
        for who in denied:
            r = call(method, path, body, who, ad_id, log_id)
            check(f"{name}: {who:<15} {method} {path} -> denied", r.status_code in DENIED, f"{r.status_code} {r.text[:120]}")
        for who in allowed:
            r = call(method, path, body, who, ad_id, log_id)
            check(f"{name}: {who:<15} {method} {path} -> authorized", (r.status_code not in DENIED and r.status_code < 500), f"{r.status_code} {r.text[:160]}")


run_group("DECISION", DECISION,
          allowed=["head_b1", "admin"],
          denied=["tanod_b1", "head_b2", "tanod_b2", "leader", "applicant", "other_resident"])
def assign(ad_id, who, task_type, status="Accepted"):
    db.add(AdoptionAssignment(adoption_id=ad_id, task_type=task_type, assigned_to=U[who].user_id,
                              assigned_to_name=U[who].name, assigned_by=U["head_b1"].user_id, status=status))
    db.commit()


run_group("TASK", [t[:3] for t in TASK],
          allowed=["head_b1", "admin"],
          denied=["tanod_b1", "head_b2", "tanod_b2", "leader", "other_resident"])
# The assignee: denied until the task is accepted, then authorized; the Head Officer then needs an override reason.
for method, path, body, task_type in TASK:
    ad_id, log_id = mk_adoption()
    assign(ad_id, "tanod_b1", task_type, status="Assigned")
    r = call(method, path, body, "tanod_b1", ad_id, log_id)
    check(f"TASK: tanod (assigned, not accepted) {path} -> 409 accept first", r.status_code == 409, f"{r.status_code} {r.text[:120]}")
    db.query(AdoptionAssignment).filter(AdoptionAssignment.adoption_id == ad_id).update({"status": "Accepted"})
    db.commit()
    r = call(method, path, body, "tanod_b2", ad_id, log_id)
    check(f"TASK: other-barangay staff still denied on an assigned task {path}", r.status_code in DENIED, r.status_code)
    r = call(method, path, body, "tanod_b1", ad_id, log_id)
    check(f"TASK: tanod (accepted assignee) {path} -> authorized", (r.status_code not in DENIED and r.status_code < 500) and r.status_code != 409, f"{r.status_code} {r.text[:160]}")

ad_id, log_id = mk_adoption()
assign(ad_id, "tanod_b1", "Interview")
r = client.post(f"/adoptions/{ad_id}/interview/evaluate", json={}, headers=TOK["head_b1"])
check("Head Officer cannot record an interview assigned to someone else without a reason", r.status_code == 403, r.status_code)
r = client.post(f"/adoptions/{ad_id}/interview/evaluate", json={"override_reason": "Interviewer is on leave"}, headers=TOK["head_b1"])
check("...but can with an override reason (audited)", r.status_code == 200, f"{r.status_code} {r.text[:160]}")

run_group("READ", READS,
          allowed=["applicant", "head_b1", "admin"],
          denied=["other_resident", "tanod_b1", "head_b2", "tanod_b2", "leader"])
ad_id, log_id = mk_adoption()
assign(ad_id, "tanod_b1", "Home_Visit", status="Assigned")
for method, path, body in READS:
    r = call(method, path, body, "tanod_b1", ad_id, log_id)
    check(f"READ: tanod assigned to the case {path} -> authorized", (r.status_code not in DENIED and r.status_code < 500), f"{r.status_code} {r.text[:120]}")

# ── Conflict of interest: staff member's own application ────────────────────
own_id, own_log = mk_adoption(applicant_key="tanod_b1")
r = client.post(f"/adoptions/{own_id}/verify", json={}, headers=TOK["tanod_b1"])
check("conflict: staff cannot process their OWN application (task)", r.status_code == 403, r.status_code)
r = client.post(f"/adoptions/{own_id}/verify", json={}, headers=TOK["head_b1"])
check("conflict: the Head Officer can process the staff member's application", (r.status_code not in DENIED and r.status_code < 500), r.status_code)

# ── Fail closed: barangay cannot be resolved (subdivision missing) ──────────
orphan_id, orphan_log = mk_adoption(subdivision_id=999)
for who in ("tanod_b1", "head_b1"):
    r = client.post(f"/adoptions/{orphan_id}/verify", json={}, headers=TOK[who])
    check(f"fail-closed: {who} denied when the application's barangay is unknown", r.status_code == 403, r.status_code)
r = client.post(f"/adoptions/{orphan_id}/verify", json={}, headers=TOK["admin"])
check("fail-closed: Admin still allowed (oversight)", (r.status_code not in DENIED and r.status_code < 500), r.status_code)

# ── Monitoring dashboard ─────────────────────────────────────────────────────
r = client.get("/adoptions/monitoring/dashboard", headers=TOK["leader"])
check("dashboard: Subdivision Leader denied (previously saw every barangay)", r.status_code == 403, r.status_code)
for who in ("tanod_b1", "head_b1", "admin"):
    r = client.get("/adoptions/monitoring/dashboard", headers=TOK[who])
    check(f"dashboard: {who} allowed", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

# ── Home-visit photo upload: leaders dropped ─────────────────────────────────
r = client.post("/adoptions/upload-home-visit-photos", headers=TOK["leader"], files={"files": ("x.jpg", b"\xff\xd8\xff", "image/jpeg")})
check("upload-home-visit-photos: Subdivision Leader denied", r.status_code == 403, r.status_code)

# ── reviewer_role recorded correctly ─────────────────────────────────────────
rid, _ = mk_adoption(stage="Application", status="Pending")
client.post(f"/adoptions/{rid}/application/approve", headers=TOK["admin"])
db.expire_all()
check("reviewer_role: Admin approval is recorded as 'Admin' (was mislabeled)", db.query(Adoption).get(rid).reviewer_role == "Admin", db.query(Adoption).get(rid).reviewer_role)
rid2, _ = mk_adoption(stage="Application", status="Pending")
client.post(f"/adoptions/{rid2}/application/approve", headers=TOK["head_b1"])
db.expire_all()
check("reviewer_role: Head Officer approval recorded as 'Barangay Head Officer'", db.query(Adoption).get(rid2).reviewer_role == "Barangay Head Officer")

# ── Notifications scoped to the application's barangay ──────────────────────
db.query(Notification).delete()
db.commit()
cid, _ = mk_adoption()
client.post(f"/adoptions/{cid}/cancel", json={"reason": "changed my mind"}, headers=TOK["applicant"])
db.expire_all()
notified = {n.user_id for n in db.query(Notification).filter(Notification.related_id == cid).all()}
check("notifications: barangay-1 Head Officer notified of the cancellation", U["head_b1"].user_id in notified, notified)
check("notifications: barangay-2 Head Officer NOT notified", U["head_b2"].user_id not in notified, notified)

# ── Residents unaffected ─────────────────────────────────────────────────────
r = client.get("/adoptions/my-applications", headers=TOK["applicant"])
check("resident: my-applications still works", r.status_code == 200 and len(r.json()) >= 1, r.status_code)

passed = sum(results)
print(f"\n{passed}/{len(results)} authority checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
