"""
V3 (AI accuracy plan): the test set checker compares the two labellers, counts against targets and freezes the set.
Run from the backend folder:  python tests/test_check_test_set.py
"""
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(HERE, "scripts", "check_test_set.py")
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


d = tempfile.mkdtemp()
for c in ("daylight", "low_light", "negative"):
    os.makedirs(os.path.join(d, "photos", c))
Image.new("RGB", (40, 30), (150, 90, 40)).save(os.path.join(d, "photos", "daylight", "dl_001.jpg"))
Image.new("RGB", (40, 30), (20, 20, 20)).save(os.path.join(d, "photos", "low_light", "ll_001.jpg"))
Image.new("RGB", (40, 30), (90, 90, 90)).save(os.path.join(d, "photos", "negative", "ng_001.jpg"))
shutil.copy(os.path.join(d, "photos", "daylight", "dl_001.jpg"), os.path.join(d, "photos", "daylight", "dl_copy.jpg"))

COLS = ["file", "condition", "animal_present", "species", "count", "breed", "main_colour", "size", "notes"]


def write(name, rows, cols=COLS):
    with open(os.path.join(d, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)


def run(*extra):
    p = subprocess.run([sys.executable, SCRIPT, "--set-dir", d, *extra], capture_output=True, text=True, encoding="utf-8")
    return p.returncode, p.stdout


A = [["daylight/dl_001.jpg", "daylight", "yes", "dog", "1", "Aspin", "Brown", "medium", ""],
     ["low_light/ll_001.jpg", "low_light", "yes", "cat", "1", "Puspin", "Black", "small", "dark"],
     ["negative/ng_001.jpg", "negative", "no", "none", "0", "", "", "", "a bag"],
     ["daylight/dl_copy.jpg", "daylight", "yes", "dog", "1", "Aspin", "Brown", "medium", ""]]
B = [r[:] for r in A]
B[1][6] = "Gray"  # the labellers disagree on a colour
write("labels_a.csv", A)
write("labels_b.csv", B)
PCOLS = ["pair_id", "file_a", "file_b", "same", "condition", "notes"]
write("pairs_a.csv", [["P01", "daylight/dl_001.jpg", "low_light/ll_001.jpg", "no", "look_alike", ""]], PCOLS)
write("pairs_b.csv", [["P01", "daylight/dl_001.jpg", "low_light/ll_001.jpg", "no", "look_alike", ""]], PCOLS)

code, out = run()
check("a disagreement makes the check fail", code == 1, out[-400:])
check("...and is listed for the labellers to resolve", os.path.exists(os.path.join(d, "disagreements.csv"))
      and "main_colour" in open(os.path.join(d, "disagreements.csv"), encoding="utf-8").read())
check("agreement per field is reported", "main_colour" in out and "75%" in out, out[-600:])
check("identical photos are warned about", "identical photos" in out)
code, _ = run("--freeze", "--allow-short")
check("it can't be frozen with a disagreement", code == 1 and not os.path.exists(os.path.join(d, "manifest.json")))

B[1][6] = "Black"  # resolved together
write("labels_b.csv", B)
code, out = run()
check("after resolving, the check passes", code == 0 and not os.path.exists(os.path.join(d, "disagreements.csv")), out[-400:])
check("targets that aren't met are reported", "SHORT" in out)
code, out = run("--freeze")
check("freezing refuses while targets are short (without --allow-short)", code == 1 and "targets not met" in out)
code, out = run("--freeze", "--allow-short")
m = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8")) if os.path.exists(os.path.join(d, "manifest.json")) else {}
check("freezing writes labels.csv, pairs.csv and manifest.json", code == 0 and os.path.exists(os.path.join(d, "labels.csv"))
      and os.path.exists(os.path.join(d, "pairs.csv")) and m.get("version") == 1, out[-400:])
check("...with every photo's SHA-256 hash", len(m.get("photos", {})) == 4 and all(len(h) == 64 for h in m["photos"].values()))
code, out = run("--freeze", "--allow-short")
check("the same version can't be frozen twice", code == 1 and "--version 2" in out)

# Label errors are caught
A2 = A + [["negative/ng_001.jpg", "daylight", "yes", "none", "0", "", "", "", ""]]
write("labels_a.csv", A2)
code, out = run()
check("bad labels are reported (twice labelled, wrong folder, species none with an animal)",
      code == 1 and "labelled twice" in out and "is in folder 'negative'" in out and "species can't be 'none'" in out, out[-800:])
write("labels_a.csv", A + [["daylight/missing.jpg", "daylight", "yes", "dog", "1", "Aspin", "Brown", "medium", ""]])
code, out = run()
check("a label for a photo that doesn't exist is reported", code == 1 and "missing.jpg not found" in out)

shutil.rmtree(d, ignore_errors=True)
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
