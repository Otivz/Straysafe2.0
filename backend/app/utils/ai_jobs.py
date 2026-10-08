"""
The AI job queue. Requests only add rows to `ai_jobs`; the AI worker (`python -m app.ai_worker`) does the work.

Job kinds
- media:     YOLO + colours + photo authenticity for one uploaded photo/video
- follow_up: Gemini suggestions + one look-alike/duplicate scan for a report, after its last photo is processed
- backfill:  fill in missing AI suggestions for a report (e.g. older reports)

Jobs live in the database, so they survive restarts and `--reload`. A failed job is retried (up to max_attempts);
a job left "running" by a worker that died is put back in the queue. If no worker is running, the web server runs the
queue itself in a background thread so AI never silently stops (see start_embedded_runner).
"""
import logging
import os
import socket
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.ai_job import AiJob

logger = logging.getLogger(__name__)

FOLLOW_UP_DELAY = float(os.getenv("AI_FOLLOW_UP_DELAY_SECONDS", "3"))
STALE_RUNNING_MINUTES = float(os.getenv("AI_JOB_STALE_MINUTES", "10"))
RETRY_BACKOFF_SECONDS = 30
HEARTBEAT_KEY = "ai_worker_heartbeat"
HEARTBEAT_MAX_AGE = 30
JOB_FILES_DIR = os.getenv("AI_JOB_FILES_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "ai_job_files")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _session(db: Optional[Session]):
    return (db, False) if db is not None else (SessionLocal(), True)


# --- Enqueue ---------------------------------------------------------------------------------------------------------
def enqueue_media(db: Session, report_id: int, media_id: int, file_url: str, file_bytes: Optional[bytes],
                  cached: Optional[Dict[str, Any]] = None) -> AiJob:
    """Queue the analysis of one uploaded photo/video. The bytes are kept in a temp file so the worker needn't download."""
    file_path = None
    if file_bytes:
        os.makedirs(JOB_FILES_DIR, exist_ok=True)
        file_path = os.path.join(JOB_FILES_DIR, f"{uuid.uuid4().hex}.bin")
        with open(file_path, "wb") as fh:
            fh.write(file_bytes)
    job = AiJob(kind="media", report_id=report_id, media_id=media_id, available_at=_now(),
                payload={"file_url": file_url, "file_path": file_path, "cached": cached or {}})
    db.add(job)
    db.commit()
    return job


def _better_hint(old: Optional[Dict[str, Any]], new: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Prefer a photo where the animal was actually recognised."""
    if not new:
        return old
    if not old or old.get("animal_type") in (None, "Unknown") or new.get("animal_type") not in (None, "Unknown"):
        return new
    return old


def enqueue_follow_up(report_id: int, hint: Optional[Dict[str, Any]] = None, delay: Optional[float] = None,
                      db: Optional[Session] = None) -> None:
    """One follow-up per report: a queued one is pushed back (debounced) and keeps the best photo hint."""
    s, own = _session(db)
    try:
        at = _now() + timedelta(seconds=FOLLOW_UP_DELAY if delay is None else delay)
        job = s.query(AiJob).filter(AiJob.kind == "follow_up", AiJob.report_id == report_id,
                                    AiJob.status == "queued").first()
        if job:
            job.available_at = at
            best = _better_hint((job.payload or {}).get("hint"), hint)
            job.payload = {"hint": best}
        else:
            s.add(AiJob(kind="follow_up", report_id=report_id, available_at=at, payload={"hint": hint}))
        s.commit()
    finally:
        if own:
            s.close()


def enqueue_backfill(report_id: int, hint: Optional[Dict[str, Any]] = None, db: Optional[Session] = None) -> bool:
    """Queue missing-suggestions backfill unless one is already queued or running for the report."""
    s, own = _session(db)
    try:
        exists = s.query(AiJob.job_id).filter(AiJob.kind == "backfill", AiJob.report_id == report_id,
                                              AiJob.status.in_(("queued", "running"))).first()
        if exists:
            return False
        s.add(AiJob(kind="backfill", report_id=report_id, available_at=_now(), payload={"hint": hint or {}}))
        s.commit()
        return True
    finally:
        if own:
            s.close()


# --- Claim and run ---------------------------------------------------------------------------------------------------
def _media_pending(db: Session, report_id: int) -> bool:
    return db.query(AiJob.job_id).filter(AiJob.kind == "media", AiJob.report_id == report_id,
                                         AiJob.status.in_(("queued", "running"))).first() is not None


def claim_next(db: Session, worker_id: str) -> Optional[AiJob]:
    """Take the next due job. SKIP LOCKED lets several workers share the queue without taking the same job."""
    for _ in range(20):
        job = (db.query(AiJob)
               .filter(AiJob.status == "queued", AiJob.available_at <= _now())
               .order_by(AiJob.available_at, AiJob.job_id)
               .with_for_update(skip_locked=True)
               .first())
        if job is None:
            db.commit()
            return None
        if job.kind == "follow_up" and _media_pending(db, job.report_id):
            # Wait until all of the report's photos are processed
            job.available_at = _now() + timedelta(seconds=FOLLOW_UP_DELAY)
            db.commit()
            continue
        job.status, job.locked_by, job.started_at = "running", worker_id, _now()
        job.attempts = (job.attempts or 0) + 1
        db.commit()
        return job
    return None


def _run(job: AiJob) -> None:
    from app.utils import ai_pipeline
    payload = job.payload or {}
    if job.kind == "media":
        from app.routes.reports import process_report_media_ai
        path = payload.get("file_path")
        content = None
        if path and os.path.exists(path):
            with open(path, "rb") as fh:
                content = fh.read()
        process_report_media_ai(job.report_id, job.media_id, payload.get("file_url"), content,
                                cached=payload.get("cached") or None)
    elif job.kind == "follow_up":
        ai_pipeline.run_follow_up_now(job.report_id, payload.get("hint"))
    elif job.kind == "backfill":
        ai_pipeline.run_backfill_now(job.report_id, payload.get("hint") or {})
    else:
        raise ValueError(f"Unknown AI job kind '{job.kind}'")


def _drop_file(job: AiJob) -> None:
    path = (job.payload or {}).get("file_path")
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def process_one(worker_id: str) -> bool:
    """Run the next due job. Returns False when there was nothing to do."""
    db = SessionLocal()
    try:
        job = claim_next(db, worker_id)
        if job is None:
            return False
        job_id = job.job_id
        try:
            _run(job)
            error = None
        except Exception as e:
            error = f"{type(e).__name__}: {e}"[:2000]
            logger.warning(f"AI job #{job_id} ({job.kind}) failed: {error}")
        db.expire_all()
        job = db.get(AiJob, job_id)
        job.finished_at = _now()
        if error is None:
            job.status, job.error = "done", None
            _drop_file(job)
        elif job.attempts >= job.max_attempts:
            job.status, job.error = "failed", error
            _drop_file(job)
        else:
            job.status, job.error = "queued", error
            job.available_at = _now() + timedelta(seconds=RETRY_BACKOFF_SECONDS * job.attempts)
        db.commit()
        return True
    finally:
        db.close()


def clean_old_job_files(max_age_hours: float = 48) -> None:
    """Temp photo files of jobs that never ran (e.g. queued in tests) are removed after two days."""
    import time
    if not os.path.isdir(JOB_FILES_DIR):
        return
    cutoff = time.time() - max_age_hours * 3600
    for name in os.listdir(JOB_FILES_DIR):
        path = os.path.join(JOB_FILES_DIR, name)
        try:
            if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                os.remove(path)
        except OSError:
            pass


def recover_stale_jobs(db: Optional[Session] = None, older_than_minutes: Optional[float] = None) -> int:
    """Put jobs left 'running' by a worker that stopped back in the queue."""
    s, own = _session(db)
    try:
        cutoff = _now() - timedelta(minutes=STALE_RUNNING_MINUTES if older_than_minutes is None else older_than_minutes)
        rows = s.query(AiJob).filter(AiJob.status == "running", AiJob.started_at < cutoff).all()
        for job in rows:
            job.status, job.locked_by, job.available_at = "queued", None, _now()
        s.commit()
        return len(rows)
    finally:
        if own:
            s.close()


# --- Worker heartbeat ------------------------------------------------------------------------------------------------
def beat(worker_id: str) -> None:
    from app.models.system_setting import SystemSetting
    db = SessionLocal()
    try:
        row = db.query(SystemSetting).filter(SystemSetting.setting_key == HEARTBEAT_KEY).first()
        value = f"{_now().isoformat()}|{worker_id}"
        if row is None:
            db.add(SystemSetting(setting_key=HEARTBEAT_KEY, setting_value=value, is_enabled=True,
                                 description="Last time the separate AI worker process checked in"))
        else:
            row.setting_value = value
        db.commit()
    finally:
        db.close()


def worker_alive(db: Optional[Session] = None, max_age: float = HEARTBEAT_MAX_AGE) -> bool:
    from app.models.system_setting import SystemSetting
    s, own = _session(db)
    try:
        row = s.query(SystemSetting).filter(SystemSetting.setting_key == HEARTBEAT_KEY).first()
        if row is None or not row.setting_value:
            return False
        try:
            last = datetime.fromisoformat(row.setting_value.split("|")[0])
        except ValueError:
            return False
        return (_now() - last).total_seconds() <= max_age
    finally:
        if own:
            s.close()


def new_worker_id(prefix: str = "worker") -> str:
    return f"{prefix}:{socket.gethostname()}:{os.getpid()}"


def run_loop(stop: threading.Event, worker_id: str, poll_seconds: float = 1.0, beat_every: float = 10.0,
             only_if_no_worker: bool = False) -> None:
    """The worker loop. With only_if_no_worker it yields to a separate worker process whenever one is running."""
    last_beat = last_recover = 0.0
    import time
    while not stop.is_set():
        try:
            if only_if_no_worker and worker_alive():
                stop.wait(5)
                continue
            if not only_if_no_worker and time.monotonic() - last_beat >= beat_every:
                beat(worker_id)
                last_beat = time.monotonic()
            if time.monotonic() - last_recover >= 60:
                recover_stale_jobs()
                clean_old_job_files()
                from app.utils.ai_matching import clean_image_cache
                clean_image_cache()
                last_recover = time.monotonic()
            if not process_one(worker_id):
                stop.wait(poll_seconds)
        except Exception as e:
            logger.warning(f"AI worker loop error: {e}")
            stop.wait(poll_seconds * 5)


_embedded_stop: Optional[threading.Event] = None


def start_embedded_runner() -> Optional[threading.Event]:
    """Safety net in the web server: runs the queue only while no separate AI worker is checking in."""
    global _embedded_stop
    if os.getenv("AI_WORKER_EMBEDDED", "auto").lower() in ("off", "0", "false", "no"):
        return None
    if _embedded_stop is not None:
        return _embedded_stop
    _embedded_stop = threading.Event()
    threading.Thread(target=run_loop, args=(_embedded_stop, new_worker_id("embedded")),
                     kwargs={"poll_seconds": 2.0, "only_if_no_worker": True}, daemon=True).start()
    return _embedded_stop


def stop_embedded_runner() -> None:
    global _embedded_stop
    if _embedded_stop is not None:
        _embedded_stop.set()
        _embedded_stop = None
