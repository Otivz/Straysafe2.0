"""
V4 (AI accuracy plan): run the frozen labelled test set (ai_test_set/, see its README) through the SAME code the app
uses, and count correct answers, false positives and false negatives per component and per condition.

    python scripts/evaluate_ai.py                     # YOLOv8 + Pillow + rule engine only (free, no Gemini calls)
    python scripts/evaluate_ai.py --gemini            # also Gemini (photo analysis, suggestions, Vision matching; uses API quota)
    python scripts/evaluate_ai.py --set-dir PATH --out results.md

What runs:
- every photo goes through the report form's analysis endpoint (POST /reports/analyze-media), in-process: YOLOv8 finds
  the animal, Pillow reads the colours, Gemini (if on) describes it and checks the photo
- in --gemini mode, the report suggestion step (the values staff see with "AI: high / AI unsure" tags) also runs
- every pair goes through the matching scorer (calculate_match_details), photos only (no location or time)

Read-only: nothing is written to any database (it runs on a throwaway database and a stand-in user). Results are written
to ai_test_set/results/ (a markdown report and a per-photo CSV for the failure examples).
"""
import argparse
import csv
import hashlib
import json
import os
import sys
import tempfile
import time
from collections import Counter, defaultdict
from types import SimpleNamespace

# Never touch the live database: the analysis needs none, and this guarantees it
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "evaluate_ai.db")
os.environ.setdefault("JWT_SECRET_KEY", "evaluate-ai-not-a-real-secret-0123456789abcdef")
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
DEFAULT_DIR = os.path.join(os.path.dirname(BACKEND), "ai_test_set")

CONDITIONS = ["daylight", "low_light", "angle", "partial", "small", "breed", "negative"]
YOLO_BANDS = [(0.0, 0.5, "< 50%"), (0.5, 0.7, "50–69%"), (0.7, 0.85, "70–84%"), (0.85, 1.01, "≥ 85%")]
PAIR_THRESHOLDS = {"pet look-alike": 50, "duplicate report": 65}
SWEEP = list(range(30, 95, 5))


def low(v):
    return (v or "").strip().lower()


def pct(n, d):
    return "—" if not d else f"{n / d * 100:.0f}%"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_set(d):
    """The frozen set. Refuses a set that isn't frozen or whose photos changed since."""
    mpath = os.path.join(d, "manifest.json")
    if not os.path.exists(mpath):
        raise SystemExit("The test set isn't frozen yet: run scripts/check_test_set.py --freeze first.")
    manifest = json.load(open(mpath, encoding="utf-8"))
    photos_dir = os.path.join(d, "photos")
    changed = [f for f, h in manifest["photos"].items()
               if not os.path.exists(os.path.join(photos_dir, f)) or sha256(os.path.join(photos_dir, f)) != h]
    if changed:
        raise SystemExit("These photos are missing or changed since the set was frozen (freeze a new version):\n  "
                         + "\n  ".join(changed))
    with open(os.path.join(d, "labels.csv"), newline="", encoding="utf-8") as f:
        labels = list(csv.DictReader(f))
    pairs = []
    if os.path.exists(os.path.join(d, "pairs.csv")):
        with open(os.path.join(d, "pairs.csv"), newline="", encoding="utf-8") as f:
            pairs = list(csv.DictReader(f))
    return manifest, photos_dir, labels, pairs


def app_client(gemini: bool):
    """The real reports router, with a stand-in signed-in user, no rate limit, and Gemini forced on or off."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import app.models  # noqa: F401
    from app.routes import reports
    from app.utils import ai_suggestions
    from app.utils.auth import get_current_user

    off = (lambda *a, **k: gemini)
    ai_suggestions.is_gemini_enabled_in_db = off
    reports.is_gemini_enabled_in_db = off
    try:
        from app.utils import photo_checks
        photo_checks.is_gemini_enabled_in_db = off
    except Exception:
        pass
    reports.limiter.enabled = False
    api = FastAPI()
    api.include_router(reports.router)
    api.dependency_overrides[get_current_user] = lambda: SimpleNamespace(user_id=0, role_id=2, name="Evaluator")
    return TestClient(api, raise_server_exceptions=False)


def analyse_photos(client, photos_dir, labels, gemini, suggestions):
    from app.utils import ai_pipeline
    from app.utils.ai_suggestions import generate_ai_suggestions
    rows = []
    for lab in labels:
        path = os.path.join(photos_dir, lab["file"])
        content = open(path, "rb").read()
        t = time.perf_counter()
        r = client.post("/reports/analyze-media", files={"file": (os.path.basename(path), content, "image/jpeg")})
        secs = time.perf_counter() - t
        out = r.json() if r.status_code == 200 else {}
        cached = ai_pipeline.cached_analysis(content)
        yolo_labels = (cached.get("yolo") or ([], []))[0]
        yolo_confs = cached.get("yolo_conf") or []
        row = {
            "file": lab["file"], "condition": low(lab["condition"]),
            "expected_present": low(lab["animal_present"]) == "yes", "expected_species": low(lab["species"]),
            "expected_count": int(lab["count"] or 0), "expected_breed": low(lab["breed"]),
            "expected_colour": low(lab["main_colour"]), "expected_size": low(lab["size"]),
            "http": r.status_code, "seconds": round(secs, 2),
            "yolo_found": bool(yolo_labels), "yolo_count": len(yolo_labels),
            "yolo_species": low(yolo_labels[0]) if yolo_labels else "",
            "yolo_conf": round(max(yolo_confs), 3) if yolo_confs else None,
            "app_found": bool(out.get("animal_detected")), "app_species": low(out.get("animal_type")),
            "app_colours": [low(out.get(k)) for k in ("primary_color", "secondary_color", "tertiary_color")
                            if low(out.get(k)) not in ("", "none", "unknown")],
            "app_breed": low(out.get("possible_breed")), "app_size": low(out.get("estimated_size")),
            "photo_status": out.get("ai_photo_status") or "",
            "sugg_breed": "", "sugg_size": "", "sugg_colour": "", "sugg_species": "", "sugg_conf": {},
        }
        if gemini and suggestions and row["app_found"]:
            s = generate_ai_suggestions(description="", category_name="", media_animal_type=out.get("animal_type"),
                                        media_dominant_color=out.get("primary_color"), media_estimated_size=out.get("estimated_size"))
            row.update(sugg_breed=low(s.get("ai_possible_breed")), sugg_size=low(s.get("ai_estimated_size")),
                       sugg_colour=low(s.get("ai_dominant_color")), sugg_species=low(s.get("ai_animal_type")),
                       sugg_conf=s.get("ai_field_confidence") or {})
        rows.append(row)
        print(f"  {lab['file']}: found={row['app_found']} species={row['app_species']} yolo={row['yolo_conf']} ({secs:.1f}s)")
    return rows


def score_pairs(pairs, photos_dir, by_file, gemini):
    from app.routes.matches import calculate_match_details

    def entity(i, f):
        a = by_file.get(f, {})
        return SimpleNamespace(
            report_id=i, animal_type=(a.get("app_species") or "unknown").capitalize(), ai_animal_type=None,
            animal_breed=a.get("app_breed") or None, ai_possible_breed=None,
            animal_color=" ".join(c.capitalize() for c in a.get("app_colours", [])) or None, ai_dominant_color=None,
            ai_coat_pattern=None, estimated_size=(a.get("app_size") or "").capitalize() or None, ai_estimated_size=None,
            description="", latitude=None, longitude=None, created_at=None, current_status_id=2,
            media=[SimpleNamespace(file_url=os.path.join(photos_dir, f), media_type="Image")], primary_photo_url=None,
        )
    out = []
    for n, p in enumerate(pairs, start=1):
        d = calculate_match_details(entity(2 * n, p["file_a"]), entity(2 * n + 1, p["file_b"]), is_pet=False, db=None, allow_vision=gemini)
        out.append({"pair_id": p["pair_id"], "same": low(p["same"]) == "yes", "condition": low(p.get("condition")) or "(none)",
                    "score": d.get("score") or 0,
                    "assessment": (d.get("visual_comparison") or {}).get("final_assessment", "POTENTIAL MATCH"),
                    "has_evidence": bool(d.get("evidence"))})
        print(f"  pair {p['pair_id']}: same={p['same']} score={out[-1]['score']}")
    return out


def confusion(items, predicted, actual):
    c = Counter()
    for x in items:
        p, a = predicted(x), actual(x)
        c[("T" if p == a else "F") + ("P" if p else "N")] += 1
    return c


def conf_line(name, c):
    tp, fp, fn, tn = c["TP"], c["FP"], c["FN"], c["TN"]
    return (f"| {name} | {tp + fp + fn + tn} | {tp} | {fp} | {fn} | {tn} | {pct(tp, tp + fp)} | {pct(tp, tp + fn)} | "
            f"{pct(tp + tn, tp + fp + fn + tn)} |")


CONF_HEAD = ["| | Photos | Correct detections (TP) | False positives (FP) | False negatives (FN) | Correct rejections (TN) | Precision | Recall | Accuracy |",
             "|---|---|---|---|---|---|---|---|---|"]


def report(rows, pair_rows, manifest, gemini, suggestions):
    L = [f"# AI validation results (test set v{manifest.get('version')}, frozen {manifest.get('frozen_at')})\n",
         f"Mode: **{'YOLOv8 + Pillow + Gemini' if gemini else 'YOLOv8 + Pillow + rule engine (Gemini off)'}**. "
         f"Photos: {len(rows)}. Pairs: {len(pair_rows)}. Run through the app's own analysis and matching code.\n",
         "Precision = of the photos where an animal was reported, how many really had one. Recall = of the photos with an "
         "animal, how many were found. FP = an animal \"found\" where there is none. FN = an animal missed.\n"]
    conds = [c for c in CONDITIONS if any(r["condition"] == c for r in rows)]

    # 1. Detection
    for title, key in (("YOLOv8 alone", "yolo_found"), ("App's final answer (YOLOv8 + Gemini)" if gemini else "App's final answer", "app_found")):
        L += [f"\n## 1. Animal detection: {title}\n"] + CONF_HEAD
        L.append(conf_line("**All**", confusion(rows, lambda r: r[key], lambda r: r["expected_present"])))
        for c in conds:
            L.append(conf_line(c, confusion([r for r in rows if r["condition"] == c], lambda r: r[key], lambda r: r["expected_present"])))

    with_animal = [r for r in rows if r["expected_present"]]
    found = [r for r in with_animal if r["app_found"]]

    def acc_table(title, items, ok, note=""):
        L.append(f"\n## {title}\n")
        if note:
            L.append(note + "\n")
        L.extend(["| Condition | Scored | Correct | Accuracy |", "|---|---|---|---|",
              f"| **All** | {len(items)} | {sum(ok(r) for r in items)} | {pct(sum(ok(r) for r in items), len(items))} |"])
        for c in conds:
            sub = [r for r in items if r["condition"] == c]
            if sub:
                L.append(f"| {c} | {len(sub)} | {sum(ok(r) for r in sub)} | {pct(sum(ok(r) for r in sub), len(sub))} |")

    acc_table("2. Species (dog / cat), on animals that were found", found, lambda r: r["app_species"] == r["expected_species"])
    yolo_found = [r for r in with_animal if r["yolo_found"]]
    acc_table("3. Number of animals (YOLOv8), on photos with an animal", with_animal, lambda r: r["yolo_count"] == r["expected_count"])
    acc_table("4a. Main coat colour, first colour reported", [r for r in found if r["expected_colour"]],
              lambda r: bool(r["app_colours"]) and r["app_colours"][0] == r["expected_colour"],
              "Colour comes from Pillow (Gemini off) or Gemini Vision (Gemini on).")
    acc_table("4b. Main coat colour, among the colours reported", [r for r in found if r["expected_colour"]],
              lambda r: r["expected_colour"] in r["app_colours"])
    if gemini:
        known = [r for r in found if r["expected_breed"] not in ("", "unknown")]
        acc_table("5. Breed (Gemini Vision)", known, lambda r: r["app_breed"] == r["expected_breed"])
        sized = [r for r in found if r["expected_size"] not in ("", "unknown")]
        acc_table("6. Size (Gemini Vision)", sized, lambda r: r["app_size"] == r["expected_size"])
    else:
        L += ["\n## 5–6. Breed and size\n",
              "**Not predicted with Gemini off.** The app then fills in a fixed default (Aspin / Puspin, Medium / Small), "
              "which is not an AI prediction and is not scored. Run with `--gemini` to measure them.\n"]

    # 7. YOLO confidence bands
    L += ["\n## 7. Is YOLOv8's confidence meaningful?\n",
          "Of the photos where YOLOv8 found a dog/cat, by its confidence: how often there really was an animal of that species.\n",
          "| YOLOv8 confidence | Detections | Really that animal | Share |", "|---|---|---|---|"]
    det = [r for r in rows if r["yolo_conf"] is not None]
    for lo, hi, name in YOLO_BANDS:
        b = [r for r in det if lo <= r["yolo_conf"] < hi]
        ok = sum(r["expected_present"] and r["yolo_species"] == r["expected_species"] for r in b)
        L.append(f"| {name} | {len(b)} | {ok} | {pct(ok, len(b))} |")

    # 8. Gemini field confidence calibration
    if gemini and suggestions:
        L += ["\n## 8. Is Gemini's own confidence meaningful? (report suggestions, the values with \"AI: high / AI unsure\" tags)\n",
              "| Field | Confidence | Suggestions | Correct | Share |", "|---|---|---|---|---|"]
        fields = (("breed", "sugg_breed", "expected_breed"), ("size", "sugg_size", "expected_size"),
                  ("color", "sugg_colour", "expected_colour"), ("animal_type", "sugg_species", "expected_species"))
        for fname, got, exp in fields:
            for level in ("high", "medium", "low"):
                b = [r for r in found if r["sugg_conf"].get(fname) == level and r[exp] not in ("", "unknown")]
                ok = sum((r[exp] in r[got].replace(",", " ").split()) if fname == "color" else (r[got] == r[exp]) for r in b)
                L.append(f"| {fname} | {level} | {len(b)} | {ok} | {pct(ok, len(b))} |")
        L.append("\nIf \"high\" isn't clearly more often right than \"low\", the tags shouldn't be relied on.\n")

    # 9. Pairs
    if pair_rows:
        L.append("\n## 9. Matching pairs (same animal or not), photos only\n")
        L.append("Location and time are not part of this test (the photos have none), so this measures the visual side only.\n")
        for name, t in PAIR_THRESHOLDS.items():
            def sug(p, t=t):
                return p["score"] >= t and p["assessment"] not in ("NOT A MATCH", "LOW CONFIDENCE") and p["has_evidence"]
            L += [f"\n### Threshold {t} ({name})\n"] + CONF_HEAD
            L.append(conf_line("**All pairs**", confusion(pair_rows, sug, lambda p: p["same"])))
            for c in sorted({p["condition"] for p in pair_rows}):
                L.append(conf_line(c, confusion([p for p in pair_rows if p["condition"] == c], sug, lambda p: p["same"])))
        L += ["\n### Threshold sweep\n", "| Threshold | TP | FP | FN | TN | Precision | Recall |", "|---|---|---|---|---|---|---|"]
        for t in SWEEP:
            c = confusion(pair_rows, lambda p, t=t: p["score"] >= t and p["assessment"] not in ("NOT A MATCH", "LOW CONFIDENCE")
                          and p["has_evidence"], lambda p: p["same"])
            mark = " **(in use)**" if t in PAIR_THRESHOLDS.values() else ""
            L.append(f"| {t}{mark} | {c['TP']} | {c['FP']} | {c['FN']} | {c['TN']} | {pct(c['TP'], c['TP'] + c['FP'])} | {pct(c['TP'], c['TP'] + c['FN'])} |")

    # 10. Speed
    secs = [r["seconds"] for r in rows]
    L += ["\n## 10. Speed\n", f"Average {sum(secs) / len(secs):.1f} s per photo (slowest {max(secs):.1f} s) on this machine.\n" if secs else "—\n"]

    # 11. Failures
    L += ["\n## 11. Failures (for the examples in the paper)\n", "| Photo | Condition | Expected | Got | Kind |", "|---|---|---|---|---|"]
    for r in rows:
        exp = f"{r['expected_species']} ×{r['expected_count']}" if r["expected_present"] else "no animal"
        got = f"{r['app_species']} (YOLO {r['yolo_conf']})" if r["app_found"] else "no animal"
        if r["app_found"] != r["expected_present"]:
            L.append(f"| {r['file']} | {r['condition']} | {exp} | {got} | {'false positive' if r['app_found'] else 'false negative'} |")
        elif r["app_found"] and r["app_species"] != r["expected_species"]:
            L.append(f"| {r['file']} | {r['condition']} | {exp} | {got} | wrong species |")
    for p in pair_rows:
        if (p["score"] >= 65) != p["same"]:
            L.append(f"| pair {p['pair_id']} | {p['condition']} | {'same' if p['same'] else 'different'} | score {p['score']} ({p['assessment']}) | "
                     f"{'false match' if not p['same'] else 'missed match'} |")
    if any(r["http"] != 200 for r in rows):
        L.append(f"\n{sum(r['http'] != 200 for r in rows)} photo(s) could not be analysed (see the CSV).")

    L += ["\n## Limits\n",
          f"- Test set of {len(rows)} photos and {len(pair_rows)} pairs, taken locally; results may differ elsewhere.",
          "- Labels are by two people (agreement in `manifest.json`); a few labels may still be wrong.",
          "- Gemini results depend on the model version on the day of the run" + (" (this run used Gemini)." if gemini else " (not used in this run)."),
          "- Pairs are compared on photos only, without location and time."]
    return "\n".join(L) + "\n"


def evaluate(set_dir=DEFAULT_DIR, gemini=False, suggestions=True, out=None):
    if gemini and not os.getenv("GEMINI_API_KEY"):
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND, ".env"))
        if not os.getenv("GEMINI_API_KEY"):
            raise SystemExit("--gemini needs GEMINI_API_KEY (in backend/.env).")
    manifest, photos_dir, labels, pairs = load_set(set_dir)
    client = app_client(gemini)
    print(f"Analysing {len(labels)} photos...")
    rows = analyse_photos(client, photos_dir, labels, gemini, suggestions)
    by_file = {r["file"]: r for r in rows}
    # Pair photos that aren't labelled photos are analysed too, so matching gets the same inputs as in the app
    extra = sorted({f for p in pairs for f in (p["file_a"], p["file_b"])} - set(by_file))
    if extra:
        stub = [{"file": f, "condition": "", "animal_present": "yes", "species": "", "count": "1", "breed": "", "main_colour": "", "size": ""} for f in extra]
        by_file.update({r["file"]: r for r in analyse_photos(client, photos_dir, stub, gemini, False)})
    print(f"Scoring {len(pairs)} pairs...")
    pair_rows = score_pairs(pairs, photos_dir, by_file, gemini)

    results_dir = os.path.join(set_dir, "results")
    os.makedirs(results_dir, exist_ok=True)
    tag = f"v{manifest.get('version')}_{'gemini' if gemini else 'local'}"
    out = out or os.path.join(results_dir, f"results_{tag}.md")
    text = report(rows, pair_rows, manifest, gemini, suggestions)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
    csv_path = os.path.splitext(out)[0] + "_photos.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        cols = [k for k in rows[0] if k != "sugg_conf"] + ["sugg_conf"] if rows else ["file"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({**{k: v for k, v in r.items() if k != "sugg_conf"}, "app_colours": ",".join(r["app_colours"]),
                        "sugg_conf": json.dumps(r["sugg_conf"])})
    print(f"\nWritten: {out}\n         {csv_path}")
    return {"rows": rows, "pairs": pair_rows, "report": out, "csv": csv_path}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set-dir", default=DEFAULT_DIR)
    ap.add_argument("--gemini", action="store_true", help="also run Gemini (uses API quota)")
    ap.add_argument("--no-suggestions", action="store_true", help="with --gemini: skip the report-suggestion step (fewer calls)")
    ap.add_argument("--out", help="markdown report path (default: ai_test_set/results/results_v<version>_<mode>.md)")
    args = ap.parse_args()
    evaluate(args.set_dir, gemini=args.gemini, suggestions=not args.no_suggestions, out=args.out)


if __name__ == "__main__":
    main()
