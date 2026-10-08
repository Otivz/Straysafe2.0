r"""
StraySafe AI worker: runs YOLOv8, Gemini, photo checks and matching jobs separately from the web server.
Start it from the backend folder (second terminal):

    ..\.venv\Scripts\python -m app.ai_worker

Stop it with Ctrl+C. Queued jobs wait in the database while it is stopped; the web server then runs them itself
until the worker is back (AI_WORKER_EMBEDDED=off disables that fallback).
"""
import logging
import signal
import threading

logging.basicConfig(level=logging.INFO, format="%(asctime)s [ai-worker] %(message)s")
log = logging.getLogger("ai_worker")


def main() -> None:
    import app.models  # noqa: F401  (register every table)
    from app.utils import ai_jobs
    from app.utils.model_loader import get_yolo_model

    worker_id = ai_jobs.new_worker_id()
    recovered = ai_jobs.recover_stale_jobs()
    if recovered:
        log.info(f"Put {recovered} interrupted job(s) back in the queue.")
    ai_jobs.beat(worker_id)
    log.info("Loading YOLOv8...")
    get_yolo_model()
    log.info(f"Ready ({worker_id}). Waiting for AI jobs.")

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    ai_jobs.run_loop(stop, worker_id)
    log.info("Stopped.")


if __name__ == "__main__":
    main()
