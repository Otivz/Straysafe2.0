"""
Subdivision-only gate (SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md, Phase 1).

- Barangay accounts (role 3) cannot sign in and every token they hold is refused.
- Retired workflows (rescue dispatch, holding, claims, claim fees, adoption) keep reads and refuse writes for all roles,
  except the kept write routes (leader escalation, owner-return claim).
- No email or push goes to a Barangay account.
- BARANGAY_WORKFLOWS_ENABLED=1 restores the legacy behavior.

Run: .venv/Scripts/python.exe backend/tests/test_barangay_gate.py  (throwaway SQLite, never the app database)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "gate.db")
os.environ.setdefault("JWT_SECRET_KEY", "gate-test-secret-key-0123456789-0123456789")
os.environ.pop("BARANGAY_WORKFLOWS_ENABLED", None)

from unittest.mock import patch  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from fastapi import Depends, FastAPI  # noqa: E402

from app.routes import (adoption_certificates, adoption_chat, adoption_tasks, adoptions, auth, claim_assessments,  # noqa: E402
                        claims, holding, notifications, reports, rescue)
from app.utils.retired import retired_workflow  # noqa: E402

# app.main runs MySQL-only startup checks, so the same wiring is rebuilt here; section 0 checks main.py itself.
RETIRED_ROUTERS = {
    "rescue.router": rescue.router, "rescue.rescue_alias_router": rescue.rescue_alias_router,
    "holding.router": holding.router, "claims.router": claims.router, "adoption_chat.router": adoption_chat.router,
    "adoption_tasks.router": adoption_tasks.router, "adoption_certificates.router": adoption_certificates.router,
    "claim_assessment_routes.router": claim_assessments.router, "adoptions.router": adoptions.router,
}
app = FastAPI()
for router in (auth.router, reports.router, notifications.router):
    app.include_router(router)
for router in RETIRED_ROUTERS.values():
    app.include_router(router, dependencies=[Depends(retired_workflow)])
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.utils.auth import create_access_token, get_password_hash  # noqa: E402
from app.utils.retired import BARANGAY_ACCOUNT_DISABLED_MESSAGE, RETIRED_WORKFLOW_MESSAGE  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=False)
db = SessionLocal()
for rid, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"))
db.commit()

PASSWORD = "Gate-Test-Pass-1"


def make_user(name, role, head=False):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@gatetest.com", password=get_password_hash(PASSWORD),
             role_id=role, is_verified=True, status="Active", subdivision_id=1, barangay_id=1, is_head_officer=head)
    db.add(u)
    db.commit()
    return u


resident, leader, brgy, admin = (make_user("Resident One", 1), make_user("Leader One", 2),
                                 make_user("Head Reyes", 3, head=True), make_user("Admin One", 4))


def bearer(u):
    return {"Authorization": "Bearer " + create_access_token(
        {"sub": str(u.user_id), "user_id": u.user_id, "email": u.email, "role_id": u.role_id, "is_verified": True})}


passed = 0


def check(label, condition, detail=""):
    global passed
    assert condition, f"{label} {detail}"
    passed += 1
    print(f"[PASS] {label}")


def detail(r):
    try:
        return r.json().get("detail")
    except Exception:
        return None


# 0. main.py attaches the gate to every retired router
main_src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "main.py"), encoding="utf-8").read()
for name in RETIRED_ROUTERS:
    check(f"main.py gates {name}", f"app.include_router({name}, dependencies=_RETIRED)" in main_src)

# 1. Barangay sign-in refused
r = client.post("/auth/login", json={"email": brgy.email, "password": PASSWORD})
check("Barangay password login refused (403)", r.status_code == 403 and detail(r) == BARANGAY_ACCOUNT_DISABLED_MESSAGE, r.text)

# 2. Existing Barangay token refused everywhere, retired router or not
for method, path in (("get", "/auth/me"), ("get", "/reports/"), ("get", "/holding/"), ("get", "/adoptions/pipeline"),
                     ("get", "/claims/"), ("get", "/notifications/me"), ("post", "/holding/")):
    r = getattr(client, method)(path, headers=bearer(brgy), **({"json": {}} if method == "post" else {}))
    # a write to a retired router may be refused by the write gate first; either refusal is correct
    allowed = {BARANGAY_ACCOUNT_DISABLED_MESSAGE} | ({RETIRED_WORKFLOW_MESSAGE} if method != "get" else set())
    check(f"Barangay token refused on {method.upper()} {path}", r.status_code == 403 and detail(r) in allowed,
          f"{r.status_code} {r.text[:150]}")

# 3. Other roles still sign in and work
r = client.get("/auth/me", headers=bearer(leader))
check("Leader token still works on GET /auth/me", r.status_code == 200, r.text[:150])

# 4. Reads of retired workflows stay available as history
for path in ("/holding/", "/claims/", "/adoptions/pipeline", "/rescue-requests/"):
    r = client.get(path, headers=bearer(admin))
    check(f"Admin GET {path} not refused by the gate", r.status_code != 403, f"{r.status_code} {r.text[:150]}")

# 5. Writes refused for every role
writes = [
    (admin, "post", "/holding/"), (admin, "patch", "/holding/1"), (admin, "put", "/holding/stay-limit"),
    (leader, "post", "/holding/1/escalate"), (leader, "post", "/holding/1/timeline"),
    (admin, "post", "/adoptions/promote/1"), (resident, "post", "/adoptions/apply"), (resident, "post", "/adoptions/1/cancel"),
    (admin, "post", "/adoptions/1/assignments"), (admin, "post", "/adoption-tasks/1/accept"),
    (resident, "post", "/chat/adoptions/1/messages"),
    (resident, "post", "/claims/1/evidence"), (admin, "delete", "/claims/1"), (resident, "post", "/claims/1/close-not-needed"),
    (admin, "post", "/claim-assessments/schedules"), (admin, "post", "/claim-assessments/1/payment"),
    (admin, "patch", "/rescue-requests/1"), (admin, "post", "/rescue-requests/assign-team"), (admin, "patch", "/rescue/1/status"),
]
for user, method, path in writes:
    kwargs = {} if method == "delete" else {"json": {}}
    r = getattr(client, method)(path, headers=bearer(user), **kwargs)
    check(f"{method.upper()} {path} refused for role {user.role_id}", r.status_code == 403 and detail(r) == RETIRED_WORKFLOW_MESSAGE,
          f"{r.status_code} {r.text[:150]}")

# 6. Kept writes are not refused by the gate (they may still fail their own validation)
for user, method, path in ((leader, "post", "/rescue-requests/"), (resident, "post", "/claims/"),
                           (resident, "patch", "/claims/1/status")):
    r = getattr(client, method)(path, headers=bearer(user), json={})
    check(f"Kept write {method.upper()} {path} passes the gate", detail(r) != RETIRED_WORKFLOW_MESSAGE, f"{r.status_code} {r.text[:150]}")

# 7. No email and no push to a Barangay account
from app.services.email_service import queue_email  # noqa: E402

with patch("app.services.email_service._deliver_email_sync", return_value=True):
    sent = queue_email(db, recipient_email=brgy.email, subject="s", text_body="t", html_body="<p>t</p>",
                       template_key="gate_test", category="reports", user_id=brgy.user_id)
    check("Email to a Barangay account suppressed", sent is None)
    sent = queue_email(db, recipient_email=brgy.email, subject="s", text_body="t", html_body="<p>t</p>",
                       template_key="gate_test", category="reports")
    check("Email to a Barangay address without user_id suppressed", sent is None)

from app.services import push_service  # noqa: E402

notif_like = type("N", (), {"user_id": brgy.user_id, "type": "alert", "related_id": None})()
sub_like = type("S", (), {"revoked_at": None, "user_id": brgy.user_id, "subscription_id": 1})()
reason = push_service.skip_reason(db, None, sub_like, notif_like, brgy)
check("Push to a Barangay account skipped", reason is not None and "Barangay" in reason, str(reason))

# 8. The overdue-holding reminder task is off
from app.tasks.unassigned_checker import check_and_notify_overdue_holding_animals  # noqa: E402

check("Overdue-holding reminder task is off", check_and_notify_overdue_holding_animals() == 0)

# 9. The switch restores the legacy behavior
os.environ["BARANGAY_WORKFLOWS_ENABLED"] = "1"
try:
    r = client.get("/auth/me", headers=bearer(brgy))
    check("With BARANGAY_WORKFLOWS_ENABLED=1 the Barangay token works again", r.status_code == 200, r.text[:150])
    r = client.post("/holding/", headers=bearer(admin), json={})
    check("With BARANGAY_WORKFLOWS_ENABLED=1 holding writes pass the gate", detail(r) != RETIRED_WORKFLOW_MESSAGE, r.text[:150])
finally:
    os.environ.pop("BARANGAY_WORKFLOWS_ENABLED", None)

db.close()
print(f"\nAll {passed} Barangay gate checks passed.")
