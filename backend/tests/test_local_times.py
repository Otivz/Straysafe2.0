"""
Times picked in forms (community alert expiry) are saved as local time, not UTC (SYSTEM_AUDIT.md 4.3).
The browser sends "...Z" (UTC); the pages show stored times as local, so UTC was shown 8 hours early.
(Was test_adoption_local_times.py; the adoption form checks were removed with the adoption feature.)
Run from the backend folder:  python tests/test_local_times.py
"""
import os
import sys
from datetime import datetime, timezone

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-local-times-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.schemas.announcement import AnnouncementCreate  # noqa: E402
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

a = AnnouncementCreate(created_by=1, title="t", category="Emergency", content="c", expiration=UTC)
check("community alert expiry is saved as local time", a.expiration == LOCAL, a.expiration)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
