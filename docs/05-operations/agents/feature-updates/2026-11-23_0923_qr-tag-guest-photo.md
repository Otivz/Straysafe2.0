# QR Tag: a Stranger Can Attach a Photo

- **Date:** 2026-11-23 09:23 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/pet_tags.py`, `backend/app/services/pet_tags.py`, `backend/tests/test_pet_tags_alerts.py`, `backend/tests/test_pet_tags_public.py`, `frontend/src/resident/pages/tag/TagScanPage.tsx`, `frontend/src/resident/pages/pets/PetTagScans.tsx`, `frontend/src/resident/pages/pets/PetTagScansPage.tsx`, `frontend/src/admin/components/PetTagBlocks.tsx`, `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md`, `docs/README.md`
- **Authorization:** Developer asked whether a stranger who scans the QR tag can send an image as proof, then "Okay goooo" to the proposal (one photo, owner and Leader only, "Tap to view", removed on "This isn't real").
- **Type:** Feature

## Intent

A stranger who finds a pet is the most common finder, and a photo is the best proof they have the right pet. Allow it safely.

## Key changes

- **Backend:**
  - new public route `POST /t/{token}/photo`: one image only, up to 10 MB, checked by the existing upload validation, 3 per hour per visitor, and refused for an unknown or inactive tag before anything is uploaded. The server uploads the image to the Cloudinary folder `straysafe/pet-tag-found` and returns the link;
  - `record_found` no longer refuses a guest's photo, but a guest's link must come from that folder ("Attach the photo from this page.");
  - `resolve_scans(..., drop_photo=True)` clears the photo link when the owner answers "This isn't real". The file is not deleted from Cloudinary; only the link is removed.
- **Resident app:**
  - the public tag page shows the Photo field to everyone, with "Only the owner and the Subdivision Leader see it.". A stranger's photo goes through the new route; a signed-in resident's through the existing app upload;
  - on the owner's pages, a guest's photo is hidden behind "Tap to view · photo from a guest (not checked)" (`FinderPhoto`); a neighbour's photo is shown directly.
- **Leader app:** the case's tag messages show a visitor's photo behind "Tap to view · photo from a visitor (not checked)".

## Validation evidence

- `tests/test_pet_tags_alerts.py`: 9 new checks pass (66/67 overall; the one failure, "a turned-off tag drops out of the list", already fails on the committed code):
  - a guest uploads one image, stored in the tag's folder;
  - a non-image and an unknown tag are refused before any upload;
  - a guest message carries the photo, and a link from elsewhere is refused;
  - the owner sees it marked as from a guest;
  - "Not yet" keeps the photo, and "This isn't real" removes the link.
- `tests/test_pet_tags_public.py`: 63/69, the same failures as before. The existing guest-photo check still passes; its label now reads "a guest cannot attach a photo that was not uploaded through the tag".
- Browser check, 6/6, on a throwaway database. The photo upload was replaced by a fake link, so nothing was sent to Cloudinary. It covered:
  - the photo field and its note;
  - a stranger's photo saved with the message;
  - the owner's "Tap to view", then the picture after one tap;
  - the Leader's "Tap to view".
- Frontend unit suite: 203 pass and the same 18 failures as before. One earlier full run showed 23 failures; running again, and running each file alone, both gave the same 18.
- `npx tsc -b`: exit 0.
- ESLint: only the existing `set-state-in-effect` error in `PetTagScansPage.tsx`, which this change did not touch.
- Not checked on the real app with real Cloudinary.
