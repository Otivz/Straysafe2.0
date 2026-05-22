"""
Color detection utility for extracting dominant animal colors from images.
"""
from PIL import Image
import io
from typing import Optional, Tuple, List


def rgb_to_color_name(rgb: Tuple[int, int, int]) -> str:
    """Convert RGB tuple to human-readable color name."""
    r, g, b = rgb
    
    # 1. White / Light colors (highly neutral and bright)
    if r > 180 and g > 180 and b > 180:
        return "White"
    
    # 2. Black / Very dark colors (neutral and dark)
    if r < 65 and g < 65 and b < 65:
        return "Black"
    
    # 3. Gray (neutral mid-tones where R, G, B are very close)
    if max(r, g, b) - min(r, g, b) < 25:
        return "Gray"
    
    # 4. Colored Hues (non-neutral)
    if r > g and r > b:
        # Red/Brown/Orange dominance
        if g > 140 and b < 100:
            return "Yellow"  # Cream/blonde
        elif g > 90:
            if r > 160:
                return "Orange"  # Ginger
            else:
                return "Brown"   # Brown fur
        elif g < 60:
            return "Red"
        else:
            return "Brown"
            
    elif g > r and g > b:
        # Green dominance
        if r > 100 and b < 100:
            return "Yellow"
        else:
            return "Green"
            
    elif b > r and b > g:
        # Blue dominance
        return "Blue"
        
    elif r > 150 and g > 120 and b < 100:
        return "Golden"
        
    return "Mixed Color"


def extract_dominant_colors(image_data: bytes, bbox: Optional[List[float]] = None) -> str:
    """
    Extract dominant colors from an image.
    
    Args:
        image_data: Raw image bytes
        bbox: Bounding box [x1, y1, x2, y2] from YOLOv8 detection
    
    Returns:
        Human-readable color description (e.g., "Brown", "Black and White")
    """
    try:
        # Open image
        img = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if needed
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # If bbox provided, crop to that region
        if bbox:
            x1, y1, x2, y2 = bbox
            # Ensure coordinates are within image bounds
            width, height = img.size
            x1 = max(0, int(x1))
            y1 = max(0, int(y1))
            x2 = min(width, int(x2))
            y2 = min(height, int(y2))
            
            if x2 > x1 and y2 > y1:
                img = img.crop((x1, y1, x2, y2))
        
        # Resize for faster color extraction
        img.thumbnail((100, 100))
        
        # Get colors
        img = img.convert('RGB')
        colors = img.getcolors(img.width * img.height)
        
        if not colors:
            return "Unknown"
        
        # Accumulate pixel counts by mapped human-readable color name
        color_counts = {}
        for count, rgb in colors:
            # Type guard to ensure we have a tuple with at least R, G, B channels
            if isinstance(rgb, tuple) and len(rgb) >= 3:
                rgb_tuple = (rgb[0], rgb[1], rgb[2])
                color_name = rgb_to_color_name(rgb_tuple)
                if color_name not in ["Unknown", "Mixed Color"]:
                    color_counts[color_name] = color_counts.get(color_name, 0) + count
        
        # Sort color names by accumulated pixel count in descending order
        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
        
        # Extract top 3 colors
        unique_colors = [color_name for color_name, _ in sorted_colors[:3]]
        
        # Format output as comma-separated list of top 3 colors (e.g., "Brown, White, Black")
        if len(unique_colors) == 0:
            return "Unknown"
        return ", ".join(unique_colors)
    
    except Exception as e:
        print(f"Error in color detection: {e}")
        return "Unknown"
