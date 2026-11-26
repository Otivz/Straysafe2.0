"""
Case "AI Insights (Suggested)" (services/case_ai_insights.py, routes/cases.py):

  - the PII redactor masks phones, emails, block/lot/unit references, honorific names and the names tied to the report
  - what goes to Gemini is an allow-list of case fields, already redacted (no reporter, contact or suspected owner)
  - GET never calls Gemini; POST caches the answer per redacted content; a changed report is a new insight
  - the Admin's Gemini OFF switch: nothing is sent, the answer is "disabled"
  - fail closed: a timeout, an exception or invalid JSON is a normal 200 "unavailable" and the case still loads
  - suggest only: generating never changes status, priority or category
  - applying / overriding a suggested priority or category is written to the audit log

  - the advisory Evidence Check: no_media, ok, blurry, no_animal, contradicts_description, PII, cache key with photos, fail closed

Offline: a throwaway SQLite file, Gemini replaced by a fake. Run from the backend folder:
    python tests/test_case_ai_insights.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

import json
import os
from decimal import Decimal

from fastapi.testclient import TestClient

from app.routes import cases  # noqa: E402

api = _isolated_db.build_app(cases.router)
ids = _isolated_db.create_schema_and_seed()

from app.database import SessionLocal  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.case_ai_insight import CaseAiInsight  # noqa: E402
from app.models.report import Report, ReportCategory, ReportMedia  # noqa: E402
from app.models.system_setting import SystemSetting  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import case_ai_insights as CAI  # noqa: E402
from app.utils import ai_suggestions, case_state, case_vocab as V  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.pii_redactor import redact_text  # noqa: E402

os.environ["GEMINI_API_KEY"] = "test-key-never-used"   # the fake below answers; this only makes the server look configured
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


resident = db.get(User, ids["resident"])
leader = db.get(User, ids["leader"])
resident.name = "Maria Santos"
db.commit()


def category_id(family):
    return CAI.resolve_category_id(db, family)


def mk(family="found_animal", **extra):
    values = dict(user_id=resident.user_id, subdivision_id=1, category_id=category_id(family), current_status_id=1, animal_type="Dog",
                  latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2", priority_level="Medium",
                  description="A brown dog keeps chasing joggers.", reported_by_name="Pedro Cruz", reported_by_contact="09171234567",
                  suspected_owner_name="Juan Dela Cruz", suspected_owner_address="Blk 4 Lot 9")
    values.update(extra)
    r = Report(**values)
    db.add(r)
    db.commit()
    return r


# ------------------------------------------------------------------------------------------- the fake Gemini
class FakeResponse:
    def __init__(self, text, model="gemini-2.5-flash"):
        self.text = text
        self.model = model


calls = []
behaviour = {"answer": None, "raise": None}


def good(priority="High", mismatch=False, category=None):
    return json.dumps({"summary": "A dog is repeatedly chasing people on the park path and needs a prompt response.",
                       "suggested_priority": priority, "priority_confidence": "medium", "priority_reason": "People are being chased.",
                       "category_check": {"mismatch": mismatch, "suggested_category": category, "reason": "It is about a risk to residents." if mismatch else None}})


def fake_gemini(contents, generation_config=None):
    calls.append(contents)
    if behaviour["raise"] is not None:
        raise behaviour["raise"]
    return FakeResponse(behaviour["answer"] if behaviour["answer"] is not None else good())


CAI.call_gemini_with_fallback = fake_gemini


def count(action, report_id):
    return db.query(AuditLog).filter(AuditLog.action == action, AuditLog.target_id == report_id).count()


# ===================================================================================== THE REDACTOR
text = ("Call Maria Santos at 0917 123 4567 or +63 917-123-4567, email maria.santos@gmail.com. Dog is at Blk 5 Lot 3, near unit 12B. "
        "Owner is Mang Tony; also Mrs. Reyes. B5 L3 again, and 123 Rizal St.")
out = redact_text(text, ["Maria Santos"])
check("known names (whole and each word) are masked", "Maria" not in out and "Santos" not in out.replace("[name]", ""), out)
check("phone numbers are masked", "0917" not in out and "123 4567" not in out and "[phone]" in out, out)
check("emails are masked", "@" not in out and "[email]" in out, out)
check("block / lot / unit references are masked", all(x not in out for x in ("Blk 5", "Lot 3", "12B", "B5 L3")) and "[address]" in out, out)
check("honorific names are masked", "Tony" not in out and "Reyes" not in out, out)
check("a street address is masked", "Rizal" not in out, out)
check("ordinary report text is left alone", redact_text("A brown dog, about 5 years old, chased 2 joggers.") == "A brown dog, about 5 years old, chased 2 joggers.")
check("empty text is an empty string", redact_text(None) == "" and redact_text("") == "")

# ===================================================================================== WHAT IS SENT
r1 = mk(description="Maria Santos saw a dog at Blk 5 Lot 3. Call 09171234567 or pedro@mail.com. Juan Dela Cruz owns it.")
payload = CAI.build_payload(db, r1)
sent = json.dumps(payload)
check("the payload is an allow-list: only case fields", set(payload) == {"category", "animal_type", "animal_breed", "animal_color", "estimated_size", "animal_count", "description", "condition"}, set(payload))
check("reporter, filed-for person, suspected owner, phone and email are not in the payload",
      all(x not in sent for x in ("Maria", "Santos", "Pedro", "Cruz", "Juan", "09171234567", "pedro@mail.com", "Blk 4", "Blk 5", "Lot 9")), sent)
prompt = CAI.build_prompt(payload)
check("the prompt Gemini receives carries none of it either", all(x not in prompt for x in ("Maria", "Pedro", "Juan", "09171234567", "pedro@mail.com", "Blk 5")), prompt[:400])

# ===================================================================================== GET / POST, CACHE
rid = r1.report_id
check("a resident cannot read or make insights (403)", client.get(f"/cases/{rid}/ai-insights", headers=H(resident)).status_code == 403
      and client.post(f"/cases/{rid}/ai-insights", headers=H(resident)).status_code == 403)
g = client.get(f"/cases/{rid}/ai-insights", headers=H(leader))
check("GET before any run is not_generated and never calls Gemini", g.status_code == 200 and g.json()["status"] == "not_generated" and g.json()["insight"] is None and not calls, g.text)

status_before = case_state.case_status_of(r1)
priority_before = case_state.priority_of(r1)
p = client.post(f"/cases/{rid}/ai-insights", headers=H(leader))
body = p.json()
check("POST makes the insight with the strict fields", p.status_code == 200 and body["status"] == "ready"
      and body["insight"]["suggested_priority"] == "High" and body["insight"]["priority_confidence"] == "medium"
      and body["insight"]["category_check"]["mismatch"] is False and len(body["insight"]["summary"]) > 20 and len(calls) == 1, p.text)
check("the prompt actually sent to Gemini was redacted", len(calls) == 1 and all(x not in str(calls[0]) for x in ("Maria", "Pedro", "Juan", "09171234567", "Blk 5")))
db.expire_all()
db.refresh(r1)
check("SUGGEST ONLY: status, priority and category are unchanged", case_state.case_status_of(r1) == status_before and case_state.priority_of(r1) == priority_before
      and V.category_family(r1.category.category_name) == "found_animal")
check("the generation is in the audit log, without text", count(CAI.ACTION_GENERATED, rid) == 1
      and "chasing" not in json.dumps([a.new_values for a in db.query(AuditLog).filter(AuditLog.action == CAI.ACTION_GENERATED).all()]))
g = client.get(f"/cases/{rid}/ai-insights", headers=H(leader))
check("GET now returns the cached insight without calling Gemini", g.json()["status"] == "ready" and g.json()["insight"]["suggested_priority"] == "High" and len(calls) == 1)
check("one cache row exists", db.query(CaseAiInsight).filter(CaseAiInsight.report_id == rid).count() == 1)
client.post(f"/cases/{rid}/ai-insights", headers=H(leader))
check("Refresh updates the same row (no duplicate)", db.query(CaseAiInsight).filter(CaseAiInsight.report_id == rid).count() == 1 and len(calls) == 2)

r1.description = "The dog bit a child near the playground and is still loose."
db.commit()
g = client.get(f"/cases/{rid}/ai-insights", headers=H(leader))
check("a changed report is a new content hash: not_generated again", g.json()["status"] == "not_generated", g.text)
r1.description = "Maria Santos saw a dog at Blk 5 Lot 3. Call 09171234567 or pedro@mail.com. Juan Dela Cruz owns it."
db.commit()
check("restoring the content finds the old cached insight", client.get(f"/cases/{rid}/ai-insights", headers=H(leader)).json()["status"] == "ready")
r1.reported_by_contact = "09998887777"
db.commit()
check("changing only private contact data does not invalidate the cache", client.get(f"/cases/{rid}/ai-insights", headers=H(leader)).json()["status"] == "ready")

# ===================================================================================== FAIL CLOSED
r2 = mk(description="A cat with a swollen leg is hiding under a car.")
before_calls = len(calls)
for label, exc in (("a timeout", TimeoutError("slow")), ("an unexpected error", RuntimeError("boom"))):
    behaviour["raise"] = exc
    p = client.post(f"/cases/{r2.report_id}/ai-insights", headers=H(leader))
    check(f"{label} is a normal 200 'unavailable'", p.status_code == 200 and p.json()["status"] == "unavailable" and p.json()["insight"] is None, p.text)
behaviour["raise"] = None
for label, answer in (("invalid JSON", "not json at all"), ("an unknown priority", good(priority="Critical")), ("an empty answer", "{}")):
    behaviour["answer"] = answer
    p = client.post(f"/cases/{r2.report_id}/ai-insights", headers=H(leader))
    check(f"{label} is a normal 200 'unavailable'", p.status_code == 200 and p.json()["status"] == "unavailable", p.text)
behaviour["answer"] = None
check("nothing was cached by the failures", db.query(CaseAiInsight).filter(CaseAiInsight.report_id == r2.report_id).count() == 0)
check("failures are logged without any report text", count(CAI.ACTION_FAILED, r2.report_id) == 5)
check("the case itself still loads normally", client.get(f"/cases/{r2.report_id}", headers=H(leader)).status_code == 200)

# ===================================================================================== ADMIN SWITCH OFF
setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
setting.is_enabled = False
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()
n = len(calls)
g = client.get(f"/cases/{rid}/ai-insights", headers=H(leader))
p = client.post(f"/cases/{rid}/ai-insights", headers=H(leader))
check("Gemini OFF: GET is 'disabled' and shows no cached insight", g.status_code == 200 and g.json()["status"] == "disabled" and g.json()["insight"] is None, g.text)
check("Gemini OFF: POST is 'disabled' and nothing is sent", p.status_code == 200 and p.json()["status"] == "disabled" and len(calls) == n, p.text)
check("Gemini OFF: the case page still works", client.get(f"/cases/{rid}", headers=H(leader)).status_code == 200)
setting.is_enabled = True
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()
check("switched back ON: the cached insight is back", client.get(f"/cases/{rid}/ai-insights", headers=H(leader)).json()["status"] == "ready")
os.environ["GEMINI_API_KEY"] = ""
ai_suggestions.invalidate_gemini_setting_cache()
check("no API key on the server is 'disabled' too", client.post(f"/cases/{rid}/ai-insights", headers=H(leader)).json()["status"] == "disabled")
os.environ["GEMINI_API_KEY"] = "test-key-never-used"

# ===================================================================================== LOST PET TOO (2026-11-25)
lost = mk("lost_pet", description="My dog is missing.")
behaviour["answer"] = good(mismatch=True, category="found_animal")
_lp = client.post(f"/cases/{lost.report_id}/ai-insights", headers=H(leader))
check("a Lost Pet report gets an insight too", _lp.json().get("status") == "ready" and len(calls) == n + 1, _lp.text + str(lost.category_id))
check("... but never a category mismatch (a Lost Pet case is never switched)", _lp.json()["insight"]["category_check"]["mismatch"] is False, _lp.text)
check("... and the prompt tells the model so", "This is a Lost Pet report" in calls[-1][0])
behaviour["answer"] = None

# ===================================================================================== PARSING GUARDS
parsed = CAI.parse_answer(good(mismatch=True, category="lost_pet"), "found_animal")
check("a suggested Lost Pet category is dropped (mismatch false)", parsed["category_check"]["mismatch"] if "category_check" in parsed else parsed["category_mismatch"] is False and parsed["suggested_category"] is None)
parsed = CAI.parse_answer(good(mismatch=True, category="found_animal"), "found_animal")
check("a 'different' category equal to the current one is dropped", parsed["category_mismatch"] is False)
parsed = CAI.parse_answer(good(mismatch=True, category="injured"), "found_animal")
check("a valid category suggestion is kept", parsed["category_mismatch"] is True and parsed["suggested_category"] == "injured")
parsed = CAI.parse_answer(json.dumps({"summary": "Call 09171234567 or write to a@b.com about the dog at Blk 1 Lot 2 today.", "suggested_priority": "normal",
                                      "category_check": {}}), "found_animal")
check("PII echoed by the model is removed again from the stored summary", all(x not in parsed["summary"] for x in ("09171234567", "a@b.com", "Blk 1")) and parsed["suggested_priority"] == "Normal", parsed["summary"])

# ===================================================================================== APPLIED vs OVERRIDDEN
behaviour["answer"] = good(priority="Urgent", mismatch=True, category="safety")
r3 = mk("found_animal", description="An aggressive dog lunged at a jogger and tried to bite.")
client.post(f"/cases/{r3.report_id}/ai-insights", headers=H(leader))
x = client.put(f"/cases/{r3.report_id}/priority", json={"priority": "urgent", "reason": "Reviewed"}, headers=H(leader))
check("the Leader applies the suggested priority", x.status_code == 200 and count(CAI.ACTION_APPLIED, r3.report_id) == 1 and count(CAI.ACTION_OVERRIDDEN, r3.report_id) == 0, x.text)
x = client.put(f"/cases/{r3.report_id}/priority", json={"priority": "normal", "reason": "Calmer now"}, headers=H(leader))
check("choosing a different priority is logged as an override", x.status_code == 200 and count(CAI.ACTION_OVERRIDDEN, r3.report_id) == 1, x.text)
x = client.put(f"/cases/{r3.report_id}/category", json={"category": "safety"}, headers=H(leader))
db.expire_all()
check("the Leader switches the category as suggested (applied, audited)", x.status_code == 200 and V.category_family(db.get(Report, r3.report_id).category.category_name) == "safety"
      and count(CAI.ACTION_CATEGORY_CHANGED, r3.report_id) == 1 and count(CAI.ACTION_APPLIED, r3.report_id) == 2, x.text)
check("after the switch the content changed: the old insight no longer matches", client.get(f"/cases/{r3.report_id}/ai-insights", headers=H(leader)).json()["status"] == "not_generated")

r4 = mk("found_animal", description="A dog is limping near the clubhouse and cannot put weight on its leg.")
client.post(f"/cases/{r4.report_id}/ai-insights", headers=H(leader))
x = client.put(f"/cases/{r4.report_id}/category", json={"category": "injured"}, headers=H(leader))
check("a different category than suggested is logged as an override", x.status_code == 200 and count(CAI.ACTION_OVERRIDDEN, r4.report_id) == 1, x.text)
check("a resident cannot switch a category (403)", client.put(f"/cases/{r4.report_id}/category", json={"category": "other"}, headers=H(resident)).status_code == 403)
check("no one can switch a case to Lost Pet (409/422)", client.put(f"/cases/{r4.report_id}/category", json={"category": "lost_pet"}, headers=H(leader)).status_code in (409, 422))
check("a Lost Pet case cannot be switched away (409)", client.put(f"/cases/{lost.report_id}/category", json={"category": "other"}, headers=H(leader)).status_code == 409)

r5 = mk("found_animal", description="A quiet cat sits by the gate every evening.")
x = client.put(f"/cases/{r5.report_id}/priority", json={"priority": "high", "reason": "x"}, headers=H(leader))
check("with no insight, a priority change records no AI decision", x.status_code == 200 and count(CAI.ACTION_APPLIED, r5.report_id) + count(CAI.ACTION_OVERRIDDEN, r5.report_id) == 0)


# ===================================================================================== EVIDENCE CHECK (advisory)
from PIL import Image  # noqa: E402

behaviour["answer"] = None
IMAGE = Image.new("RGB", (8, 8), "white")
loads = []
REAL_LOADER = CAI._load_evidence_image


def fake_loader(url):
    loads.append(url)
    return None if "broken" in url else IMAGE


CAI._load_evidence_image = fake_loader


def add_media(report, url, media_type="Image", **extra):
    m = ReportMedia(report_id=report.report_id, file_url=url, media_type=media_type, **extra)
    db.add(m)
    db.commit()
    return m


def with_evidence(flags, summary="The photo shows a small grey cat.", confidence=0.82, **kw):
    data = json.loads(good(**kw))
    data["evidence_check"] = {"flags": flags, "summary": summary, "confidence": confidence}
    return json.dumps(data)


def make(report, who=leader):
    r = client.post(f"/cases/{report.report_id}/ai-insights", headers=H(who))
    assert r.status_code == 200, r.text
    return r.json()


def cached_state(report):
    return client.get(f"/cases/{report.report_id}/ai-insights", headers=H(leader)).json()


# --- no_media
e1 = mk("found_animal", description="A dog sits by the gate.")
out = make(e1)
check("no photo: evidence_check is no_media, the rest of the insight is still made", out["status"] == "ready"
      and out["insight"]["evidence_check"] == {"status": "no_media", "flags": [], "summary": "No photo attached to check.", "confidence": 1.0}, out)
check("no photo: nothing was loaded and the prompt has no evidence section", not loads and "EVIDENCE CHECK" not in str(calls[-1][0]))
add_media(e1, "https://res.cloudinary.com/demo/video/upload/clip.mp4", media_type="Video")
check("a video is never an evidence photo (still no_media, still ready from the cache)", cached_state(e1)["status"] == "ready"
      and make(e1)["insight"]["evidence_check"]["status"] == "no_media" and not loads)

# --- ok / flags
e2 = mk("found_animal", description="A black dog with a limp near the clubhouse. Call Maria Santos 09171234567, Blk 5 Lot 3.", animal_color="Black", reported_by_name="Pedro Cruz")
add_media(e2, "https://res.cloudinary.com/demo/image/upload/e2a.jpg")
behaviour["answer"] = with_evidence([], "A black dog is clearly visible.", 0.9)
n = len(calls)
out = make(e2)
ev = out["insight"]["evidence_check"]
check("a matching photo is status ok with no flags", ev["status"] == "ok" and ev["flags"] == [] and ev["confidence"] == 0.9, ev)
check("the photo goes to Gemini with the prompt (1 call, 1 image)", len(calls) == n + 1 and len(calls[-1]) == 2 and calls[-1][1] is IMAGE and "EVIDENCE CHECK" in calls[-1][0])
sent_text = calls[-1][0]
check("with a photo attached, the text is still redacted and no media link is sent",
      all(x not in sent_text for x in ("Maria", "Santos", "09171234567", "Blk 5", "Pedro", "Cruz", "e2a.jpg", "cloudinary")), sent_text[:300])

for label in ("blurry", "no_animal", "contradicts_description"):
    behaviour["answer"] = with_evidence([label], f"Reason for {label}.", 0.7)
    out = make(e2)
    ev = out["insight"]["evidence_check"]
    check(f"flag {label}: status flag with exactly that flag", out["status"] == "ready" and ev["status"] == "flag" and ev["flags"] == [label]
          and ev["summary"] == f"Reason for {label}." and ev["confidence"] == 0.7, ev)
behaviour["answer"] = with_evidence(["blurry", "no_animal", "blurry", "made_up_flag"], "Dark photo.", 1.7)
ev = make(e2)["insight"]["evidence_check"]
check("duplicates and unknown flags are dropped, confidence is clamped to 0-1", ev["flags"] == ["blurry", "no_animal"] and ev["confidence"] == 1.0, ev)
n = len(calls)
check("GET returns the cached evidence check without calling Gemini", cached_state(e2)["insight"]["evidence_check"]["flags"] == ["blurry", "no_animal"] and len(calls) == n)

# --- PII echoed in the evidence summary
behaviour["answer"] = with_evidence(["contradicts_description"], "The photo shows a cat; call 09171234567 or a@b.com at Blk 1 Lot 2.", 0.8)
ev = make(e2)["insight"]["evidence_check"]
check("PII echoed by the model in the evidence summary is removed before it is stored", all(x not in ev["summary"] for x in ("09171234567", "a@b.com", "Blk 1")), ev["summary"])

# --- suggest only
db.expire_all()
db.refresh(e2)
check("SUGGEST ONLY: the evidence flags changed nothing on the case (status, priority, evidence sufficiency, category)",
      case_state.sufficiency_of(e2) == "not_assessed" and case_state.priority_of(e2) == "normal" and case_state.case_status_of(e2) == "reported"
      and V.category_family(e2.category.category_name) == "found_animal")
check("the evidence result is in the audit log, without text",
      any(a.new_values and a.new_values.get("evidence_flags") == ["contradicts_description"] and a.new_values.get("photos_checked") == 1 and "summary" not in a.new_values
          for a in db.query(AuditLog).filter(AuditLog.action == CAI.ACTION_GENERATED, AuditLog.target_id == e2.report_id).all()))

# --- the local detector disagrees with no_animal
e3 = mk("found_animal", description="A cat under a car.", animal_type="Cat")
add_media(e3, "https://res.cloudinary.com/demo/image/upload/e3.jpg", ai_detection_confidence=Decimal("0.870"))
behaviour["answer"] = with_evidence(["no_animal"], "I cannot see an animal.", 0.6)
ev = make(e3)["insight"]["evidence_check"]
check("no_animal is dropped when the local detector (YOLO) found a dog or cat in the file", ev["status"] == "ok" and ev["flags"] == [] and "local animal detector" in ev["summary"], ev)

# --- the cap, the order, and the cache key
e4 = mk("found_animal", description="Several photos of a stray dog.")
a = add_media(e4, "https://res.cloudinary.com/demo/image/upload/p1.jpg")
b = add_media(e4, "https://res.cloudinary.com/demo/image/upload/p2.jpg")
add_media(e4, "https://res.cloudinary.com/demo/image/upload/p3.jpg")
behaviour["answer"] = with_evidence([], "Fine.", 0.8)
loads.clear()
make(e4)
check("at most 2 photos are sent (the first two)", len(calls[-1]) == 3 and loads == [a.file_url, b.file_url], loads)
check("the same photos: the cache holds (ready)", cached_state(e4)["status"] == "ready")
add_media(e4, "https://res.cloudinary.com/demo/image/upload/p4.jpg")
check("a photo beyond the cap does not change the insight (still ready)", cached_state(e4)["status"] == "ready")
e5 = mk("found_animal", description="One photo to start.")
first = add_media(e5, "https://res.cloudinary.com/demo/image/upload/s1.jpg")
make(e5)
check("evidence photos are part of the cache key: unchanged, it is ready", cached_state(e5)["status"] == "ready")
add_media(e5, "https://res.cloudinary.com/demo/image/upload/s2.jpg")
check("a new evidence photo makes it not_generated (re-run needed)", cached_state(e5)["status"] == "not_generated")
make(e5)
first.file_url = "https://res.cloudinary.com/demo/image/upload/s1-replaced.jpg"
db.commit()
check("a replaced evidence photo makes it not_generated too", cached_state(e5)["status"] == "not_generated")
check("rows made before the check existed read as 'unavailable', never as ok",
      CAI.evidence_view(CaseAiInsight(evidence_check=None))["status"] == "unavailable"
      and CAI.evidence_view(CaseAiInsight(evidence_check="{not json"))["status"] == "unavailable")

# --- fail closed
e6 = mk("found_animal", description="A dog with a photo that cannot be read.")
add_media(e6, "https://res.cloudinary.com/demo/image/upload/broken.jpg")
behaviour["answer"] = None
n = len(calls)
out = make(e6)
check("a photo that cannot be loaded: evidence 'unavailable' but the rest is made (text-only call)", out["status"] == "ready"
      and out["insight"]["evidence_check"]["status"] == "unavailable" and out["insight"]["suggested_priority"] == "High"
      and len(calls) == n + 1 and len(calls[-1]) == 1 and "EVIDENCE CHECK" not in calls[-1][0], out)
behaviour["answer"] = good()
out = make(e2)
check("the model leaves the evidence part out: evidence 'unavailable', the rest is kept", out["status"] == "ready"
      and out["insight"]["evidence_check"]["status"] == "unavailable" and out["insight"]["summary"], out)
behaviour["answer"] = json.dumps({**json.loads(good()), "evidence_check": {"flags": "blurry", "summary": 5, "confidence": "high"}})
ev = make(e2)["insight"]["evidence_check"]
check("a malformed evidence part is made safe (ok, no flags, confidence 0), never a flag", ev["status"] == "ok" and ev["flags"] == [] and ev["confidence"] == 0.0, ev)
behaviour["answer"] = None
e7 = mk("found_animal", description="A slow Gemini day.")
add_media(e7, "https://res.cloudinary.com/demo/image/upload/e7.jpg")
behaviour["raise"] = TimeoutError("slow")
p = client.post(f"/cases/{e7.report_id}/ai-insights", headers=H(leader))
check("a Gemini timeout with a photo is a normal 200 'unavailable' and nothing is cached", p.status_code == 200 and p.json()["status"] == "unavailable"
      and db.query(CaseAiInsight).filter(CaseAiInsight.report_id == e7.report_id).count() == 0, p.text)
check("the case still loads", client.get(f"/cases/{e7.report_id}", headers=H(leader)).status_code == 200)
behaviour["raise"] = None
setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
setting.is_enabled = False
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()
n, nl = len(calls), len(loads)
p = client.post(f"/cases/{e7.report_id}/ai-insights", headers=H(leader))
check("Gemini OFF: no photo is loaded or sent, the answer is 'disabled'", p.json()["status"] == "disabled" and len(calls) == n and len(loads) == nl, p.text)
setting.is_enabled = True
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()

# --- the real loader only reads our own files or Cloudinary (no network is touched for these)
CAI._load_evidence_image = REAL_LOADER
check("the real loader refuses a non-Cloudinary or plain-http link and a missing file",
      REAL_LOADER("https://evil.example.com/a.jpg") is None and REAL_LOADER("http://res.cloudinary.com/demo/a.jpg") is None
      and REAL_LOADER("https://cloudinary.com.evil.example/a.jpg") is None and REAL_LOADER("uploads/does-not-exist.jpg") is None)


# ===================================================================================== GUIDANCE (next steps, missing, recap)
from datetime import datetime, timedelta  # noqa: E402

from app.models.case_records import CaseContactLog, CaseFollowUp  # noqa: E402
from app.models.report import StatusHistory  # noqa: E402

behaviour["answer"] = None
behaviour["raise"] = None


def with_guidance(guidance, **kw):
    data = json.loads(good(**kw))
    data["guidance"] = guidance
    return json.dumps(data)


def guidance_of(out):
    return out["insight"]["guidance"]


GOOD_GUIDANCE = {
    "next_steps": [{"action": "start_review", "reason": "The report is new."}, {"action": "record_assessment", "reason": "Nothing is assessed yet."}],
    "missing": ["When the dog was last seen"],
    "draft_question": "Anong oras po huling nakita ang aso?",
    "recap": "Reported today. No action has been recorded yet.",
}

# --- what is sent: no personal data, no coordinates, no free text from notes, follow-ups or contacts
g1 = mk("safety", description="A dog keeps chasing joggers near the park.", reported_by_name="Pedro Cruz")
db.add(CaseFollowUp(report_id=g1.report_id, subdivision_id=1, kind="site_check", title="Visit Juan Dela Cruz at Blk 4 Lot 9",
                    notes="Call 09171234567", status="pending", due_at=datetime.now() + timedelta(days=2)))
db.add(CaseContactLog(report_id=g1.report_id, subdivision_id=1, method="phone", with_whom="Maria Santos", summary="Spoke to Maria at 09171234567",
                      outcome="cooperative", contact_at=datetime.now()))
db.add(StatusHistory(report_id=g1.report_id, report_status_id=1, remarks="Juan Dela Cruz was told by Mang Tony"))
db.commit()
gin = CAI.build_guidance_input(db, g1)
sent = json.dumps(gin, default=str)
check("the guidance input carries no name, contact, address, coordinate or landmark",
      all(x not in sent for x in ("Maria", "Santos", "Juan", "Pedro", "Tony", "0917", "Blk", "14.8", "121.0", "Gate 2", "Visit", "Spoke")), sent)
check("the guidance input is the case page, status, priority, facts, allowed actions and a timeline",
      set(gin) == {"case_page", "case_status", "priority", "facts", "allowed_actions", "timeline"} and gin["case_page"] == "standard"
      and gin["facts"]["has_map_pin"] is True
      and gin["facts"]["pending_follow_ups"] == 1 and gin["facts"]["overdue_follow_ups"] == 0, gin)
events = [e["event"] for e in gin["timeline"]]
check("the timeline is fixed words: submitted, the follow-up kind and the contact method/outcome, no remarks",
      "Report submitted" in events and "Follow-up scheduled (site check)" in events and "Contact logged (phone, cooperative)" in events
      and not any("Juan" in e or "Tony" in e for e in events), events)
check("a reported, unassessed case with a pending follow-up: start, assess, referral (no new follow-up)",
      gin["allowed_actions"] == ["start_review", "record_assessment", "create_referral"], gin["allowed_actions"])
check("the content hash ignores the case state: the payload is unchanged by guidance",
      set(CAI.build_payload(db, g1)) == {"category", "animal_type", "animal_breed", "animal_color", "estimated_size", "animal_count", "description", "condition"})
prompt = CAI.build_prompt(CAI.build_payload(db, g1), guidance=gin)
check("the prompt asks for guidance with only the allowed ids and says hidden data is not missing",
      "CASE STATE" in prompt and "- start_review:" in prompt and "- mark_in_progress:" not in prompt and "EXISTS and was hidden" in prompt
      and all(x not in prompt for x in ("Maria", "Juan", "Pedro", "09171234567", "Gate 2", "14.8")), prompt[-1500:])

# --- a good answer
behaviour["answer"] = with_guidance(GOOD_GUIDANCE)
out = make(g1)
gd = guidance_of(out)
check("a good guidance is kept: labelled steps, missing item, question and recap", out["status"] == "ready" and gd["status"] == "ok"
      and [s["action"] for s in gd["next_steps"]] == ["start_review", "record_assessment"] and gd["next_steps"][0]["label"] == "Start the review"
      and gd["missing"] == ["When the dog was last seen"] and gd["draft_question"].startswith("Anong oras") and gd["recap"] and gd["stale"] is False, gd)
check("the guidance went in the same single Gemini call", "CASE STATE" in calls[-1][0])
gen = [a.new_values for a in db.query(AuditLog).filter(AuditLog.action == CAI.ACTION_GENERATED, AuditLog.target_id == g1.report_id).all()][-1]
check("the audit log has the action ids and counts, never the guidance text",
      gen["guidance_status"] == "ok" and gen["next_step_actions"] == ["start_review", "record_assessment"] and gen["missing_count"] == 1
      and gen["has_draft_question"] is True and "Anong" not in json.dumps(gen) and "last seen" not in json.dumps(gen), gen)

# --- the server's checks on each part
behaviour["answer"] = with_guidance({
    "next_steps": [{"action": "close_case", "reason": "Done."}, {"action": "issue_warning"}, {"action": "mark_in_progress", "reason": "x"},
                   {"action": "start_review", "reason": "Call 09171234567 first."}, {"action": "start_review", "reason": "again"},
                   {"action": "create_referral", "reason": "r"}, {"action": "record_assessment", "reason": "a"}, "junk"],
    "missing": ["a", "A", "b", "c", "d", "e", "f", 7, ""],
    "draft_question": "Pwede po ba kayong tumawag kay Maria Santos sa 09171234567?",
    "recap": "Seen at Blk 5 Lot 3 by maria@mail.com.",
})
gd = guidance_of(make(g1))
check("unknown and not-allowed actions are dropped, duplicates too, at most 3 steps",
      [s["action"] for s in gd["next_steps"]] == ["start_review", "create_referral", "record_assessment"], gd["next_steps"])
check("missing items are deduplicated, non-text dropped, at most 5", gd["missing"] == ["a", "b", "c", "d", "e"], gd["missing"])
check("PII echoed by the model is removed from the reason, question and recap",
      all(x not in json.dumps(gd) for x in ("09171234567", "maria@mail.com", "Blk 5")), gd)

# --- fail closed, part by part
behaviour["answer"] = good()
out = make(g1)
check("the model leaves guidance out: guidance 'unavailable', the summary and priority are kept",
      out["status"] == "ready" and guidance_of(out)["status"] == "unavailable" and out["insight"]["suggested_priority"] == "High", out)
behaviour["answer"] = with_guidance("just text")
check("a malformed guidance is 'unavailable', never a guess", guidance_of(make(g1))["status"] == "unavailable")
behaviour["answer"] = with_guidance({"next_steps": [{"action": "fly_away"}], "missing": [], "draft_question": 5, "recap": None})
check("a guidance with no usable part is 'unavailable'", guidance_of(make(g1))["status"] == "unavailable")
behaviour["answer"] = with_guidance({"next_steps": "x", "missing": "y", "draft_question": None, "recap": "Only a recap is usable here."})
gd = guidance_of(make(g1))
check("one good part is enough: a recap alone is kept", gd["status"] == "ok" and gd["recap"] and gd["next_steps"] == [] and gd["missing"] == [], gd)
check("rows made before guidance existed read as 'none' (made on the next Refresh)",
      CAI.guidance_view(CaseAiInsight(guidance=None))["status"] == "none" and CAI.guidance_view(CaseAiInsight(guidance="{bad"))["status"] == "none")

# --- applying the suggested priority keeps the insight; the guidance says the case changed
behaviour["answer"] = with_guidance(GOOD_GUIDANCE, priority="Urgent")
make(g1)
x = client.put(f"/cases/{g1.report_id}/priority", json={"priority": "urgent", "reason": "Applied"}, headers=H(leader))
st = cached_state(g1)
check("after Apply priority the insight is still shown (same content hash)", x.status_code == 200 and st["status"] == "ready", st)
check("... and the guidance is marked stale (the case changed since it was made)", guidance_of(st)["stale"] is True, guidance_of(st))
check("the timeline now has the priority change", "Priority set to Urgent" in [e["event"] for e in CAI.case_timeline(db, g1)])

# --- a step that no longer fits is dropped when read
behaviour["answer"] = with_guidance(GOOD_GUIDANCE)
make(g1)
x = client.post(f"/cases/{g1.report_id}/status", json={"to": "under_review"}, headers=H(leader))
gd = guidance_of(cached_state(g1))
check("after Start review, 'start_review' is no longer offered and the guidance is stale",
      x.status_code == 200 and "start_review" not in [s["action"] for s in gd["next_steps"]] and "record_assessment" in [s["action"] for s in gd["next_steps"]]
      and gd["stale"] is True, (x.text, gd))

# --- overdue follow-up, needs more evidence, possible owner, claim
g2 = mk("injured", description="A dog with a bleeding paw near the clubhouse.")
db.add(CaseFollowUp(report_id=g2.report_id, subdivision_id=1, kind="follow_up", title="Check again", status="pending",
                    due_at=datetime.now() - timedelta(days=1)))
g2.evidence_sufficiency = "needs_more"
g2.identity_status = "possible_match"
db.commit()
acts = CAI.build_guidance_input(db, g2)["allowed_actions"]
check("an overdue follow-up offers 'complete_follow_up' (not a new one); needs_more with a pending follow-up does not ask again; a possible match offers the owners",
      "complete_follow_up" in acts and "schedule_follow_up" not in acts and "request_more_evidence" not in acts and "review_possible_owners" in acts, acts)
g2.animal_type = "Wildlife"
db.commit()
check("Possible Pet Owners is never offered for wildlife", "review_possible_owners" not in CAI.build_guidance_input(db, g2)["allowed_actions"])

# --- a closed case: recap only
# (not "other": in this throwaway database that category has id 6, which the app reads as Lost Pet)
g3 = mk("injured", description="A cat was stuck on a roof and was brought down.")
g3.case_status = "closed"
g3.current_status_id = 11
db.commit()
gin3 = CAI.build_guidance_input(db, g3)
check("a closed case offers no next step", gin3["allowed_actions"] == [] and "CLOSED" in CAI.build_prompt(CAI.build_payload(db, g3), guidance=gin3))
behaviour["answer"] = with_guidance(GOOD_GUIDANCE)
gd = guidance_of(make(g3))
check("a closed case keeps only the recap (and no decision it was not asked for), whatever the model says", gd["status"] == "ok" and gd["next_steps"] == []
      and gd["missing"] == [] and gd["draft_question"] is None and gd["recap"] and gd["decision"] is None, gd)

# --- how a closed case ended and why (2026-11-25)
check("an open case has no closure block", "closure" not in CAI.build_guidance_input(db, g1))
check("a closed case's recap is still the full recap (the decision is a separate part)",
      "without repeating it" not in CAI.build_prompt(CAI.build_payload(db, g3), guidance=CAI.build_guidance_input(db, g3)))
c1 = mk("injured", description="A cat with a hurt paw by the clubhouse.")
c1.closure_disposition = "owner_compliance"
c1.closure_reason = "Mang Tony agreed to keep the dog leashed. Spoke with Maria Santos (09171234567) at Blk 5 Lot 3. Marked by Leader Pedro Cruz."
c1.closed_at = datetime(2026, 11, 20, 10, 30)
c1.closed_by = leader.user_id
c1.case_status = "closed"
c1.current_status_id = 11
db.commit()
leader_name = leader.name
gin_c = CAI.build_guidance_input(db, c1)
cl = gin_c["closure"]
check("a closed case sends the decision label, outcome group, date and reason", cl["decision"] == "Owner compliance verified" and cl["outcome"] == "resolved"
      and cl["closed_on"] == "2026-11-20" and cl["reason"], cl)
sent = json.dumps(gin_c)
check("the closing reason is redacted: no phone, address, honorific name, reporter name or the closer's own name",
      all(x not in sent for x in ("09171234567", "Blk 5", "Tony", "Maria", "Santos", "Pedro")) and leader_name not in sent, sent)
check("the closure is in the prompt, with the instruction not to invent a reason",
      "closure.reason" in CAI.build_prompt(CAI.build_payload(db, c1), guidance=gin_c) and "NEVER invent a reason" in CAI.build_prompt(CAI.build_payload(db, c1), guidance=gin_c)
      and '"decision":' in CAI.build_prompt(CAI.build_payload(db, c1), guidance=gin_c))
check("an open case's prompt does not ask for a decision", '"decision":' not in CAI.build_prompt(CAI.build_payload(db, g1), guidance=CAI.build_guidance_input(db, g1)))
full_prompt = CAI.build_prompt(CAI.build_payload(db, c1), guidance=gin_c)
check("the decision stays close to the recorded reason and adds no fact (no 'found' or 'picked up' unless the reason says so)",
      "Do NOT add any fact" in full_prompt and 'do not say an animal was "found"' in full_prompt and "kept close to what it says" in full_prompt)
check("each text has its own job: the summary is what was reported, not how the case went or ended",
      "what was REPORTED" in full_prompt and "how it ended (the recap and the decision do that)" in full_prompt)
check("the recap does not repeat the report's description, nor (closed) the decision",
      "Do not repeat the description of the report" in full_prompt and "do not restate the decision" in full_prompt)
check("an open case's recap is told not to repeat the description but has no decision rule",
      "Do not repeat the description of the report" in CAI.build_prompt(CAI.build_payload(db, g1), guidance=CAI.build_guidance_input(db, g1))
      and "do not restate the decision" not in CAI.build_prompt(CAI.build_payload(db, g1), guidance=CAI.build_guidance_input(db, g1)))
check("without guidance the summary line is the old one", "what was REPORTED" not in CAI.build_prompt(CAI.build_payload(db, g1)))

# redundancy guard on the server
SUMMARY = "A black and white cat was reported lost near the basketball court of the subdivision."
DECISION = "The case was closed as resolved because the owner said the missing pet was recovered at the court."
base = {"status": "ok", "next_steps": [], "missing": [], "draft_question": None, "case_signature": "s"}
check("a recap that copies the summary is dropped",
      CAI.drop_repeated_recap({**base, "decision": DECISION, "recap": "A black and white cat was reported lost near the basketball court of the subdivision today."}, SUMMARY)["recap"] is None)
check("a recap that copies the decision is dropped",
      CAI.drop_repeated_recap({**base, "decision": DECISION, "recap": "The case was closed as resolved because the owner said the missing pet was recovered at the court."}, SUMMARY)["recap"] is None)
kept = CAI.drop_repeated_recap({**base, "decision": DECISION, "recap": "Two sightings were recorded, then the owner confirmed in the app that the pet was home."}, SUMMARY)
check("a recap that adds what happened is kept", kept["recap"] and kept["decision"] == DECISION)
check("short texts are never judged a repeat", CAI.drop_repeated_recap({**base, "decision": "Closed.", "recap": "Closed."}, "Closed.")["recap"] == "Closed.")
check("a guidance with only a repeated recap becomes 'unavailable'",
      CAI.drop_repeated_recap({**base, "decision": None, "recap": "A black and white cat was reported lost near the basketball court of the subdivision today."}, SUMMARY)["status"] == "unavailable")
behaviour["answer"] = with_guidance({"next_steps": [], "missing": [], "draft_question": None, "decision": "Closed as owner compliance verified because the owner agreed to leash the dog.",
                                     "recap": "A brown dog keeps chasing joggers near the park, every single evening there."})
behaviour["answer"] = json.dumps({**json.loads(behaviour["answer"]), "summary": "A brown dog keeps chasing joggers near the park, every single evening."})
gd = guidance_of(make(c1))
check("end to end: a recap that copies the summary is dropped, the decision is kept", gd["status"] == "ok" and gd["recap"] is None and gd["decision"], gd)
behaviour["answer"] = with_guidance({"next_steps": [{"action": "schedule_follow_up", "reason": "x"}], "missing": ["m"], "draft_question": "q?",
                                     "decision": "The case was closed as owner compliance verified, because the owner agreed to leash the dog. Call 09171234567.",
                                     "recap": "Reported, assessed, then the owner was contacted."})
gd = guidance_of(make(c1))
check("a closed case keeps the decision and the recap, nothing else; PII echoed in the decision is removed",
      gd["status"] == "ok" and gd["decision"].startswith("The case was closed as owner compliance verified") and "09171234567" not in gd["decision"]
      and gd["recap"] and gd["next_steps"] == [] and gd["missing"] == [] and gd["draft_question"] is None, gd)
behaviour["answer"] = with_guidance({"next_steps": [], "missing": [], "draft_question": None, "decision": 5, "recap": None})
check("a closed case whose model answer has no usable decision or recap is 'unavailable'", guidance_of(make(c1))["status"] == "unavailable")
c2 = mk("injured", description="Closed without any detail.")
c2.case_status = "closed"
c2.current_status_id = 14
db.commit()
cl2 = CAI.build_guidance_input(db, c2)["closure"]
check("an older closure with no stored outcome still has a decision line and no invented reason", cl2["decision"] and cl2["reason"] is None, cl2)
audit_new = [a.new_values for a in db.query(AuditLog).filter(AuditLog.action == CAI.ACTION_GENERATED, AuditLog.target_id == c1.report_id).all()]
check("the audit log notes a decision was made, never its text", audit_new and audit_new[0].get("has_decision") in (True, False)
      and "owner compliance" not in json.dumps(audit_new).lower().replace("_", " "))
behaviour["answer"] = None

# --- the timeline is capped
g4 = mk("injured", description="Many follow-ups.")
for i in range(25):
    db.add(CaseFollowUp(report_id=g4.report_id, subdivision_id=1, kind="welfare_check", title=f"Check {i}", status="done",
                        created_at=datetime.now() - timedelta(days=30 - i), completed_at=datetime.now() - timedelta(days=29 - i)))
db.commit()
tl = CAI.case_timeline(db, g4)
check("the timeline keeps the latest 20 events, oldest first", len(tl) == 20 and tl == sorted(tl, key=lambda e: e["date"]), tl[:3])

# --- every kind of case, each with its own page's steps (2026-11-25)
from app.models.lost_found_match import LostFoundMatch  # noqa: E402

n1 = mk("nuisance", description="A dog barks all night at the corner house.")
gin_n = CAI.build_guidance_input(db, n1)
check("an animal complaint is worked on the complaint page", gin_n["case_page"] == CAI.COMPLAINT and CAI.workflow_of(n1) == "complaint")
check("a new complaint offers only its own first steps: verify what happened, then who is responsible",
      gin_n["allowed_actions"] == ["verify_incident", "find_respondent"], gin_n["allowed_actions"])
n1.incident_verification = "verified"
db.commit()
check("once verified, only 'who is responsible' is left (no status, follow-up or referral step on the complaint page)",
      CAI.build_guidance_input(db, n1)["allowed_actions"] == ["find_respondent"])
n1.incident_verification = "invalid"
db.commit()
check("an invalid complaint offers nothing (closing it stays the Leader's call)", CAI.build_guidance_input(db, n1)["allowed_actions"] == [])
behaviour["answer"] = with_guidance({"next_steps": [{"action": "verify_incident", "reason": "x"}, {"action": "start_review", "reason": "y"}],
                                     "missing": [], "draft_question": None, "recap": "r"})
n1.incident_verification = "not_reviewed"
db.commit()
gd = guidance_of(make(n1))
check("a complaint keeps only complaint steps from the answer", [s["action"] for s in gd["next_steps"]] == ["verify_incident"], gd)

# --- suggesting a rule for an animal complaint (2026-11-25): from the confirmed rules only, ids only, never preselected, Leader decides
from app.schemas.case import CaseSettings, PolicyIn  # noqa: E402
from app.utils import case_policy  # noqa: E402

settings_now = CaseSettings(categories={fam: True for fam in V.CATEGORY_FAMILIES}, policies=[
    PolicyIn(id="noise", title="Control of Excessive Animal Noise & Habitual Barking", reference="Ord. 12-3", summary="Barking, howling or other animal noise that disturbs neighbours, especially at night.",
             applies_to=["nuisance"], status="confirmed"),
    PolicyIn(id="leash", title="Leash and Roaming Rule", reference="Ord. 12-4", summary="Dogs and cats must not roam loose; dogs are leashed outside the home.",
             applies_to=["nuisance", "safety"], status="confirmed"),
    PolicyIn(id="waste", title="Animal Waste", reference="Ord. 12-5", summary="Owners clean up after their animals.", applies_to=["nuisance"], status="pending_confirmation"),
    PolicyIn(id="bite", title="Bite Reporting", reference="Ord. 12-6", summary="Report every bite.", applies_to=["safety"], status="confirmed"),
])
case_policy.save_settings(db, 1, settings_now, None)
db.commit()
r1n = mk("nuisance", description="Tahol nang tahol ang aso ni Mang Tony tuwing gabi sa Blk 5 Lot 3, hindi kami makatulog. Call 09171234567.")
gin_r = CAI.build_guidance_input(db, r1n)
check("only the CONFIRMED rules that cover animal complaints are offered to the model (not pending, not another kind of concern)",
      [r["id"] for r in gin_r["rules"]] == ["noise", "leash"], gin_r.get("rules"))
sent_r = json.dumps(gin_r)
check("the rules sent are id, title and what the rule covers; the report's names, phone and address are not in the input",
      set(gin_r["rules"][0]) == {"id", "title", "covers"} and all(x not in sent_r for x in ("Tony", "09171234567", "Blk 5")), sent_r)
prompt_r = CAI.build_prompt(CAI.build_payload(db, r1n), guidance=gin_r)
check("the prompt asks for rule suggestions from those ids, behaviour only, and lets the model say none fits",
      '"rule_suggestions"' in prompt_r and "RULES:" in prompt_r and "a wrong suggestion is worse than none" in prompt_r and "never who" in prompt_r
      and "Control of Excessive Animal Noise" in prompt_r, prompt_r[-900:])
case_policy.save_settings(db, 1, CaseSettings(categories={fam: True for fam in V.CATEGORY_FAMILIES}), None)
db.commit()
gin_none = CAI.build_guidance_input(db, r1n)
check("a complaint with no confirmed rule to choose from asks for no suggestion",
      "rules" not in gin_none and '"rule_suggestions"' not in CAI.build_prompt(CAI.build_payload(db, r1n), guidance=gin_none))
case_policy.save_settings(db, 1, settings_now, None)
db.commit()
check("other kinds of case never get rules", all("rules" not in CAI.build_guidance_input(db, mk(f, description="x")) for f in ("injured", "safety", "found_animal")))

behaviour["answer"] = with_guidance({"next_steps": [], "missing": [], "draft_question": None, "recap": "A complaint about barking at night.",
                                     "rule_suggestions": [{"id": "noise", "reason": "The report says the dog barks all night. Call 09171234567."}, {"id": "made_up", "reason": "x"},
                                                          {"id": "waste", "reason": "pending rule"}, {"id": "bite", "reason": "other concern"}, {"id": "noise", "reason": "again"}, {"id": "leash", "reason": "It may roam."}]})
out_r = make(r1n)
gd = guidance_of(out_r)
check("suggestions keep only ids the server offered (not made-up, pending or other-concern ones), each once, in order", [r["id"] for r in gd["rule_suggestions"]] == ["noise", "leash"], gd["rule_suggestions"])
check("each suggestion carries the rule's title from Settings and a reason, with PII removed",
      gd["rule_suggestions"][0]["title"] == "Control of Excessive Animal Noise & Habitual Barking" and "09171234567" not in json.dumps(gd) and gd["rule_suggestions"][0]["reason"], gd)
check("the guidance says suggestions were asked for (so 'no clear match' can be told from 'not asked')", gd["rules_asked"] is True)

behaviour["answer"] = with_guidance({"next_steps": [], "missing": [], "draft_question": None, "recap": "A complaint.", "rule_suggestions": [{"id": "a", "reason": "1"}, {"id": "b", "reason": "2"}, {"id": "c", "reason": "3"}]})
many = CAI.parse_guidance({"recap": "A complaint.", "rule_suggestions": [{"id": "a"}, {"id": "b"}, {"id": "c"}]}, [], False, "s", ["a", "b", "c"])
check("at most 2 suggestions", [r["id"] for r in many["rule_suggestions"]] == ["a", "b"])
none_fit = CAI.parse_guidance({"recap": None, "rule_suggestions": []}, [], False, "s", ["a"])
check("'no clear match' (asked, nothing suggested) is a real answer, not 'unavailable'", none_fit["status"] == "ok" and none_fit["rule_suggestions"] == [] and none_fit["rules_asked"] is True, none_fit)
check("malformed rule suggestions are ignored", CAI.parse_guidance({"recap": "r", "rule_suggestions": "noise"}, [], False, "s", ["noise"])["rule_suggestions"] == []
      and CAI.parse_guidance({"recap": "r", "rule_suggestions": [5, None, {"id": 7}]}, [], False, "s", ["noise"])["rule_suggestions"] == [])
check("a closed case never gets rule suggestions", CAI.parse_guidance({"decision": "d", "rule_suggestions": [{"id": "noise"}]}, [], True, "s", ["noise"])["rule_suggestions"] == [])

behaviour["answer"] = with_guidance({"next_steps": [], "missing": [], "draft_question": None, "recap": "A complaint about barking at night.",
                                     "rule_suggestions": [{"id": "noise", "reason": "Barking at night."}]})
make(r1n)
st_r = cached_state(r1n)
check("GET returns the cached suggestions without calling Gemini", [r["id"] for r in guidance_of(st_r)["rule_suggestions"]] == ["noise"])
gen_r = [a.new_values for a in db.query(AuditLog).filter(AuditLog.action == CAI.ACTION_GENERATED, AuditLog.target_id == r1n.report_id).all()][-1]
check("the audit log has the suggested rule ids, never the reasons", gen_r["rule_suggestions"] == ["noise"] and "Barking" not in json.dumps(gen_r), gen_r)

# the Leader's choice is noted: applied (one of the suggested) or overridden (another rule, or "none")
CAI.record_rule_decision(db, r1n, leader, "noise")
CAI.record_rule_decision(db, r1n, leader, "leash")
CAI.record_rule_decision(db, r1n, leader, "none")
db.commit()
check("choosing a suggested rule is 'applied'; another rule or 'none applies' is 'overridden'; ids only",
      count(CAI.ACTION_RULE_APPLIED, r1n.report_id) == 1 and count(CAI.ACTION_RULE_OVERRIDDEN, r1n.report_id) == 2)
check("a complaint with no suggestion on file records nothing", (lambda x: (CAI.record_rule_decision(db, x, leader, "noise"), db.commit(), count(CAI.ACTION_RULE_APPLIED, x.report_id) == 0)[-1])(mk("nuisance", description="Loud dog.")))
# the Leader's own choice ends the suggestion: once a rule is chosen nothing is offered again
from app.models.complaint import ComplaintFinding  # noqa: E402
db.add(ComplaintFinding(report_id=r1n.report_id, subdivision_id=1, policy_id="noise", policy_title="Control of Excessive Animal Noise & Habitual Barking"))
db.commit()
check("once a rule is chosen no rules are offered, and the old suggestions are no longer shown",
      "rules" not in CAI.build_guidance_input(db, r1n) and guidance_of(cached_state(r1n))["rule_suggestions"] == [] and guidance_of(cached_state(r1n))["rules_asked"] is False)
# end to end through the real Verify service: the rule the Leader saves is noted as applied / overridden (the choice itself is the Leader's)
from app.schemas.complaint import VerifyIn  # noqa: E402
from app.services import complaints as CM  # noqa: E402


def verify_with(report, **kw):
    CM.verify(db, db.get(Report, report.report_id), leader, VerifyIn(incident="verified", basis="The guard heard it too.", **kw))
    db.commit()


r_v1 = mk("nuisance", description="Tahol nang tahol ang aso tuwing gabi.")
behaviour["answer"] = with_guidance({"next_steps": [], "missing": [], "draft_question": None, "recap": "Barking at night.", "rule_suggestions": [{"id": "noise", "reason": "Barking at night."}]})
make(r_v1)
verify_with(r_v1, policy_id="noise")
check("Verify with the suggested rule: saved as the Leader chose it, and noted as applied",
      db.get(ComplaintFinding, r_v1.report_id).policy_id == "noise" and count(CAI.ACTION_RULE_APPLIED, r_v1.report_id) == 1 and count(CAI.ACTION_RULE_OVERRIDDEN, r_v1.report_id) == 0)
r_v2 = mk("nuisance", description="Tahol nang tahol ang aso tuwing gabi.", reported_by_name="Pedro Cruz")
make(r_v2)
verify_with(r_v2, policy_id="leash")
check("Verify with another rule: saved as chosen, noted as overridden", db.get(ComplaintFinding, r_v2.report_id).policy_id == "leash" and count(CAI.ACTION_RULE_OVERRIDDEN, r_v2.report_id) == 1)
r_v3 = mk("nuisance", description="Tahol nang tahol ang aso tuwing gabi.", reported_by_name="Pedro Cruz")
make(r_v3)
verify_with(r_v3, no_rule=True)
check("Verify with 'none of the rules applies': noted as overridden", db.get(ComplaintFinding, r_v3.report_id).no_rule is True and count(CAI.ACTION_RULE_OVERRIDDEN, r_v3.report_id) == 1)
r_v4 = mk("nuisance", description="Loud dog.")
verify_with(r_v4, policy_id="noise")
check("Verify with no insight on file: nothing is noted and nothing breaks", db.get(ComplaintFinding, r_v4.report_id).policy_id == "noise" and count(CAI.ACTION_RULE_APPLIED, r_v4.report_id) + count(CAI.ACTION_RULE_OVERRIDDEN, r_v4.report_id) == 0)
behaviour["answer"] = None

r_inv = mk("nuisance", description="Barks.")
r_inv.incident_verification = "invalid"
db.commit()
check("a complaint already found unverified or invalid is offered no rules", "rules" not in CAI.build_guidance_input(db, r_inv))
behaviour["answer"] = None

f1 = mk("found_animal", description="A brown dog found near the gate.")
lost2 = mk("lost_pet", description="Our brown dog is missing.")
gin_f = CAI.build_guidance_input(db, f1)
check("a found animal is monitored: no review, assessment or status step",
      gin_f["case_page"] == CAI.MONITORED and not {"start_review", "record_assessment", "mark_in_progress"} & set(gin_f["allowed_actions"])
      and gin_f["facts"]["found_animal"] is True, gin_f)
db.add(LostFoundMatch(subdivision_id=1, lost_report_id=lost2.report_id, found_report_id=f1.report_id, score=80, level="strong", status="pending"))
db.commit()
check("a waiting possible match is offered on both reports",
      "review_possible_match" in CAI.build_guidance_input(db, f1)["allowed_actions"]
      and "review_possible_match" in CAI.build_guidance_input(db, lost2)["allowed_actions"])
f1.identity_status = "possible_match"
lost2.identity_status = "possible_match"
db.commit()
check("Possible Pet Owners is offered for a found animal, never for a missing pet (its owner is known)",
      "review_possible_owners" in CAI.build_guidance_input(db, f1)["allowed_actions"]
      and "review_possible_owners" not in CAI.build_guidance_input(db, lost2)["allowed_actions"])
facts = dict(CAI.build_guidance_input(db, lost2)["facts"], unchecked_sightings=1)
check("an unchecked sighting offers 'review_sighting'", "review_sighting" in CAI.allowed_actions("reported", facts, "Dog", CAI.MONITORED))
behaviour["answer"] = with_guidance({"next_steps": [{"action": "review_possible_match", "reason": "Strong match."}], "missing": ["Last seen time"],
                                     "draft_question": None, "recap": "A missing dog."})
out = make(lost2)
check("a missing pet gets guidance with its own steps", out["status"] == "ready"
      and [s["action"] for s in guidance_of(out)["next_steps"]] == ["review_possible_match"], out)

# --- suggest only
db.expire_all()
before = (case_state.case_status_of(db.get(Report, g2.report_id)), case_state.priority_of(db.get(Report, g2.report_id)))
behaviour["answer"] = with_guidance({"next_steps": [{"action": "complete_follow_up", "reason": "Overdue."}], "missing": [], "draft_question": None, "recap": "r"})
make(db.get(Report, g2.report_id))
db.expire_all()
r_after = db.get(Report, g2.report_id)
check("SUGGEST ONLY: guidance changes nothing (status, priority, follow-ups)",
      (case_state.case_status_of(r_after), case_state.priority_of(r_after)) == before
      and db.query(CaseFollowUp).filter(CaseFollowUp.report_id == g2.report_id, CaseFollowUp.status == "pending").count() == 1)
behaviour["answer"] = None

print(f"\n{PASSED} checks passed.")
