"""
D5: the Admin's Gemini ON/OFF setting.
- one shared check, cached for a few seconds (no DB query per Gemini call)
- an Admin switch takes effect immediately
- fails CLOSED: if the setting can't be read, Gemini is OFF
Run from the backend folder:  python tests/test_gemini_setting.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "gemini_setting_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-gemini-setting-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.system_setting import SystemSetting  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import matches  # noqa: E402
from app.utils import ai_suggestions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
admin = User(name="Admin", email="admin@test-mail.com", password="x", role_id=4, is_verified=True, status="Active")
db.add(admin)
db.add(SystemSetting(setting_key="gemini_vision_matching", setting_value="vision", is_enabled=True))
db.commit()
H = {"Authorization": "Bearer " + create_access_token({"sub": str(admin.user_id), "user_id": admin.user_id, "role_id": 4})}
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


queries = {"n": 0}


@event.listens_for(engine, "before_cursor_execute")
def _count(conn, cursor, statement, *a, **k):
    if "system_settings" in statement:
        queries["n"] += 1


ai_suggestions.invalidate_gemini_setting_cache()
check("Gemini ON is read from the setting", ai_suggestions.is_gemini_enabled_in_db() is True)
queries["n"] = 0
for _ in range(50):
    ai_suggestions.is_gemini_enabled_in_db()
    matches.is_gemini_vision_enabled(db)
check("100 checks within a few seconds use the cache (0 queries)", queries["n"] == 0, queries["n"])

# Changing the row directly (any code path) takes effect immediately
s = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
s.is_enabled = False
db.commit()
check("switching OFF takes effect at once (not after the cache expires)", ai_suggestions.is_gemini_enabled_in_db() is False)
check("the matching engine sees the same answer", matches.is_gemini_vision_enabled(db) is False)

# Through the Admin settings endpoint
api = FastAPI()
api.include_router(matches.router)
client = TestClient(api)
r = client.put("/matches/settings", json={"gemini_vision_enabled": True}, headers=H)
check("Admin turns it back ON via the settings page", r.status_code == 200 and ai_suggestions.is_gemini_enabled_in_db() is True, r.text[:200])
r = client.put("/matches/settings", json={"gemini_vision_enabled": False}, headers=H)
check("...and OFF again, effective immediately", r.status_code == 200 and ai_suggestions.is_gemini_enabled_in_db() is False, r.text[:200])

# Fails closed
ai_suggestions.invalidate_gemini_setting_cache()


class BrokenSession:
    def query(self, *a, **k):
        raise RuntimeError("database connection lost")


check("a database error means OFF (fail closed), not ON", ai_suggestions.is_gemini_enabled_in_db(BrokenSession()) is False)
check("...in the matching engine too", matches.is_gemini_vision_enabled(BrokenSession()) is False)
check("...and the error result is not cached", ai_suggestions._setting_cache["value"] is None)

# Fresh install with no row: default ON
db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").delete()
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()
check("no setting row yet -> default ON", ai_suggestions.is_gemini_enabled_in_db() is True)

# The Gemini wrapper itself refuses to call Google when OFF
db.add(SystemSetting(setting_key="gemini_vision_matching", setting_value="attribute_only", is_enabled=False))
db.commit()
try:
    ai_suggestions.call_gemini_with_fallback("hello")
    refused = False
except RuntimeError as e:
    refused = "disabled" in str(e)
check("when OFF, no request is sent to Google", refused)

# --- P3: google-genai wrapper: model fallback rules (fake client, no network) -------------------------------------
from google.genai import errors as genai_errors  # noqa: E402

s = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
s.is_enabled = True
db.commit()
os.environ["GEMINI_API_KEY"] = "test-key"
tried = []


class FakeModels:
    def __init__(self, plan):
        self.plan = plan

    def generate_content(self, model, contents, config=None):
        tried.append(model)
        outcome = self.plan.get(model, "ok")
        if outcome == "timeout":
            raise TimeoutError("timed out")
        if outcome == "429":
            raise genai_errors.APIError(429, {"error": {"code": 429, "message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}})
        if outcome == "400":
            raise genai_errors.APIError(400, {"error": {"code": 400, "message": "Bad prompt", "status": "INVALID_ARGUMENT"}})
        return type("R", (), {"text": f"answer from {model}"})()


def use_plan(plan):
    tried.clear()
    ai_suggestions._gemini_client = lambda key, timeout: type("C", (), {"models": FakeModels(plan)})()


first, second, third = ai_suggestions.AVAILABLE_GEMINI_MODELS
use_plan({})
r = ai_suggestions.call_gemini_with_fallback("hi")
check("the first model answers -> one request", r.text == f"answer from {first}" and r.model == first and tried == [first], tried)
use_plan({first: "timeout"})
r = ai_suggestions.call_gemini_with_fallback("hi")
check("a model that times out is skipped for the next one", r.model == second and tried == [first, second], tried)
use_plan({first: "429", second: "timeout"})
r = ai_suggestions.call_gemini_with_fallback("hi")
check("rate limited, then slow -> the third model answers", r.model == third and tried == [first, second, third], tried)
use_plan({first: "400"})
try:
    ai_suggestions.call_gemini_with_fallback("hi")
    raised = False
except genai_errors.APIError:
    raised = True
check("a real error in the request (400) is raised, not retried on other models", raised and tried == [first], tried)
use_plan({first: "timeout", second: "timeout", third: "timeout"})
try:
    ai_suggestions.call_gemini_with_fallback("hi")
    raised = False
except TimeoutError:
    raised = True
check("all models too slow -> a timeout error (callers fall back to the local result)", raised and len(tried) == 3, tried)
check("the old google.generativeai package is not used any more", "google.generativeai" not in sys.modules)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
