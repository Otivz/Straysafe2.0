"""
G2: validate the AI matching thresholds against a labelled test set (read-only; nothing is written to the database).

Label pairs you have checked by hand in a CSV file:

    kind,report_id,candidate_id,same,condition
    pet,12,3,yes,low_light
    pet,14,7,no,
    duplicate,15,13,yes,partial_view
    duplicate,20,1,no,different_angle

- kind: "pet" (report vs registered pet; candidate_id is a pet_id) or "duplicate" (report vs report; candidate_id is a report_id)
- same: yes / no (is it really the same animal?)
- condition: optional tag (low_light, different_angle, partial_view, breed name...) to break results down

Run from the backend folder:
    python scripts/evaluate_thresholds.py labels.csv                 # rule engine only (free)
    python scripts/evaluate_thresholds.py labels.csv --vision        # also Gemini Vision (uses API quota)
    python scripts/evaluate_thresholds.py labels.csv --out results.md

The report has: the confusion matrix at the current thresholds (pet 50, duplicate 65), a sweep of thresholds,
a breakdown per condition, and the distance/time of the duplicate pairs against the 1.5 km / 7 day windows.
"""
import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report  # noqa: E402
from app.routes.matches import (  # noqa: E402
    DUPLICATE_MIN_SCORE, DUPLICATE_RADIUS_KM, DUPLICATE_WINDOW_DAYS, PET_MATCH_MIN_SCORE, _distance_km, calculate_match_details,
)

CURRENT = {"pet": PET_MATCH_MIN_SCORE, "duplicate": DUPLICATE_MIN_SCORE}
SWEEP = list(range(30, 95, 5))


def suggested(row, threshold):
    """Would the system suggest this pair? Same rule as the scan: score, assessment and evidence."""
    return (row["score"] >= threshold and row["assessment"] not in ("NOT A MATCH", "LOW CONFIDENCE") and row["has_evidence"])


def confusion(rows, threshold):
    c = {"TP": 0, "FP": 0, "FN": 0, "TN": 0}
    for r in rows:
        s = suggested(r, threshold)
        c[("T" if s == r["same"] else "F") + ("P" if s else "N")] += 1
    return c


def rates(c):
    p = c["TP"] / (c["TP"] + c["FP"]) if c["TP"] + c["FP"] else None
    rc = c["TP"] / (c["TP"] + c["FN"]) if c["TP"] + c["FN"] else None
    f1 = 2 * p * rc / (p + rc) if p and rc else None
    return p, rc, f1


def pct(v):
    return "—" if v is None else f"{v * 100:.0f}%"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("labels")
    ap.add_argument("--vision", action="store_true", help="also run Gemini Vision (uses API quota)")
    ap.add_argument("--out", help="write the markdown report to this file")
    args = ap.parse_args()

    db = SessionLocal()
    rows, skipped = [], []
    try:
        with open(args.labels, newline="", encoding="utf-8") as f:
            for i, line in enumerate(csv.DictReader(f), start=2):
                kind = (line.get("kind") or "").strip().lower()
                try:
                    rid, cid = int(line["report_id"]), int(line["candidate_id"])
                except (KeyError, TypeError, ValueError):
                    skipped.append(f"line {i}: report_id / candidate_id must be numbers")
                    continue
                if kind not in CURRENT:
                    skipped.append(f"line {i}: kind must be pet or duplicate")
                    continue
                report = db.get(Report, rid)
                cand = db.get(Pet, cid) if kind == "pet" else db.get(Report, cid)
                if report is None or cand is None:
                    skipped.append(f"line {i}: Report #{rid} or {'Pet' if kind == 'pet' else 'Report'} #{cid} not found")
                    continue
                d = calculate_match_details(report, cand, is_pet=(kind == "pet"), db=db, allow_vision=args.vision)
                row = {
                    "kind": kind, "report_id": rid, "candidate_id": cid,
                    "same": (line.get("same") or "").strip().lower() in ("yes", "y", "true", "1"),
                    "condition": (line.get("condition") or "").strip() or "(none)",
                    "score": d.get("score") or 0,
                    "assessment": (d.get("visual_comparison") or {}).get("final_assessment", "POTENTIAL MATCH"),
                    "has_evidence": bool(d.get("evidence")),
                    "km": None, "days": None,
                }
                if kind == "duplicate":
                    if None not in (report.latitude, report.longitude, cand.latitude, cand.longitude):
                        row["km"] = _distance_km(report.latitude, report.longitude, cand.latitude, cand.longitude)
                    if report.created_at and cand.created_at:
                        row["days"] = abs((report.created_at - cand.created_at).total_seconds()) / 86400
                rows.append(row)
    finally:
        db.rollback()  # read-only: never keep anything the scorer may have touched
        db.close()

    out = [f"# AI matching threshold validation\n", f"Pairs evaluated: {len(rows)}"
           + (" (rule engine + Gemini Vision)" if args.vision else " (rule engine only)") + "\n"]
    for kind in ("pet", "duplicate"):
        kr = [r for r in rows if r["kind"] == kind]
        if not kr:
            continue
        label = "Pet look-alike (report vs registered pet)" if kind == "pet" else "Duplicate report (report vs report)"
        c = confusion(kr, CURRENT[kind])
        p, rc, f1 = rates(c)
        out += [f"\n## {label}\n",
                f"At the current threshold ({CURRENT[kind]}): TP {c['TP']}, FP {c['FP']}, FN {c['FN']}, TN {c['TN']}; "
                f"precision {pct(p)}, recall {pct(rc)}, F1 {pct(f1)}.\n",
                "\n| Threshold | TP | FP | FN | TN | Precision | Recall | F1 |\n|---|---|---|---|---|---|---|---|"]
        for t in SWEEP:
            c = confusion(kr, t)
            p, rc, f1 = rates(c)
            mark = " **(current)**" if t == CURRENT[kind] else ""
            out.append(f"| {t}{mark} | {c['TP']} | {c['FP']} | {c['FN']} | {c['TN']} | {pct(p)} | {pct(rc)} | {pct(f1)} |")
        out += ["\n### By condition (current threshold)\n", "| Condition | Pairs | TP | FP | FN | TN | Precision | Recall |", "|---|---|---|---|---|---|---|---|"]
        for cond in sorted({r["condition"] for r in kr}):
            cr = [r for r in kr if r["condition"] == cond]
            c = confusion(cr, CURRENT[kind])
            p, rc, _ = rates(c)
            out.append(f"| {cond} | {len(cr)} | {c['TP']} | {c['FP']} | {c['FN']} | {c['TN']} | {pct(p)} | {pct(rc)} |")
        if kind == "duplicate":
            same = [r for r in kr if r["same"]]
            far = [r for r in same if r["km"] is not None and r["km"] > DUPLICATE_RADIUS_KM]
            late = [r for r in same if r["days"] is not None and r["days"] > DUPLICATE_WINDOW_DAYS]
            out += [f"\n### Search windows\n",
                    f"True duplicates outside {DUPLICATE_RADIUS_KM} km: {len(far)} of {len(same)}"
                    + (f" (Reports {', '.join('#%d' % r['report_id'] for r in far)})" if far else "") + ".  ",
                    f"True duplicates more than {DUPLICATE_WINDOW_DAYS} days apart: {len(late)} of {len(same)}"
                    + (f" (Reports {', '.join('#%d' % r['report_id'] for r in late)})" if late else "") + "."]
        out += ["\n### Pairs\n", "| Report | Candidate | Same? | Condition | Score | Assessment | Suggested |", "|---|---|---|---|---|---|---|"]
        for r in kr:
            out.append(f"| #{r['report_id']} | #{r['candidate_id']} | {'yes' if r['same'] else 'no'} | {r['condition']} | {r['score']} | "
                       f"{r['assessment']} | {'yes' if suggested(r, CURRENT[kind]) else 'no'} |")
    if skipped:
        out += ["\n## Skipped lines\n"] + [f"- {s}" for s in skipped]
    text = "\n".join(out) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Written to {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
