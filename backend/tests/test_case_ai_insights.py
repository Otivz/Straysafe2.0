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

# ===================================================================================== NOT FOR LOST PET
lost = mk("lost_pet", description="My dog is missing.")
_lp = client.post(f"/cases/{lost.report_id}/ai-insights", headers=H(leader))
check("a Lost Pet report gets no insight (not_applicable), Gemini untouched", _lp.json().get("status") == "not_applicable" and len(calls) == n, _lp.text + str(lost.category_id))

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

print(f"\n{PASSED} checks passed.")
