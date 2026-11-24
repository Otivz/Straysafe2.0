# Pet registration: photo analysis suggestions

- **Date:** 2026-11-24 10:02 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/resident/pages/pets/PetFormPage.tsx`, `frontend/src/resident/components/AiBadge.tsx`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/live/mediaAnalysis.ts`
- **Authorization:** Developer's request in the Claude Code session that the pet registration photo get an AI analysis like the report form's.
- **Type:** Feature

## Intent

When an owner registers a pet and picks a photo, check it in the background and suggest the details, as the report forms already do, without ever blocking the registration.

## Key changes

- `PetFormPage.tsx`: choosing a new photo sends it to `POST /reports/analyze-media` with `purpose="pet"` (the server's existing pet mode: the local detector only, no Gemini). While it runs the form shows "Analyzing photo…" and can still be filled in. The answer fills only "Dog or cat" and "Colour or coat", only when the owner has not filled or edited them (an earlier AI suggestion may be replaced by a later photo), and each suggested field shows an "AI suggested" badge. If no dog or cat is found, an info notice is shown; if the detector counts more than one animal, an amber notice asks for a photo of only this pet. A failed, slow or rate-limited check shows a short message and registration works as before.
- `AiBadge.tsx` (new): the "AI suggested" badge moved out of `DetailsPage.tsx` so both forms share it.
- `mediaAnalysis.ts`: `analyzeReportMedia(file, purpose?)` can send `purpose="pet"`.
- No backend change: breed, size and the AI-generated check are not part of pet mode (see `backend/app/utils/photo_checks.py`: pet photos are not checked by Gemini).

## Validation evidence

- `npx tsc -b`: no errors. `npx eslint` on the four files: 0 problems.
- Not checked: the form in a running app, and a real detector answer for a pet photo.
