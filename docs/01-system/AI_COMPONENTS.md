# AI components

- **Status:** Current
- **Verified:** 2026-11-05, from `backend/app/utils/model_loader.py` and `backend/app/utils/ai_suggestions.py`. The rule-based matching in `ai_matching.py` and `ai_pipeline.py` was not read in detail; check it before quoting specifics.

## 1. Summary

StraySafe uses three layers to help match pets and reports. They only **suggest**. A person confirms every match.

| Layer | Where it runs | Role |
|---|---|---|
| YOLOv8 nano (`yolov8n.pt`) | Local, on the server | Detects and crops the animal in a photo |
| Google Gemini (optional) | Cloud | Visual comparison for matching suggestions |
| Rule-based matching | Local | Fallback when Gemini is off or fails |

## 2. YOLOv8 nano (local)

- Loaded once and cached (`get_yolo_model`, thread-safe) with the `ultralytics` and `torch` libraries.
- Detects the animal and crops it. The crop is used to pick colors and to check how many animals are in the photo.
- Detections below confidence **0.35** are ignored (`YOLO_MIN_CONFIDENCE`). The threshold is applied on every call, because the library ignores `overrides['conf']` once its predictor exists.
- CPU threads are limited by `AI_TORCH_THREADS` (default 2) so the server stays responsive.
- Needs no internet and no API key.

## 3. Google Gemini (optional)

- The Administrator turns it on or off in Admin Settings (setting key `gemini_vision_matching`).
- It **fails closed**: if the setting cannot be read, Gemini is treated as OFF and the local result is used.
- Models are tried in order: `gemini-2.5-flash`, `gemini-flash-lite-latest`, `gemini-flash-latest`. Only fast, cheap models are used; "pro" models are deliberately not an automatic fallback.
- A model that errors, is rate limited or does not answer in time is skipped for the next one.
- Timeouts: `GEMINI_TIMEOUT_SECONDS` (default 15) per call and `GEMINI_TOTAL_BUDGET_SECONDS` (default 35) overall. If all fail, the rule-based result is used.

## 4. Rule-based matching and review

- The local fallback when Gemini is off or fails.
- Staff review suggestions in the manual matching workflow ([MANUAL_REPORT_MATCHING.md](MANUAL_REPORT_MATCHING.md)). There is no automatic merge.

## 5. Supporting libraries (not AI models)

| Library | Used for | Where |
|---|---|---|
| Pillow (`Pillow>=9.0.0`) | Opening, resizing and validating photos; reading the animal's colors when Gemini is off; passing images to Gemini; ID image integrity checks | `routes/reports.py`, `utils/ai_matching.py`, `utils/id_security.py` |
| OpenCV (`opencv-python>=4.8.0`) | Extracting up to 8 sample frames from an uploaded video, which are then handled like photos. Optional import: without it, video frame extraction does not run | `utils/video_processing.py` |

## 6. Rules

- The AI never confirms a match, closes a case or changes a status by itself.
- The Gemini API key stays in `.env` on the server, never in client code, tracked files or logs.
- Do not send real identity, medical or payment data to Gemini while the system uses test or mock data.

## 7. Known gaps

- The AI test set has **0 photos**. No accuracy figures can be reported until `backend/scripts/evaluate_ai.py` runs on a labeled set.

## 8. For the defense

> YOLOv8-nano detects and crops the animal locally, with Pillow reading colors and OpenCV sampling frames from videos. Gemini Flash is an optional second opinion on the visual match, controlled by the Administrator. Rule-based scoring is the fallback. The AI only suggests, and a person confirms.
