"""
Server-side photo checks for report media.

One place for the AI-generated thresholds (used by /reports/analyze-media, /reports/validate-images and the
background re-checks) so the same photo gets the same verdict everywhere. Pet photos are not checked by Gemini:
pet registration uses only YOLO (analyze-media with purpose="pet").
"""
import json
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


def recommendation_for(verification_status: Optional[str]) -> str:
    """Staff recommendation matching a verdict (same wording as /reports/analyze-media), so a re-check never leaves
    an older recommendation next to a new status."""
    if verification_status == "authentic":
        return "Photo appears authentic."
    if verification_status in ("ai_generated", "uncertain"):
        return "Please verify the authenticity of the uploaded photo."
    if verification_status == "ineligible_subject":
        return "No dog or cat was detected in this photo. Staff should check the photo."
    return "Authenticity could not be checked because the AI service is offline. Staff should check the photo."


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
