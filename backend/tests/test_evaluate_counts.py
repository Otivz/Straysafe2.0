"""
The AI evaluation scores the animal count the way the resident sees it, covers the "Multiple Animals Detected" warning,
and accepts short videos and a "multiple" condition (AI_TODO.md section 3). YOLO is faked (decided by colour).
Run from the backend folder:  python tests/test_evaluate_counts.py
"""
import csv
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from scripts import evaluate_ai  # noqa: E402  (sets a throwaway DATABASE_URL before the app is imported)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


BROWN, GREEN, BLUE = (150, 90, 40), (40, 150, 60), (40, 60, 150)   # 1 dog / 2 dogs apart / 1 dog boxed twice
d = tempfile.mkdtemp()
PHOTOS = {
    "daylight/one_dog.jpg": (BROWN, ["daylight", "yes", "dog", "1", "Aspin", "Brown", "medium"]),
    "daylight/boxed_twice.jpg": (BLUE, ["daylight", "yes", "dog", "1", "Aspin", "Brown", "medium"]),
    "multiple/two_dogs.jpg": (GREEN, ["multiple", "yes", "dog", "2", "Aspin", "Brown", "medium"]),
}
for f, (rgb, _) in PHOTOS.items():
    os.makedirs(os.path.join(d, "photos", os.path.dirname(f)), exist_ok=True)
    img = Image.new("RGB", (200, 160), rgb)
    img.putpixel((0, 0), (len(f), 0, 0))
    img.save(os.path.join(d, "photos", f))


def video(path, rgb, frames=12):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 6, (200, 160))
    for i in range(frames):
        frame = np.full((160, 200, 3), rgb[::-1], dtype=np.uint8)   # OpenCV is BGR
        frame[0, 0] = (i, 0, 0)
        w.write(frame)
    w.release()


video(os.path.join(d, "photos", "daylight", "one_dog_clip.mp4"), BROWN)
VIDEOS = {"daylight/one_dog_clip.mp4": ["daylight", "yes", "dog", "1", "Aspin", "Brown", "medium"]}


def write(name, cols, rows):
    with open(os.path.join(d, name), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        w.writerows(rows)


LCOLS = ["file", "condition", "animal_present", "species", "count", "breed", "main_colour", "size", "notes"]
rows = [[f] + lab + [""] for f, (_, lab) in PHOTOS.items()] + [[f] + lab + [""] for f, lab in VIDEOS.items()]
write("labels_a.csv", LCOLS, rows)
write("labels_b.csv", LCOLS, rows)
PCOLS = ["pair_id", "file_a", "file_b", "same", "condition", "notes"]
write("pairs_a.csv", PCOLS, [])
write("pairs_b.csv", PCOLS, [])


def check_set(*extra):
    p = subprocess.run([sys.executable, os.path.join(HERE, "scripts", "check_test_set.py"), "--set-dir", d, *extra],
                       capture_output=True, text=True, encoding="utf-8")
    return p.returncode, p.stdout


code, txt = check_set()
check("the checker accepts videos and the 'multiple' condition", code == 0, txt)
check("...and shows the video count against its target", "Videos (any condition): 1 / 10" in txt and "multiple" in txt, txt)

# a 'multiple' photo labelled with 1 animal is refused; a video can't be used in a pair
write("labels_b.csv", LCOLS, [r if r[0] != "multiple/two_dogs.jpg" else r[:4] + ["1"] + r[5:] for r in rows])
write("labels_a.csv", LCOLS, [r if r[0] != "multiple/two_dogs.jpg" else r[:4] + ["1"] + r[5:] for r in rows])
code, txt = check_set()
check("a 'multiple' item must have 2 or more animals", code != 0 and "must have 2 or more animals" in txt, txt)
write("labels_a.csv", LCOLS, rows)
write("labels_b.csv", LCOLS, rows)
write("pairs_a.csv", PCOLS, [["P01", "daylight/one_dog.jpg", "daylight/one_dog_clip.mp4", "yes", "", ""]])
write("pairs_b.csv", PCOLS, [["P01", "daylight/one_dog.jpg", "daylight/one_dog_clip.mp4", "yes", "", ""]])
code, txt = check_set()
check("a video can't be used in a matching pair", code != 0 and "pairs are compared on photos only" in txt, txt)
write("pairs_a.csv", PCOLS, [])
write("pairs_b.csv", PCOLS, [])
code, txt = check_set("--freeze", "--allow-short")
check("setup: the set is frozen", code == 0, txt)


# --- fake YOLO by colour (photos come as a path, video frames as an image) ------------------------------------------
class Box(list):
    def tolist(self):
        return list(self)


def fake_model(src, *a, **k):
    img = src if isinstance(src, Image.Image) else Image.open(src)
    r, g, b = img.convert("RGB").getpixel((100, 80))
    if r > 120:                       # brown: one dog
        dets = [(10.0, 10.0, 190.0, 150.0, 0.9)]
    elif g > 120:                     # green: two dogs side by side
        dets = [(5.0, 10.0, 95.0, 150.0, 0.9), (105.0, 10.0, 195.0, 150.0, 0.85)]
    elif b > 120:                     # blue: one dog boxed twice (overlapping)
        dets = [(10.0, 10.0, 190.0, 150.0, 0.9), (14.0, 12.0, 186.0, 148.0, 0.6)]
    else:
        dets = []
    boxes = type("B", (), {})()
    boxes.cls = [0 for _ in dets]
    boxes.xyxy = [Box(list(x[:4])) for x in dets]
    boxes.conf = [x[4] for x in dets]
    return [type("R", (), {"names": {0: "dog"}, "boxes": boxes})()]


from app.routes import reports  # noqa: E402
reports.get_yolo_model = lambda: fake_model
out = evaluate_ai.evaluate(set_dir=d, gemini=False)
by = {r["file"]: r for r in out["rows"]}
check("photos and the video are all analysed", len(out["rows"]) == 4 and all(r["http"] == 200 for r in out["rows"]),
      [(r["file"], r["http"]) for r in out["rows"]])
check("one dog: counted 1, no warning", by["daylight/one_dog.jpg"]["app_count"] == 1 and not by["daylight/one_dog.jpg"]["app_multiple"])
b2 = by["daylight/boxed_twice.jpg"]
check("one dog boxed twice: 2 raw boxes, but counted 1 and no warning (the fixed bug)",
      b2["yolo_boxes"] == 2 and b2["yolo_count"] == 1 and b2["app_count"] == 1 and not b2["app_multiple"], b2)
t2 = by["multiple/two_dogs.jpg"]
check("two dogs side by side: counted 2, with the warning", t2["app_count"] == 2 and t2["app_multiple"], t2)
v = by["daylight/one_dog_clip.mp4"]
check("a one-dog video: counted 1, no warning (not 10+)", v["media"] == "video" and v["app_found"] and v["app_count"] == 1
      and not v["app_multiple"], v)

text = open(out["report"], encoding="utf-8").read()
check("the report scores the count the resident sees", "## 3a. Number of animals: the app's final count" in text
      and "| **All** | 4 | 4 | 100% |" in text, text[text.find("## 3a"):text.find("## 3a") + 600])
check("...and YOLOv8 alone with overlapping boxes merged", "## 3b. Number of animals: YOLOv8 alone" in text)
check("the multiple-animal warning is scored as TP / FP / FN / TN",
      "## 3c. The \"Multiple Animals Detected\" warning" in text and "| **All with an animal** | 4 | 1 | 0 | 0 | 3 |" in text,
      text[text.find("## 3c"):text.find("## 3c") + 700])
check("photos and videos are compared", "## 3d. Photos vs videos" in text and "| videos | 1 |" in text)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
