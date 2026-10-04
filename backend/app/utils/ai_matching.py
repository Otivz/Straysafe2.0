import os
import io
import json
import urllib.request
from typing import Optional, Dict, Any, List, Tuple
from PIL import Image

from app.utils.ai_suggestions import call_gemini_with_fallback

COLOR_FAMILIES = {
    "black": {"black", "dark", "charcoal", "jet black"},
    "white": {"white", "cream", "ivory", "light", "snow"},
    "gray": {"gray", "grey", "silver", "ash", "slate"},
    "orange": {"orange", "ginger", "red", "yellow", "tan", "gold", "golden", "fawn", "sable", "apricot", "peach"},
    "brown": {"brown", "chocolate", "brindle", "dark brown", "chestnut", "mahogany", "coffee", "caramel"}
}

def get_color_family(c_str: Optional[str]) -> Optional[str]:
    if not c_str:
        return None
    c_clean = c_str.lower().strip()
    for fam, members in COLOR_FAMILIES.items():
        if c_clean in members:
            return fam
        for m in members:
            if m in c_clean or c_clean in m:
                return fam
    return None

def parse_colors(color_str: Optional[str]) -> List[str]:
    if not color_str:
        return []
    cleaned = color_str.lower()
    for sep in [",", "/", "&", ";", "-", "|", "(", ")", ".", "+", "and"]:
        cleaned = cleaned.replace(sep, " ")
    
    known_colors = {
        "black", "white", "brown", "cream", "tan", "golden", "yellow", 
        "gray", "grey", "silver", "orange", "red", "chocolate", "fawn", 
        "brindle", "tricolor", "bicolor", "merle", "calico", "sable", "dark", "light"
    }
    
    tokens = [c.strip() for c in cleaned.split() if c.strip()]
    matched = [t for t in tokens if t in known_colors]
    return matched if matched else tokens


def fetch_image_for_entity(entity: Any, is_pet: bool = False) -> Optional[Image.Image]:
    """
    Safely loads and resizes a PIL Image from an entity's media / photo URLs.
    Handles Cloudinary URLs, web URLs, and local upload paths.
    """
    url_to_fetch: Optional[str] = None

    if is_pet:
        for attr in ["photo_front_url", "photo_url", "photo_left_url", "photo_right_url"]:
            val = getattr(entity, attr, None)
            if val and isinstance(val, str) and val.strip():
                url_to_fetch = val.strip()
                break
    else:
        # Report entity
        media_list = getattr(entity, "media", [])
        if media_list and len(media_list) > 0:
            for m in media_list:
                m_url = getattr(m, "file_url", None)
                m_type = getattr(m, "media_type", "Image")
                if m_url and isinstance(m_url, str) and m_url.strip():
                    if m_type == "Image" or not m_url.lower().endswith((".mp4", ".mov", ".webm", ".avi", ".pdf")):
                        url_to_fetch = m_url.strip()
                        break
        if not url_to_fetch and getattr(entity, "primary_photo_url", None):
            url_to_fetch = entity.primary_photo_url

    if not url_to_fetch:
        return None

    try:
        # 1. Check if local file exists
        if os.path.exists(url_to_fetch):
            img = Image.open(url_to_fetch).convert("RGB")
            img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            return img

        # 2. Check relative uploads directory
        local_path = os.path.join(os.getcwd(), url_to_fetch.lstrip("/"))
        if os.path.exists(local_path):
            img = Image.open(local_path).convert("RGB")
            img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            return img

        # 3. Remote HTTP/HTTPS URL
        if url_to_fetch.startswith("http://") or url_to_fetch.startswith("https://"):
            req = urllib.request.Request(
                url_to_fetch,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StraySafe/2.0"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read()
                img = Image.open(io.BytesIO(content)).convert("RGB")
                img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                return img
    except Exception as e:
        print(f"[AI Matching] Failed to load image from '{url_to_fetch}': {e}")

    return None


def compare_animals_vision(
    source_img: Image.Image,
    candidate_img: Image.Image,
    source_meta: Dict[str, Any],
    candidate_meta: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Executes a forensic biometric comparison between two animal images using Google Gemini Vision.
    Evaluates INDIVIDUAL visual identity (face shape, markings, ear posture, coat patches)
    and strictly penalizes generic breed similarity.
    """
    from app.utils.ai_suggestions import is_gemini_enabled_in_db
    if not is_gemini_enabled_in_db():
        return None

    try:
        prompt = f"""
        You are the StraySafe Senior Biometric Animal Identification & Forensic AI Specialist.
        Your task is to analyze and compare these TWO animal images to determine if they depict the EXACT SAME INDIVIDUAL ANIMAL.

        Image 1: Sighting Report Subject ({source_meta.get('species', 'Animal')}, Breed: {source_meta.get('breed', 'Unknown')}, Color: {source_meta.get('color', 'Unknown')})
        Image 2: Candidate Subject ({candidate_meta.get('species', 'Animal')}, Breed: {candidate_meta.get('breed', 'Unknown')}, Color: {candidate_meta.get('color', 'Unknown')})

        ### CORE MANDATE: INDIVIDUAL VISUAL IDENTITY > BREED / GENERIC SIMILARITY
        - "SAME BREED" DOES NOT EQUAL "SAME INDIVIDUAL": Two Aspin dogs or two Puspin cats are completely different individual animals unless their specific, unique physical features match.
        - DO NOT award a high similarity score simply because both animals are dogs, both are Aspins, both are medium-sized, or both have brown or white fur.
        - The similarity score MUST represent the confidence that these two images show the SAME INDIVIDUAL ANIMAL.

        ### EVALUATE THE FOLLOWING VISUAL FEATURES IN DETAIL:
        1. Face Structure & Head Shape: Muzzle length, snout width, skull shape, stop depth, facial contours.
        2. Ear Structure & Posture: Ear shape (erect, semi-erect, folded, rose, dropped/floppy, cropped) and placement on head.
        3. Coat Pattern & Color Distribution: Solid, bicolor, piebald, tricolor, brindle, merle, tabby stripes, distinct patches, saddle mark.
        4. Facial Markings: Snout blaze, forehead star, eye mask, spectacles, cheek spots, chin markings.
        5. Body Structure & Proportions: Leg length, neck girth, tail shape/length, body build (lean, stocky, deep-chested).
        6. Distinctive Markings & Scars: White socks/paws, chest bib, white tail tip, ear notches, scars, nose leather pigmentation/spots.

        ### CONTRADICTION PENALTY RULES:
        - If Image 1 has a Brown & White bicolor/piebald coat and Image 2 has a solid Gray/Black coat -> STRONG CONTRADICTION (Score 0% - 20%).
        - If Image 1 has erect pointed ears and Image 2 has dropped floppy ears -> STRONG CONTRADICTION.
        - If Image 1 has a white facial blaze and Image 2 has a solid dark snout -> STRONG CONTRADICTION.
        - Obvious individual differences MUST strongly reduce match confidence, even if species, breed, and size match.

        ### CALIBRATED SIMILARITY SCORE RANGE:
        - 0 - 25: Clearly different individual animals (Obvious color, pattern, facial, or structural contradictions).
        - 26 - 49: Not a match / Low confidence (Generic breed resemblance only; clear individual visual differences).
        - 50 - 69: Plausible / Low-to-Moderate confidence (Similar color palette and general markings, but ambiguous angle or lack of definitive unique marks).
        - 70 - 84: Potential Match (Multiple distinct matching individual characteristics, matching coat distribution and facial/ear structure).
        - 85 - 100: High Confidence Match (Near-identical distinctive facial markings, specific coat patch layout, matching ears, face, and body structure).

        Respond ONLY with a valid JSON object matching this schema:
        {{
            "face_structure": "Different" | "Somewhat Similar" | "Similar" | "Highly Similar" | "Cannot Determine",
            "ear_structure": "Different" | "Somewhat Similar" | "Similar" | "Highly Similar" | "Cannot Determine",
            "coat_pattern": "Different" | "Somewhat Similar" | "Similar" | "Highly Similar" | "Cannot Determine",
            "facial_markings": "Different" | "Somewhat Similar" | "Similar" | "Highly Similar" | "Cannot Determine",
            "body_structure": "Different" | "Somewhat Similar" | "Similar" | "Highly Similar" | "Cannot Determine",
            "distinctive_markings": "Different" | "Somewhat Similar" | "Similar" | "Highly Similar" | "None Visible",
            "individual_similarity_score": <integer 0-100>,
            "final_assessment": "NOT A MATCH" | "LOW CONFIDENCE" | "POTENTIAL MATCH" | "STRONG MATCH",
            "reason": "<A concise, objective 1-3 sentence explanation explaining what specific visual features match or contradict, and why this is or is not the same individual animal>",
            "visual_contradictions": ["<specific difference 1>", "<specific difference 2>"],
            "visual_corroborations": ["<specific matching trait 1>"]
        }}
        """

        contents = [prompt, source_img, candidate_img]
        response = call_gemini_with_fallback(
            contents,
            generation_config={"response_mime_type": "application/json"}
        )

        if not response or not getattr(response, "text", None):
            return None

        text_resp = response.text.strip()
        if text_resp.startswith("```"):
            lines = text_resp.split("\n")
            if lines[0].startswith("```json"):
                text_resp = "\n".join(lines[1:-1])
            elif lines[0].startswith("```"):
                text_resp = "\n".join(lines[1:-1])

        data = json.loads(text_resp)
        raw_score = data.get("individual_similarity_score")
        if raw_score is None:
            print("[AI Matching] Gemini answer had no similarity score; using rule-based result instead.")
            return None
        score = max(0, min(100, int(float(raw_score))))
        data["individual_similarity_score"] = score
        data["_model"] = getattr(response, "_straysafe_model", None)
        return data

    except Exception as e:
        print(f"[AI Matching] Gemini Vision comparison failed: {e}")
        return None


def compare_animals_rule_based(
    source_meta: Dict[str, Any],
    candidate_meta: Dict[str, Any],
    is_pet: bool = False
) -> Dict[str, Any]:
    """
    Advanced rule-based fallback comparison when images cannot be loaded or Gemini is offline.
    Strictly calibrates scores so that generic breed matches (e.g. Aspin + Dog) NEVER produce false high similarity.
    """
    src_species = (source_meta.get("species") or "Unknown").lower().strip()
    cand_species = (candidate_meta.get("species") or "Unknown").lower().strip()

    # Species Gatekeeper
    if src_species != cand_species and src_species != "unknown" and cand_species != "unknown":
        return {
            "score": 0,
            "visual_comparison": {
                "face_structure": "Different",
                "ear_structure": "Different",
                "coat_pattern": "Different",
                "facial_markings": "Different",
                "body_structure": "Different",
                "distinctive_markings": "Different",
                "final_assessment": "NOT A MATCH",
                "reason": f"Species mismatch: {src_species.capitalize()} vs {cand_species.capitalize()}.",
                "visual_contradictions": [f"Species: {src_species.capitalize()} vs {cand_species.capitalize()}"],
                "visual_corroborations": []
            },
            "evidence": {
                "species_match": False,
                "key_evidence_bullets": [f"Species Mismatch: {src_species.capitalize()} vs {cand_species.capitalize()}"]
            },
            "explanation": f"Species mismatch: {src_species.capitalize()} vs {cand_species.capitalize()}."
        }

    evidence_bullets = [f"Species Match: Both identified as {src_species.capitalize()}"]
    contradictions: List[str] = []
    corroborations: List[str] = []

    # Initial low base score (only 10% for basic species compatibility)
    score = 10

    # 1. Breed Comparison
    src_breed = (source_meta.get("breed") or "").lower().strip()
    cand_breed = (candidate_meta.get("breed") or "").lower().strip()
    generic_breeds = {"aspin", "puspin", "mixed", "unknown", "mongrel", "mixed breed", "local", ""}
    is_src_purebred = src_breed and (src_breed not in generic_breeds)
    is_cand_purebred = cand_breed and (cand_breed not in generic_breeds)

    breed_status = "Different"
    if src_breed and cand_breed:
        if src_breed == cand_breed or src_breed in cand_breed or cand_breed in src_breed:
            if is_src_purebred:
                # Distinct purebred match (e.g. Siberian Husky vs Siberian Husky) gives meaningful evidence
                score += 25
                breed_status = "Similar"
                corroborations.append(f"Breed: Both identified as {src_breed.title()}")
                evidence_bullets.append(f"Breed Match: Both identified as {src_breed.title()}")
            else:
                # Local mixed breed match (Aspin vs Aspin) gives minimal evidence (+5%)
                score += 5
                breed_status = "Similar"
                corroborations.append("Breed: Both identified as local/mixed breed (Aspin/Puspin)")
                evidence_bullets.append("Breed Classification: Both identified as local mixed breed")
        elif is_src_purebred and is_cand_purebred:
            # Different purebreds
            score -= 35
            breed_status = "Different"
            contradictions.append(f"Breed Conflict: {src_breed.title()} vs {cand_breed.title()}")
            evidence_bullets.append(f"Breed Conflict: {src_breed.title()} vs {cand_breed.title()}")
        else:
            score -= 10
            breed_status = "Different"
            contradictions.append(f"Breed Difference: {src_breed.title()} vs {cand_breed.title()}")

    # 2. Color & Pattern Comparison
    src_color = (source_meta.get("color") or "").lower().strip()
    cand_color = (candidate_meta.get("color") or "").lower().strip()
    src_colors = set(parse_colors(src_color))
    cand_colors = set(parse_colors(cand_color))

    src_fam = get_color_family(src_color.split()[0]) if src_color else None
    cand_fam = get_color_family(cand_color.split()[0]) if cand_color else None

    color_overlap = src_colors.intersection(cand_colors)
    has_color_conflict = False

    if src_fam and cand_fam and src_fam != cand_fam:
        if not (src_fam in cand_color and cand_fam in src_color):
            has_color_conflict = True
            contradictions.append(f"Coat Color Conflict: Sighted ({src_color.title()}) vs Candidate ({cand_color.title()})")
            evidence_bullets.append(f"Color Contrast: Sighted color ({src_color.title()}) clashes with candidate ({cand_color.title()})")
            score -= 40
    elif color_overlap:
        shared_str = ", ".join(color_overlap).title()
        corroborations.append(f"Shared Coat Colors: {shared_str}")
        evidence_bullets.append(f"Color Match: Shared color palette ({shared_str})")
        score += 20 if len(color_overlap) > 1 else 10
    elif src_colors and cand_colors:
        has_color_conflict = True
        contradictions.append(f"Coat Colors Differ: Sighted ({src_color.title()}) vs Candidate ({cand_color.title()})")
        score -= 30

    # Coat Pattern
    src_pat = (source_meta.get("coat_pattern") or "").lower()
    cand_pat = (candidate_meta.get("coat_pattern") or "").lower()
    pattern_status = "Similar" if src_pat == cand_pat and src_pat else "Different"

    if ("bicolor" in src_pat or "piebald" in src_pat or "white" in src_color) and ("solid" in cand_pat or ("gray" in cand_color and "white" not in cand_color)):
        contradictions.append("Coat Pattern Contrast: Bicolor/patched vs uniform coat")
        score -= 25
        pattern_status = "Different"
    elif src_pat and cand_pat and src_pat == cand_pat:
        score += 15
        corroborations.append(f"Coat Pattern: Matching {src_pat.title()}")
        pattern_status = "Similar"

    # 3. Size Category
    size_map = {"small": 1, "medium": 2, "large": 3}
    src_size = (source_meta.get("size") or "").lower()
    cand_size = (candidate_meta.get("size") or "").lower()
    s_val = size_map.get(src_size)
    c_val = size_map.get(cand_size)

    if s_val is None or c_val is None:
        body_status = "Cannot Determine"  # size not recorded on one side: no points either way
    else:
        body_status = "Similar" if s_val == c_val else ("Somewhat Similar" if abs(s_val - c_val) == 1 else "Different")
    if s_val is None or c_val is None:
        pass
    elif s_val == c_val:
        score += 10
        corroborations.append(f"Size: Both {src_size.capitalize()}")
    elif abs(s_val - c_val) == 1:
        score -= 10
        contradictions.append(f"Size Variance: {src_size.capitalize()} vs {cand_size.capitalize()}")
    else:
        score -= 30
        contradictions.append(f"Size Conflict: {src_size.capitalize()} vs {cand_size.capitalize()}")

    # 4. Distinctive Markings & Description
    src_desc = (source_meta.get("description") or "").lower()
    cand_desc = (candidate_meta.get("description") or "").lower()
    keywords = ["patch", "spot", "socks", "collar", "leash", "stripe", "scar", "white chest", "black ear", "pointed ears", "floppy ears"]
    shared_kw = [kw for kw in keywords if kw in src_desc and kw in cand_desc]
    if shared_kw:
        score += 15
        corroborations.append(f"Distinctive Markings: {', '.join(shared_kw)}")
        evidence_bullets.append(f"Distinctive Features: Common traits noted ({', '.join(shared_kw)})")

    # 5. Location Proximity (Contextual evidence ONLY - max +5%)
    dist_km = source_meta.get("dist_km")
    dist_m = source_meta.get("dist_m")
    if dist_km is not None:
        if dist_km <= 0.5:
            score += 5
            evidence_bullets.append(f"Location Proximity: Sighted within {dist_m or int(dist_km * 1000)}m")
        elif dist_km <= 1.5:
            score += 2
            evidence_bullets.append(f"Location Proximity: Sighted within {dist_km} km")

    # Final score calibration
    if has_color_conflict or len(contradictions) >= 2:
        final_score = min(max(score, 5), 25)
        assessment = "NOT A MATCH"
    elif contradictions:
        final_score = min(max(score, 15), 45)
        assessment = "LOW CONFIDENCE"
    elif len(corroborations) >= 3 and score >= 70:
        final_score = min(score, 90)
        assessment = "POTENTIAL MATCH"
    elif score >= 50:
        final_score = min(score, 90)
        assessment = "POTENTIAL MATCH"
    else:
        final_score = max(score, 15)
        assessment = "LOW CONFIDENCE"

    subj_name = candidate_meta.get("name", "Candidate")
    if assessment in ["NOT A MATCH", "LOW CONFIDENCE"]:
        reason = (
            f"Both animals are identified as {src_species.title()}s, but individual physical characteristics differ significantly "
            f"({'; '.join(contradictions[:2]) if contradictions else 'different coat markings and structure'}). "
            f"Breed or species similarity alone is insufficient evidence that they are the same individual."
        )
    else:
        reason = (
            f"The animals share multiple individual visual characteristics ({'; '.join(corroborations[:3])}) "
            f"that may indicate they are the same individual {src_species.lower()}. Human verification is required."
        )

    visual_comparison = {
        "face_structure": "Similar" if assessment == "POTENTIAL MATCH" else "Different",
        "ear_structure": "Similar" if assessment == "POTENTIAL MATCH" else "Different",
        "coat_pattern": pattern_status,
        "facial_markings": "Similar" if shared_kw else ("Different" if has_color_conflict else "Cannot Determine"),
        "body_structure": body_status,
        "distinctive_markings": "Similar" if shared_kw else ("Different" if contradictions else "None Visible"),
        "final_assessment": assessment,
        "reason": reason,
        "visual_contradictions": contradictions,
        "visual_corroborations": corroborations
    }

    return {
        "score": final_score,
        "visual_comparison": visual_comparison,
        "evidence": {
            "species_match": True,
            "animal_type": src_species.capitalize(),
            "breed_name": src_breed.title() if src_breed else "Not recorded",
            "color_match": len(color_overlap) > 0 and not has_color_conflict,
            "shared_colors": list(color_overlap),
            "size_match": s_val is not None and s_val == c_val,
            "size_category": src_size.capitalize(),
            "distinctive_markings": shared_kw,
            "distance_km": dist_km,
            "distance_meters": dist_m,
            "key_evidence_bullets": evidence_bullets,
            "visual_comparison": visual_comparison
        },
        "explanation": reason
    }
