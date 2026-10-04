"""
One-off repair: close rescue requests whose report is already closed (resolved, returned to owner, released,
deceased, dismissed, not found, rejected or merged). New closures are handled automatically (utils/case_closure.py).

  python scripts/close_rescues_of_closed_reports.py          # dry run
  python scripts/close_rescues_of_closed_reports.py --apply  # fix
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.report import Report, Rescue  # noqa: E402
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS, RESCUE_CLOSED_STATUS_IDS, close_open_rescues  # noqa: E402

APPLY = "--apply" in sys.argv
db = SessionLocal()
rows = (
    db.query(Rescue, Report)
    .join(Report, Rescue.report_id == Report.report_id)
    .filter(Report.current_status_id.in_(CLOSED_REPORT_STATUS_IDS), ~Rescue.status_id.in_(RESCUE_CLOSED_STATUS_IDS))
    .all()
)
for rescue, rep in rows:
    print(f"rescue #{rescue.rescue_id} (status {rescue.status_id}) of report #{rep.report_id} (status {rep.current_status_id}) -> close")
if APPLY:
    for rep_id, status in {(rep.report_id, rep.current_status_id) for _, rep in rows}:
        close_open_rescues(db, rep_id, status)
    db.commit()
print(f"{len(rows)} rescue(s) {'closed' if APPLY else 'found (dry run; use --apply)'}")
db.close()
