"""
P2: the separate AI worker process (python -m app.ai_worker) runs queued AI jobs, checks in, and the Admin can see it.
Starts the real worker as a subprocess on a throwaway SQLite DB (Gemini switched OFF, so nothing goes to Google).
Run from the backend folder:  python tests/test_ai_worker.py
"""
import os
import subprocess
import sys
import tempfile
import time

_DB = os.path.join(tempfile.mkdtemp(), "ai_worker_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ai-worker-0123456789")
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.ai_job import AiJob  # noqa: E402
from app.models.report import Report  # noqa: E402
from app.models.system_setting import SystemSetting  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import ai_jobs as ai_jobs_routes  # noqa: E402
from app.utils import ai_jobs  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(SystemSetting(setting_key="gemini_vision_matching", setting_value="attribute_only", is_enabled=False))
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
res = User(name="Res", email="r@test-mail.com", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1)
admin = User(name="Admin", email="a@test-mail.com", password="x", role_id=4, is_verified=True, status="Active")
db.add_all([res, admin])
db.flush()
rep = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=1,
             animal_type="Dog", description="Notes: a dog chasing kids near the gate")
db.add(rep)
db.commit()
RID, ADMIN_ID = rep.report_id, admin.user_id
db.close()
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def wait_for(cond, seconds=60):
    end = time.time() + seconds
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.5)
    return False


def job_status(jid):
    s = SessionLocal()
    try:
        return s.get(AiJob, jid).status
    finally:
        s.close()


ai_jobs.enqueue_backfill(RID, {"animal_type": "Dog"})
s = SessionLocal()
JID = s.query(AiJob.job_id).filter(AiJob.kind == "backfill").scalar()
s.close()

env = dict(os.environ, PYTHONIOENCODING="utf-8", AI_WORKER_EMBEDDED="off")
worker = subprocess.Popen([sys.executable, "-m", "app.ai_worker"], cwd=BACKEND, env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
try:
    check("the worker process starts and checks in", wait_for(lambda: ai_jobs.worker_alive(), 90))
    check("it picks up the queued job and completes it", wait_for(lambda: job_status(JID) == "done", 60), job_status(JID))
    s = SessionLocal()
    check("...the report's AI suggestions are saved", s.get(Report, RID).ai_suggested_risk_level is not None)
    s.close()

    # A job queued while the worker is running is handled without the web server doing anything
    ai_jobs.enqueue_follow_up(RID, delay=0)
    s = SessionLocal()
    FID = s.query(AiJob.job_id).filter(AiJob.kind == "follow_up").scalar()
    s.close()
    check("a newly queued follow-up (matching scan) is run by the worker", wait_for(lambda: job_status(FID) == "done", 60), job_status(FID))

    # Admin view
    api = FastAPI()
    api.include_router(ai_jobs_routes.router)
    client = TestClient(api)
    H = {"Authorization": "Bearer " + create_access_token({"sub": str(ADMIN_ID), "user_id": ADMIN_ID, "role_id": 4})}
    body = client.get("/admin/ai-jobs", headers=H).json()
    check("Admin sees the worker running and the finished jobs",
          body.get("worker_running") is True and body["counts"].get("backfill:done") == 1 and body["counts"].get("follow_up:done") == 1, body)
    RH = {"Authorization": "Bearer " + create_access_token({"sub": "1", "user_id": 1, "role_id": 1})}
    check("residents can't see the AI queue", client.get("/admin/ai-jobs", headers=RH).status_code == 403)
finally:
    worker.terminate()
    try:
        out, _ = worker.communicate(timeout=20)
    except subprocess.TimeoutExpired:
        worker.kill()
        out, _ = worker.communicate()

check("the worker logged that it was ready", "Ready" in (out or ""), (out or "")[-600:])
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
