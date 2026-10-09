"""
V4 (AI accuracy plan): the evaluation runs a frozen test set through the app's own analysis and matching code and
counts correct answers, false positives and false negatives. YOLO is faked here (decided by the photo's colour).
Run from the backend folder:  python tests/test_evaluate_ai.py
"""
import csv
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from PIL import Image  # noqa: E402

from scripts import evaluate_ai  # noqa: E402  (sets a throwaway DATABASE_URL before the app is imported)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


# --- a tiny test set -------------------------------------------------------------------------------------------------
d = tempfile.mkdtemp()
PHOTOS = {  # file: (colour, label row)
    "daylight/dog1.jpg": ((150, 90, 40), ["daylight", "yes", "dog", "1", "Aspin", "Brown", "medium"]),
    "daylight/dog2.jpg": ((152, 92, 42), ["daylight", "yes", "dog", "1", "Aspin", "Brown", "medium"]),
    "low_light/cat1.jpg": ((20, 20, 20), ["low_light", "yes", "cat", "1", "Puspin", "Black", "small"]),
    "low_light/missed.jpg": ((10, 10, 60), ["low_light", "yes", "dog", "1", "Aspin", "Black", "medium"]),  # YOLO misses it
    "negative/bag.jpg": ((90, 90, 90), ["negative", "no", "none", "0", "", "", ""]),
    "negative/toy.jpg": ((151, 91, 41), ["negative", "no", "none", "0", "", "", ""]),  # looks like a dog: false positive
}
for f, (rgb, _) in PHOTOS.items():
    os.makedirs(os.path.join(d, "photos", os.path.dirname(f)), exist_ok=True)
    img = Image.new("RGB", (200, 160), rgb)
    img.putpixel((0, 0), (len(f), 0, 0))  # every file different, so no "identical photos" warning
    img.save(os.path.join(d, "photos", f))


def write(name, cols, rows):
    with open(os.path.join(d, name), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        w.writerows(rows)


LCOLS = ["file", "condition", "animal_present", "species", "count", "breed", "main_colour", "size", "notes"]
rows = [[f] + lab + [""] for f, (_, lab) in PHOTOS.items()]
write("labels_a.csv", LCOLS, rows)
write("labels_b.csv", LCOLS, rows)
PCOLS = ["pair_id", "file_a", "file_b", "same", "condition", "notes"]
pairs = [["P01", "daylight/dog1.jpg", "daylight/dog2.jpg", "yes", "daylight", ""],
         ["P02", "daylight/dog1.jpg", "low_light/cat1.jpg", "no", "look_alike", ""]]
write("pairs_a.csv", PCOLS, pairs)
write("pairs_b.csv", PCOLS, pairs)

code, _ = (lambda p: (p.returncode, p.stdout))(subprocess.run(
    [sys.executable, os.path.join(HERE, "scripts", "check_test_set.py"), "--set-dir", d, "--freeze", "--allow-short"],
    capture_output=True, text=True, encoding="utf-8"))
check("setup: the small set is frozen", code == 0)


# --- fake YOLO: brown photo -> dog (0.9), black -> cat (0.6), anything else -> nothing ------------------------------
class Box(list):
    def tolist(self):
        return list(self)


def fake_model(path, *a, **k):
    rgb = Image.open(path).convert("RGB").getpixel((100, 80))
    dets = []
    if rgb[0] > 120 and rgb[1] > 60:
        dets = [(0, 0.9)]
    elif max(rgb) < 40:
        dets = [(1, 0.6)]
    boxes = type("B", (), {})()
    boxes.cls = [c for c, _ in dets]
    boxes.xyxy = [Box([10.0, 10.0, 190.0, 150.0]) for _ in dets]
    boxes.conf = [c for _, c in dets]
    return [type("R", (), {"names": {0: "dog", 1: "cat"}, "boxes": boxes})()]


from app.routes import reports  # noqa: E402

reports.get_yolo_model = lambda: fake_model

out = evaluate_ai.evaluate(set_dir=d, gemini=False)
by = {r["file"]: r for r in out["rows"]}
check("every labelled photo is run through the app's analysis", len(out["rows"]) == len(PHOTOS) and all(r["http"] == 200 for r in out["rows"]),
      [r["http"] for r in out["rows"]])
check("a correct detection is counted as found, with YOLO's confidence", by["daylight/dog1.jpg"]["app_found"] and by["daylight/dog1.jpg"]["yolo_conf"] == 0.9)
check("a missed animal is a false negative", not by["low_light/missed.jpg"]["app_found"])
check("an animal 'found' in a negative photo is a false positive", by["negative/toy.jpg"]["app_found"])
check("an empty negative photo is a correct rejection", not by["negative/bag.jpg"]["app_found"])
text = open(out["report"], encoding="utf-8").read()
check("the report has the detection table with TP / FP / FN / TN", "| **All** | 6 | 3 | 1 | 1 | 1 | 75% | 75% | 67% |" in text, text[:1500])
check("...broken down per condition", "| low_light | 2 |" in text and "| negative | 2 |" in text)
check("species is scored on animals that were found", "## 2. Species" in text)
check("breed and size are reported as not predicted with Gemini off (not scored)", "Not predicted with Gemini off" in text)
check("YOLO confidence bands are reported", "## 7. Is YOLOv8's confidence meaningful?" in text and "| ≥ 85% | 3 |" in text, text)
check("pairs are scored at both thresholds and swept", "### Threshold 50" in text and "### Threshold 65" in text and "Threshold sweep" in text)
check("failures are listed for the paper", "| negative/toy.jpg | negative | no animal |" in text and "false negative" in text)
check("a per-photo CSV is written", os.path.exists(out["csv"]))

# A photo changed after freezing is refused
Image.new("RGB", (200, 160), (1, 2, 3)).save(os.path.join(d, "photos", "negative", "bag.jpg"))
try:
    evaluate_ai.load_set(d)
    refused = False
except SystemExit as e:
    refused = "changed since the set was frozen" in str(e)
check("a photo changed after freezing is refused", refused)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
