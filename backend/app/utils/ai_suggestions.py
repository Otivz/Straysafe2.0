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
    
    Returns a dictionary with:
    - ai_animal_type: 'Dog' | 'Cat' | 'Unknown'
    - ai_dominant_color: str
    - ai_estimated_size: 'Small' | 'Medium' | 'Large' | 'Unknown'
    - ai_suggested_risk_level: 'Low Risk' | 'Medium Risk' | 'High Risk'
    - ai_suggested_priority: 'Low Priority' | 'Regular Priority' | 'High Priority'
    """
    text = (description or "").lower()
    cat = (category_name or "").lower()
    
    # 1. Animal Type Selection
    animal_type = "Unknown"
    if media_animal_type is not None:
        animal_type = media_animal_type
    else:
        # Scan text for indicators
        dog_keywords = ["dog", "puppy", "pup", "canine", "bark", "mutt", "chihuahua", "retriever", "terrier", "bulldog"]
        cat_keywords = ["cat", "kitten", "kitty", "feline", "meow", "purr", "stray cat", "calico", "siamese"]
        
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
    dominant_color = "Unknown"
    if media_dominant_color is not None:
        dominant_color = media_dominant_color
    else:
        # Scan text for common color keywords
        color_keywords = ["brown", "black", "white", "golden", "orange", "ginger", "gray", "grey", "spotted", "stripe", "cream", "yellow", "red", "tan"]
        detected_colors = []
        for ck in color_keywords:
            if ck in text:
                detected_colors.append(ck.capitalize())
        
        if len(detected_colors) >= 1:
            dominant_color = ", ".join(detected_colors[:2])
        else:
            dominant_color = "Brown"  # Fallback default if not detected

    # Stick to existing fur colors: dogs are not orange/ginger, map to Brown
    if animal_type == "Dog" and dominant_color and dominant_color != "Unknown":
        colors_list = [c.strip() for c in dominant_color.split(",")]
        mapped_colors = []
        for c in colors_list:
            if c.lower() in ["orange", "ginger"]:
                mapped_colors.append("Brown")
            else:
                mapped_colors.append(c)
        # De-duplicate while preserving order
        seen = set()
        final_colors = []
        for c in mapped_colors:
            if c not in seen:
                seen.add(c)
                final_colors.append(c)
        dominant_color = ", ".join(final_colors)

    # 3. Estimated Size Selection
    estimated_size = "Medium"  # Default
    if media_estimated_size is not None:
        estimated_size = media_estimated_size
    else:
        # Scan text for size indicators
        small_keywords = ["small", "little", "tiny", "puppy", "pup", "kitten", "kitty", "chihuahua", "toy", "young", "baby"]
        large_keywords = ["large", "huge", "big", "giant", "tall", "heavy", "mastiff", "shepherd", "rottweiler", "husky"]
        
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
        "snarling", "snarl", "foaming", "snapping", "blood", "wound", "hostile", "sick"
    ]
    
    medium_risk_keywords = [
        "chasing", "barking", "running", "scared", "fearful", "skinny", "mangy", "hungry", 
        "limping", "trash", "scavenge", "howling", "growl", "stray", "blocking", "traffic",
        "nuisance", "distress", "crying"
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
        priority = "High Priority" if urgent_hits > 0 else "Medium Priority"  # Standardized to high/medium/low priority suggestions
    else:
        priority = "Low Priority"
        
    # Standardize suggestions according to the prompt's specifications:
    # "High Priority" or "Medium Priority" (Wait, the example says "High Priority", "High Priority")
    # Let's adjust to support the formats: High Priority, Regular Priority, Low Priority.
    # Wait, does the prompt say:
    # * Suggested Report Priority
    # Example AI Suggestions:
    # Suggested Priority: High Priority
    # Yes, "High Priority", "Regular Priority", or "Low Priority" would match standard naming! 
    # Let's make sure priority suggestions are: "High Priority", "Regular Priority", or "Low Priority".
    if priority == "Medium Priority":
         priority = "Regular Priority"

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

    return {
        "ai_animal_type": animal_type,
        "ai_dominant_color": dominant_color,
        "ai_estimated_size": estimated_size,
        "ai_possible_breed": possible_breed,
        "ai_suggested_risk_level": risk_level,
        "ai_suggested_priority": priority
    }
