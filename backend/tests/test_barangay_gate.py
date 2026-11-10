"""
Subdivision-only gate (SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md, Phase 1).

- Barangay accounts (role 3) cannot sign in and every token they hold is refused.
- The retired workflows (rescue dispatch, holding, legacy claims, claim fees, adoption) have no routes any more.
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
from fastapi import FastAPI  # noqa: E402

from app.routes import auth, notifications, reports  # noqa: E402

app = FastAPI()
for router in (auth.router, reports.router, notifications.router):
    app.include_router(router)
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.utils.auth import create_access_token, get_password_hash  # noqa: E402
from app.utils.retired import BARANGAY_ACCOUNT_DISABLED_MESSAGE  # noqa: E402

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


# 0. main.py registers none of the retired routers and has no retired start-up logic
main_src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "main.py"), encoding="utf-8").read()
for name in ("rescue.router", "holding.router", "claims.router", "adoption_chat.router", "adoption_tasks.router", "adoption_certificates.router",
             "claim_assessment_routes.router", "adoptions.router", "sidebar_routes.router", "_RETIRED"):
    check(f"main.py does not register {name}", name not in main_src)
for name in ("ensure_holding_tables", "ensure_adoption_tables_and_columns", "ensure_rescue_tables_columns", "ensure_endorsement_letters_columns",
             "ensure_pet_claims_status_enum", "ensure_claim_assessment_cat_charge_columns"):
    check(f"main.py has no {name}", name not in main_src)

# 1. Barangay sign-in refused
r = client.post("/auth/login", json={"email": brgy.email, "password": PASSWORD})
check("Barangay password login refused (403)", r.status_code == 403 and detail(r) == BARANGAY_ACCOUNT_DISABLED_MESSAGE, r.text)

# 2. Existing Barangay token refused everywhere
for method, path in (("get", "/auth/me"), ("get", "/reports/"), ("get", "/notifications/me")):
    r = getattr(client, method)(path, headers=bearer(brgy))
    check(f"Barangay token refused on {method.upper()} {path}", r.status_code == 403 and detail(r) == BARANGAY_ACCOUNT_DISABLED_MESSAGE,
          f"{r.status_code} {r.text[:150]}")

# 3. Other roles still sign in and work
r = client.get("/auth/me", headers=bearer(leader))
check("Leader token still works on GET /auth/me", r.status_code == 200, r.text[:150])

# 4. The retired workflows have no routes: reads and writes are 404 for every role
for user, method, path in ((admin, "get", "/holding/"), (admin, "get", "/claims/"), (admin, "get", "/adoptions/pipeline"),
                           (admin, "get", "/rescue-requests/"), (admin, "get", "/claim-assessments/schedules"), (admin, "get", "/sidebar/badges"),
                           (admin, "post", "/holding/"), (leader, "post", "/rescue-requests/"), (resident, "post", "/claims/"),
                           (resident, "post", "/adoptions/apply"), (admin, "post", "/adoption-tasks/1/accept")):
    r = getattr(client, method)(path, headers=bearer(user), **({"json": {}} if method == "post" else {}))
    check(f"{method.upper()} {path} no longer exists (404)", r.status_code == 404, f"{r.status_code} {r.text[:150]}")

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

# 8. The operations watcher no longer has the holding or adoption jobs
from app.tasks import unassigned_checker  # noqa: E402

check("The overdue-holding and adoption-monitoring jobs are gone",
      not hasattr(unassigned_checker, "check_and_notify_overdue_holding_animals") and not hasattr(unassigned_checker, "check_and_notify_monitoring_schedules")
      and not hasattr(unassigned_checker, "reconcile_adoption_after_owner_return"))

# 9. The switch still lets the legacy Barangay sign-in work
os.environ["BARANGAY_WORKFLOWS_ENABLED"] = "1"
try:
    r = client.get("/auth/me", headers=bearer(brgy))
    check("With BARANGAY_WORKFLOWS_ENABLED=1 the Barangay token works again", r.status_code == 200, r.text[:150])
finally:
    os.environ.pop("BARANGAY_WORKFLOWS_ENABLED", None)

db.close()
print(f"\nAll {passed} Barangay gate checks passed.")
