# AI Features and Process Guide

- **Date:** 2026-11-24 05:03 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `docs/01-system/AI_FEATURES_AND_PROCESS.md` (new), `docs/README.md`
- **Authorization:** Developer request "Create me a commplete overall process, featuer of the system with the ai".
- **Type:** Polish (documentation only)

## Intent

One complete guide to how the AI works in StraySafe, end to end, so a reader does not have to combine four separate documents.

## Key changes

- New `docs/01-system/AI_FEATURES_AND_PROCESS.md`:
  - the one rule (the AI suggests, a person decides);
  - the five technologies;
  - the full background process from a filed photo to a suggestion (media, follow-up and backfill jobs, the separate AI worker and its fallback);
  - each AI feature: finding the animal, describing the report, photo check, look-alike pets, duplicate reports, lost and found matches;
  - the matching engine and its weights;
  - what is **not** AI (automatic safety priority, Possible Owners ranking, offense counts, QR tag signals);
  - what people see today;
  - settings, failure behavior, privacy, limits and a short defense summary.
- Built from the existing AI documents and a re-read of the job queue, pipeline, Gemini and matching code. One finding is stated openly in the guide: the AI description, risk and photo-check fields are stored and returned by the report API, but no screen in the current Leader or Resident app displays them (not re-checked in every file).
- `docs/README.md`: indexed.

## Validation evidence

- Strict documentation audit run after the change; no finding for the new file (the findings already present are in other files).
- No source code, tests, configuration or database touched.
