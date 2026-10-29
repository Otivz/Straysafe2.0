# Pet registration photo check: YOLO only, no Gemini

- **Date:** 2026-10-28 11:17 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/reports.py`, `backend/app/routes/pets.py`, `backend/app/utils/photo_checks.py`, `backend/tests/test_pet_photo_multi_animal.py`, `backend/tests/test_pet_behavior_history.py`, `backend/tests/test_pet_record_access.py`, `frontend/src/components/PetPhotoGuard.tsx`, `frontend/src/components/PetRecords/AddPetModal.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/src/pages/citizen/ResidentPet.tsx`, `docs/01-system/AI_TECHNOLOGIES.md`, `docs/02-project/SYSTEM_PRESENTATION_FLOW.md`, this record
- **Authorization:** the developer: "maybe remain the yolo for animal detection but leave out the gemini in the register pet"; the resident should not see the check ("leave the info for the user only the system know … it wont accept"); potential matching keeps Gemini ("in the potential matching it must have that feature"); then "yes please".
- **Type:** Polish

## Intent

Pet registration checks the photo with the local YOLO model only and shows the resident nothing about the check. Look-alike matching keeps using Gemini.

## Key changes

- `POST /reports/analyze-media` accepts `purpose=pet`. In that mode Gemini is never called. The answer gives only YOLO's result (dog or cat, how many, coat colours), with breed, size and pattern set to `Unknown` and no authenticity fields. If YOLO itself fails, `animal_detected` is `null` (not checked) so registration is not refused for a server problem. Report photos (no `purpose`) are unchanged.
- The background Gemini re-check of pet photos (`recheck_pet_photos`) and its helpers are removed, so `pets.photo_check_status` is no longer written (the column stays). The staff "photo check" label in the pet record panel is removed. YOLO's confidence is still saved on the pet (`ai_detection_confidence`) when a photo is uploaded.
- Resident form (`ResidentPet.tsx`): the authenticity badge and the "AI Recognition" card are removed. Species and coat colours still fill in quietly from YOLO, and breed and size are left to the resident. A photo with no dog or cat blocks saving with "Please upload a clear photo of your dog or cat."
- Staff Add Pet form: the same refusal. Both forms use the new `noAnimal` flag in `usePetPhotoGuard`, which also sends `purpose=pet`. The several-animals crop step is unchanged.
- Gemini Vision look-alike matching (`utils/ai_matching.py`) is not touched.

## Validation evidence

- `test_pet_photo_multi_animal.py`: 28 of 28. New checks: pet mode detects with YOLO, never calls Gemini even when it is switched on, returns no authenticity verdict and no guessed breed or size, reports a no-animal photo, and returns "not checked" when YOLO fails. A control check confirms report photos still go to Gemini under the same settings.
- `test_pet_behavior_history.py` and `test_pet_record_access.py` (patch of the removed function dropped): OK.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the 4 changed frontend files: 97 problems before, 96 after (all pre-existing). Browser tests `petPhotoAccess`, `petBehaviorHistory`, `petClaimRecords`: pass.
- Not covered by an automated test: the resident registration form's photo step in a browser. To be checked by the developer.
