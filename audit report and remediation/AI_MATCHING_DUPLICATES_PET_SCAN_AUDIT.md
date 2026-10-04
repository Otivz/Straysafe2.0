# StraySafe AI Audit — Potential Matching, Duplicate Reports, and Photo Scanning

**Date:** 2026-10-04
**Scope:** Every place the system uses AI: Gemini, YOLOv8, color extraction, and the rule-based fallbacks.
**Method:** Read-only code audit of `backend/app/utils/ai_*.py`, `routes/matches.py`, `routes/reports.py`, `routes/pets.py` and the frontend callers. Nothing was changed while writing this report.

---

## 1. The AI building blocks

| Component | File | What it is | Runs where |
|---|---|---|---|
| **YOLOv8n** (`yolov8n.pt`) | `utils/model_loader.py` | Object detector. StraySafe only keeps the `dog` and `cat` classes and their bounding boxes. Loaded once and cached in memory. | Locally on the server (no internet, no cost) |
| **Color extraction** | `utils/color_detection.py` | Crops to the YOLO box, ignores sky/grass pixels and names the dominant coat colors (e.g. "Brown, White"). | Locally |
| **Video frame sampler** | `utils/video_processing.py` | Pulls up to 8 frames from a video, runs YOLO on each and keeps the frame with the clearest, largest dog or cat. | Locally |
| **Google Gemini** | `utils/ai_suggestions.py` → `call_gemini_with_fallback()` | A multimodal LLM used for: (a) reading the report text, (b) inspecting photos (species, breed, colors, collar, AI-generated check), (c) comparing two animal photos. Tries `gemini-flash-latest` → `flash-lite` → `2.5-flash` → `2.5-pro` → `pro-latest` and moves to the next one on a rate-limit, quota or 404 error. | Google's servers (needs `GEMINI_API_KEY`, costs quota) |
| **Rule-based fallback** | `utils/ai_suggestions.py`, `utils/ai_matching.py` | Keyword and attribute scoring that runs when Gemini is turned off, has no key, or fails. | Locally |
| **Admin switch** | `system_settings.gemini_vision_matching` | Admin → AI settings turns Gemini on or off for everything. If the setting row is missing, Gemini is treated as **ON**. | DB |

---

## 2. When a resident submits a report (text + photo)

```
Resident picks a photo/video
   │
   ├─► POST /reports/analyze-media      (auto-fill the form)
   │      1. Video? → sample 8 frames → YOLO picks the best frame
   │      2. Photo → YOLO finds dog/cat boxes
   │      3. Crop to the biggest animal box
   │      4. Gemini (if ON): "Is this AI-generated?" + "Dog or cat? breed, 3 colors,
   │         coat pattern, size, collar, QR tag"
   │      5. Gemini OFF/failed → YOLO label + local color extraction
   │      → returns species, breed, colors, size, pattern, ai_photo_likelihood %
   │
   ├─► POST /reports/validate-images    (gate before submit, ResiHomePage)
   │      Gemini rejects: AI-generated (confidence ≥ 0.55) or "not a dog/cat"
   │
   └─► POST /reports/  (create)
          • generate_ai_suggestions(): Gemini reads the description →
            risk level, priority + reason, behavior flags (chasing, attempted bite,
            actual bite, injury, aggressive) with English/Tagalog negation handling
            ("hindi naman nangagat" = no bite). Fallback: keyword + regex rules.
          • trigger_looks_matching() → section 3 (runs inside the request)
          • Each uploaded media later runs process_report_media_ai() in a
            BACKGROUND task: YOLO + colors + refresh suggestions + matching again.
```

**AI-generated photo thresholds** (Gemini's `ai_generation_confidence`):

| Range | Label |
|---|---|
| ≤ 0.35 | Likely Authentic |
| 0.36 – 0.54 / 0.59 | Uncertain |
| ≥ 0.55 (validate-images) / ≥ 0.60 (analyze-media) | Potentially AI-generated → blocked on submit |

---

## 3. Potential matching (stray sighting ↔ registered pet)

Entry point: `scan_and_generate_matches_for_report(report_id)` in `routes/matches.py`.
It runs **when a report is created**, **after each media upload** (in the background task), and **on demand** (`POST /matches/scan/{id}`, `POST /matches/scan-all`, staff only).

### 3.1 Which pets are compared

A report is skipped entirely if it is resolved, already merged as a duplicate, impounded, or **already linked to a pet** (`report.pet_id`).

Candidate pets must pass `is_pet_eligible_for_matching()`:
- status is Active, Lost, Found or Rescued (never Deceased, Archived, Inactive or Impounded)
- the owner account, if any, is not Inactive, Suspended or Deleted
- the pet has a name and a type
- the pet has **at least one photo** (main, front, left or right)
- same species as the report, when the report says Dog or Cat
- not already judged by a human (CONFIRMED_MATCH / NOT_A_MATCH / UNABLE_TO_VERIFY) and not already answered by the owner

Old unreviewed AI suggestions for the report are deleted before each rescan, so a rescan replaces them.

### 3.2 How a pair is scored — `calculate_match_details()`

1. **Hard gates:** a deceased candidate scores 0, and a species mismatch (Dog vs Cat) scores 0.
2. **Metadata gathered:** breed, color, coat pattern, size, description and markings for both sides, plus the straight-line distance between the sighting and the pet's registered address.
3. **Gemini Vision path** (Gemini ON and both photos load):
   - Both photos are sent to Gemini with a forensic prompt. The prompt says **"same breed ≠ same animal"** and asks Gemini to compare face, ears, coat pattern, facial markings, body build and scars.
   - Gemini returns `individual_similarity_score` (0–100), a verdict (NOT A MATCH / LOW CONFIDENCE / POTENTIAL MATCH / STRONG MATCH), contradictions and corroborations.
   - **This score is used as-is.** Distance is shown as evidence but doesn't change the score.
4. **Rule-based path** (Gemini OFF, failed, or a photo couldn't be loaded) — `compare_animals_rule_based()`:

| Signal | Effect on score (starts at 10) |
|---|---|
| Same purebred (e.g. Husky = Husky) | +25 |
| Both Aspin / Puspin / mixed | +5 only |
| Two different purebreds | −35 |
| Other breed difference | −10 |
| Shared coat colors | +10 (one) / +20 (two or more) |
| Color families clash (e.g. black vs white) | −40 |
| Colors simply differ | −30 |
| Bicolor vs solid coat | −25 |
| Same coat pattern | +15 |
| Same size / one step apart / two steps apart | +10 / −10 / −30 |
| Shared marking keywords (patch, socks, collar, scar, …) | +15 |
| Within 0.5 km / 1.5 km | +5 / +2 (context only) |

   It then caps the score: any color conflict or two or more contradictions → **max 25 (NOT A MATCH)**; one contradiction → **max 45**; otherwise **max 90**. The rule path can never reach "STRONG MATCH".

### 3.3 What gets saved and who is told

- Saved when **score ≥ 50 and the verdict is not NOT A MATCH / LOW CONFIDENCE**, as a `report_matches` row with status `AI_SUGGESTED`, the score, an explanation and the evidence (JSON).
- The **pet owner gets one notification** ("🔍 Look-Alike Pet Sighting Detected"). Rescans don't send it again.
- Nothing is linked automatically. It's **two-way**: the owner confirms ("is this my pet?") and a staff reviewer verifies (`/matches/{id}/verify`). Only then is the report linked to the pet. A disputed link can be undone (`unlink-pet`).

---

## 4. Duplicate reports (stray sighting ↔ another stray sighting)

Same function, part 2. The reverse direction (B vs A) is created when the other report is scanned.

**Which reports are compared:**
- active (not resolved), not already merged, not impounded
- **same `animal_type`** (if the new report has no animal type, duplicate detection is skipped)
- created within **±7 days** of each other
- within **1.5 km**, or in the same subdivision when coordinates are missing
- not a pair a human already judged

**Scoring:** the same `calculate_match_details()` as section 3 (Gemini Vision first, rule-based otherwise). The time gap between the reports is recorded as evidence only.

**Saved when score ≥ 65** and the verdict isn't NOT A MATCH / LOW CONFIDENCE. That bar is stricter than pets (50).
- A report within 24 h gets a "Time Proximity" bullet at the top.
- **Subdivision Leaders** of that subdivision get one alert per pair: "⚠️ Suspected Duplicate: #A & #B".
- Staff then **merge** (confirmed duplicate → status 18, `duplicate_of_report_id` set, timelines shared) or dismiss. When a report is resolved, its unreviewed duplicate suggestions are deleted.

---

## 5. Pet registration photo upload — how the pet photo is scanned

Resident → My Pets → Register a Pet (`ResidentPet.tsx`):

1. When a photo is picked, the page calls **`POST /reports/analyze-media`**. This is the same scan as section 2: YOLO, crop, Gemini species/breed/colors/size/pattern, and the AI-generated check.
2. The result **pre-fills the form**: species, breed, primary/secondary/tertiary color, size and coat pattern. An **AI image verification badge** shows Likely Authentic / Uncertain / Potentially AI-generated.
3. On save, the photos upload **straight from the browser to Cloudinary**, then `POST /pets/` stores the URLs.
4. Staff upload (`POST /pets/{id}/photo`): YOLO + color extraction runs on the server (`auto_extract_pet_colors`), but **only fills the colors if the pet has none yet**.
5. Front, left and right photos are **not scanned**. They're used later as images in matching (front first).

**Why it matters:** the pet's photo and colors are what every future look-alike match compares against. A wrong or fake photo here means wrong matches later.

---

## 6. Findings

Severity: 🔴 high · 🟠 medium · 🟡 low

| # | Sev | Finding | Where | Why it matters |
|---|---|---|---|---|
| F1 | 🔴 | **Match endpoints are open to anyone, no login needed:** `GET /matches/`, `/matches/duplicates`, `/matches/duplicates/report/{id}`, `/matches/{id}`, `/matches/report/{id}`, `/matches/settings`. Their response includes the full pet record (`registered_address`, `emergency_contact_name/phone`) and full reports (`owner_phone`, `owner_email`, `owner_address`). | `routes/matches.py` L801–1105 | Anyone who knows the API can list owners' home addresses and phone numbers. Data-privacy (RA 10173) exposure. |
| F2 | 🔴 | **`/reports/analyze-media` and `/reports/validate-images` need no login** and have no rate limit. | `routes/reports.py` L1424, L1809 | Anyone can use your Gemini quota (cost / quota exhaustion) and push large files at YOLO (CPU). |
| F3 | 🟠 | **The fake-photo block is front-end only.** `validate-images` blocks AI-generated / non-dog-or-cat photos in the resident UI, but `POST /reports/` and `POST /pets/` don't re-check. Pet registration shows the badge but **still saves** an AI-generated or non-animal photo. | `ResiHomePage.tsx`, `ResidentPet.tsx`, `POST /pets/` | Fake or wrong photos can enter the records and poison matching. |
| F4 | 🟠 | **When Gemini is OFF or fails, `analyze-media` returns `verification_status: "authentic"`** without having checked authenticity. | `routes/reports.py` fallback (~L1740) | The badge says "verified" when nothing was checked. It should say "not checked". |
| F5 | 🟠 | **Matching runs inside the create-report request.** For each eligible pet of that species (system-wide, not limited by area) it makes one Gemini call with two images, one after another. | `create_report` → `trigger_looks_matching` | With 50 pets that's 50 sequential Gemini calls: slow submits, timeouts, quota burn. Background uploads repeat the full scan. |
| F6 | 🟠 | **Inconsistent AI-generated thresholds:** 0.55 (validate-images), 0.60 (analyze-media), 60% / 0.55 (frontend). | reports.py, ReportStrayPage, ResidentPet | The same photo can be "uncertain" on one screen and "blocked" on another. |
| F7 | 🟠 | **The Gemini Vision score is trusted without any check.** If Gemini returns no score it defaults to **50**, which reaches the pet-suggestion bar. Bad JSON returns `None` and falls back to rules, which is fine. | `ai_matching.py` L192, `matches.py` L389 | A malformed but valid-JSON answer can create a 50% "potential match". |
| F8 | 🟡 | **Invented defaults feed the matcher.** A missing breed becomes "Aspin" and a missing size becomes "Medium" on both sides. `generate_ai_suggestions` defaults the color to "Brown" and the pattern to "Solid". | `matches.py` L312–331, `ai_suggestions.py` | Two unknown animals look like "same breed + same size" and earn points from data nobody entered. |
| F9 | 🟡 | **Duplicate detection needs `animal_type`** and only compares exact equal values ("Dog" vs "dog" or "Unknown" are never compared). | `matches.py` L688–701 | Reports with an unknown species are never checked for duplicates. |
| F10 | 🟡 | **Distance uses a flat-earth approximation** (`111 km × Δlat`, `0.965` cosine fixed for about 15° N). Fine for the Philippines, but it's not haversine. | `matches.py` L344, L724 | Small error; acceptable locally. |
| F11 | 🟡 | **YOLO uses its default confidence (0.25)** and only "dog"/"cat". A low-confidence box can pick the crop and color. | reports.py, pets.py | Occasionally the wrong crop gives the wrong colors. |
| F12 | 🟡 | **Front/left/right pet photos are never scanned**, but they're the *first* image used for matching (`photo_front_url` before `photo_url`). | `ai_matching.fetch_image_for_entity`, ResidentPet | An unverified side photo decides the match. |
| F13 | 🟡 | **No record of which engine produced a score.** A saved match doesn't say whether Gemini Vision or rules made it, or which Gemini model answered. | `report_matches` | Staff can't judge how much to trust a %; it's hard to audit or defend. |
| F14 | 🟡 | **The model list includes `gemini-2.5-pro` / `pro-latest` as fallbacks.** | `ai_suggestions.py` | When the flash models are rate-limited, calls move to pro models, which are slower and cost more. |

### What is done well

- **"Same breed ≠ same animal"** is built into both the Gemini prompt and the rule caps (Aspin vs Aspin gives only +5; any color conflict caps the score at 25).
- **Two-way confirmation** before a pet is linked to a sighting: the owner confirms and staff verifies. No automatic linking.
- **Human decisions are kept**: rescans never re-suggest a pair a human rejected or confirmed.
- **Notifications go out once**: rescans don't spam owners or leaders.
- **Sensible exclusions**: deceased, archived and impounded animals, inactive owners and pets without photos.
- **Tagalog/Taglish negation handling** in behavior analysis ("hindi naman nangagat").
- **It still works with Gemini off** (YOLO + rules), and admins can switch Gemini off.

---

## 7. Recommended fixes (in order)

1. **F1:** require login on all `/matches` GET routes and scope them like reports (resident: own reports and own pets; leader: own subdivision; staff: own barangay). Return a slim pet/owner object, never addresses or phones, to anyone but the owner and staff in scope.
2. **F2:** require login and add a rate limit (e.g. 20/min per user) on `analyze-media` and `validate-images`, with the same 10 MB size check used elsewhere.
3. **F3:** run the authenticity + species check on the server when a report or pet photo is saved. Block or flag (`ai_photo_status`) instead of trusting the browser.
4. **F4:** in the fallback return `verification_status: "not_checked"` and show "Authenticity not checked (AI offline)".
5. **F5:** move the create-report scan to a background task (like media uploads). Pre-filter pets by area/barangay and by color family before calling Gemini, and cap the Gemini calls per scan (e.g. the top 10 by rule score).
6. **F6:** use one shared constant (`AI_GENERATED_BLOCK = 0.60`, `UNCERTAIN = 0.36`) in the backend and have the frontend read the backend's `verification_status` instead of recomputing it.
7. **F7 / F13:** treat a missing Gemini score as "no result" (use the rules), and save `engine: "gemini_vision" | "rules"` plus the model name in `ai_evidence`. Show it on the match card.
8. **F8 / F9:** compare only fields that were actually entered (unknown breed/size give no points), and normalize `animal_type` case. Optionally compare Unknown-species reports by photo.
9. **F12:** scan front/left/right photos with the same check on pet registration.

---

## 7b. Remediation status (2026-10-04)

Each finding was re-checked in the code before it was fixed. Verified by `backend/tests/test_ai_audit_fixes.py` (28/28), together with every existing backend suite (all pass) and the frontend type-check.

| # | Status | What changed |
|---|---|---|
| F1 | ✅ Fixed | All `/matches` reads require login. The list endpoints (`/`, `/duplicates`, `/duplicates/report/{id}`) are staff only and scoped to the leader's subdivision or the staff member's barangay. `/{id}` and `/report/{id}` let a resident see only matches on their own report or their own pet, and the other party's phone, email, address, registered address and emergency contact are removed. |
| F2 | ✅ Fixed | `analyze-media` and `validate-images` require login, are limited to 20 requests/min, and reject files over 10 MB. **Also found and fixed:** `POST /reports/` needed no login and trusted the `user_id` sent by the browser, falling back to the first user. It now requires login, always files the report as the caller, and is rate-limited. |
| F3 | ✅ Fixed | **Reports:** the background media job runs a server-side Gemini authenticity + species check (`utils/photo_checks.py`) and overwrites the browser's `ai_photo_*` values, which could be faked. **Pets:** every photo (main/front/left/right) is checked in the background on create, update and upload. The worst result is stored in `pets.photo_check_status/details`, shown to staff in the pet panel, and logged in the pet's history. The registration form blocks AI-generated and no-dog/cat photos. |
| F4 | ✅ Fixed | The offline fallback returns `verification_status: "not_checked"` ("Authenticity not checked (AI offline)"), and the badge shows it. |
| F5 | ✅ Fixed | Matching on report creation runs as a background job. Every candidate is scored by the free rules first, and Gemini Vision is called only for the top **10 per pass** (pets, then duplicates). |
| F6 | ✅ Fixed | One threshold table (`photo_checks.py`): ≥ 0.60 AI-generated, 0.36–0.59 uncertain, < 0.36 authentic. Used by both endpoints, the background checks and the prompts. |
| F7 | ✅ Fixed | A Gemini answer without a score now counts as no result (rules are used); there's no default 50. |
| F8 | ✅ Fixed | Missing breed, size, color or pattern give **no** points (no invented "Aspin/Medium/Uniform"). `generate_ai_suggestions` no longer invents "Brown/Solid/Medium". Badges show "Not recorded". |
| F9 | ✅ Fixed, finding corrected | `animal_type` is a DB enum (Dog/Cat/Unknown), so the "Dog vs dog" case problem can't actually happen. The real gap was that reports with an **unknown** species were never checked. Now every report is checked against the same species plus Unknown. |
| F10 | ✅ Fixed | Distance uses haversine. |
| F11 | ✅ Fixed | YOLO ignores detections below 0.35 confidence. |
| F12 | ✅ Fixed | Covered by F3: front/left/right photos are checked too. |
| F13 | ✅ Fixed | `ai_evidence.engine` (`gemini_vision` / `rules`) and `ai_evidence.model` are saved with every match. |
| F14 | ✅ Fixed | The automatic fallback chain is flash models only; `2.5-pro` / `pro-latest` were removed. |

**Not changed:** the human review flow (two-way confirmation, merge / dismiss), the 50 / 65 thresholds and the ±7-day / 1.5 km duplicate window.
**Schema:** `pets.photo_check_status`, `pets.photo_check_details` (added on startup; `Database3.3.txt` updated).

---

## 8. Quick reference — thresholds

| Rule | Value |
|---|---|
| Pet look-alike suggestion | score ≥ 50 and verdict not NOT A MATCH / LOW CONFIDENCE · Gemini Vision for the top 10 candidates per scan |
| Duplicate report suggestion | score ≥ 65, same species, ±7 days, ≤ 1.5 km (or same subdivision) |
| Rule-based max with any color conflict / one contradiction / clean | 25 / 45 / 90 |
| AI-generated photo blocked | confidence ≥ 0.60 everywhere (was 0.55 / 0.60 before remediation) |
| Video | up to 8 sampled frames; best = 0.7 × YOLO confidence + 0.6 × box area (capped at 0.5) |
| Images sent to Gemini | resized to max 1024 px |
