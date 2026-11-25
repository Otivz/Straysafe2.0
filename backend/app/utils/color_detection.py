"""
Color detection utility for extracting dominant animal coat colors from images.
Includes background foliage/grass rejection and HSV coat color clustering.
"""
from PIL import Image
import io
import colorsys
from typing import Optional, Tuple, List


def is_background_foliage_or_sky(r: int, g: int, b: int) -> bool:
    """Detects if pixel is background grass, green foliage, or sky/water to exclude from coat analysis."""
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    h_deg = h * 360.0

    # Green foliage / grass (Hue between 65 and 165 degrees with moderate saturation)
    if 65 <= h_deg <= 165 and s >= 0.15:
        return True

    # Sky / blue background (Hue between 185 and 255 degrees with saturation)
    if 185 <= h_deg <= 255 and s >= 0.20:
        return True

    return False


def rgb_to_color_name(rgb: Tuple[int, int, int]) -> str:
    """Convert RGB tuple to standard animal coat color name."""
    r, g, b = rgb
    
    # Exclude background grass / sky pixels
    if is_background_foliage_or_sky(r, g, b):
        return "Background"

    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    h_deg = h * 360.0

    # 1. White / Cream / Light fur
    if v > 0.72 and s < 0.22:
        return "White"
    if v > 0.80 and s < 0.35 and 30 <= h_deg <= 55:
        return "Cream"

    # 2. Black / Very dark fur
    if v < 0.28:
        return "Black"

    # 3. Gray fur (low saturation mid-tones)
    if s < 0.18 and 0.28 <= v <= 0.72:
        return "Gray"

    # 4. Brown, Tan, Orange, Golden, Red fur
    if 15 <= h_deg <= 45:
        if v < 0.50 or s > 0.50:
            return "Brown"
        elif v >= 0.65 and s >= 0.35:
            return "Orange"
        else:
            return "Tan"
    elif 45 < h_deg <= 65:
        if v >= 0.60 and s >= 0.30:
            return "Golden"
        else:
            return "Tan"
    elif h_deg < 15 or h_deg > 345:
        if v < 0.45:
            return "Brown"
        else:
            return "Orange"

    # Catch-all for neutral shades
    if max(r, g, b) - min(r, g, b) < 25:
        return "Gray" if (r + g + b) / 3.0 < 170 else "White"

    return "Mixed Color"


def extract_dominant_colors(image_data: bytes, bbox: Optional[List[float]] = None, max_colors: int = 3,
                            min_share: float = 0.0, drop_shading_gray: bool = False) -> str:
    """
    Extract dominant animal coat colors from an image, focusing on the animal's coat.

    Args:
        image_data: Raw image bytes
        bbox: Bounding box [x1, y1, x2, y2] from YOLOv8 detection
        max_colors: at most this many colours are returned (3 by default, as before)
        min_share: a colour must cover at least this share of the coat pixels to be named (0 = any, as before)
        drop_shading_gray: drop "Gray" when Black and White are also present and gray is not a large part of the coat:
            on a black-and-white animal, mid-gray pixels are usually shadow or the edge between the two colours, not gray fur
        The defaults keep the earlier behaviour. The report form's photo check uses the stricter options when the AI is unavailable.
    
    Returns:
        Human-readable comma-separated coat colors (e.g. "White, Gray", "Brown, White")
    """
    try:
        img = Image.open(io.BytesIO(image_data))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Crop to animal bounding box if available
        if bbox:
            x1, y1, x2, y2 = bbox
            width, height = img.size
            x1 = max(0, int(x1))
            y1 = max(0, int(y1))
            x2 = min(width, int(x2))
            y2 = min(height, int(y2))
            if x2 > x1 and y2 > y1:
                img = img.crop((x1, y1, x2, y2))
        
        # Sample center region of cropped animal to reduce peripheral background
        cw, ch = img.size
        if cw > 40 and ch > 40:
            # 10% inner margin crop to further avoid perimeter background grass
            margin_x = int(cw * 0.08)
            margin_y = int(ch * 0.08)
            img = img.crop((margin_x, margin_y, cw - margin_x, ch - margin_y))

        img.thumbnail((120, 120))
        img = img.convert('RGB')
        colors = img.getcolors(img.width * img.height)
        
        if not colors:
            return "Unknown"
        
        color_counts = {}
        for count, rgb in colors:
            if isinstance(rgb, tuple) and len(rgb) >= 3:
                rgb_tuple = (rgb[0], rgb[1], rgb[2])
                color_name = rgb_to_color_name(rgb_tuple)
                if color_name not in ["Unknown", "Mixed Color", "Background"]:
                    color_counts[color_name] = color_counts.get(color_name, 0) + count
        
        if not color_counts:
            # Fallback if all were flagged as background
            for count, rgb in colors:
                if isinstance(rgb, tuple) and len(rgb) >= 3:
                    r, g, b = rgb[0], rgb[1], rgb[2]
                    name = "White" if (r > 170 and g > 170 and b > 170) else ("Black" if (r < 75 and g < 75 and b < 75) else "Gray")
                    color_counts[name] = color_counts.get(name, 0) + count

        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
        total = sum(color_counts.values()) or 1
        if min_share > 0:
            sorted_colors = [(n, c) for n, c in sorted_colors if c / total >= min_share] or sorted_colors[:1]
        if drop_shading_gray:
            names = {n for n, _ in sorted_colors}
            gray_share = color_counts.get("Gray", 0) / total
            if {"Black", "White"} <= names and "Gray" in names and gray_share < 0.40:
                sorted_colors = [(n, c) for n, c in sorted_colors if n != "Gray"]
        unique_colors = [color_name for color_name, _ in sorted_colors[:max(1, max_colors)]]
        
        if len(unique_colors) == 0:
            return "Unknown"
        return ", ".join(unique_colors)
    
    except Exception as e:
        print(f"Error in color detection: {e}")
        return "Unknown"
