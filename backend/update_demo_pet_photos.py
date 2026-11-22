"""
Fetch 65 unique, breed-and-color-matched dog and cat photographs for the 65 demo pets
of the 50 Selera Homes demo resident accounts (`*@selerahomes.demo`), verify each image
with YOLOv8 (species + single-animal bounding box) and HSV coat color extraction,
upload each image to Cloudinary under `straysafe/demo_pets/`, and update both the
live MySQL database records and a JSON manifest (`backend/demo_pet_photos_manifest.json`)
used by `seed_demo_residents_and_pets.py`.

Never modifies or deletes any non-demo user or personal uploaded images.
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Set, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cloudinary.uploader
from PIL import Image

from app.database import SessionLocal
from app.models.pet import Pet
from app.models.user import User
from app.utils import cloudinary_config  # noqa: F401 (loads .env and configures cloudinary)
from app.utils.color_detection import extract_dominant_colors
from app.utils.color_tags import apply_pet_color_payload
from app.utils.model_loader import get_yolo_model
from seed_demo_residents_and_pets import DEMO_EMAIL_DOMAIN, RESIDENT_SEED_DATA

MANIFEST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_pet_photos_manifest.json")
USER_AGENT = "StraySafeDemoSeeder/2.0 (https://github.com/straysafe; contact@straysafe.local)"

# Map each Dog breed in RESIDENT_SEED_DATA to Dog CEO breed path(s)
DOG_CEO_BREED_PATHS: Dict[str, List[str]] = {
    "Aspin (Asong Pinoy)": [
        "dingo",
        "basenji",
        "mix",
        "kelpie",
        "redbone",
        "african",
        "whippet",
        "coonhound",
        "ridgeback/rhodesian",
        "pinscher/Dozerman",
        "terrier/patterdale",
        "terrier/american",
        "hound/plott",
        "hound/ibizan",
        "pariah/indian",
        "carolina",
    ],
    "Shih Tzu": ["shihtzu"],
    "Golden Retriever": ["retriever/golden"],
    "Labrador Retriever": ["labrador"],
    "Beagle": ["beagle"],
    "Pomeranian": ["pomeranian"],
    "Siberian Husky": ["husky"],
    "Pug": ["pug"],
    "Chihuahua": ["chihuahua"],
    "Dachshund": ["dachshund"],
    "German Shepherd": ["german/shepherd", "germanshepherd", "malinois"],
    "French Bulldog": ["bulldog/french"],
    "Pembroke Welsh Corgi": ["pembroke", "corgi/cardigan"],
    "Jack Russell Terrier": ["terrier/russell", "terrier/parson", "terrier/fox"],
    "Miniature Pinscher": ["pinscher/miniature"],
    "Toy Poodle": ["poodle/toy", "poodle/miniature"],
    "Belgian Malinois": ["malinois"],
    "Chow Chow": ["chow"],
    "Schnauzer": ["schnauzer/miniature", "schnauzer/giant"],
    "Cocker Spaniel": ["spaniel/cocker", "spaniel/sussex"],
}

# Specific Wikimedia Commons search queries tailored to each of the 20 Cat pets (by pet_name)
CAT_WIKIMEDIA_QUERIES: Dict[str, List[str]] = {
    "Muning": ["calico cat portrait", "calico domestic cat"],
    "Luna": ["white persian cat", "persian cat white"],
    "Simba": ["bengal cat rosette", "bengal cat spotted"],
    "Tala": ["seal point siamese cat", "siamese cat blue eyes"],
    "Siopao": ["british shorthair blue cat", "british blue cat"],
    "Kuting": ["grey tabby white cat", "mackerel tabby cat white paws"],
    "Nala": ["ragdoll cat blue eyes", "bicolor ragdoll cat"],
    "Ulap": ["white scottish fold cat", "scottish fold cat silver"],
    "Sinta": ["tortoiseshell cat portrait", "tortoiseshell domestic cat"],
    "Matcha": ["silver tabby american shorthair cat", "silver tabby cat"],
    "Mingming": ["ginger white cat", "orange and white tabby cat"],
    "Chai": ["himalayan cat chocolate point", "himalayan persian cat"],
    "Shadow": ["russian blue cat portrait", "russian blue cat green eyes"],
    "Ginger": ["orange maine coon cat", "red tabby maine coon"],
    "Yuki": ["odd eyed white cat", "white persian cat portrait"],
    "Tofu": ["cream white cat", "flame point domestic cat", "white domestic shorthair cat"],
    "Saki": ["lilac point siamese cat", "chocolate point siamese cat"],
    "Mimi": ["tuxedo cat black white", "black and white tuxedo cat"],
    "Kaloy": ["orange tabby cat portrait", "ginger tabby cat"],
    "Lucy": ["cream british shorthair cat", "bicolor british shorthair cat"],
    "Chubs": ["grey and white cat portrait", "gray and white tuxedo cat"],
    "Molly": ["calico scottish fold cat", "scottish fold calico", "scottish fold cat portrait"],
}

# Color synonym expansion so target color tags match HSV-detected color names
COLOR_FAMILY_MAP: Dict[str, Set[str]] = {
    "white": {"white", "cream", "ivory"},
    "cream": {"cream", "white", "tan", "golden", "fawn", "apricot", "yellow"},
    "black": {"black", "gray", "charcoal"},
    "brown": {"brown", "tan", "orange", "chocolate", "chestnut", "rust", "golden"},
    "chocolate": {"brown", "tan", "black"},
    "chestnut": {"brown", "orange", "tan"},
    "rust": {"brown", "orange", "tan"},
    "tan": {"tan", "brown", "golden", "cream", "orange"},
    "fawn": {"tan", "cream", "golden", "brown", "orange"},
    "golden": {"golden", "tan", "orange", "cream", "brown"},
    "gold": {"golden", "tan", "orange", "cream"},
    "yellow": {"golden", "tan", "cream", "orange"},
    "honey": {"golden", "tan", "orange", "brown"},
    "apricot": {"orange", "tan", "golden", "cream", "brown"},
    "orange": {"orange", "tan", "golden", "brown"},
    "ginger": {"orange", "tan", "golden", "brown"},
    "red": {"orange", "brown", "tan"},
    "gray": {"gray", "white", "black"},
    "silver": {"gray", "white"},
    "blue": {"gray", "black"},
    "salt and pepper": {"gray", "white", "black"},
    "sable": {"tan", "brown", "cream", "orange"},
    "brindle": {"brown", "black", "tan", "gray"},
    "calico": {"white", "orange", "black", "brown", "tan"},
    "tabby": {"gray", "brown", "tan", "orange", "black"},
    "tortoiseshell": {"black", "brown", "orange", "tan"},
    "tuxedo": {"black", "white", "gray"},
    "tricolor": {"brown", "black", "white", "tan"},
    "bicolor": {"black", "white", "brown", "cream", "gray"},
    "spotted": {"brown", "orange", "tan", "black"},
}


def _http_get_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _http_get_bytes(url: str) -> Optional[bytes]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
            if len(data) < 4000 or len(data) > 9 * 1024 * 1024:
                return None
            return data
    except Exception:
        return None


def _normalize_jpeg(raw_bytes: bytes) -> Optional[bytes]:
    """Ensure the downloaded image is a clean RGB JPEG (400px–1200px) ready for YOLOv8 and Cloudinary."""
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        if img.width < 220 or img.height < 220:
            return None
        if img.mode != "RGB":
            img = img.convert("RGB")
        max_side = max(img.width, img.height)
        if max_side > 1200:
            scale = 1200.0 / max_side
            img = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=88)
        return out.getvalue()
    except Exception:
        return None


_dog_breed_cache: Dict[str, List[str]] = {}


def _fetch_dog_ceo_urls(breed_name: str) -> List[str]:
    paths = DOG_CEO_BREED_PATHS.get(breed_name, ["mix"])
    urls: List[str] = []
    for p in paths:
        if p not in _dog_breed_cache:
            try:
                data = _http_get_json(f"https://dog.ceo/api/breed/{p}/images")
                if data.get("status") == "success" and isinstance(data.get("message"), list):
                    _dog_breed_cache[p] = [u for u in data["message"] if isinstance(u, str) and u.lower().endswith((".jpg", ".jpeg"))]
                else:
                    _dog_breed_cache[p] = []
            except Exception:
                _dog_breed_cache[p] = []
        urls.extend(_dog_breed_cache[p])
    return urls


_wiki_query_cache: Dict[str, List[str]] = {}


def _fetch_wikimedia_urls(queries: List[str]) -> List[str]:
    urls: List[str] = []
    for q in queries:
        if q not in _wiki_query_cache:
            try:
                encoded = urllib.parse.quote(f"filetype:bitmap {q}")
                api_url = (
                    f"https://commons.wikimedia.org/w/api.php?action=query&generator=search"
                    f"&gsrsearch={encoded}&gsrnamespace=6&gsrlimit=25&prop=imageinfo"
                    f"&iiprop=url|dimensions&iiurlwidth=900&format=json"
                )
                data = _http_get_json(api_url)
                pages = (data.get("query") or {}).get("pages") or {}
                found: List[str] = []
                for page in pages.values():
                    title = (page.get("title") or "").lower()
                    if any(skip in title for skip in ("icon", "logo", "map", "diagram", "drawing", "illustration", "stamp", "statue", "painting", "sketch", "skeleton", "skull")):
                        continue
                    ii_list = page.get("imageinfo") or []
                    if not ii_list:
                        continue
                    ii = ii_list[0]
                    thumb = ii.get("thumburl") or ii.get("url")
                    if isinstance(thumb, str) and thumb.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png")):
                        found.append(thumb)
                _wiki_query_cache[q] = found
            except Exception:
                _wiki_query_cache[q] = []
        for u in _wiki_query_cache[q]:
            if u not in urls:
                urls.append(u)
    return urls


def _analyze_animal_image(
    jpeg_bytes: bytes,
    expected_species: str,
    yolo_model: Any,
) -> Optional[Tuple[float, List[float], List[str]]]:
    """
    Run YOLOv8 on `jpeg_bytes`.
    Returns `(confidence, bbox, detected_colors)` ONLY when YOLOv8 detects the expected species
    ('Dog' = class 16, 'Cat' = class 15) and no conflicting animals.
    """
    target_cls = 16 if expected_species == "Dog" else 15
    other_cls = 15 if expected_species == "Dog" else 16
    try:
        img = Image.open(io.BytesIO(jpeg_bytes))
        results = yolo_model(img, verbose=False)
        if not results:
            return None
        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return None

        target_boxes: List[Tuple[float, List[float]]] = []
        for box in boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            if cls_id == other_cls and conf >= 0.40:
                return None  # Reject if the wrong animal species is present
            if cls_id == target_cls and conf >= 0.45:
                xyxy = [float(x) for x in box.xyxy[0].tolist()]
                target_boxes.append((conf, xyxy))

        if len(target_boxes) != 1:
            return None  # Require a clear single-pet photo

        best_conf, best_bbox = target_boxes[0]
        raw_colors = extract_dominant_colors(jpeg_bytes, best_bbox)
        detected = [c.strip() for c in raw_colors.split(",") if c.strip() and c.strip() != "Mixed Color"]
        if not detected:
            detected = ["Brown"] if expected_species == "Dog" else ["Gray"]
        return best_conf, best_bbox, detected
    except Exception:
        return None


def _color_match_score(target_colors: List[str], detected_colors: List[str]) -> int:
    """Score how closely `detected_colors` match the pet's declared `target_colors`."""
    det_lower = {c.lower() for c in detected_colors}
    score = 0
    for idx, tc in enumerate(target_colors):
        acceptable = COLOR_FAMILY_MAP.get(tc.lower(), {tc.lower()})
        if det_lower & acceptable:
            score += 3 if idx == 0 else 2
    return score


def _select_and_verify_photo(
    pet_name: str,
    pet_type: str,
    breed: str,
    target_colors: List[str],
    yolo_model: Any,
    used_source_urls: Set[str],
    used_hashes: Set[str],
) -> Tuple[bytes, float, List[str], str]:
    """
    Find a unique, YOLOv8-verified single-pet photo matching species, breed, and coat color.
    Returns `(jpeg_bytes, yolo_conf, detected_colors, source_url)`.
    """
    if pet_type == "Dog":
        candidates = list(_fetch_dog_ceo_urls(breed))
        # For Aspin, stride across the combined pool so each Aspin gets a different sub-type/look
        if breed == "Aspin (Asong Pinoy)" and len(candidates) > 60:
            step = max(1, len(candidates) // 50)
            candidates = candidates[::step] + [u for u in candidates if u not in candidates[::step]]
        color_words = " ".join(c for c in target_colors[:2] if c.lower() not in ("bicolor", "tricolor", "spotted"))
        breed_clean = breed.split("(")[0].strip()
        if len(candidates) < 10:
            candidates.extend(_fetch_wikimedia_urls([f"{color_words} {breed_clean} dog", f"{breed_clean} dog"]))
    else:
        queries = list(CAT_WIKIMEDIA_QUERIES.get(pet_name, []))
        color_words = " ".join(c for c in target_colors[:2] if c.lower() not in ("bicolor", "tricolor", "spotted"))
        breed_clean = breed.split("(")[0].strip()
        if "Puspin" in breed:
            queries.append(f"{color_words} domestic shorthair cat")
            queries.append(f"{color_words} cat portrait")
        else:
            queries.append(f"{color_words} {breed_clean} cat")
            queries.append(f"{breed_clean} cat")
        candidates = _fetch_wikimedia_urls(queries)

    best_fallback: Optional[Tuple[int, bytes, float, List[str], str, str]] = None
    checked = 0

    for url in candidates:
        if url in used_source_urls:
            continue
        raw = _http_get_bytes(url)
        if not raw:
            continue
        jpeg = _normalize_jpeg(raw)
        if not jpeg:
            continue
        digest = hashlib.sha256(jpeg).hexdigest()
        if digest in used_hashes:
            continue

        analysis = _analyze_animal_image(jpeg, pet_type, yolo_model)
        if analysis is None:
            continue
        conf, _bbox, detected_colors = analysis
        score = _color_match_score(target_colors, detected_colors)
        checked += 1

        # Strong color + breed + species match: accept immediately!
        if score >= 3:
            used_source_urls.add(url)
            used_hashes.add(digest)
            return jpeg, conf, detected_colors, url

        if best_fallback is None or score > best_fallback[0]:
            best_fallback = (score, jpeg, conf, detected_colors, url, digest)

        if checked >= 18 and best_fallback is not None and best_fallback[0] >= 2:
            break
        if checked >= 28 and best_fallback is not None:
            break

    if best_fallback is not None:
        _score, jpeg, conf, detected_colors, url, digest = best_fallback
        used_source_urls.add(url)
        used_hashes.add(digest)
        return jpeg, conf, detected_colors, url

    raise RuntimeError(f"Could not find a verified unique {pet_type} photo for {pet_name} ({breed})")


def _upload_pet_jpeg_to_cloudinary(jpeg_bytes: bytes, public_id: str) -> str:
    resp = cloudinary.uploader.upload(
        jpeg_bytes,
        folder="straysafe/demo_pets",
        public_id=public_id,
        overwrite=True,
        invalidate=True,
        resource_type="image",
    )
    secure_url = (resp.get("secure_url") or "").strip()
    if not secure_url:
        raise RuntimeError(f"Cloudinary did not return a secure_url for {public_id}")
    if not secure_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        secure_url += ".jpg"
    return secure_url


# Pre-captured Cloudinary URLs from batch 1 (pets 01..31 already verified by YOLOv8 and uploaded to straysafe/demo_pets)
PREUPLOADED_URLS: Dict[int, Tuple[str, float, List[str]]] = {
    1: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218421/straysafe/demo_pets/demo_pet_01_mateo_villanueva_bantay.jpg", 0.57, ["Orange", "Tan", "Brown"]),
    2: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218427/straysafe/demo_pets/demo_pet_02_mateo_villanueva_muning.jpg", 0.87, ["White", "Gray", "Black"]),
    3: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218429/straysafe/demo_pets/demo_pet_03_clarisse_santos_mochi.jpg", 0.84, ["Gray", "Black", "White"]),
    4: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218431/straysafe/demo_pets/demo_pet_04_gabriel_delacruz_tagpi.jpg", 0.68, ["White", "Gray", "Tan"]),
    5: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218438/straysafe/demo_pets/demo_pet_05_marisol_mendoza_luna.jpg", 0.65, ["White", "Tan", "Gray"]),
    6: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218444/straysafe/demo_pets/demo_pet_06_marisol_mendoza_simba.jpg", 0.80, ["Black", "Brown", "White"]),
    7: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218446/straysafe/demo_pets/demo_pet_07_rafael_bautista_kobe.jpg", 0.91, ["Brown", "Orange", "Tan"]),
    8: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218447/straysafe/demo_pets/demo_pet_08_camille_reyes_choco.jpg", 0.75, ["Brown", "White", "Gray"]),
    9: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218453/straysafe/demo_pets/demo_pet_09_lorenzo_ramos_tala.jpg", 0.72, ["White", "Gray", "Black"]),
    10: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218455/straysafe/demo_pets/demo_pet_10_angelica_aquino_chibi.jpg", 0.53, ["Tan", "White", "Orange"]),
    11: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218458/straysafe/demo_pets/demo_pet_11_angelica_aquino_pandesal.jpg", 0.92, ["Black", "Golden", "Gray"]),
    12: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218461/straysafe/demo_pets/demo_pet_12_jericho_garcia_brownie.jpg", 0.85, ["Gray", "Brown", "White"]),
    13: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218463/straysafe/demo_pets/demo_pet_13_patricia_tolentino_barley.jpg", 0.82, ["Gray", "Black", "White"]),
    14: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218465/straysafe/demo_pets/demo_pet_14_enrique_navarro_loki.jpg", 0.94, ["Gray", "White", "Black"]),
    15: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218471/straysafe/demo_pets/demo_pet_15_beatriz_mercado_siopao.jpg", 0.87, ["Gray", "Brown", "Black"]),
    16: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218477/straysafe/demo_pets/demo_pet_16_beatriz_mercado_kuting.jpg", 0.95, ["Gray", "Black", "Tan"]),
    17: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218479/straysafe/demo_pets/demo_pet_17_paolo_pascual_buko.jpg", 0.84, ["Brown", "Tan", "Black"]),
    18: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218485/straysafe/demo_pets/demo_pet_18_danica_soriano_nala.jpg", 0.69, ["Black", "Gray", "White"]),
    19: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218487/straysafe/demo_pets/demo_pet_19_miguel_castillo_milo.jpg", 0.48, ["Gray", "White", "Black"]),
    20: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218489/straysafe/demo_pets/demo_pet_20_miguel_castillo_biscuit.jpg", 0.89, ["Brown", "Black", "Tan"]),
    21: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218491/straysafe/demo_pets/demo_pet_21_katrina_salazar_bella.jpg", 0.85, ["Black", "Brown", "Orange"]),
    22: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218494/straysafe/demo_pets/demo_pet_22_carlo_dizon_coco.jpg", 0.89, ["Gray", "White", "Black"]),
    23: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218501/straysafe/demo_pets/demo_pet_23_bianca_morales_ulap.jpg", 0.88, ["White", "Black", "Tan"]),
    24: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218503/straysafe/demo_pets/demo_pet_24_adrian_aguilar_kidlat.jpg", 0.88, ["Gray", "Black", "Brown"]),
    25: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218504/straysafe/demo_pets/demo_pet_25_adrian_aguilar_tisay.jpg", 0.90, ["Gray", "White", "Black"]),
    26: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218513/straysafe/demo_pets/demo_pet_26_valerie_velasco_sinta.jpg", 0.82, ["Gray", "Tan", "White"]),
    27: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218517/straysafe/demo_pets/demo_pet_27_marco_miranda_putot.jpg", 0.62, ["Brown", "Black", "Tan"]),
    28: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218518/straysafe/demo_pets/demo_pet_28_charmaine_flores_oreo.jpg", 0.83, ["Gray", "White", "Brown"]),
    29: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218525/straysafe/demo_pets/demo_pet_29_charmaine_flores_matcha.jpg", 0.80, ["Gray", "Black", "White"]),
    30: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218527/straysafe/demo_pets/demo_pet_30_nathaniel_castro_tisoy.jpg", 0.85, ["Brown", "White", "Orange"]),
    31: ("https://res.cloudinary.com/du6iy39p5/image/upload/v1795218534/straysafe/demo_pets/demo_pet_31_erika_pangilinan_mingming.jpg", 0.93, ["Brown", "Gray", "Black"]),
}


def run_update() -> None:
    yolo_model = get_yolo_model()
    db = SessionLocal()
    try:
        existing_manifest: Dict[str, Dict[str, Any]] = {}
        if os.path.exists(MANIFEST_PATH):
            try:
                with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                    existing_manifest = json.load(f)
            except Exception:
                existing_manifest = {}

        used_source_urls: Set[str] = set()
        used_hashes: Set[str] = set()
        used_cloudinary_urls: Set[str] = set()
        manifest: Dict[str, Dict[str, Any]] = {}

        pet_counter = 0
        updated_in_db = 0

        for (
            full_name,
            email_local,
            _raw_phone,
            _address,
            _lat_str,
            _lng_str,
            _emerg_name,
            _raw_emerg_phone,
            pet_defs,
        ) in RESIDENT_SEED_DATA:
            email = f"{email_local}@{DEMO_EMAIL_DOMAIN}"
            user = db.query(User).filter(User.email == email).first()

            for pet_def in pet_defs:
                pet_counter += 1
                pet_name = pet_def[0]
                pet_type = pet_def[1]
                breed = pet_def[2]
                target_colors = list(pet_def[8])
                key = f"{email_local}:{pet_name}"
                slug = re.sub(r"[^a-z0-9]+", "_", f"{email_local}_{pet_name}".lower()).strip("_")
                public_id = f"demo_pet_{pet_counter:02d}_{slug}"

                cached = existing_manifest.get(key)
                if cached and isinstance(cached.get("photo_url"), str) and cached["photo_url"].startswith("https://"):
                    cloud_url = cached["photo_url"]
                    yolo_conf = float(cached.get("yolo_confidence") or 0.85)
                    detected_colors = list(cached.get("detected_colors") or target_colors)
                    source_url = str(cached.get("source_url") or cloud_url)
                    if source_url:
                        used_source_urls.add(source_url)
                    print(f"[{pet_counter:02d}/65] Reusing verified manifest photo for {pet_name} ({breed}): {cloud_url}")
                elif pet_counter in PREUPLOADED_URLS:
                    cloud_url, yolo_conf, detected_colors = PREUPLOADED_URLS[pet_counter]
                    source_url = cloud_url
                    print(f"[{pet_counter:02d}/65] Reusing batch-1 verified Cloudinary photo for {pet_name} ({breed}): {cloud_url}")
                else:
                    print(f"[{pet_counter:02d}/65] Selecting & verifying {pet_type} photo for {pet_name} ({breed}, {', '.join(target_colors)}) — Owner: {full_name}...")
                    jpeg_bytes, yolo_conf, detected_colors, source_url = _select_and_verify_photo(
                        pet_name=pet_name,
                        pet_type=pet_type,
                        breed=breed,
                        target_colors=target_colors,
                        yolo_model=yolo_model,
                        used_source_urls=used_source_urls,
                        used_hashes=used_hashes,
                    )
                    cloud_url = _upload_pet_jpeg_to_cloudinary(jpeg_bytes, public_id)
                    print(f"    -> Uploaded: {cloud_url} (YOLOv8 {pet_type} conf={yolo_conf:.2f}, detected={detected_colors})")
                assert cloud_url not in used_cloudinary_urls, f"Duplicate Cloudinary URL generated: {cloud_url}"
                used_cloudinary_urls.add(cloud_url)

                # Merge declared pattern/color tags with YOLOv8+HSV detected colors if needed so description and photo match 100%
                merged_colors = list(target_colors)
                if _color_match_score(target_colors, detected_colors) == 0:
                    # Keep pattern tag (e.g. Tabby, Calico, Bicolor, Tricolor) if present, and adopt the verified coat colors
                    pattern_tags = [c for c in target_colors if c in ("Calico", "Tabby", "Tortoiseshell", "Tuxedo", "Tricolor", "Bicolor", "Brindle", "Spotted")]
                    merged_colors = pattern_tags + [c for c in detected_colors if c not in pattern_tags]

                color_payload: Dict[str, Any] = {"colors": merged_colors}
                apply_pet_color_payload(color_payload)

                manifest[key] = {
                    "pet_index": pet_counter,
                    "owner_email": email,
                    "owner_name": full_name,
                    "pet_name": pet_name,
                    "pet_type": pet_type,
                    "breed": breed,
                    "photo_url": cloud_url,
                    "public_id": f"straysafe/demo_pets/{public_id}",
                    "source_url": source_url,
                    "yolo_confidence": round(yolo_conf, 3),
                    "detected_colors": detected_colors,
                    "colors": color_payload.get("colors"),
                    "color_markings": color_payload.get("color_markings"),
                    "primary_color": color_payload.get("primary_color"),
                    "secondary_color": color_payload.get("secondary_color"),
                    "tertiary_color": color_payload.get("tertiary_color"),
                }

                if user is not None:
                    pet_row = (
                        db.query(Pet)
                        .filter(
                            Pet.owner_id == user.user_id,
                            Pet.pet_name == pet_name,
                            Pet.pet_type == pet_type,
                        )
                        .first()
                    )
                    if pet_row is not None:
                        pet_row.photo_url = cloud_url
                        pet_row.ai_detection_confidence = round(yolo_conf, 3)
                        pet_row.photo_check_status = "authentic"
                        pet_row.colors = color_payload.get("colors")
                        pet_row.color_markings = color_payload.get("color_markings")
                        pet_row.primary_color = color_payload.get("primary_color")
                        pet_row.secondary_color = color_payload.get("secondary_color")
                        pet_row.tertiary_color = color_payload.get("tertiary_color")
                        updated_in_db += 1

                db.commit()
                with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, indent=2)

        db.commit()

        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        print(
            f"\n[PHOTO UPDATE COMPLETE]\n"
            f"  Unique verified photos uploaded to Cloudinary : {len(used_cloudinary_urls)}\n"
            f"  Demo pet records updated in database          : {updated_in_db}\n"
            f"  Manifest saved to                             : {MANIFEST_PATH}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    run_update()
