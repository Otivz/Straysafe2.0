"""
Server-side photo checks shared by report media and pet photos.

One place for the AI-generated thresholds (used by /reports/analyze-media, /reports/validate-images and the
background re-checks) so the same photo gets the same verdict everywhere.
"""
import io
import json
import urllib.request
from typing import Any, Dict, Optional, Tuple

from PIL import Image

# Gemini "ai_generation_confidence" (0..1)
AI_GENERATED_MIN = 0.60   # at or above -> treated as AI-generated (blocked in the upload forms)
AI_UNCERTAIN_MIN = 0.36   # between this and AI_GENERATED_MIN -> uncertain
# (below AI_UNCERTAIN_MIN -> likely authentic)

STATUS_NOT_CHECKED = "not_checked"


def classify_ai_confidence(conf: Optional[float]) -> Tuple[str, str]:
    """(verification_status, human label) for an AI-generation confidence."""
    if conf is None:
        return STATUS_NOT_CHECKED, "Authenticity not checked (AI offline)"
    if conf >= AI_GENERATED_MIN:
        return "ai_generated", "Potentially AI-generated"
    if conf >= AI_UNCERTAIN_MIN:
        return "uncertain", "Uncertain"
    return "authentic", "Likely Authentic"


def load_image(url: str, timeout: int = 15) -> Optional[Image.Image]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "StraySafe/2.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            img = Image.open(io.BytesIO(resp.read())).convert("RGB")
        img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        return img
    except Exception as e:
        print(f"[Photo check] could not load {url}: {e}")
        return None


PET_PHOTO_FIELDS = ("photo_url", "photo_front_url", "photo_left_url", "photo_right_url")
_SEVERITY = {"ineligible_subject": 4, "ai_generated": 3, "uncertain": 2, STATUS_NOT_CHECKED: 1, "authentic": 0}


def pet_photo_urls(pet: Any) -> Tuple[str, ...]:
    return tuple(u for u in (getattr(pet, f, None) for f in PET_PHOTO_FIELDS) if u)


def recheck_pet_photos(pet_id: int) -> None:
    """
    Background job: check every photo of a pet record (main + front/left/right) on the server and store the
    worst verdict on the pet. Pet photos are what look-alike matching compares against, so a fake or
    non-animal photo is flagged for staff instead of trusting the browser's check.
    """
    from app.database import SessionLocal
    from app.models.pet import Pet
    from app.models.pet_history import PetHistory

    db = SessionLocal()
    try:
        pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
        if not pet:
            return
        worst: Optional[Dict[str, Any]] = None
        worst_field = None
        for field in PET_PHOTO_FIELDS:
            url = getattr(pet, field, None)
            if not url:
                continue
            img = load_image(url)
            res = check_animal_photo(img) if img is not None else None
            if res is None:
                res = {"verification_status": STATUS_NOT_CHECKED, "label": classify_ai_confidence(None)[1], "details": ""}
            if worst is None or _SEVERITY[res["verification_status"]] > _SEVERITY[worst["verification_status"]]:
                worst, worst_field = res, field
        if worst is None:
            pet.photo_check_status = None
            pet.photo_check_details = None
        else:
            prev = pet.photo_check_status
            pet.photo_check_status = worst["verification_status"]
            which = {"photo_url": "main", "photo_front_url": "front", "photo_left_url": "left side",
                     "photo_right_url": "right side"}.get(worst_field or "", "")
            pet.photo_check_details = (f"{worst['label']} ({which} photo). {worst.get('details') or ''}").strip()[:1000]
            if worst["verification_status"] in ("ai_generated", "ineligible_subject") and prev != worst["verification_status"]:
                db.add(PetHistory(
                    pet_id=pet.pet_id,
                    event_type="PHOTO_FLAGGED",
                    title="Pet Photo Flagged by AI Check",
                    description=pet.photo_check_details,
                    actor_name="StraySafe AI",
                    actor_role="System",
                ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Photo check] pet #{pet_id} recheck failed: {e}")
    finally:
        db.close()


def check_animal_photo(img: Image.Image) -> Optional[Dict[str, Any]]:
    """
    Gemini authenticity + species check of one photo.
    Returns None when Gemini is off / unavailable (callers must then report STATUS_NOT_CHECKED, never "authentic").
    """
    from app.utils.ai_suggestions import call_gemini_with_fallback, is_gemini_enabled_in_db
    if not is_gemini_enabled_in_db():
        return None
    prompt = """
    You are a digital image forensics inspector for an animal welfare platform. Inspect the photo and answer:
    1. Is it AI-generated or synthetic (airbrushed fur, glassy eyes, malformed paws/whiskers, impossible lighting)?
       Give ai_generation_confidence 0.0-1.0 (0.0 = clearly a real camera photo, 1.0 = clearly AI-generated).
    2. Does it clearly show a real dog or cat? animal_type must be "Dog", "Cat", or "None".
    Respond ONLY with JSON:
    {"ai_generation_confidence": <number>, "animal_detected": <bool>, "animal_type": "Dog"|"Cat"|"None",
     "details": "<one short sentence on what you saw>"}
    """
    try:
        res = call_gemini_with_fallback([prompt, img], generation_config={"response_mime_type": "application/json"})
        text = (getattr(res, "text", "") or "").strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:-1])
        data = json.loads(text)
        conf = float(data.get("ai_generation_confidence"))
    except Exception as e:
        print(f"[Photo check] Gemini check failed: {e}")
        return None
    conf = max(0.0, min(1.0, conf))
    v_status, label = classify_ai_confidence(conf)
    animal_type = str(data.get("animal_type") or "None").strip().capitalize()
    is_animal = bool(data.get("animal_detected")) and animal_type in ("Dog", "Cat")
    if not is_animal:
        v_status, label = "ineligible_subject", "No dog or cat detected"
    return {
        "verification_status": v_status,
        "label": label,
        "ai_photo_likelihood": round(conf * 100, 1),
        "animal_type": animal_type if is_animal else None,
        "details": str(data.get("details") or "")[:500],
    }
