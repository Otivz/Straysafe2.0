# StraySafe 2.0: AI Technologies

StraySafe uses four technologies to help staff handle stray animal reports: **YOLOv8, Gemini, OpenCV and Pillow**.
None of them makes a final decision. They **suggest**; a Subdivision Leader or Barangay staff member decides, and for a
registered pet the owner confirms as well.

> **Accuracy:** not yet measured. Until the validation results exist (`AI_VALIDATION_RESULTS.md`, see
> `audit report and remediation/AI_ACCURACY_VALIDATION_IMPLEMENTATION.md`), StraySafe makes no accuracy claim.
> The scores below are the AI's own estimates, not measured accuracy.

---

## Overview

| Technology | Role | Input → output | Decides anything? |
|---|---|---|---|
| **YOLOv8** | Animal object detection | Photo or video frame → box around each dog/cat + class + confidence | No. Locates the animal so the photo can be cropped. |
| **Gemini** | Multimodal analysis / decision support | Photo(s) + report text → description, suggestions, comparison score | No. Every suggestion is reviewed by staff. |
| **OpenCV** | Image/video processing | Uploaded video → sample frames | No. Processing only. |
| **Pillow** | Image and fur-colour processing | Photo (+ YOLO box) → cropped image, dominant fur colours | No. Fills in a colour that staff can correct. |

How they work together when a report is filed:

```
photo / video ──► OpenCV (video only: sample up to 8 frames)
                     │
                     ▼
               YOLOv8 finds the dog/cat ──► Pillow crops it and reads the fur colours
                     │
                     ▼
               Gemini describes the animal (type, breed, size, behaviour, risk) and checks the photo
                     │
                     ▼
               Matching: rule engine (+ Gemini Vision) compares it with registered pets and other reports
                     │
                     ▼
               Suggestions shown to staff ──► staff confirm or reject (owner confirms a pet match)
```

---

## 1. YOLOv8: animal object detection

| | |
|---|---|
| **Used for** | Finding the dog or cat in a report photo, a pet photo, or video frames. The largest box is used to crop the image before colour reading and comparison. |
| **Model** | `yolov8n.pt` (YOLOv8 nano, COCO classes `dog` and `cat`), via the `ultralytics` package. Loaded once and shared (`backend/app/utils/model_loader.py`). |
| **Settings** | Minimum box confidence **0.35** (the library default 0.25 let weak boxes pick the wrong crop). CPU threads limited by `AI_TORCH_THREADS` (default 2). |
| **Where** | `routes/reports.py` (report media analysis), `routes/pets.py` (pet photos), `utils/video_processing.py` (videos). |
| **Output** | Labels (`Dog` / `Cat`), boxes, detection count. For videos, the frame with the best confidence × box size is chosen. |
| **Confidence** | Stored per photo/video (`report_media.ai_detection_confidence`), per report (best photo) and per pet photo, 0–1. Staff see "Animal detected (87%)", or "Weak detection: check the photo" below 50%. Nothing found = "not measured". For videos it also picks the best frame. |
| **When it finds nothing** | The whole image is used. Gemini can still describe the animal, and staff see the photo as it is. |
| **Limits to test** | Small or distant animals, partial views (behind a gate), low light, and objects that look like animals (toys, statues). |

## 2. Gemini: multimodal analysis and decision support

| | |
|---|---|
| **Used for** | (a) Describing the animal from the photo and text: type, breed, colour, size, behaviour flags (chasing, bite, injury, aggression) and a suggested risk/priority. (b) Checking a photo: is it a real animal photo, and could it be AI-generated? (c) **Gemini Vision matching:** comparing two photos to estimate whether they show the same individual animal. |
| **Models** | `gemini-2.5-flash`, then `gemini-flash-lite-latest`, then `gemini-flash-latest` (tried in order; a model that fails, is rate-limited or is too slow is skipped). "Pro" models are not used. Via the `google-genai` package. |
| **Settings** | Per-call timeout `GEMINI_TIMEOUT_SECONDS` (15 s), total budget `GEMINI_TOTAL_BUDGET_SECONDS` (35 s). Vision matching re-scores only the 10 best candidates per scan (`VISION_CANDIDATES_PER_SCAN`). Results of a photo pair are cached. Admins can switch Gemini off (Admin settings → AI matching). |
| **Where** | `utils/ai_suggestions.py` (description, suggestions, model fallback), `utils/ai_matching.py` (Vision comparison), `utils/photo_checks.py` (photo check). |
| **Scores** | Match similarity 0–100 (26–49 not a match, 50–69 plausible, higher = stronger). Photo AI-generation likelihood 0–1 (≥ 0.60 "potentially AI-generated", 0.36–0.59 "uncertain"). Description fields carry Gemini's **own confidence** per field (high / medium / low, `reports.ai_description_confidence`), shown to staff as "AI: high" … "AI unsure". None when Gemini was off. |
| **When it is off or fails** | Matching falls back to the free **rule engine** (species, breed, colours, size, markings, distance, time). The photo check shows "Authenticity not checked", never "authentic". Descriptions stay empty for staff to fill in. |
| **Decision** | Suggestions only. A pet match needs staff confirmation **and** the owner's confirmation. Duplicates are merged only when staff decide. |
| **Limits to test** | Look-alike animals of the same breed and colour, low light, unusual angles, breeds that are rare locally. |

## 3. OpenCV: image and video processing

| | |
|---|---|
| **Used for** | Opening uploaded videos and taking sample frames so YOLOv8 and Gemini can analyse them. |
| **Package** | `opencv-python` (`cv2`). |
| **Settings** | Up to **8 frames**, spread evenly through the video (read one after another when the video has no frame count). Frames are converted from BGR to RGB and handed to Pillow. |
| **Where** | `utils/video_processing.py`. |
| **Confidence** | Not applicable: it processes, it doesn't decide. |
| **When it fails** | The video is not analysed. The report is kept and staff see the video. |

## 4. Pillow: image and fur-colour processing

| | |
|---|---|
| **Used for** | Loading, resizing and cropping images (to the YOLO box), and reading the **dominant fur colours** for `ai_dominant_color`. Also used for photo checks, matching and ID-photo security. |
| **Package** | `Pillow` (`PIL`). |
| **Method** | Pixel colours are grouped (HSV) into coat colour names (White, Black, Brown, Tan, Gray…). Green foliage and blue sky are ignored as background. |
| **Where** | `utils/color_detection.py`; also `photo_checks.py`, `ai_matching.py`, `video_processing.py`, `id_security.py`. |
| **Confidence** | None: it is a fixed rule, not a model. It can still be wrong (shadows, low light, a coloured background), so its results are measured in the validation (V4). |
| **When it fails** | The colour is left empty or as reported by the resident. Staff can correct it. |

---

## What staff see and decide

| AI output | Shown as | Who decides |
|---|---|---|
| Animal type, breed, colour, size | Pre-filled report fields | Staff can correct them |
| Behaviour flags, risk, priority | "AI suggested" values with a reason | Staff set the final priority |
| Photo check | "Likely authentic" / "Uncertain" / "Potentially AI-generated" / "Not checked" | Staff |
| Pet look-alike | "AI-suggested match (score N)" with the evidence | Staff confirm, then the owner confirms |
| Duplicate report | "Suspected duplicate (score N)" | Staff merge or reject |

## Wording rules

Until measured results exist, the system and the paper do not say "accurate", "reliable", "biometric verification" or
"AI-verified". They say what the AI **suggests** and that **staff confirm** it. When the validation is done, accuracy
statements quote the measured numbers and the conditions they were measured under.
