"""
V3 (AI accuracy plan): check, compare and freeze the labelled AI test set in `ai_test_set/`.

    python scripts/check_test_set.py                       # check + compare the two labellers + count against targets
    python scripts/check_test_set.py --freeze              # write labels.csv, pairs.csv, manifest.json (needs a clean check)
    python scripts/check_test_set.py --freeze --version 2  # freeze a changed set as a new version
    python scripts/check_test_set.py --freeze --allow-short   # freeze although some targets aren't met yet
    python scripts/check_test_set.py --set-dir PATH        # another test set folder

Read-only except for the files it writes inside the test set folder (disagreements.csv, and the frozen files).
Uses only the standard library. Instructions for the team: ai_test_set/README.md.
"""
import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

DEFAULT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "ai_test_set")
TARGETS = {"daylight": 30, "low_light": 20, "angle": 20, "partial": 20, "small": 20, "breed": 30, "negative": 15}
PAIR_TARGETS = {"same": 20, "different": 20}
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp")
LABEL_COLS = ["file", "condition", "animal_present", "species", "count", "breed", "main_colour", "size", "notes"]
PAIR_COLS = ["pair_id", "file_a", "file_b", "same", "condition", "notes"]
COMPARED = ["animal_present", "species", "count", "breed", "main_colour", "size"]  # fields both labellers must agree on
PAIR_COMPARED = ["file_a", "file_b", "same"]


def norm(v):
    return (v or "").strip()


def low(v):
    return norm(v).lower()


def read_csv(path, cols, errors):
    if not os.path.exists(path):
        errors.append(f"{os.path.basename(path)} is missing")
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in cols if c not in (reader.fieldnames or [])]
        if missing:
            errors.append(f"{os.path.basename(path)}: missing column(s) {', '.join(missing)}")
            return []
        return [dict(r, _line=i) for i, r in enumerate(reader, start=2) if any(norm(r.get(c)) for c in cols)]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def photo_files(photos_dir):
    out = []
    for root, _, files in os.walk(photos_dir):
        for name in files:
            if name.lower().endswith(IMAGE_EXT):
                out.append(os.path.relpath(os.path.join(root, name), photos_dir).replace(os.sep, "/"))
    return sorted(out)


def validate_labels(rows, who, photos, errors):
    """Check one labeller's photo labels. Returns {file: row}."""
    by_file = {}
    for r in rows:
        where = f"labels_{who}.csv line {r['_line']}"
        f = norm(r["file"]).replace("\\", "/")
        cond, present, species = low(r["condition"]), low(r["animal_present"]), low(r["species"])
        if not f:
            errors.append(f"{where}: no file")
            continue
        if f in by_file:
            errors.append(f"{where}: {f} is labelled twice")
        if f not in photos:
            errors.append(f"{where}: {f} not found in photos/")
        if cond not in TARGETS:
            errors.append(f"{where}: condition must be one of {', '.join(TARGETS)} (got '{r['condition']}')")
        elif f.split("/")[0] != cond:
            errors.append(f"{where}: {f} is in folder '{f.split('/')[0]}' but labelled '{cond}'")
        if present not in ("yes", "no"):
            errors.append(f"{where}: animal_present must be yes or no")
        if species not in ("dog", "cat", "none"):
            errors.append(f"{where}: species must be dog, cat or none")
        if present == "no" and species != "none":
            errors.append(f"{where}: no animal present, so species must be 'none'")
        if present == "yes" and species == "none":
            errors.append(f"{where}: an animal is present, so species can't be 'none'")
        try:
            count = int(norm(r["count"]) or "-1")
            if count < 0 or (present == "no" and count != 0) or (present == "yes" and count < 1):
                raise ValueError
        except ValueError:
            errors.append(f"{where}: count must be 0 for no animal, or 1 or more")
        if present == "yes" and low(r["size"]) not in ("small", "medium", "large", "unknown"):
            errors.append(f"{where}: size must be small, medium, large or unknown")
        if cond == "negative" and present == "yes":
            errors.append(f"{where}: a 'negative' photo must have no animal")
        if present == "yes" and not norm(r["main_colour"]):
            errors.append(f"{where}: main_colour is empty")
        by_file[f] = r
    return by_file


def validate_pairs(rows, who, photos, errors):
    by_id = {}
    for r in rows:
        where = f"pairs_{who}.csv line {r['_line']}"
        pid = norm(r["pair_id"])
        a, b = norm(r["file_a"]).replace("\\", "/"), norm(r["file_b"]).replace("\\", "/")
        if not pid:
            errors.append(f"{where}: no pair_id")
            continue
        if pid in by_id:
            errors.append(f"{where}: pair {pid} appears twice")
        for x in (a, b):
            if x not in photos:
                errors.append(f"{where}: {x or '(empty)'} not found in photos/")
        if a and a == b:
            errors.append(f"{where}: a pair needs two different photos")
        if low(r["same"]) not in ("yes", "no"):
            errors.append(f"{where}: same must be yes or no")
        by_id[pid] = dict(r, file_a=a, file_b=b)
    return by_id


def compare(a, b, keys, fields, key_name):
    """Disagreements between the two labellers, and agreement per field (on items both labelled)."""
    both = sorted(set(a) & set(b))
    only_a, only_b = sorted(set(a) - set(b)), sorted(set(b) - set(a))
    disagreements, agree = [], Counter()
    for k in both:
        for fld in fields:
            va, vb = norm(a[k].get(fld)), norm(b[k].get(fld))
            if va.lower() == vb.lower():
                agree[fld] += 1
            else:
                disagreements.append({key_name: k, "field": fld, "labeller_a": va, "labeller_b": vb})
    agreement = {fld: (agree[fld] / len(both) if both else None) for fld in fields}
    return both, only_a, only_b, disagreements, agreement


def pct(v):
    return "—" if v is None else f"{v * 100:.0f}%"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set-dir", default=DEFAULT_DIR)
    ap.add_argument("--freeze", action="store_true")
    ap.add_argument("--version", type=int, default=1)
    ap.add_argument("--allow-short", action="store_true")
    args = ap.parse_args()

    d = os.path.abspath(args.set_dir)
    photos_dir = os.path.join(d, "photos")
    if not os.path.isdir(photos_dir):
        print(f"No photos/ folder in {d}")
        return 2
    errors, warnings = [], []
    photos = set(photo_files(photos_dir))

    la = validate_labels(read_csv(os.path.join(d, "labels_a.csv"), LABEL_COLS, errors), "a", photos, errors)
    lb = validate_labels(read_csv(os.path.join(d, "labels_b.csv"), LABEL_COLS, errors), "b", photos, errors)
    pa = validate_pairs(read_csv(os.path.join(d, "pairs_a.csv"), PAIR_COLS, errors), "a", photos, errors)
    pb = validate_pairs(read_csv(os.path.join(d, "pairs_b.csv"), PAIR_COLS, errors), "b", photos, errors)

    both, only_a, only_b, dis, agreement = compare(la, lb, None, COMPARED, "file")
    pboth, ponly_a, ponly_b, pdis, pagreement = compare(pa, pb, None, PAIR_COMPARED, "pair_id")
    for f in only_a:
        errors.append(f"{f}: labelled by labeller A only")
    for f in only_b:
        errors.append(f"{f}: labelled by labeller B only")
    for p in ponly_a + ponly_b:
        errors.append(f"pair {p}: labelled by one labeller only")
    for f in sorted(photos - set(la) - set(lb)):
        warnings.append(f"{f}: photo not labelled yet")

    # Identical files (the same photo saved twice) would count twice
    hashes = {f: sha256(os.path.join(photos_dir, f)) for f in sorted(photos)}
    seen = defaultdict(list)
    for f, h in hashes.items():
        seen[h].append(f)
    for files in seen.values():
        if len(files) > 1:
            warnings.append(f"identical photos: {', '.join(files)}")

    # Disagreements file for the labellers to resolve together
    dis_path = os.path.join(d, "disagreements.csv")
    if dis or pdis:
        with open(dis_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["item", "field", "labeller_a", "labeller_b"])
            w.writeheader()
            for x in dis:
                w.writerow({"item": x["file"], "field": x["field"], "labeller_a": x["labeller_a"], "labeller_b": x["labeller_b"]})
            for x in pdis:
                w.writerow({"item": "pair " + x["pair_id"], "field": x["field"], "labeller_a": x["labeller_a"], "labeller_b": x["labeller_b"]})
    elif os.path.exists(dis_path):
        os.remove(dis_path)

    # Counts against the targets (photos both labellers agree on fully)
    agreed = [f for f in both if not any(x["file"] == f for x in dis)]
    by_cond = Counter(low(la[f]["condition"]) for f in agreed)
    agreed_pairs = [p for p in pboth if not any(x["pair_id"] == p for x in pdis)]
    pair_counts = Counter("same" if low(pa[p]["same"]) == "yes" else "different" for p in agreed_pairs)
    short = [c for c, n in TARGETS.items() if by_cond[c] < n] + [k for k, n in PAIR_TARGETS.items() if pair_counts[k] < n]

    print(f"AI test set: {d}\n")
    print(f"Photos found: {len(photos)}   labelled by both: {len(both)}   agreed: {len(agreed)}")
    print("\nCondition     agreed / target")
    for c, n in TARGETS.items():
        print(f"  {c:<12} {by_cond[c]:>3} / {n:<3} {'ok' if by_cond[c] >= n else 'SHORT'}")
    print(f"\nPairs: same {pair_counts['same']} / {PAIR_TARGETS['same']}, different {pair_counts['different']} / {PAIR_TARGETS['different']}")
    print("\nAgreement between labellers (photos both labelled):")
    for fld, v in agreement.items():
        print(f"  {fld:<15} {pct(v)}")
    if pboth:
        print("  pairs 'same'    " + pct(pagreement["same"]))
    if dis or pdis:
        print(f"\n{len(dis) + len(pdis)} disagreement(s): resolve them together, see {dis_path}")
    for w_ in warnings:
        print("WARNING:", w_)
    for e in errors:
        print("ERROR:", e)
    clean = not errors and not dis and not pdis

    if not args.freeze:
        print("\nCheck " + ("passed." if clean else "found problems (see above).") + (" Some targets are short." if short else ""))
        return 0 if clean else 1

    # --- Freeze --------------------------------------------------------------------------------------------------
    if not clean:
        print("\nNot frozen: fix the errors and disagreements first.")
        return 1
    if short and not args.allow_short:
        print(f"\nNot frozen: targets not met ({', '.join(short)}). Add photos or use --allow-short.")
        return 1
    manifest_path = os.path.join(d, "manifest.json")
    if os.path.exists(manifest_path):
        old = json.load(open(manifest_path, encoding="utf-8"))
        if old.get("version") == args.version:
            print(f"\nNot frozen: version {args.version} already exists. Use --version {args.version + 1} for a changed set.")
            return 1
    with open(os.path.join(d, "labels.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=LABEL_COLS)
        w.writeheader()
        for fl in agreed:
            row = {c: norm(la[fl].get(c)) for c in LABEL_COLS}
            row["file"] = fl
            row["notes"] = "; ".join(x for x in (norm(la[fl].get("notes")), norm(lb[fl].get("notes"))) if x)
            w.writerow(row)
    with open(os.path.join(d, "pairs.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=PAIR_COLS)
        w.writeheader()
        for p in agreed_pairs:
            w.writerow({c: norm(pa[p].get(c)) for c in PAIR_COLS})
    used = sorted(set(agreed) | {pa[p]["file_a"] for p in agreed_pairs} | {pa[p]["file_b"] for p in agreed_pairs})
    manifest = {
        "version": args.version,
        "frozen_at": datetime.now().isoformat(timespec="seconds"),
        "photos": {f: hashes[f] for f in used},
        "counts": {"by_condition": dict(by_cond), "pairs": dict(pair_counts)},
        "targets_short": short,
        "labeller_agreement": {k: v for k, v in agreement.items()},
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nFrozen as version {args.version}: labels.csv ({len(agreed)} photos), pairs.csv ({len(agreed_pairs)} pairs), manifest.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
