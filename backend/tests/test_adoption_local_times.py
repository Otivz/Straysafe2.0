"""
Times picked in the adoption forms (and community alert expiry) are saved as local time, not UTC (SYSTEM_AUDIT.md 4.3).
The browser sends "...Z" (UTC); the pages show stored times as local, so UTC was shown 8 hours early.
Run from the backend folder:  python tests/test_adoption_local_times.py
"""
import os
import sys
from datetime import datetime, timezone

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-local-times-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.schemas import adoption as s  # noqa: E402
from app.schemas.announcement import AnnouncementCreate  # noqa: E402
from app.schemas.adoption_tasks import AssignmentCreateRequest  # noqa: E402
from app.utils.local_time import to_local_naive  # noqa: E402

results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok   " if ok else "  FAIL ") + label + ("" if ok else f"  -> {extra}"))


UTC = "2026-10-20T13:11:00Z"                                   # what the browser sends for 9:11 PM in UTC+8
LOCAL = datetime(2026, 10, 20, 13, 11, tzinfo=timezone.utc).astimezone().replace(tzinfo=None)   # this machine's local

check("a UTC time becomes the same moment in local time", to_local_naive(datetime(2026, 10, 20, 13, 11, tzinfo=timezone.utc)) == LOCAL)
check("a time without a timezone is kept as it is", to_local_naive(datetime(2026, 10, 20, 21, 11)) == datetime(2026, 10, 20, 21, 11))
check("an empty time stays empty", to_local_naive(None) is None)

fields = [
    (s.AdoptionInterviewScheduleRequest, "scheduled_at", "interview schedule"),
    (s.AdoptionInterviewEvaluateRequest, "conducted_at", "interview conducted at"),
    (s.AdoptionHomeVisitScheduleRequest, "scheduled_date", "home visit schedule"),
    (s.AdoptionHandoverScheduleRequest, "handover_date", "handover schedule"),
    (s.AdoptionHandoverCompleteRequest, "handover_date", "handover completed at"),
    (s.AdoptionStaffMonitoringRecordRequest, "monitoring_date", "monitoring visit date"),
]
for model, field, label in fields:
    # build with only the time field; other required fields get simple values when the model needs them
    ann = model.model_fields
    data = {field: UTC}
    for name, info in ann.items():
        if name != field and info.is_required():
            t = info.annotation
            data[name] = 1 if t is int else ("x" if t is str else True if t is bool else 1)
    try:
        value = getattr(model(**data), field)
        check(f"{label}: a picked 9:11 PM is saved as local time, not 1:11 PM", value == LOCAL, value)
    except Exception as e:   # a required field the loop couldn't fill
        check(f"{label}: model builds", False, e)

a = AnnouncementCreate(created_by=1, title="t", category="Emergency", content="c", expiration=UTC)
check("community alert expiry is saved as local time", a.expiration == LOCAL, a.expiration)
t = AssignmentCreateRequest(task_type="Interview", assigned_to=1, due_at=UTC)
check("adoption task due time is saved as local time", t.due_at == LOCAL, t.due_at)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
