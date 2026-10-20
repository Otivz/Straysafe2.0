# StraySafe 2.0 — AI: What's Left To Do

**Date:** October 20, 2026  
**Related:** [SYSTEM_AUDIT.md](SYSTEM_AUDIT.md) (whole-system audit and checklist), [MULTI_ANIMAL_REPORT_PLAN.md](MULTI_ANIMAL_REPORT_PLAN.md)

## How the AI works today

| Feature | Technology | Where |
|---|---|---|
| Is there a dog or cat? How many? (photo and video) | YOLOv8 | `backend/app/routes/reports.py` (`/reports/analyze-media`), `backend/app/utils/video_processing.py` |
| Photo authenticity (AI-generated check), colour, breed, size, risk | Google Gemini Vision | `backend/app/routes/reports.py` |
| Duplicate sightings and pet look-alike matching | Gemini + attribute scoring | `backend/app/routes/matches.py`, `backend/app/utils/ai_matching.py` |
| Background AI jobs (matching, suggestions after a report or photo change) | AI worker | `python -m app.ai_worker`, `backend/app/utils/ai_pipeline.py` |

**Rule kept throughout:** the AI only **suggests** (duplicates, look-alikes, priority); staff always confirm.

**Fixed this session:**
- A one-animal video no longer says "10+ animals": the count is the most animals seen in one frame.
- One animal boxed twice (e.g. as "cat" and "dog") counts once.
- A group report and its own animal records are never suggested as duplicates of each other.
- Each animal record gets its own AI analysis, shown on the group report ("AI per animal").

---

## 1. Must do (operational)

- [ ] **Restart the AI worker** (`python -m app.ai_worker`) after pulling these changes.
  - It runs separately from the backend. An AI worker still running older code created the bad match #122 (animal
    record #103 flagged as a duplicate of its own group #101).
  - The new rules only apply after a restart: never compare a group with its own animals, and the new video counting.
- [x] **Save AI times in local time, not UTC.** ✅ Done: all 12 places below now use local time, like the database. The 10
  AI-related test files pass. **Restart the backend and the AI worker together:** if only one runs the new code, queued AI
  jobs would look 8 hours in the future to the other. The same 8-hour problem fixed for adoptions (SYSTEM_AUDIT 4.3) was
  in:
  - `backend/app/routes/matches.py`: 8 places (match decisions, owner verification)
  - `backend/app/utils/ai_matching.py`: 2 places
  - `backend/app/routes/ai_jobs.py` and `backend/app/utils/ai_jobs.py`: 1 each

  Match and AI-job times can show 8 hours early.
- [ ] **Mind the Gemini free quota on defence day: 20 requests per day per model** (`gemini-2.5-flash`). When it runs out,
  photos show "Authenticity not checked (AI offline)" until it resets about a day later. The local YOLO detection still
  works. Avoid heavy testing the day before, or switch Gemini off in Admin Settings while testing other features. For
  more requests: enable billing, or use a key from a different Google project.
- [ ] **Remove the debug count log before release.** After each upload, `reports.py` prints
  `[analyze-media] … detector=…, Gemini=…`. It was added to find the wrong-count cause, which is fixed and confirmed.

## 2. Should improve

- [ ] **Gemini can still raise the animal count.**
  - The final count is the higher of the detector's and Gemini's.
  - A phrase like "two animals" in Gemini's description also forces a count of 2.
  - If a one-animal photo ever shows "Multiple Animals Detected" again, check this logic in `reports.py`
    (`final_animal_count = max(yolo_count, gemini_count)`).
- [ ] **Tune the detection thresholds on real photos.** The duplicate-box rule in `video_processing.py` was only checked
  with simulated boxes:
  - `COUNT_MIN_CONF = 0.40`: weak boxes don't add an animal
  - `SAME_ANIMAL_IOU = 0.45` and `SAME_ANIMAL_INSIDE = 0.70`: overlapping boxes are one animal

  Try 10–20 real photos and videos (one dog, two dogs side by side, a cat close-up, a blurry video).
- [ ] **Old match #122 is hidden, not removed.** The duplicates list now filters out group-vs-own-animal pairs, but the
  row still exists. It's harmless; dismiss it in the app if you want it gone.
- [ ] **Confirm that AI per-animal summaries should be officials only.** Residents don't see AI suggestions (current
  behaviour); keep it that way unless you decide otherwise.

## 3. For the manuscript (likely asked at the defence)

- [x] **Test-set tools cover this session's fixes** (multi-animal condition, videos, the count as the resident sees it,
  the "Multiple Animals Detected" warning). ✅ Done; details in the item below.
- [ ] **Measure accuracy: collect and label the test set.** The tools already exist and use the app's real code; only
  the photos are missing.

  | Step | What | Status |
  |---|---|---|
  | 1 | Collect about 170 photos and 10 short videos in `ai_test_set/photos/<condition>/` (daylight 30, low light 20, angle 20, partial 20, small 20, breed 30, no animal 15, **multiple 15**) and 40 photo pairs (20 same animal, 20 look-alikes) | **0 collected** |
  | 2 | Two people label them separately: `labels_a.csv` / `labels_b.csv`, `pairs_a.csv` / `pairs_b.csv` (instructions: `ai_test_set/README.md`) | Headers only |
  | 3 | `python scripts/check_test_set.py`, then `--freeze` | Not run |
  | 4 | `python scripts/evaluate_ai.py` (free), or `--gemini` (uses API quota) → results in `ai_test_set/results/` for Chapter 4 | Not run |
  | 5 | Optional: `python scripts/evaluate_thresholds.py labels.csv` for the matching thresholds | Not run |

  ✅ **The plan now covers this session's fixes:**
  - A `multiple` condition: 15 photos or videos with 2+ animals.
  - About 10 short videos in any folder.
  - The animal count is scored as the resident sees it, with one animal boxed twice counted once (section 3a); YOLOv8
    alone is section 3b.
  - The "Multiple Animals Detected" warning is scored as TP / FP / FN / TN (section 3c), and photos are compared with
    videos (section 3d).

  Updated: `check_test_set.py`, `evaluate_ai.py`, `ai_test_set/README.md`. Tested in
  `backend/tests/test_evaluate_counts.py` (14 checks); the two existing evaluator tests still pass. The target is now
  about 170 photos + 10 videos + 40 pairs.

- [ ] **Explain the rule that AI never decides,** in the paper and in the demo. AI suggests, staff confirm, and every
  override is logged (e.g. `PET_PHOTO_OVERRIDE` in the Admin Logs "Multi-animal & photo overrides" filter). This is a
  strong design point.

## 4. Future work (recommendations chapter)

- [ ] **Re-link "Animal Cannot Be Found" reports to later sightings.** For 30 days, a not-found report stays a matching
  candidate. A new sighting then shows "May be the animal not found in Report #…" for staff to compare.
- [ ] **Re-run matching automatically** when a pet record gets better photos (it already re-runs when a report's photo
  is replaced).

---

## Suggested order

1. Restart the AI worker (section 1).
2. ~~Fix the AI timestamps (section 1).~~ ✅ Done.
3. Collect and label the test set, then run `evaluate_ai.py` (section 3). The tools are ready; only the photos are missing.
4. Remove the debug log right before release (section 1).
