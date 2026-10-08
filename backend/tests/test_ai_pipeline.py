"""
RC4: AI work is not repeated for the same report.
- the follow-up (Gemini suggestions + matching scan) runs once per report, after its last photo
- a photo analyzed in the report form is not analyzed again when the identical file is uploaded
- each image is downloaded once per matching scan
Run from the backend folder:  python tests/test_ai_pipeline.py
"""
import os
import sys
import tempfile
import threading
import time

_DB = os.path.join(tempfile.mkdtemp(), "ai_pipeline_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ai-pipeline-0123456789")
os.environ["AI_FOLLOW_UP_DELAY_SECONDS"] = "0.2"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.report import Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.utils import ai_matching, ai_pipeline  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
u = User(name="Res", email="r@test-mail.com", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
db.add(u)
db.flush()
rep = Report(user_id=u.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=1,
             animal_type="Dog", description="Notes: brown dog", ai_suggested_risk_level="Low")
db.add(rep)
db.commit()
RID = rep.report_id
UID = u.user_id
db.close()

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


from app.models.ai_job import AiJob  # noqa: E402
from app.utils import ai_jobs  # noqa: E402

# Count follow-ups instead of running the real scan
runs = []
real_run = ai_pipeline.run_follow_up_now
ai_pipeline.run_follow_up_now = lambda rid, hint=None: runs.append((rid, hint))


def wait(seconds=0.4):
    time.sleep(seconds)


def drain(rounds=40):
    """Run due jobs like the AI worker does, until nothing is left that is due."""
    for _ in range(rounds):
        if not ai_jobs.process_one("test-worker"):
            time.sleep(0.1)
            if not ai_jobs.process_one("test-worker"):
                return


def jobs(kind, status=None):
    db = SessionLocal()
    q = db.query(AiJob).filter(AiJob.kind == kind)
    if status:
        q = q.filter(AiJob.status == status)
    out = q.all()
    db.close()
    return out


def add_media_job(hint_type):
    db = SessionLocal()
    j = AiJob(kind="media", report_id=RID, media_id=None, available_at=ai_jobs._now() + ai_jobs.timedelta(hours=1), payload={})
    db.add(j)
    db.commit()
    jid = j.job_id
    db.close()
    return jid


# --- One follow-up per report (through the AI job queue) -------------------------------------------------------
ai_jobs.enqueue_follow_up(RID)                                             # report created
m1, m2 = add_media_job("Dog"), add_media_job("Unknown")                    # two photos still waiting
ai_jobs.enqueue_follow_up(RID, {"animal_type": "Dog", "dominant_color": "Brown", "visual_size": "Medium"})
ai_jobs.enqueue_follow_up(RID, {"animal_type": "Unknown", "dominant_color": "Unknown", "visual_size": "Unknown"})
check("create + 2 photo results -> one queued follow-up", len(jobs("follow_up", "queued")) == 1, len(jobs("follow_up", "queued")))
check("...keeping the photo where the animal was recognised",
      jobs("follow_up", "queued")[0].payload["hint"]["animal_type"] == "Dog", jobs("follow_up", "queued")[0].payload)
wait()
drain()
check("the follow-up waits while the report's photos are not processed yet", runs == [], runs)
db = SessionLocal()
db.query(AiJob).filter(AiJob.job_id.in_([m1, m2])).update({"status": "done"}, synchronize_session=False)
db.commit()
db.close()
wait()
drain()
check("...and runs exactly once when they are done", len(runs) == 1 and runs[0][1]["animal_type"] == "Dog", runs)
check("the job is marked done", len(jobs("follow_up", "done")) == 1)

runs.clear()
for _ in range(5):
    ai_jobs.enqueue_follow_up(RID)
wait()
drain()
check("repeated requests are merged into one follow-up", len(runs) == 1, runs)

# A failing follow-up is retried, then marked failed
runs.clear()
attempts = []


def boom(rid, hint=None):
    attempts.append(1)
    raise RuntimeError("scan crashed")


ai_pipeline.run_follow_up_now = boom
ai_jobs.RETRY_BACKOFF_SECONDS = 0
ai_jobs.enqueue_follow_up(RID, delay=0)
drain()
failed = jobs("follow_up", "failed")
check("a failing job is retried up to 3 times, then marked failed", len(attempts) == 3 and len(failed) == 1 and "scan crashed" in failed[0].error,
      (len(attempts), [(j.status, j.attempts) for j in jobs("follow_up")]))
ai_pipeline.run_follow_up_now = lambda rid, hint=None: runs.append((rid, hint))

# A job left running by a worker that died goes back to the queue
db = SessionLocal()
stuck = AiJob(kind="follow_up", report_id=RID, status="running", attempts=1, available_at=ai_jobs._now(),
              started_at=ai_jobs._now() - ai_jobs.timedelta(hours=1), payload={"hint": None})
db.add(stuck)
db.commit()
SID = stuck.job_id
db.close()
check("a job stuck in 'running' is put back in the queue", ai_jobs.recover_stale_jobs() == 1)
drain()
db = SessionLocal()
check("...and then completes", db.get(AiJob, SID).status == "done")
db.close()

# Heartbeat: the web server's safety-net runner yields to a separate worker
check("no worker heartbeat -> worker not running", ai_jobs.worker_alive() is False)
ai_jobs.beat("worker:test:1")
check("after a heartbeat the worker counts as running", ai_jobs.worker_alive() is True)
ai_pipeline.run_follow_up_now = real_run

# --- Analysis cache -------------------------------------------------------------------------------------------
photo = b"jpeg-bytes-of-the-photo"
ai_pipeline.remember_yolo(photo, ["Dog"], [[1.0, 2.0, 30.0, 40.0]])
ai_pipeline.remember_photo_check(photo, {"verification_status": "authentic", "label": "Likely Authentic", "ai_photo_likelihood": 4.0,
                                         "animal_type": "Dog", "details": "real dog"})
c = ai_pipeline.cached_analysis(photo)
check("the form's YOLO result is reused for the identical file", c.get("yolo") == (["Dog"], [[1.0, 2.0, 30.0, 40.0]]), c)
check("the form's authenticity check is reused for the identical file", c.get("photo_check", {}).get("label") == "Likely Authentic")
check("a different file is analyzed normally (no reuse)", ai_pipeline.cached_analysis(b"another photo") == {})
check("no file -> no reuse", ai_pipeline.cached_analysis(None) == {})

# --- Image cache per scan -------------------------------------------------------------------------------------
downloads = []
ai_matching._load_image = lambda url: downloads.append(url) or object()


class Ent:
    media = [type("M", (), {"file_url": "https://cdn.example/a.jpg", "media_type": "Image"})()]


token = ai_pipeline.begin_scan_image_cache()
for _ in range(10):
    ai_matching.fetch_image_for_entity(Ent())
ai_pipeline.end_scan_image_cache(token)
check("within one scan the sighting photo is downloaded once (was once per candidate)", len(downloads) == 1, downloads)
ai_matching.fetch_image_for_entity(Ent())
check("outside a scan nothing is cached", len(downloads) == 2, downloads)

# --- End to end: the upload job reuses the form's analysis ------------------------------------------------------
import io  # noqa: E402

from PIL import Image  # noqa: E402

from app.models.report import ReportMedia  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils import photo_checks  # noqa: E402

buf = io.BytesIO()
Image.new("RGB", (200, 160), (140, 90, 40)).save(buf, "JPEG")
real_photo = buf.getvalue()
ai_pipeline.remember_yolo(real_photo, ["Dog"], [[20.0, 20.0, 180.0, 140.0]])
ai_pipeline.remember_photo_check(real_photo, {"verification_status": "authentic", "label": "Likely Authentic",
                                              "ai_photo_likelihood": 3.0, "animal_type": "Dog", "details": "real dog"})
yolo_calls, gemini_checks, follow_ups = [], [], []
reports.get_yolo_model = lambda: (lambda *a, **k: yolo_calls.append(1) or [])
photo_checks.check_animal_photo = lambda img: gemini_checks.append(1)

db = SessionLocal()
m = ReportMedia(report_id=RID, file_url="https://cdn.example/dog.jpg", media_type="Image")
db.add(m)
db.commit()
MID = m.media_id
db.close()
db = SessionLocal()
db.query(AiJob).filter(AiJob.kind == "follow_up").delete()
db.commit()
db.close()
reports.process_report_media_ai(RID, MID, "https://cdn.example/dog.jpg", real_photo)
follow_ups = [j.payload.get("hint") for j in jobs("follow_up", "queued")]
db = SessionLocal()
m = db.get(ReportMedia, MID)
check("upload job: YOLO is not run again for an already-analyzed photo", yolo_calls == [], yolo_calls)
check("upload job: Gemini photo check is not run again", gemini_checks == [], gemini_checks)
check("upload job: results are still saved on the photo", m.animal_type == "Dog" and m.ai_photo_status == "Likely Authentic",
      (m.animal_type, m.ai_photo_status))
check("upload job: one follow-up queued for the report, with the photo's details", len(follow_ups) == 1 and follow_ups[0]["animal_type"] == "Dog", follow_ups)
db.close()

# --- RC5: opening a report never waits for Gemini ----------------------------------------------------------------
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.utils import ai_suggestions  # noqa: E402

gemini_calls = []


def slow_suggestions(**kw):
    gemini_calls.append(1)
    time.sleep(2)  # a slow Gemini answer
    return {"ai_suggested_risk_level": "Medium", "ai_animal_type": "Dog"}


ai_suggestions.generate_ai_suggestions = slow_suggestions
from app.utils.auth import create_access_token  # noqa: E402
AUTH = {"Authorization": "Bearer " + create_access_token({"sub": str(UID), "user_id": UID, "role_id": 1})}
api = FastAPI()
api.include_router(reports.router)
client = TestClient(api)
db = SessionLocal()
old = Report(user_id=UID, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=1,
             animal_type="Dog", description="Notes: old report without AI suggestions")
db.add(old)
db.commit()
OLD = old.report_id
db.close()
db = SessionLocal()
db.query(AiJob).filter(AiJob.status == "queued").delete()   # start this part with an empty queue
db.commit()
db.close()
t = time.perf_counter()
r = client.get(f"/reports/{OLD}", headers=AUTH)
elapsed = time.perf_counter() - t
check("opening a report without suggestions answers right away (no Gemini wait)", r.status_code == 200 and elapsed < 1.5,
      f"{r.status_code} in {elapsed:.2f}s")
client.get(f"/reports/{OLD}", headers=AUTH)
client.get(f"/reports/{OLD}", headers=AUTH)
check("...opening it 3 times queues one backfill job", len([j for j in jobs("backfill") if j.report_id == OLD]) == 1)
drain()
db = SessionLocal()
check("...the suggestions are filled in by the AI worker", db.get(Report, OLD).ai_suggested_risk_level == "Medium")
db.close()
check("...with a single Gemini call", len(gemini_calls) == 1, gemini_calls)
gemini_calls.clear()
client.get(f"/reports/{OLD}", headers=AUTH)
drain()
check("once filled in, opening the report calls Gemini no more", gemini_calls == [], gemini_calls)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
