"""
P2 (per-pet storage): a rescan doesn't call Gemini Vision again for a pair of photos it already compared, and
downloaded photos are kept on disk so later scans don't download them again.
Run from the backend folder:  python tests/test_vision_cache.py
"""
import io
import os
import sys
import tempfile

_TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP, 'vision_cache_test.db')}"
os.environ["AI_IMAGE_CACHE_DIR"] = os.path.join(_TMP, "images")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-vision-cache-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.ai_vision_comparison import AiVisionComparison  # noqa: E402
from app.utils import ai_matching  # noqa: E402

Base.metadata.create_all(bind=engine)
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


class Media:
    def __init__(self, url):
        self.file_url, self.media_type = url, "Image"


class Sighting:
    def __init__(self, url):
        self.media = [Media(url)]


class Pet:
    def __init__(self, url):
        self.photo_front_url, self.photo_url = url, None


gemini_calls = []
ai_matching.compare_animals_vision = lambda a, b, sm, cm: gemini_calls.append(1) or {"individual_similarity_score": 91, "final_assessment": "STRONG MATCH"}
ai_matching.fetch_image_for_entity = lambda entity, is_pet=False: Image.new("RGB", (10, 10))

db = SessionLocal()
src, pet = Sighting("https://cdn.example/sighting1.jpg"), Pet("https://cdn.example/kippy.jpg")
meta_s, meta_c = {"breed": "Aspin", "color": "Brown"}, {"breed": "Aspin", "color": "Brown"}
r1 = ai_matching.compare_animals_vision_cached(db, src, pet, True, meta_s, meta_c)
db.commit()
r2 = ai_matching.compare_animals_vision_cached(db, src, pet, True, meta_s, meta_c)
check("first scan asks Gemini", r1 and r1["individual_similarity_score"] == 91)
check("a rescan of the same pair reuses the stored result (no second Gemini call)", len(gemini_calls) == 1 and r2 == r1, (len(gemini_calls), r2))
check("the result is stored in ai_vision_comparisons", db.query(AiVisionComparison).count() == 1)

ai_matching.compare_animals_vision_cached(db, src, Pet("https://cdn.example/kippy-new-photo.jpg"), True, meta_s, meta_c)
check("a changed pet photo is compared again", len(gemini_calls) == 2, len(gemini_calls))
ai_matching.compare_animals_vision_cached(db, src, pet, True, meta_s, {"breed": "Shih Tzu", "color": "White"})
check("changed pet details are compared again", len(gemini_calls) == 3, len(gemini_calls))
ai_matching.compare_animals_vision_cached(db, Sighting("https://cdn.example/sighting2.jpg"), pet, True, meta_s, meta_c)
check("a different sighting photo is compared", len(gemini_calls) == 4, len(gemini_calls))

ai_matching.compare_animals_vision = lambda *a: gemini_calls.append(1) or None
before = db.query(AiVisionComparison).count()
ai_matching.compare_animals_vision_cached(db, Sighting("https://cdn.example/sighting3.jpg"), pet, True, meta_s, meta_c)
check("a failed Gemini comparison is not stored (it will be tried again)", db.query(AiVisionComparison).count() == before)
check("no photo -> no comparison", ai_matching.compare_animals_vision_cached(db, Sighting(None), pet, True, meta_s, meta_c) is None)
db.close()

# Disk copy of downloaded photos
downloads = []
buf = io.BytesIO()
Image.new("RGB", (1600, 1200), (120, 80, 40)).save(buf, "JPEG")
PHOTO = buf.getvalue()


class FakeResp:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return PHOTO


ai_matching.urllib.request.urlopen = lambda req, timeout=10: downloads.append(req.full_url) or FakeResp()
img1 = ai_matching._load_image("https://cdn.example/kippy.jpg")
img2 = ai_matching._load_image("https://cdn.example/kippy.jpg")
check("a photo is downloaded once, later scans use the disk copy", len(downloads) == 1 and img2 is not None, downloads)
check("the disk copy is resized (max 1024 px)", max(img2.size) <= 1024 and img1.size == img2.size, img2.size)
check("a different photo is downloaded", ai_matching._load_image("https://cdn.example/other.jpg") is not None and len(downloads) == 2)
old = os.path.join(ai_matching.IMAGE_CACHE_DIR, os.listdir(ai_matching.IMAGE_CACHE_DIR)[0])
os.utime(old, (0, 0))
check("photo copies older than 30 days are cleaned up", ai_matching.clean_image_cache() == 1 and not os.path.exists(old))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
