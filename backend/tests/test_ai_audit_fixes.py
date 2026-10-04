"""
Fixes from audit report and remediation/AI_MATCHING_DUPLICATES_PET_SCAN_AUDIT.md (F1-F14).
Throwaway SQLite DB, real JWT auth, Gemini stubbed.  Run from the backend folder:  python tests/test_ai_audit_fixes.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "ai_audit_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ai-audit-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
import app.routes.matches as matches_mod  # noqa: E402
import app.utils.ai_matching as ai_matching  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.photo_checks import classify_ai_confidence  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(matches.router)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="Sta. Maria, Bulacan"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"))
for sid in (1, 2, 4, 9, 11, 12, 18):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@t.com", password="x", role_id=role_id,
             is_verified=True, status="Active", phone="0917", address="Secret St.", **kw)
    db.add(u)
    db.flush()
    return u


reporter = mk_user("Reporter", 1, subdivision_id=1, barangay_id=1)
owner = mk_user("Owner", 1, subdivision_id=1, barangay_id=1)
stranger = mk_user("Stranger", 1, subdivision_id=1, barangay_id=1)
leader1 = mk_user("Leader One", 2, subdivision_id=1, barangay_id=1)
leader2 = mk_user("Leader Two", 2, subdivision_id=2, barangay_id=1)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


# Gemini off for scoring tests unless a test turns it on
matches_mod.is_gemini_vision_enabled = lambda db=None: False


def mk_report(**kw):
    base = dict(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.80, longitude=121.00,
                current_status_id=2, animal_type="Dog")
    base.update(kw)
    r = Report(**base)
    db.add(r)
    db.commit()
    return r


# ── F1: match records need login, are scoped, and are redacted for residents ──
rep = mk_report(animal_breed="Siberian Husky", animal_color="Gray White", ai_coat_pattern="Bicolor", estimated_size="Large",
                description="husky with white socks and blue collar")
pet = Pet(pet_name="Snow", pet_type="Dog", owner_id=owner.user_id, status="Active", breed="Siberian Husky",
          primary_color="Gray", secondary_color="White", color_markings="Bicolor", size_category="Large",
          photo_url="https://x/snow.jpg", registered_address="Owner Home Address", emergency_contact_phone="0999",
          distinctive_markings="white socks collar")
db.add(pet)
db.commit()
m = ReportMatch(source_report_id=rep.report_id, matched_pet_id=pet.pet_id, similarity_score=80, status="AI_SUGGESTED")
db.add(m)
db.commit()

for path in ("/matches/", "/matches/duplicates", f"/matches/duplicates/report/{rep.report_id}", f"/matches/{m.match_id}",
             f"/matches/report/{rep.report_id}", "/matches/settings"):
    check(f"F1 anonymous GET {path} is refused", client.get(path).status_code == 401)
check("F1 residents cannot list all matches", client.get("/matches/", headers=H(reporter)).status_code == 403)
check("F1 leader of the subdivision sees the match", len(client.get("/matches/", headers=H(leader1)).json()) == 1)
check("F1 leader of another subdivision sees none", client.get("/matches/", headers=H(leader2)).json() == [])
r_rep = client.get(f"/matches/report/{rep.report_id}", headers=H(reporter)).json()
check("F1 reporter sees the match on their report", len(r_rep) == 1)
p = r_rep[0]["matched_pet"] if r_rep else {}
check("F1 reporter does NOT get the pet owner's address / emergency phone / contact",
      p.get("registered_address") is None and p.get("emergency_contact_phone") is None
      and (p.get("owner") or {}).get("phone") is None and (p.get("owner") or {}).get("address") is None, str(p)[:200])
r_own = client.get(f"/matches/report/{rep.report_id}", headers=H(owner)).json()
check("F1 the pet owner still sees their own pet's details", r_own and r_own[0]["matched_pet"]["registered_address"] == "Owner Home Address")
check("F1 an unrelated resident sees nothing", client.get(f"/matches/report/{rep.report_id}", headers=H(stranger)).json() == [])
check("F1 single match is hidden from an unrelated resident", client.get(f"/matches/{m.match_id}", headers=H(stranger)).status_code == 404)

# ── F2 / create-report: login required ──────────────────────────────────────
check("F2 analyze-media refuses anonymous callers",
      client.post("/reports/analyze-media", files={"file": ("a.jpg", b"x", "image/jpeg")}).status_code == 401)
check("F2 validate-images refuses anonymous callers",
      client.post("/reports/validate-images", files=[("files", ("a.jpg", b"x", "image/jpeg"))]).status_code == 401)
check("report creation refuses anonymous callers",
      client.post("/reports/", json={"latitude": 14.8, "longitude": 121.0, "description": "dog"}).status_code == 401)
big = b"\xff\xd8" + b"0" * (10 * 1024 * 1024 + 10)
check("F2 analyze-media rejects files over 10 MB",
      client.post("/reports/analyze-media", files={"file": ("big.jpg", big, "image/jpeg")}, headers=H(reporter)).status_code == 413)

# ── F6 / F4: one threshold table; offline = not checked ─────────────────────
check("F6 0.60+ is AI-generated, 0.36-0.59 uncertain, below authentic",
      classify_ai_confidence(0.60)[0] == "ai_generated" and classify_ai_confidence(0.59)[0] == "uncertain"
      and classify_ai_confidence(0.36)[0] == "uncertain" and classify_ai_confidence(0.35)[0] == "authentic")
check("F4 no AI result is 'not_checked', never 'authentic'", classify_ai_confidence(None)[0] == "not_checked")

# ── F8: missing attributes earn no points ───────────────────────────────────
blank_a = mk_report(animal_type="Dog")
blank_b = mk_report(animal_type="Dog")
calc = matches_mod.calculate_match_details(blank_a, blank_b, is_pet=False, db=db)
check("F8 two reports with nothing recorded do not look alike (score <= 20)", calc["score"] <= 20, calc["score"])
check("F8 breed badge says 'Not recorded' instead of a fake 'Same Breed'",
      any(a.get("match_status") == "Not recorded" for a in calc["evidence"].get("closest_attributes", [])))
good = matches_mod.calculate_match_details(rep, pet, is_pet=True, db=db)
check("F8 a genuinely similar pair still scores as a potential match", good["score"] >= 50, good["score"])
check("F13 the evidence records which engine scored it", good["evidence"].get("engine") == "rules")

# ── F7: Gemini answer without a score is ignored (rules used) ───────────────
class _Resp:
    text = '{"final_assessment": "STRONG MATCH", "reason": "x"}'


ai_matching.call_gemini_with_fallback = lambda *a, **k: _Resp()
import app.utils.ai_suggestions as ai_sugg  # noqa: E402
ai_sugg.is_gemini_enabled_in_db = lambda db=None: True
img = Image.new("RGB", (20, 20))
check("F7 a Gemini answer with no score returns None (falls back to rules)",
      ai_matching.compare_animals_vision(img, img, {}, {}) is None)


class _Resp2:
    text = '{"individual_similarity_score": 88, "final_assessment": "STRONG MATCH", "reason": "same face"}'
    _straysafe_model = "gemini-flash-latest"


ai_matching.call_gemini_with_fallback = lambda *a, **k: _Resp2()
v = ai_matching.compare_animals_vision(img, img, {}, {})
check("F13 the Gemini model name is kept with the result", v and v["_model"] == "gemini-flash-latest" and v["individual_similarity_score"] == 88)

# ── F5: Gemini Vision is only called for the top candidates ─────────────────
vision_calls = []
matches_mod.is_gemini_vision_enabled = lambda db=None: True
matches_mod.fetch_image_for_entity = lambda e, is_pet=False: img
matches_mod.compare_animals_vision = lambda *a, **k: vision_calls.append(1) or {"individual_similarity_score": 10, "final_assessment": "NOT A MATCH"}
many = []
for i in range(25):
    many.append(Pet(pet_name=f"Dog{i}", pet_type="Dog", status="Active", photo_url=f"https://x/{i}.jpg", breed="Aspin"))
db.add_all(many)
db.commit()
scan_rep = mk_report(animal_breed="Aspin", animal_color="Brown")
matches_mod.scan_and_generate_matches_for_report(scan_rep.report_id, db)
# cap applies per pass (registered pets, then duplicate reports)
check(f"F5 a scan over {len(many) + 1} pets calls Gemini Vision at most {matches_mod.VISION_CANDIDATES_PER_SCAN} times per pass",
      0 < len(vision_calls) <= 2 * matches_mod.VISION_CANDIDATES_PER_SCAN and len(vision_calls) < len(many), len(vision_calls))
matches_mod.is_gemini_vision_enabled = lambda db=None: False

# ── F9: a report whose species is not identified yet is still checked for duplicates ──
d1 = mk_report(animal_type="Dog", animal_breed="Shih Tzu", animal_color="White Brown", ai_coat_pattern="Bicolor",
               estimated_size="Small", description="shih tzu with pink collar and white socks")
d2 = mk_report(animal_type="Unknown", animal_breed="Shih Tzu", animal_color="White Brown", ai_coat_pattern="Bicolor",
               estimated_size="Small", description="small shih tzu, pink collar, white socks", latitude=14.8005)
matches_mod.scan_and_generate_matches_for_report(d1.report_id, db)
dup = db.query(ReportMatch).filter(ReportMatch.source_report_id == d1.report_id, ReportMatch.matched_report_id == d2.report_id).first()
check("F9 a Dog report and an Unknown-species report are compared and flagged as a duplicate", dup is not None)

print(f"\n{sum(results)}/{len(results)} AI audit checks passed")
sys.exit(0 if all(results) else 1)
