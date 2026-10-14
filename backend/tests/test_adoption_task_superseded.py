"""
A task whose step was finished by a decision on the whole application (the officer approved it, which also verifies
the documents) is no longer someone else's to-do: it is closed for them (moves to "Declined / Closed"), they're told,
and the officer's own task is marked Completed. Throwaway SQLite DB, real JWT auth.
Run from the backend folder:  python tests/test_adoption_task_superseded.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "adoption_task_superseded_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-task-superseded-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Adoption, AdoptionAssignment, HoldingAnimal, Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoption_tasks, adoptions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(adoption_tasks.router)
api.include_router(adoptions.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="Brgy One", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


applicant = mk_user("Applicant", 1, subdivision_id=1, barangay_id=1)
kyla = mk_user("Kyla Officer", 3, barangay_id=1, is_head_officer=True)
richard = mk_user("Richard Staff", 3, barangay_id=1)
db.commit()
H = {u.user_id: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}
     for u in (applicant, kyla, richard)}
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def mk_adoption(stage="Application", status="Pending"):
    rep = Report(user_id=applicant.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1)
    db.add(rep)
    db.flush()
    animal = HoldingAnimal(report_id=rep.report_id, animal_name="Shaq", animal_type="Dog", facility_status=6)
    db.add(animal)
    db.flush()
    ad = Adoption(holding_id=animal.holding_id, applicant_id=applicant.user_id, status=status, full_name="Applicant",
                  address="Blk 1", contact_no="0900", reason="r" * 25, current_stage=stage)
    db.add(ad)
    db.commit()
    return ad.adoption_id


def assign(ad, task, target):
    return client.post(f"/adoptions/{ad}/assignments", json={"task_type": task, "assigned_to": target.user_id}, headers=H[kyla.user_id])


def tasks(ad, user):
    db.expire_all()
    return {a.task_type: a for a in db.query(AdoptionAssignment).filter(AdoptionAssignment.adoption_id == ad,
                                                                       AdoptionAssignment.assigned_to == user.user_id).all()}


def my_open(user):
    r = client.get("/adoption-tasks/mine", headers=H[user.user_id])
    return [t["adoption_id"] for t in r.json()] if r.status_code == 200 else ["ERR", r.status_code, r.text[:120]]


# 1. The reported case: verification assigned to Richard, then Kyla approves the application herself
A = mk_adoption()
client.post(f"/adoptions/{A}/claim", headers=H[kyla.user_id])
r = assign(A, "Verification", richard)
check("setup: verification assigned to Richard (waiting for acceptance)", r.status_code == 200 and tasks(A, richard)["Verification"].status == "Assigned", r.text[:200])
check("setup: it shows in Richard's open tasks", A in my_open(richard))
r = client.post(f"/adoptions/{A}/application/approve", headers=H[kyla.user_id])
check("Kyla approves the application", r.status_code == 200, r.text[:200])
v = tasks(A, richard)["Verification"]
check("Richard's verification task is closed, not left waiting", v.status == "Cancelled" and v.cancelled_at is not None, v.status)
check("...with the reason recorded", "approved" in (v.remarks or "") and "Kyla" in (v.remarks or ""), v.remarks)
check("...and it's gone from his open tasks", A not in my_open(richard))
db.expire_all()
check("Richard is told it's no longer needed",
      db.query(Notification).filter(Notification.user_id == richard.user_id, Notification.title.like("Task no longer needed%")).count() == 1)

# 2. The officer's own task is Completed, not closed
B = mk_adoption()
client.post(f"/adoptions/{B}/claim", headers=H[kyla.user_id])
assign(B, "Verification", kyla)
client.post(f"/adoptions/{B}/application/approve", headers=H[kyla.user_id])
check("the approver's own verification task is marked Completed", tasks(B, kyla)["Verification"].status == "Completed")

# 3. Final approval closes any still-open verification / interview / home-visit tasks
C = mk_adoption(stage="Home_Visit", status="Approved")
client.post(f"/adoptions/{C}/claim", headers=H[kyla.user_id])
assign(C, "Interview", richard)
assign(C, "Home_Visit", richard)
r = client.put(f"/adoptions/review/{C}", json={"decision": "Approved"}, headers=H[kyla.user_id])
check("final approval succeeds", r.status_code == 200, r.text[:200])
t = tasks(C, richard)
check("open interview and home-visit tasks are closed by the final approval",
      t["Interview"].status == "Cancelled" and t["Home_Visit"].status == "Cancelled", {k: v.status for k, v in t.items()})
check("...and nothing is left in Richard's open tasks", C not in my_open(richard))

# 4. Tasks for later steps are untouched
D = mk_adoption()
client.post(f"/adoptions/{D}/claim", headers=H[kyla.user_id])
assign(D, "Interview", richard)
client.post(f"/adoptions/{D}/application/approve", headers=H[kyla.user_id])
check("approving the application doesn't touch the (next) interview task", tasks(D, richard)["Interview"].status == "Assigned")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
