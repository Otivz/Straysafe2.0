"""
V2 (AI accuracy plan): confidence scores where they apply.
- YOLOv8: the box confidence of the dog/cat found is stored per photo, per report (best photo) and per pet photo
- Gemini: its own confidence per suggested field (high / medium / low) is stored; anything else counts as "not measured"
- confidences are set by the AI only: a client can't send them
Run from the backend folder:  python tests/test_ai_confidence.py
"""
import io
import json
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "ai_confidence_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ai-confidence-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportMedia  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import pets, reports  # noqa: E402
from app.schemas.pet import PetCreate  # noqa: E402
from app.schemas.report import ReportCreate  # noqa: E402
from app.utils import ai_pipeline, ai_suggestions, photo_checks  # noqa: E402
from app.utils.video_processing import analyze_video_frames  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
u = User(name="Res", email="r@test-mail.com", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
db.add(u)
db.flush()
rep = Report(user_id=u.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=1,
             animal_type="Dog", description="brown dog", ai_suggested_risk_level="Low")
db.add(rep)
db.commit()
RID = rep.report_id
db.close()
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


# --- a fake YOLO that returns given (label, confidence) detections -----------------------------------------------
class Box(list):
    def tolist(self):
        return list(self)


class Result:
    def __init__(self, dets):
        self.names = {0: "dog", 1: "cat", 2: "person"}
        ids = {"dog": 0, "cat": 1, "person": 2}
        self.boxes = type("B", (), {})()
        self.boxes.cls = [ids[l] for l, _ in dets]
        self.boxes.xyxy = [Box([10.0, 10.0, 150.0, 120.0]) for _ in dets]
        self.boxes.conf = [c for _, c in dets]


def fake_yolo(dets):
    return lambda *a, **k: [Result(dets)]


def photo(rgb):
    buf = io.BytesIO()
    Image.new("RGB", (200, 160), rgb).save(buf, "JPEG")
    return buf.getvalue()


photo_checks.check_animal_photo = lambda img: None  # Gemini photo check off in tests
ai_pipeline.queue_follow_up = getattr(ai_pipeline, "queue_follow_up", None)

# --- YOLO: videos report the confidence of the chosen frame --------------------------------------------------------
frames = [Image.new("RGB", (200, 160), (120, 80, 40)) for _ in range(2)]
confs = []
analyze_video_frames(frames, fake_yolo([("dog", 0.82), ("person", 0.99)]), conf_out=confs)
check("video: the chosen frame's dog/cat confidences are returned (people ignored)", confs and max(confs) == 0.82, confs)
check("video: the old call (without conf_out) still works", analyze_video_frames(frames, fake_yolo([("dog", 0.5)]))[1] == ["Dog"])


def media(url):
    s = SessionLocal()
    m = ReportMedia(report_id=RID, file_url=url, media_type="Image")
    s.add(m)
    s.commit()
    mid = m.media_id
    s.close()
    return mid


def run(dets, rgb, url):
    reports.get_yolo_model = lambda: fake_yolo(dets)
    mid = media(url)
    reports.process_report_media_ai(RID, mid, url, photo(rgb), cached={})
    s = SessionLocal()
    m, r = s.get(ReportMedia, mid), s.get(Report, RID)
    out = (float(m.ai_detection_confidence) if m.ai_detection_confidence is not None else None,
           float(r.ai_detection_confidence) if r.ai_detection_confidence is not None else None)
    s.close()
    return out


# --- YOLO: report photos --------------------------------------------------------------------------------------------
m1, r1 = run([("dog", 0.873), ("dog", 0.41)], (140, 90, 40), "https://cdn.example/a.jpg")
check("photo: the best dog/cat box confidence is stored on the photo", m1 == 0.873, m1)
check("photo: ...and on the report", r1 == 0.873, r1)
m2, r2 = run([("dog", 0.52)], (130, 85, 45), "https://cdn.example/b.jpg")
check("a weaker second photo keeps its own value, the report keeps its best photo", m2 == 0.52 and r2 == 0.873, (m2, r2))
m3, r3 = run([("person", 0.95)], (90, 90, 90), "https://cdn.example/c.jpg")
check("no dog/cat found: 'not measured' (None), never 0%", m3 is None and r3 == 0.873, (m3, r3))

# --- YOLO: the form's cached detection carries its confidence into the saved photo ---------------------------------
reports.get_yolo_model = lambda: fake_yolo([])  # must not be needed
cached_photo = photo((150, 100, 50))
ai_pipeline.remember_yolo(cached_photo, ["Dog"], [[20.0, 20.0, 180.0, 140.0]], [0.91])
mid = media("https://cdn.example/d.jpg")
reports.process_report_media_ai(RID, mid, "https://cdn.example/d.jpg", cached_photo)
s = SessionLocal()
check("a photo analysed in the report form keeps the form's YOLO confidence", float(s.get(ReportMedia, mid).ai_detection_confidence) == 0.91)
s.close()

# --- YOLO: pet photos -----------------------------------------------------------------------------------------------
pets.get_yolo_model = lambda: fake_yolo([("cat", 0.66)])
s = SessionLocal()
p = Pet(pet_name="Ming", pet_type="Cat", status="Active")
s.add(p)
s.commit()
pets.auto_extract_pet_colors(photo((200, 200, 200)), "ming.jpg", p)
s.commit()
check("pet photo: YOLO's confidence in the animal is stored on the pet", float(p.ai_detection_confidence) == 0.66, p.ai_detection_confidence)
s.close()

# --- Gemini: confidence per suggested field --------------------------------------------------------------------------
check("field confidence keeps only high / medium / low",
      ai_suggestions.clean_field_confidence({"breed": "LOW", "size": "medium", "color": "93%", "risk": "", "junk": "high"}) == {"breed": "low", "size": "medium"})
check("anything that isn't an object means 'not measured'", ai_suggestions.clean_field_confidence("high") is None
      and ai_suggestions.clean_field_confidence({"breed": "sure"}) is None)

answer = {"ai_animal_type": "Dog", "ai_dominant_color": "Brown", "ai_estimated_size": "Medium", "ai_suggested_risk_level": "Low Risk",
          "ai_suggested_priority": "Low Priority", "ai_possible_breed": "Aspin", "ai_suggested_priority_reason": "calm dog",
          "ai_field_confidence": {"animal_type": "high", "breed": "low", "size": "medium"}}
ai_suggestions.is_gemini_enabled_in_db = lambda db=None: True
os.environ["GEMINI_API_KEY"] = "test-key"
prompts = []
ai_suggestions.call_gemini_with_fallback = lambda prompt, generation_config=None: (prompts.append(prompt) or type("R", (), {"text": json.dumps(answer)})())
s_out = ai_suggestions.generate_ai_suggestions(description="brown dog sleeping", category_name="Stray")
check("Gemini is asked for its confidence per field", prompts and "ai_field_confidence" in prompts[0])
check("Gemini's per-field confidence is returned with the suggestions",
      s_out.get("ai_field_confidence") == {"animal_type": "high", "breed": "low", "size": "medium"}, s_out.get("ai_field_confidence"))
ai_suggestions.is_gemini_enabled_in_db = lambda db=None: False
check("rule-based fallback (Gemini off): no confidence, shown as 'not measured'",
      ai_suggestions.generate_ai_suggestions(description="brown dog").get("ai_field_confidence") is None)

# The follow-up job stores it on the report
s = SessionLocal()
r = s.get(Report, RID)
ai_suggestions.is_gemini_enabled_in_db = lambda db=None: True
ai_pipeline._refresh_suggestions(r, {"animal_type": "Dog"})
s.commit()
s.expire_all()
check("the report keeps Gemini's per-field confidence", s.get(Report, RID).ai_description_confidence == {"animal_type": "high", "breed": "low", "size": "medium"})
s.close()

# --- The 0.35 minimum is applied on every YOLO call (setting model.overrides alone was ignored by ultralytics) ---------
from app.utils import model_loader  # noqa: E402
seen = []
wrapped = model_loader._YoloWithThreshold(type("M", (), {"names": {0: "dog"}, "__call__": lambda self, *a, **k: seen.append(k) or []})())
wrapped("photo.jpg")
wrapped("photo.jpg", conf=0.5)
check("YOLO is always called with the 0.35 minimum confidence", seen[0].get("conf") == model_loader.YOLO_MIN_CONFIDENCE == 0.35)
check("...unless a caller asks for another one, and the model's attributes still work", seen[1].get("conf") == 0.5 and wrapped.names == {0: "dog"})

# --- Confidences are set by the AI only ----------------------------------------------------------------------------
check("a client can't send a detection or description confidence with a new report",
      "ai_detection_confidence" not in ReportCreate.model_fields and "ai_description_confidence" not in ReportCreate.model_fields)
check("...or with a new pet", "ai_detection_confidence" not in PetCreate.model_fields)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
