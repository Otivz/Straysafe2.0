from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_job import AiJob
from app.models.user import User
from app.utils.ai_jobs import worker_alive
from app.utils.auth import get_current_user

router = APIRouter(prefix="/admin/ai-jobs", tags=["AI Jobs"])


@router.get("")
def ai_job_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Admin view of the AI queue: is the worker running, what is waiting, what failed."""
    if current_user.role_id != 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can view the AI job queue.")
    counts = {f"{kind}:{st}": n for kind, st, n in
              db.query(AiJob.kind, AiJob.status, func.count(AiJob.job_id)).group_by(AiJob.kind, AiJob.status).all()}
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)
    failed = (db.query(AiJob).filter(AiJob.status == "failed", AiJob.created_at >= since)
              .order_by(AiJob.job_id.desc()).limit(10).all())
    return {
        "worker_running": worker_alive(db),
        "counts": counts,
        "queued": sum(n for k, n in counts.items() if k.endswith(":queued")),
        "running": sum(n for k, n in counts.items() if k.endswith(":running")),
        "recent_failures": [
            {"job_id": j.job_id, "kind": j.kind, "report_id": j.report_id, "attempts": j.attempts,
             "error": (j.error or "")[:300], "finished_at": j.finished_at}
            for j in failed
        ],
    }
