"""Phase 1 account retirement regression. Uses only throwaway SQLite and mocked mail.

Run: .venv/Scripts/python.exe backend/tests/test_barangay_provisioning_retired.py
Never imports app.main or uses the application's configured database.
"""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
temp_dir = tempfile.TemporaryDirectory(prefix="straysafe-retired-users-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(temp_dir.name) / "test.db").as_posix()
os.environ.setdefault("JWT_SECRET_KEY", "synthetic-retired-users-test-secret-0123456789")
os.environ.pop("BARANGAY_WORKFLOWS_ENABLED", None)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.user import Barangay, Position, Role, Subdivision, User  # noqa: E402
from app.routes import auth, users  # noqa: E402
from app.utils.auth import create_access_token, get_password_hash  # noqa: E402

Base.metadata.create_all(engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(users.router)
api.include_router(auth.router)
client = TestClient(api)
db = SessionLocal()
checks = 0


def check(label, condition, detail=""):
    global checks
    assert condition, f"{label}: {detail}"
    checks += 1
    print("PASS " + label)


def headers(user):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(user.user_id), "user_id": user.user_id,
            "role_id": user.role_id, "is_verified": True})}


def request(method, path, payload=None, actor=None):
    limiter.reset()
    return client.request(method, path, headers=headers(actor) if actor else {},
                          **({"json": payload} if payload is not None else {}))


try:
    db.add_all([Role(role_id=n, role_name=label) for n, label in
                [(1, "Resident"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Administrator")]])
    db.add(Barangay(barangay_id=1, barangay_name="Demo Barangay", city="Demo City"))
    db.flush()
    db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Demo Subdivision"))
    password = "Synthetic-Test-Pass-123"
    digest = get_password_hash(password)
    actors = []
    for role in (4, 1, 2, 3):
        user = User(name=f"Demo Role {role}", email=f"role{role}@example.com", password=digest,
                    role_id=role, subdivision_id=1, barangay_id=1, is_verified=True,
                    status="Active", is_head_officer=(role == 3))
        db.add(user)
        actors.append(user)
    db.commit()
    admin, resident, leader, historical = actors
    original_head_id = historical.user_id
    original_user_count = db.query(User).count()
    original_positions = db.query(Position).count()

    with patch.object(users, "_send_invite", return_value=True) as mail:
        for endpoint in ("/users/", "/users/admin-create"):
            for role, head in ((3, False), (3, True), (2, True), (4, True)):
                payload = {"name": "Blocked demo", "email": f"blocked{role}{head}@example.com",
                           "role_id": role, "is_head_officer": head, "password": password,
                           "position": "Blocked title must not be created", "subdivision_id": 1}
                r = request("POST", endpoint, payload, admin)
                check(f"{endpoint} refuses role {role}/head {head}", r.status_code == 403, r.text)
        db.expire_all()
        check("refused creates leave users unchanged", db.query(User).count() == original_user_count)
        check("refused creates do not create positions", db.query(Position).count() == original_positions)
        check("refused creates send no invitations", mail.call_count == 0)

        for actor in (resident, leader, admin):
            for change in ({"role_id": 3}, {"is_head_officer": True}, {"role_id": 3, "is_head_officer": True}):
                r = request("PUT", f"/users/{actor.user_id}",
                            {**change, "position": "Blocked update title"}, admin)
                check(f"role/head promotion refused for existing role {actor.role_id}: {change}", r.status_code == 403, r.text)
        db.expire_all()
        check("refused edits do not create positions", db.query(Position).count() == original_positions)
        check("existing supported roles and head flags are unchanged",
              [db.get(User, u.user_id).role_id for u in (resident, leader, admin)] == [1, 2, 4]
              and not any(db.get(User, u.user_id).is_head_officer for u in (resident, leader, admin)))

        for target in (resident, historical):
            r = request("POST", "/users/barangay/1/assign-head", {"user_id": target.user_id}, admin)
            check("head assignment refused without touching current heads", r.status_code == 403, r.text)
        db.expire_all()
        check("original historical account/head preserved",
              db.get(User, original_head_id).role_id == 3 and db.get(User, original_head_id).is_head_officer)
        r = request("POST", f"/users/{historical.user_id}/resend-invite", actor=admin)
        check("historical account cannot receive a setup invitation", r.status_code == 403, r.text)
        check("no invitation sent for historical account", mail.call_count == 0)

        r = request("GET", "/users/?role_id=3", actor=admin)
        check("historical account remains readable by Admin",
              r.status_code == 200 and any(u["user_id"] == original_head_id for u in r.json()), r.text)
        r = request("POST", "/auth/login", {"email": historical.email, "password": password})
        check("historical Barangay sign-in still refused", r.status_code == 403, r.text)
        r = request("GET", "/users/", actor=historical)
        check("existing role-3 token still refused", r.status_code == 403, r.text)

        for endpoint in ("/users/", "/users/admin-create"):
            for role in (1, 2, 4):
                payload = {"name": f"Supported Demo {role}", "email": f"supported{role}{len(endpoint)}@example.com",
                           "role_id": role, "password": password, "subdivision_id": 1}
                r = request("POST", endpoint, payload, admin)
                check(f"{endpoint} still creates role {role}", r.status_code == 200 and r.json()["role_id"] == role, r.text)
        r = request("PUT", f"/users/{resident.user_id}", {"name": "Updated Demo Resident"}, admin)
        check("ordinary supported account edits still work", r.status_code == 200, r.text)
        r = request("PUT", f"/users/{resident.user_id}", {"role_id": 2}, admin)
        check("conversion between supported roles still works", r.status_code == 200 and r.json()["role_id"] == 2, r.text)

        # Public registration keeps its pre-existing role clamp rather than granting requested authority.
        r = request("POST", "/users/", {"name": "Public Demo", "email": "public@example.com",
                    "role_id": 3, "is_head_officer": True, "password": password})
        check("public sign-up still creates only an unverified resident",
              r.status_code == 200 and r.json()["role_id"] == 1 and not r.json()["is_head_officer"]
              and not r.json()["is_verified"], r.text)

        with patch.dict(os.environ, {"BARANGAY_WORKFLOWS_ENABLED": "1"}):
            for endpoint in ("/users/", "/users/admin-create"):
                r = request("POST", endpoint, {"name": "Legacy Demo", "email": f"legacy{len(endpoint)}@example.com",
                            "role_id": 3, "is_head_officer": True, "barangay_id": 1, "password": password}, admin)
                check("legacy switch restores role-3 creation on " + endpoint,
                      r.status_code == 200 and r.json()["role_id"] == 3, r.text)
            r = request("PUT", f"/users/{leader.user_id}", {"role_id": 3, "is_head_officer": True}, admin)
            check("legacy switch restores role/head edits", r.status_code == 200 and r.json()["role_id"] == 3, r.text)
            r = request("POST", "/users/barangay/1/assign-head", {"user_id": resident.user_id}, admin)
            check("legacy switch restores head assignment", r.status_code == 200 and r.json()["is_head_officer"], r.text)
        check("legacy switch does not remain enabled", "BARANGAY_WORKFLOWS_ENABLED" not in os.environ)
    print(f"PASS all {checks} isolated account retirement checks")
finally:
    client.close()
    db.close()
    engine.dispose()
    temp_dir.cleanup()
