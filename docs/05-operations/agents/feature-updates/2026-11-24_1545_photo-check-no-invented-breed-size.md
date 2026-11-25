# Photo Check: No Invented Breed or Size When the AI Is Unavailable

- **Date:** 2026-11-24 15:45 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/reports.py`, `backend/app/utils/color_detection.py`, `frontend/src/live/mediaAnalysis.ts`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/admin/pages/NewReportPage.tsx`, `docs/README.md`
- **Authorization:** Developer: "I'm not satisfied how ai detects the breed and color of the image" (a small black-and-white long-haired dog under a car came back as Aspin, Medium, Black, Gray, White, Tricolor), then "Yes go ahead" to fixes 1 to 4.
- **Type:** Fix

## Intent

The developer's photo was answered by the backup path, not the AI. The free Gemini quota was used up (429), and the other models were overloaded (503). The backup then **invented** "Aspin" and "Medium" for every dog and turned three pixel colours into "Tricolor", and the form labelled all of it "AI suggested".

## Key changes

1. **No invented values** (`POST /reports/analyze-media`, backup path):
   - `possible_breed`, `estimated_size` and `coat_pattern` are now `Unknown` (they were `Aspin`/`Puspin`, `Medium`, and a pattern counted from the colours);
   - when the AI answers but leaves a field out, it also stays `Unknown` (it defaulted to White, Medium or Aspin);
   - the forms leave `Unknown` fields empty.
2. **Honest wording:**
   - the answer carries `analysis_source` (`ai` or `basic`);
   - when it is `basic`, both report forms say the AI photo check is unavailable, that only the animal and its main colours were read (shadows can make colours wrong), and that breed and size were not guessed.
3. **Stricter backup colours:**
   - `extract_dominant_colors` gains optional `max_colors`, `min_share` and `drop_shading_gray`; the defaults keep the earlier behavior for every other caller;
   - the backup photo check uses at most 2 colours, each at least 15% of the coat;
   - gray is dropped when black and white are present and gray is under 40%;
   - an RGBA image (a PNG screenshot) is converted before reading.
4. **Less bias in the AI prompt:**
   - size is judged from the animal's build, with toy and small breeds named as Small, and "Unknown" allowed;
   - breed: use Aspin or Puspin only for a local mixed-breed look, never as a default, and "Unknown" when unsure;
   - colours: only the animal's fur, never shadow or ground.

## Validation evidence

- **The developer's photo, run through the real endpoint code with Gemini still over quota:**
  - before: Black, Gray, White, Tricolor, Medium, Aspin;
  - after: Black, Gray, coat pattern Unknown, size Unknown, breed Unknown, `analysis_source: basic`.
- **Colour limit:** the colour reading of that photo remains imperfect. It is a dark 211 × 201 pixel image where shaded white fur reads as gray (white is 6% of the dog's pixels, gray 43%). A pixel reader cannot separate them, so the form now says so.
- **Backend tests:**
  - `test_pet_photo_multi_animal.py` 30/30, `test_admin_012_gemini_governance.py` passes;
  - `test_ai_audit_fixes.py` 23/28, the same 5 failures as on the committed code.
- `npx tsc -b`: exit 0. ESLint on the three frontend files: no findings.
- **Not checked:** the prompt change with a real Gemini answer, because the free daily quota was exhausted (Google said to retry in about 16 hours).
