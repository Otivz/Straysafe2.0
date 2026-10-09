# StraySafe 2.0: AI Accuracy and Validation (Implementation Plan)

**Source:** `Audit_IMplementation.md`, section 2 (consultation priority #1).
**Status:** V1 ✅, V2 ✅ and V4 ✅ done. V3 🟡 kit ready, photos to be collected by the team. V5 = run V4 on the frozen set and write the results.
**Goal:** show *with measured numbers* what the AI gets right and wrong, instead of claiming accuracy because YOLOv8 is used.

---

## 1. What the consultation asks for

| # | Requirement | Where it is handled |
|---|---|---|
| A1 | Clearly document the four technologies: YOLOv8, Gemini, OpenCV, Pillow | Section 3, Phase V1 |
| A2 | Add or measure AI confidence scores where applicable | Section 4, Phase V2 |
| A3 | Test and document correct detections, false positives, false negatives | Sections 5–6, Phases V3–V5 |
| A4 | Don't claim accuracy just because YOLOv8 is used | Section 7 (wording rules) |
| A5 | Test difficult conditions: low light, different angles, partial visibility, small animals, different breeds | Section 5 (test set design) |

---

## 2. Current state (checked in the code)

| Technology | Where it is used | What it does today | Confidence today |
|---|---|---|---|
| **YOLOv8** (`yolov8n.pt`, nano) | `utils/model_loader.py`; called in `routes/reports.py`, `routes/pets.py`, `utils/video_processing.py` | Finds the animal in a photo (dog / cat) and returns a box used to crop it for colour and matching | A minimum of **0.35** filters weak boxes. The box confidence is **used only for videos** (`video_processing.py`). For photos it is **not read or stored**. |
| **Gemini** (`gemini-2.5-flash`, with fallbacks) | `utils/ai_suggestions.py`, `utils/ai_matching.py`, `utils/photo_checks.py` | Animal description (type, breed, colour, size), risk/priority suggestion, behaviour flags, look-alike / duplicate comparison (Vision), AI-generated photo check | The **match similarity score** (0–100) and the **photo likelihood** (`ai_photo_likelihood`) are stored. The breed, colour, size, risk and behaviour fields are stored **without a confidence**. |
| **OpenCV** (`cv2`) | `utils/video_processing.py` | Opens uploaded videos and samples frames for YOLO / Gemini | None. It doesn't need one: it is processing, not a decision. |
| **Pillow** (`PIL`) | `utils/color_detection.py`, `photo_checks.py`, `ai_matching.py`, `video_processing.py`, `id_security.py` | Loads and crops images. Finds the dominant fur colours (ignoring foliage and sky) for `ai_dominant_color` | None. Colour is a rule, not a model, but it can still be **wrong** and should be measured (V4). |

**Gaps found:**
1. YOLO box confidence is thrown away for photos, so a weak detection looks the same as a strong one.
2. Gemini descriptions (breed, colour, size) have no confidence or "unsure" value.
3. No labelled test set exists. The live database has only 5 human-decided match pairs, all "same animal", so false positives can't be measured from it.
4. `opencv-python` is **not listed in `requirements.txt`**. It is only installed because `ultralytics` pulls it in, so a clean install could break video processing.
5. The only existing measuring tool is `scripts/evaluate_thresholds.py` (matching only, from matches audit G2).

---

## 3. Phase V1: Document the four technologies (A1)

Add a section to the paper and a page `docs/AI_TECHNOLOGIES.md` with one block per technology:

- **Role in StraySafe:** what it decides or prepares (from the table above).
- **Input → output:** e.g. YOLOv8: photo → box + class (dog/cat) + confidence.
- **Version and settings:** `yolov8n.pt`, confidence ≥ 0.35. Gemini model list and fallback order. OpenCV frame sampling (max 8 frames). Pillow colour rules.
- **What happens when it fails or is off:** e.g. Gemini disabled → rule engine only; YOLO finds nothing → whole image used.
- **Who makes the final decision:** always staff (and the owner, for pet matches). The AI only suggests.
- **Measured accuracy:** link to the V5 results (no accuracy claim before them).

Also add `opencv-python` to `requirements.txt` (gap 4).

**Effort:** small. **Depends on:** nothing.

✅ **Done:**
- `docs/AI_TECHNOLOGIES.md` written: role, input/output, settings, fallback and final decision for each of the four technologies, plus what staff see and decide.
- `opencv-python>=4.8.0` added to `requirements.txt`.
- Wording check: unmeasured accuracy claims removed or reworded.
  - Landing page: the hard-coded "94% AI Accuracy" became "AI suggests · Staff confirm".
  - Admin dashboard: "Match Confidence / Biometric Avg" became "Avg AI Match Score (of staff-confirmed matches, not an accuracy measure)", and "Baseline Training Mode" became "No confirmed matches yet".
  - Admin settings, the match review window and the admin report view: "biometric verification" became "visual comparison / suggestion".
  - The matching code's "accurate … score" docstring was reworded, and the API's `ai_accuracy` field is marked as not an accuracy.

---

## 4. Phase V2: Confidence scores where they apply (A2)

| Output | Change | Shown to staff as |
|---|---|---|
| YOLO detection (photos) | Read `r.boxes.conf` like the video path already does. Store the best box confidence per report and pet photo (`ai_detection_confidence`, 0–1). | "Animal detected (87%)". Below 0.50: "Weak detection, check the photo". |
| Gemini description (type, breed, colour, size) | Ask Gemini for a confidence per field (high / medium / low) in the same structured response, and store `ai_description_confidence` (JSON). | Low-confidence fields marked "AI unsure". |
| Look-alike / duplicate score | Already a 0–100 score. Keep it and show its band (low / plausible / strong), as the prompt already defines. | Unchanged. |
| AI-generated photo check | Already a likelihood. Unchanged. | Unchanged. |
| Behaviour flags (bite, chase) | Gemini returns a reason already. Add high / medium / low. | "AI flagged chasing (low confidence)". |
| Pillow colour | Not a model: no confidence. Measured in V4 instead. | — |

Rules:
- A confidence is **displayed and logged only**. It never confirms, merges or closes anything by itself.
- Missing confidence (AI off, older reports) is shown as "not measured", never as 0% or 100%.

**Effort:** medium (2 new columns, prompt change, small UI labels). **Depends on:** nothing. Should be done before V3, so the test run records the confidences.

✅ **Done:**
- **YOLOv8:** the box confidence of the best dog/cat detection is stored for every report photo or video (`report_media.ai_detection_confidence`), for the report (best photo, `reports.ai_detection_confidence`) and for pet photos (`pets.ai_detection_confidence`). This covers fresh detections, the report form's cached detection and the chosen video frame. Nothing found = NULL ("not measured"), never 0%.
- **Gemini:** the prompt asks for its own confidence in each suggested field (animal type, colour, size, coat pattern, breed, risk, behaviour), stored as `reports.ai_description_confidence`. Only high / medium / low are kept. The rule-based fallback (Gemini off) stores nothing, shown as "not measured".
- **Set by the AI only:** the new fields are in the response schemas, not the create schemas, so a client can't send them.
- **UI (staff):**
  - The AI panel on every staff report view shows "Animal detected (87%)", "Weak detection (42%): check the photo" or "Animal detection: not measured".
  - Each suggested field gets an "AI: high / AI: medium / AI unsure" tag, shown only while the value on screen is still the AI's (a value a person entered or corrected carries no AI confidence).
  - The pet detail panel shows the detection confidence on the pet photo.
  - Every tag says it is the AI's own confidence, not a measured accuracy.
- **Bug found and fixed on the way:** the first version of the new prompt text contained `{…}` inside a Python f-string, which would have made every Gemini suggestion fail over to the rule engine. The test caught it.
- **Bug found during the backfill and fixed:** the documented YOLO minimum confidence of 0.35 was never applied. `model.overrides['conf']` is ignored by ultralytics, so dog/cat boxes down to 0.25 were accepted. `model_loader` now passes `conf=0.35` on every call (`_YoloWithThreshold`).
- **Existing records backfilled** (2026-10-08, after a dry run that was approved):
  - 19 values written into empty fields only, logged as `ONE_TIME_AI_CONFIDENCE_BACKFILL`.
  - Detection confidence for the 5 report photos and 4 pets. Freddy (Pet #4) gets none: YOLO finds no dog/cat above 0.35 and sees a "cow" at 0.78, so check that photo.
  - Gemini field confidence for the 5 reports, kept only where Gemini's new suggestion equals the stored value. Size was dropped for every report, and risk for #13.
- Tested in `test_ai_confidence.py` (18/18). Behaviour flags share the single "behavior" confidence. A separate high/medium/low per flag was not added, because the explanation text already gives the reason.

---

## 5. Phase V3: Build the labelled test set (A3, A5)

A set of photos where a person has written down the right answer.

**Size (minimum for meaningful numbers):** about 150 photos and 40 match pairs.

| Condition (A5) | Photos | What is checked |
|---|---|---|
| Normal daylight, clear full body | 30 | Baseline |
| Low light / night | 20 | Detection, colour, matching |
| Different angles (side, back, from above) | 20 | Detection, matching |
| Partial visibility (behind a gate, cropped, among other objects) | 20 | Detection |
| Small animals (puppies, kittens, far away in the frame) | 20 | Detection, size |
| Different breeds (Aspin, Shih Tzu, Labrador, puspin, Persian…) | 30 | Breed, colour, matching |
| **Negatives:** no animal (empty street, a bag, a toy dog, a statue) | 15 | False positives |
| Match pairs: 20 same animal + 20 look-alikes that are *different* animals | 40 pairs | Matching false positives / negatives |

**Labels file** (`ai_test_set/labels.csv`): one row per photo with
`file, condition, animal_present (yes/no), species, breed, main_colour, size`, plus `pairs.csv` (the format used by `scripts/evaluate_thresholds.py`).

Rules:
- Photos are taken by the team or used with permission. No residents' private photos without consent.
- Each label is checked by two people. Disagreements are noted, not guessed.
- The set is frozen (versioned) before testing, so results can be repeated.

**Effort:** mostly the team's time (collecting and labelling), not code. **Depends on:** nothing.

🟡 **Kit ready; collection is the team's part:**
- `ai_test_set/` with one folder per condition (`daylight`, `low_light`, `angle`, `partial`, `small`, `breed`, `negative`), and empty label files for two labellers (`labels_a/b.csv`, `pairs_a/b.csv`).
- `ai_test_set/README.md`: targets, consent and photo rules, the label columns with an example, how to establish "same animal", and the check / resolve / freeze steps.
- `backend/scripts/check_test_set.py`:
  - validates every label and finds missing or unlabelled photos and identical files;
  - compares the two labellers, writes `disagreements.csv` and reports their **agreement per field** (for the paper);
  - counts agreed photos against the targets;
  - `--freeze` writes `labels.csv`, `pairs.csv` and `manifest.json` (SHA-256 of every photo, counts, version). It refuses while there are disagreements, while targets are short (unless `--allow-short`), or when the version already exists.
  - Tested in `test_check_test_set.py` (13/13).
- Photos are git-ignored; keep them in the shared drive and commit the CSVs and `manifest.json`.

---

## 6. Phases V4–V5: Measure and document (A3)

### V4: Evaluation script `scripts/evaluate_ai.py` (read-only, no database writes)
Runs every photo of the test set through the **same code the app uses** and compares the result with the label:

| Component | Measured |
|---|---|
| YOLOv8 detection | Correct detections, false positives (animal "found" where there is none), false negatives (animal missed), species right/wrong, plus the confidence of each |
| Gemini description | Breed / colour / size right or wrong, per confidence level (does "high" really mean more often right?) |
| Pillow colour | Dominant colour right or wrong (low light especially) |
| Matching (YOLO + Pillow + Gemini Vision) | Reuses `scripts/evaluate_thresholds.py`: confusion matrix at 50 / 65 and the threshold sweep |
| Speed | Average time per photo (YOLO alone, with Gemini) |

Options: `--no-gemini` (free run, rule engine and YOLO only) and `--gemini` (uses API quota).

✅ **Done:** `backend/scripts/evaluate_ai.py`.
- **Input:** only a frozen set (refuses an unfrozen set, or any photo whose SHA-256 changed since freezing).
- **Photos:** each one goes through the report form's real analysis endpoint (`/reports/analyze-media`), in-process, with a stand-in user and a throwaway database. The live database is never touched.
- **Pairs:** each pair goes through the real matching scorer, on the photos only.
- **Report** (`ai_test_set/results/results_v<version>_<local|gemini>.md` plus a per-photo CSV):
  1. Detection with TP / FP / FN / TN, precision, recall and accuracy, for YOLOv8 alone and for the app's final answer.
  2. Species, among the animals found.
  3. Number of animals (YOLO).
  4. Main colour: the first colour reported, and among all colours reported.
  5–6. Breed and size (Gemini mode only; with Gemini off they are fixed defaults, reported as "not predicted" rather than scored).
  7. YOLO confidence bands against correctness.
  8. Gemini's high / medium / low against correctness.
  9. Pairs at 50 and 65, per condition, plus a threshold sweep.
  10. Speed.
  11. Failures list.
  12. Limits.
  Every table is broken down per condition.
- **Default is free** (no Gemini). `--gemini` also runs Gemini; `--no-suggestions` skips the suggestion step to use fewer calls.
- **Tested** in `test_evaluate_ai.py` (15/15, fake YOLO). It was also smoke-run with the real YOLOv8 on 3 photos.

### V5: Results document
`AI_VALIDATION_RESULTS.md` and a section in the paper:
- One table per component: correct, false positives, false negatives, precision, recall.
- The same tables **per condition** (low light, angle, partial, small, breed).
- Examples of failures, each with its photo and the likely reason.
- What was changed because of the results (e.g. a threshold, or a "check the photo" warning in low light).
- Limits: test set size, local photos only, and the Gemini model version used.

**Effort:** medium (script) + small (document). **Depends on:** V3 (and V2, for confidence analysis).

---

## 7. Wording rules (A4)

Until V5 exists, the system and the paper must **not** say "accurate", "reliable" or "verified by AI".

| Instead of | Write |
|---|---|
| "The AI accurately identifies the animal." | "YOLOv8 detects the animal. On our test set it found X of Y animals (Z% in low light)." |
| "AI-verified match" | "AI-suggested match (score 82). Staff confirm it." |
| "The AI determines the breed." | "Gemini suggests a breed. Staff can correct it." |

Check the UI texts and notifications for such claims as part of V1.

---

## 8. Order and effort

| Step | What | Effort | Can start |
|---|---|---|---|
| V1 | Document the four technologies; add `opencv-python` to requirements | Small | Now |
| V2 | Store YOLO confidence for photos; Gemini field confidence; show in the UI | Medium | Now |
| V3 | Collect and label the test set | Team time | Now (in parallel with V1–V2) |
| V4 | `scripts/evaluate_ai.py` | Medium | After V2 (code) |
| V5 | Run, write the results, adjust thresholds or warnings if the numbers show a need | Small | After V3 + V4 |

**Recommended start:** V1 and V2 in code while the team starts collecting photos for V3.

---

## 9. Acceptance checks

- [~] `docs/AI_TECHNOLOGIES.md` describes all four technologies (role, input/output, settings, fallback, final decision by staff). Done; the paper section is still to be written from it.
- [x] `opencv-python` is in `requirements.txt`.
- [x] Every photo analysed shows a YOLO detection confidence, or "not measured".
- [x] Gemini description fields carry a confidence. Low ones are marked "AI unsure".
- [ ] A frozen, labelled test set covers all five difficult conditions plus negatives.
- [ ] Measured results exist (correct / false positive / false negative) per component and per condition. *(Tool ready: `evaluate_ai.py`; needs the frozen set.)*
- [ ] No text in the system or paper claims accuracy without pointing to the measured results.
- [ ] Confidence is never used to confirm, merge or close anything automatically.
