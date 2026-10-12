"""
One priority on every page: the report forms always send "Medium" (nobody picks it), so pages show the AI's suggested
priority, then its risk level, then the stored value. Dashboards, maps, report lists and the takeover timer agree.
Run from the backend folder:  python tests/test_effective_priority.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "effective_priority_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-effective-priority-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime  # noqa: E402

from app.schemas.report import ReportResponse, effective_priority  # noqa: E402

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


check("the AI's suggested priority wins over the form's placeholder", effective_priority("Low Priority", "Low Risk", "Medium") == "Low")
check("High / Emergency map to High", effective_priority("High Priority", None, "Medium") == "High" and effective_priority("Emergency", None, None) == "High")
check("without a suggested priority, the risk level is used", effective_priority(None, "Medium Risk", "Low") == "Medium")
check("without any AI value, the stored value is kept", effective_priority(None, None, "High") == "High")
check("nothing at all: Medium", effective_priority(None, None, None) == "Medium")

now = datetime.now()
base = dict(report_id=1, user_id=1, category_id=1, latitude=14.8, longitude=121.0, created_at=now, updated_at=now)
r = ReportResponse(**base, priority_level="Medium", ai_suggested_priority="Low Priority", ai_suggested_risk_level="Low Risk")
check("a report sent to any page carries the effective priority", r.model_dump()["priority_level"] == "Low", r.model_dump()["priority_level"])
r.ai_suggested_priority = "High Priority"   # endpoints that fill the AI fields in after building the response
check("...even when the AI fields are filled in after the response is built", r.model_dump()["priority_level"] == "High")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
