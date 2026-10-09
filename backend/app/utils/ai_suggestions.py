from typing import Optional, Dict, Any
import re
import os
import json

# Fast/cheap models only; "pro" models are deliberately not used as an automatic fallback (slow + costly).
# Tried in order. A model that errors, is rate limited, or doesn't answer in time is skipped for the next one.
AVAILABLE_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
]

GEMINI_SETTING_KEY = "gemini_vision_matching"
_SETTING_TTL_SECONDS = 5.0
_setting_cache: Dict[str, Any] = {"value": None, "at": 0.0}


def invalidate_gemini_setting_cache() -> None:
    _setting_cache["value"] = None


def is_gemini_enabled_in_db(db: Optional[Any] = None) -> bool:
    """
    Whether the Admin has Google Gemini turned ON (Admin Settings). The one check used everywhere.
    - Cached for 5 s, and cleared as soon as the setting row is saved, so a switch takes effect immediately.
    - Fails CLOSED: if the setting can't be read, Gemini is treated as OFF and the local (YOLO / rule-based)
      results are used. An Admin "OFF" is never ignored because of a database error.
    - No setting row yet (fresh install): ON, the default seeded at startup.
    """
    import time
    cached = _setting_cache["value"]
    if cached is not None and time.monotonic() - _setting_cache["at"] < _SETTING_TTL_SECONDS:
        return cached
    try:
        from app.models.system_setting import SystemSetting
        if db is not None:
            setting = db.query(SystemSetting).filter(SystemSetting.setting_key == GEMINI_SETTING_KEY).first()
        else:
            from app.database import SessionLocal
            with SessionLocal() as session:
                setting = session.query(SystemSetting).filter(SystemSetting.setting_key == GEMINI_SETTING_KEY).first()
        value = True if setting is None else bool(setting.is_enabled)
    except Exception as e:
        print(f"[Gemini] Could not read the Gemini ON/OFF setting, treating it as OFF: {e}")
        return False
    _setting_cache["value"], _setting_cache["at"] = value, time.monotonic()
    return value


def _register_setting_invalidation() -> None:
    from sqlalchemy import event
    from app.models.system_setting import SystemSetting

    def _changed(mapper, connection, target):
        if getattr(target, "setting_key", None) == GEMINI_SETTING_KEY:
            invalidate_gemini_setting_cache()

    for evt in ("after_insert", "after_update", "after_delete"):
        event.listen(SystemSetting, evt, _changed)


_register_setting_invalidation()


# A Gemini call that doesn't answer in time is abandoned and the rule-based result is used instead.
GEMINI_TIMEOUT_SECONDS = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "15"))
GEMINI_TOTAL_BUDGET_SECONDS = float(os.getenv("GEMINI_TOTAL_BUDGET_SECONDS", "35"))


class GeminiResponse:
    """What callers get back: the answer text, which model gave it, and the SDK's raw response."""

    def __init__(self, text: str, model: str, raw: Any = None):
        self.text = text
        self.model = model
        self._straysafe_model = model
        self.raw = raw


_client_cache: Dict[str, Any] = {}


def _gemini_client(api_key: str, timeout_seconds: float):
    """One google-genai client per (key, timeout); the SDK takes the timeout in milliseconds."""
    from google import genai
    from google.genai import types
    key = f"{api_key[-6:]}:{int(timeout_seconds * 1000)}"
    client = _client_cache.get(key)
    if client is None:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)))
        _client_cache[key] = client
    return client


def _should_try_next_model(e: Exception) -> bool:
    """Rate limited, model gone, overloaded or too slow: try the next model instead of failing the analysis."""
    from google.genai import errors
    if isinstance(e, TimeoutError) or "timeout" in type(e).__name__.lower():  # e.g. httpx ConnectTimeout/ReadTimeout
        return True
    if isinstance(e, errors.APIError) and getattr(e, "code", None) in (404, 408, 429, 499, 500, 503, 504):
        return True
    err = str(e)
    low = err.lower()
    return ("timed out" in low or "timeout" in low or "deadline" in low or "quota" in low or "rate limit" in low
            or any(code in err for code in ("429", "404", "503", "504")))


def call_gemini_with_fallback(contents: Any, generation_config: Optional[Dict[str, Any]] = None) -> GeminiResponse:
    """
    One Gemini request through the google-genai SDK, with model fallback and time limits.
    - Refuses to call Google when the Admin has Gemini turned OFF.
    - Tries AVAILABLE_GEMINI_MODELS in order; a model that is rate limited, gone, overloaded or doesn't answer within
      GEMINI_TIMEOUT_SECONDS is skipped for the next one, all within GEMINI_TOTAL_BUDGET_SECONDS.
    - contents: a prompt string, or a list of prompt strings and PIL images.
    """
    if not is_gemini_enabled_in_db():
        raise RuntimeError("Google Gemini API is currently disabled in Admin Settings (Text-Based Mode Active).")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not configured.")

    from google.genai import types
    import time
    config = types.GenerateContentConfig(**generation_config) if generation_config else None
    deadline = time.monotonic() + GEMINI_TOTAL_BUDGET_SECONDS
    last_exception: Optional[Exception] = None
    for model_name in AVAILABLE_GEMINI_MODELS:
        remaining = deadline - time.monotonic()
        if remaining < 3:
            last_exception = TimeoutError(f"Gemini did not answer within {GEMINI_TOTAL_BUDGET_SECONDS:.0f}s.")
            break
        try:
            client = _gemini_client(api_key, min(GEMINI_TIMEOUT_SECONDS, remaining))
            raw = client.models.generate_content(model=model_name, contents=contents, config=config)
            text = getattr(raw, "text", None)
            if text:
                return GeminiResponse(text, model_name, raw)
            last_exception = RuntimeError(f"Model '{model_name}' returned an empty response.")
        except Exception as e:
            last_exception = e
            if _should_try_next_model(e):
                print(f"[Gemini Fallback] Model '{model_name}' unavailable ({str(e)[:80]}). Trying next model...")
                continue
            raise

    if last_exception:
        raise last_exception
    raise RuntimeError("All Gemini models failed to return a response.")


CONFIDENCE_FIELDS = ("animal_type", "color", "size", "coat_pattern", "breed", "risk", "behavior")


def clean_field_confidence(raw: Any) -> Optional[Dict[str, str]]:
    """Gemini's per-field confidence, kept only as high / medium / low. Anything else is dropped (= not measured)."""
    if not isinstance(raw, dict):
        return None
    out = {}
    for k in CONFIDENCE_FIELDS:
        v = str(raw.get(k) or "").strip().lower()
        if v in ("high", "medium", "low"):
            out[k] = v
    return out or None


def generate_ai_suggestions(
    description: Optional[str] = "",
    category_name: Optional[str] = "",
    media_animal_type: Optional[str] = None,
    media_dominant_color: Optional[str] = None,
    media_estimated_size: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate AI suggestions based on report text and media metadata.
    Checks Admin Gemini setting: if disabled, directly executes rule-based text parser without Gemini API calls.
    """
    if is_gemini_enabled_in_db() and os.getenv("GEMINI_API_KEY"):
        try:
            prompt = f"""
            You are the StraySafe Copilot, an expert AI safety and animal behavior analyzer for a subdivision's stray animal reporting and incident management system.

            Analyze the following report information:
            - User Description: "{description}"
            - Category: "{category_name}"
            - YOLOv8 Visual Detections (if any):
                * Animal Type: {media_animal_type}
                * Dominant Color: {media_dominant_color}
                * Estimated Size: {media_estimated_size}

            ### CRITICAL RULE: WHOLE DESCRIPTION CONTEXTUAL UNDERSTANDING
            You MUST analyze the entire description as a complete narrative context rather than relying on keyword matching in isolation.
            Never classify an incident based solely on the appearance of isolated words like "bite", "nangagat", "nakakagat", "chased", "attack", or "sugat".
            
            You must evaluate:
            1. Complete sentence semantics, including preceding and succeeding sentences.
            2. Negations in English, Tagalog, and Taglish (e.g., "hindi naman nangagat", "wala namang kinagat", "never bit anyone", "hindi nanunugod", "di naman nanghahabol").
            3. Tense, timing, and hypothetical vs actual events:
               - Near-miss / Attempted: "muntikan na akong makagat pero hindi ako natamaan" -> Attempted Bite: true, Actual Bite: false, Injury: false.
               - Actual bite without wound: "talagang nakagat siya pero walang sugat" -> Actual Bite: true, Attempted Bite: false, Injury: false.
               - General calm statement: "madalas lumapit pero hindi naman nangagat kahit kailan" -> Actual Bite: false, Attempted Bite: false, Aggressive: false.
            4. Actual Animal Action vs Human Fear: Distinguish between an animal running past vs actively chasing; an animal approaching friendly vs lunging.
            5. Injury / Harm: Check if the text states an injury occurred or explicitly confirms no injury/wound.

            Output a valid JSON object with the following fields:
            1. "ai_animal_type": "Dog", "Cat", or "Unknown". Prefer media_animal_type if provided, otherwise infer accurately from user description.
            2. "ai_dominant_color": Dominant color or colors (e.g. "Brown", "Black, White"). Prefer visual detection if provided, otherwise infer from description.
            3. "ai_estimated_size": "Small", "Medium", "Large", or "Unknown". For cats, default to "Small".
            4. "ai_coat_pattern": "Solid", "Bicolor", "Tricolor", "Tabby", "Calico", "Tortoiseshell", "Striped", "Spotted", "Brindle", "Merle", "Patched", or "Unknown".
            5. "ai_suggested_risk_level": "Low Risk", "Medium Risk", or "High Risk".
               - High Risk: Verified actual bite, aggressive attacks, foaming/rabies symptoms, or severe animal trauma.
               - Medium Risk: Nuisance behaviors (chasing vehicles/children, barking packs, near-miss snapping, sickly condition).
               - Low Risk: Calm, non-aggressive, healthy or resting stray.
            6. "ai_suggested_priority": "Low Priority", "Medium Priority", or "High Priority".
            7. "ai_possible_breed": Likely breed (e.g., "Aspin", "Puspin", "Golden Retriever", "Siamese"). Default "Puspin" for cats, "Aspin" for dogs.
            8. "ai_suggested_priority_reason": A concise, clear reason (1-2 sentences) explaining the priority classification based strictly on facts in the report.
            9. "ai_behavior_chasing": boolean (true if the animal actively chased people, kids, or vehicles; false otherwise).
            10. "ai_behavior_attempted_bite": boolean (true if the animal lunged or almost bit someone without physical tooth contact; false otherwise).
            11. "ai_behavior_actual_bite": boolean (true if an actual physical bite occurred; false otherwise).
            12. "ai_behavior_injury": boolean (true if a human or animal was wounded/injured/bled; false if no injury occurred or explicitly negated).
            13. "ai_behavior_aggressive": boolean (true if displaying hostile/aggressive temperament like biting, attacking, snarling; false if calm, playful, or negated).
            14. "ai_behavior_explanation": string (A concise 1-2 sentence explanation for subdivision/barangay staff detailing what behavioral events were identified and why, explicitly highlighting any near-misses, actual bites, or negations).
            15. "ai_field_confidence": an object with your honest confidence in fields 1-13, each "high", "medium" or "low":
                {{"animal_type": ..., "color": ..., "size": ..., "coat_pattern": ..., "breed": ..., "risk": ..., "behavior": ...}}
                - "high": clearly stated in the description or clearly given by the visual detection.
                - "medium": a reasonable inference.
                - "low": a guess or a default (e.g. a default breed, size not mentioned, an unclear photo).

            Respond ONLY with a valid JSON block.
            """
            
            response = call_gemini_with_fallback(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            if not response or not getattr(response, "text", None):
                raise ValueError("Gemini API returned an empty or invalid response.")

            text_resp = response.text.strip()
            # Handle markdown code blocks
            if text_resp.startswith("```"):
                lines = text_resp.split("\n")
                if lines[0].startswith("```json"):
                    text_resp = "\n".join(lines[1:-1])
                elif lines[0].startswith("```"):
                    text_resp = "\n".join(lines[1:-1])
                    
            data = json.loads(text_resp)
            
            # Basic validation
            required_keys = ["ai_animal_type", "ai_dominant_color", "ai_estimated_size", "ai_suggested_risk_level", "ai_suggested_priority", "ai_possible_breed", "ai_suggested_priority_reason"]
            if all(k in data for k in required_keys):
                return {
                    "ai_animal_type": str(data.get("ai_animal_type") or "Unknown"),
                    "ai_dominant_color": str(data.get("ai_dominant_color") or "Unknown"),
                    "ai_coat_pattern": str(data.get("ai_coat_pattern") or "Unknown"),
                    "ai_estimated_size": str(data.get("ai_estimated_size") or "Unknown"),
                    "ai_possible_breed": str(data.get("ai_possible_breed") or "Aspin"),
                    "ai_suggested_risk_level": str(data.get("ai_suggested_risk_level") or "Low Risk"),
                    "ai_suggested_priority": str(data.get("ai_suggested_priority") or "Low Priority"),
                    "ai_suggested_priority_reason": str(data.get("ai_suggested_priority_reason") or ""),
                    "ai_behavior_chasing": bool(data.get("ai_behavior_chasing", False)),
                    "ai_behavior_actual_bite": bool(data.get("ai_behavior_actual_bite", False)),
                    "ai_behavior_attempted_bite": bool(data.get("ai_behavior_attempted_bite", False)),
                    "ai_behavior_injury": bool(data.get("ai_behavior_injury", False)),
                    "ai_behavior_aggressive": bool(data.get("ai_behavior_aggressive", False)),
                    "ai_behavior_explanation": str(data.get("ai_behavior_explanation") or "Context analyzed from report description."),
                    "ai_field_confidence": clean_field_confidence(data.get("ai_field_confidence")),
                }
        except Exception as gemini_err:
            print(f"Gemini API error (falling back to heuristics): {gemini_err}")

    # Fallback to local rule-based heuristics
    text = (description or "").lower()
    cat = (category_name or "").lower()
    
    # 1. Animal Type Selection
    animal_type = "Unknown"
    if media_animal_type is not None:
        animal_type = media_animal_type
    else:
        # Scan text for indicators
        dog_keywords = ["dog", "puppy", "pup", "canine", "bark", "mutt", "chihuahua", "retriever", "terrier", "bulldog", "aso", "tuta", "tahol", "kahol"]
        cat_keywords = ["cat", "kitten", "kitty", "feline", "meow", "purr", "stray cat", "calico", "siamese", "pusa", "kuting"]
        
        dog_hits = sum(1 for kw in dog_keywords if kw in text)
        cat_hits = sum(1 for kw in cat_keywords if kw in text)
        
        # Also check category name
        if "dog" in cat or "canine" in cat:
            dog_hits += 2
        if "cat" in cat or "feline" in cat:
            cat_hits += 2
            
        if dog_hits > cat_hits:
            animal_type = "Dog"
        elif cat_hits > dog_hits:
            animal_type = "Cat"
            
    # 2. Animal Color Selection
    detected_colors = []
    if media_dominant_color is not None:
        # If the media analysis passed a color string (e.g. "Black, White")
        detected_colors = [c.strip().capitalize() for c in media_dominant_color.split(",")]
    else:
        # Scan text for common color keywords
        color_keywords = ["brown", "black", "white", "golden", "orange", "ginger", "gray", "grey", "spotted", "stripe", "cream", "yellow", "red", "tan"]
        for ck in color_keywords:
            if ck in text:
                detected_colors.append(ck.capitalize())

    # Stick to existing fur colors: dogs are not orange/ginger, map to Brown
    if animal_type == "Dog":
        mapped_colors = []
        for c in detected_colors:
            if c.lower() in ["orange", "ginger"]:
                mapped_colors.append("Brown")
            else:
                mapped_colors.append(c)
        # De-duplicate while preserving order
        seen = set()
        detected_colors = []
        for c in mapped_colors:
            if c not in seen:
                seen.add(c)
                detected_colors.append(c)

    primary = detected_colors[0] if len(detected_colors) >= 1 else "Unknown"  # never invent a coat color
    secondary = detected_colors[1] if len(detected_colors) >= 2 else "None"
    
    dominant_color = primary
    if secondary != "None":
        dominant_color += f", {secondary}"

    # 3. Estimated Size Selection
    estimated_size = "Unknown"  # not stated -> unknown (an invented size would earn match points)
    if media_estimated_size is not None:
        estimated_size = media_estimated_size
    else:
        # Scan text for size indicators
        small_keywords = ["small", "little", "tiny", "puppy", "pup", "kitten", "kitty", "chihuahua", "toy", "young", "baby", "maliit"]
        large_keywords = ["large", "huge", "big", "giant", "tall", "heavy", "mastiff", "shepherd", "rottweiler", "husky", "malaki", "mataba"]
        
        small_hits = sum(1 for kw in small_keywords if kw in text)
        large_hits = sum(1 for kw in large_keywords if kw in text)
        
        if small_hits > large_hits:
            estimated_size = "Small"
        elif large_hits > small_hits:
            estimated_size = "Large"

    # 4. Suggested Risk Level
    # Classify based on description of behavior, condition, and category
    high_risk_keywords = [
        "aggressive", "bite", "biting", "attack", "attacking", "growling", "rabies", "rabid", 
        "bleeding", "injured", "hit by car", "broken leg", "hurt", "danger", "furious", 
        "snarling", "snarl", "foaming", "snapping", "blood", "wound", "hostile", "sick",
        "kagat", "nangangagat", "nakagat", "atake", "nang-aatake", "nanunugod", "galit", 
        "mabangis", "umuungol", "sugat", "sugatan", "dugo", "madugo", "pilay", "nabangga", 
        "may sakit", "sakitin"
    ]
    
    medium_risk_keywords = [
        "chasing", "barking", "running", "scared", "fearful", "skinny", "mangy", "hungry", 
        "limping", "trash", "scavenge", "howling", "growl", "stray", "blocking", "traffic",
        "nuisance", "distress", "crying",
        "habol", "nanghahabol", "hinahabol", "tahol", "tumatahol", "takot", "natatakot", 
        "payat", "galisin", "gutom", "alulong", "iyak"
    ]
    
    high_hits = sum(1 for kw in high_risk_keywords if kw in text)
    medium_hits = sum(1 for kw in medium_risk_keywords if kw in text)
    
    # Also evaluate categories
    if "emergency" in cat or "aggressive" in cat or "injured" in cat or "bite" in cat:
        high_hits += 3
    elif "stray" in cat or "nuisance" in cat:
        medium_hits += 1

    if high_hits > 0:
        risk_level = "High Risk"
    elif medium_hits > 0:
        risk_level = "Medium Risk"
    else:
        risk_level = "Low Risk"

    # 5. Suggested Priority Level
    # Correlation between risk level and general urgency text keywords
    urgent_keywords = ["urgent", "immediate", "emergency", "danger", "dying", "help", "save", "asap", "fast"]
    urgent_hits = sum(1 for kw in urgent_keywords if kw in text)
    
    if risk_level == "High Risk" or urgent_hits > 0:
        priority = "High Priority"
    elif risk_level == "Medium Risk" or "stray" in cat:
        priority = "High Priority" if urgent_hits > 0 else "Medium Priority"
    else:
        priority = "Low Priority"

    # 6. Possible Breed Selection
    possible_breed = "Unknown"
    if animal_type == "Dog":
        # Scan text for common dog breeds
        dog_breeds = {
            "chihuahua": "Chihuahua",
            "retriever": "Golden Retriever",
            "golden": "Golden Retriever",
            "husky": "Siberian Husky",
            "bulldog": "Bulldog",
            "poodle": "Poodle",
            "german shepherd": "German Shepherd",
            "shepherd": "German Shepherd",
            "terrier": "Terrier",
            "shihtzu": "Shih Tzu",
            "shih tzu": "Shih Tzu",
            "pug": "Pug",
            "aspin": "Aspin",
        }
        for kb, val in dog_breeds.items():
            if kb in text:
                possible_breed = val
                break
        else:
            # Default to Aspin if no specific dog breed is mentioned in description
            possible_breed = "Aspin"
    elif animal_type == "Cat":
        # Scan text for common cat breeds
        cat_breeds = {
            "siamese": "Siamese",
            "persian": "Persian",
            "calico": "Calico",
            "tabby": "Tabby",
            "puspin": "Puspin",
        }
        for kb, val in cat_breeds.items():
            if kb in text:
                possible_breed = val
                break
        else:
            # Default to Puspin if no specific cat breed is mentioned in description
            possible_breed = "Puspin"

    # 7. Fallback Priority Reason Generation
    reason = "Priority suggested based on report categories and description details."
    if priority == "High Priority":
        if any(kw in text for kw in ["injured", "bleeding", "wound", "hurt", "broken", "blood", "accident", "sugat", "sugatan", "dugo", "pilay", "nabangga"]):
            reason = "High Priority suggested because the animal is reported as injured or bleeding, requiring urgent medical care."
        elif any(kw in text for kw in ["aggressive", "bite", "biting", "attack", "attacking", "growl", "growling", "snarl", "snarling", "snap", "snapping", "hostile", "kagat", "nangangagat", "nakagat", "atake", "nang-aatake", "nanunugod", "galit", "mabangis"]):
            reason = "High Priority suggested because of reports of aggressive behavior (like biting or growling), posing a safety risk to the area."
        else:
            reason = "High Priority suggested because the description indicates a critical situation requiring immediate response."
    elif priority == "Medium Priority":
        if any(kw in text for kw in ["sick", "weak", "skinny", "mangy", "hungry", "limp", "sakitin", "payat", "gutom"]):
            reason = "Medium Priority suggested because the animal appears sick, weak, or undernourished. Needs attention, but doesn't pose an immediate threat."
        elif any(kw in text for kw in ["roaming", "pack", "group", "multiple", "horde"]):
            reason = "Medium Priority suggested because roaming behavior is causing a public nuisance."
    # Extract coat pattern from description or keywords
    import re
    coat_pattern = "Unknown"
    pat_match = re.search(r'(?:pattern|markings):\s*([^|]+)', description or '', re.IGNORECASE)
    if pat_match and pat_match.group(1).strip():
        coat_pattern = pat_match.group(1).strip().capitalize()
    elif "tabby" in text:
        coat_pattern = "Tabby"
    elif "calico" in text:
        coat_pattern = "Calico"
    elif "tortoiseshell" in text or "tortie" in text:
        coat_pattern = "Tortoiseshell"
    elif "bicolor" in text or ("white" in text and ("black" in text or "brown" in text or "gray" in text or "grey" in text or "orange" in text)):
        coat_pattern = "Bicolor"
    elif "tricolor" in text:
        coat_pattern = "Tricolor"
    elif "striped" in text:
        coat_pattern = "Striped"
    elif "spotted" in text:
        coat_pattern = "Spotted"
    elif "brindle" in text:
        coat_pattern = "Brindle"
    elif "merle" in text:
        coat_pattern = "Merle"

    # 8. Behavioral Analysis Heuristic Engine (Whole sentence & Negation aware)
    import re
    sentences = [s.strip() for s in re.split(r'[.!?\n]+', text) if s.strip()]
    
    behavior_chasing = False
    behavior_attempted_bite = False
    behavior_actual_bite = False
    behavior_injury = False
    behavior_aggressive = False
    behavior_reasons = []

    chase_terms = r'(habol|nanghahabol|hinahabol|hinabol|chase|chasing|chased)'
    for s in sentences:
        if re.search(chase_terms, s):
            if re.search(r'(hindi\s+(naman\s+)?(nanghahabol|humabol|hinabol)|never\s+chased|not\s+chasing|di\s+naman\s+nanghahabol)', s):
                pass
            else:
                behavior_chasing = True
                behavior_reasons.append("Chasing behavior detected")
                break

    near_miss_terms = r'(muntik|muntikan|almost|tinangka|nearly|attempted)'
    bite_terms = r'(kagat|nangagat|nakagat|kumagat|makagat|bite|biting|bitten|bit)'
    
    for s in sentences:
        has_bite_word = bool(re.search(bite_terms, s))
        if not has_bite_word:
            continue
            
        if re.search(r'(hindi\s+(naman\s+)?(nangagat|kumagat|nakakagat|nakagat)|never\s+bit|wala\s+(namang\s+)?kinagat|not\s+biting)', s):
            continue
            
        if re.search(near_miss_terms, s) or re.search(r'(hindi\s+naman\s+(ako\s+)?natamaan|muntik\s+nang\s+makagat)', s):
            behavior_attempted_bite = True
            behavior_aggressive = True
            behavior_reasons.append("Near-miss / attempted bite detected")
        elif re.search(r'(talagang\s+nakagat|nakagat|nangagat|kinagat|bit\s+someone|has\s+bitten|actual\s+bite)', s) and not re.search(r'(hindi\s+nangagat|hindi\s+nakagat)', s):
            behavior_actual_bite = True
            behavior_aggressive = True
            behavior_reasons.append("Confirmed bite incident reported")

    injury_terms = r'(sugat|sugatan|dugo|madugo|bleeding|wound|injured|injury|laceration|bite\s+mark)'
    for s in sentences:
        if re.search(injury_terms, s):
            if re.search(r'(wala\s+naman(g)?\s+(siyang\s+)?(sugat|dugo)|no\s+wound|walang\s+dugo|hindi\s+nasugatan|no\s+injury)', s):
                pass
            else:
                behavior_injury = True
                behavior_reasons.append("Injury / wound mentioned")
                break

    if behavior_actual_bite or behavior_attempted_bite or any(re.search(r'(nanunugod|nang-aatake|mabangis|aggressive|snarling|snarl|growling)', s) for s in sentences):
        if not any(re.search(r'(hindi\s+(naman\s+)?(mabangis|nanunugod|aggressive)|not\s+aggressive)', s) for s in sentences):
            behavior_aggressive = True

    behavior_explanation = "; ".join(behavior_reasons) if behavior_reasons else "Normal behavior. No aggressive or biting incidents reported."

    return {
        "ai_animal_type": animal_type,
        "ai_dominant_color": dominant_color,
        "ai_coat_pattern": coat_pattern,
        "ai_estimated_size": estimated_size,
        "ai_possible_breed": possible_breed,
        "ai_suggested_risk_level": risk_level,
        "ai_suggested_priority": priority,
        "ai_suggested_priority_reason": reason,
        "ai_behavior_chasing": behavior_chasing,
        "ai_behavior_actual_bite": behavior_actual_bite,
        "ai_behavior_attempted_bite": behavior_attempted_bite,
        "ai_behavior_injury": behavior_injury,
        "ai_behavior_aggressive": behavior_aggressive,
        "ai_behavior_explanation": behavior_explanation
    }
