"""
AI Suggestion Utility for generating AI-assisted suggestions for stray animal reports.
Analyzes text, categories, and image metadata (YOLO outputs, color extraction) to formulate recommendations.
"""
from typing import Optional, Dict, Any

def generate_ai_suggestions(
    description: Optional[str] = "",
    category_name: Optional[str] = "",
    media_animal_type: Optional[str] = None,
    media_dominant_color: Optional[str] = None,
    media_estimated_size: Optional[str] = None
) -> Dict[str, str]:
    """
    Generate AI suggestions based on report text and media metadata.
    Uses Google Gemini API if GEMINI_API_KEY is configured in the environment.
    Falls back to a rule-based local scanner if Gemini fails or is unconfigured.
    """
    import os
    import json
    
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            
            prompt = f"""
            You are the StraySafe Copilot, an AI assistant for a subdivision's stray animal reporting and safety system.
            Analyze the following report information:
            - User Description: "{description}"
            - Category: "{category_name}"
            - YOLOv8 Visual Detections (if any):
                * Animal Type: {media_animal_type}
                * Dominant Color: {media_dominant_color}
                * Estimated Size: {media_estimated_size}

            Your task is to classify this stray animal sighting and output a JSON object with the following fields:
            1. "ai_animal_type": Must be "Dog", "Cat", or "Unknown". Prefer media_animal_type if provided (e.g. "Cat"), otherwise infer accurately from user description.
            2. "ai_dominant_color": Dominant color or colors (e.g. "Brown", "Black, White"). Prefer visual detection if provided, otherwise infer from description.
            3. "ai_estimated_size": Must be "Small", "Medium", "Large", or "Unknown". For cats, default to "Small".
            4. "ai_coat_pattern": Must be "Solid", "Bicolor", "Tricolor", "Tabby", "Calico", "Tortoiseshell", "Striped", "Spotted", "Brindle", "Merle", "Patched", or "Unknown". Infer from user description (e.g. if description contains "Pattern: Tabby", "Tabby", "Stripes", "Calico", "Two colors", etc.).
            5. "ai_suggested_risk_level": Must be "Low Risk", "Medium Risk", or "High Risk".
               - High Risk: Aggressive behaviors (biting, snarling, attacks, foaming) or severe injury/trauma.
               - Medium Risk: Nuisance behaviors (barking, chasing cars, roaming pack, crying, skinny/sick).
               - Low Risk: Normal stray animal condition (healthy, calm, not aggressive).
            6. "ai_suggested_priority": Must be "Low Priority", "Medium Priority", or "High Priority". Matches the risk level or urgency.
            7. "ai_possible_breed": Likely breed (e.g., "Aspin", "Puspin", "Golden Retriever", "Siamese"). Default to "Puspin" for cats, "Aspin" for dogs.
            8. "ai_suggested_priority_reason": A short, conversational, warm, and helpful explanation (1-2 sentences) of why this priority level was suggested. Explain accurately without inventing unmentioned items (like collars or leashes).

            Respond ONLY with a valid JSON block.
            """
            
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
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
                    "ai_animal_type": str(data["ai_animal_type"]),
                    "ai_dominant_color": str(data["ai_dominant_color"]),
                    "ai_coat_pattern": str(data.get("ai_coat_pattern") or "Solid"),
                    "ai_estimated_size": str(data["ai_estimated_size"]),
                    "ai_possible_breed": str(data["ai_possible_breed"]),
                    "ai_suggested_risk_level": str(data["ai_suggested_risk_level"]),
                    "ai_suggested_priority": str(data["ai_suggested_priority"]),
                    "ai_suggested_priority_reason": str(data["ai_suggested_priority_reason"])
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

    primary = detected_colors[0] if len(detected_colors) >= 1 else "Brown"
    secondary = detected_colors[1] if len(detected_colors) >= 2 else "None"
    
    dominant_color = primary
    if secondary != "None":
        dominant_color += f", {secondary}"

    # 3. Estimated Size Selection
    estimated_size = "Medium"  # Default
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
    coat_pattern = "Solid"
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

    return {
        "ai_animal_type": animal_type,
        "ai_dominant_color": dominant_color,
        "ai_coat_pattern": coat_pattern,
        "ai_estimated_size": estimated_size,
        "ai_possible_breed": possible_breed,
        "ai_suggested_risk_level": risk_level,
        "ai_suggested_priority": priority,
        "ai_suggested_priority_reason": reason
    }
