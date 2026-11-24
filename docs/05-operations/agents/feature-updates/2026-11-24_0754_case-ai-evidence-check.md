# Case AI Insights: advisory Evidence Check

- **Date:** 2026-11-24 07:54 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/app/models/case_ai_insight.py`, `backend/app/db_migrations/case_ai_insights.py`, `backend/migrations/2026-11-24_case_ai_insights_evidence.sql`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `docs/01-system/CASE_AI_INSIGHTS.md`, `docs/01-system/REPORT_LIFECYCLE_AND_FEATURES.md`, `docs/README.md`
- **Authorization:** Developer's request in the Claude Code session to extend the Phase 1 AI Insights feature with the advisory Evidence Check (section 2A of the AI report analysis proposal).
- **Type:** Feature

## Intent

Tell the Subdivision Leader when an evidence photo looks blurry, shows no animal, or contradicts the report, without ever rejecting evidence or deciding Evidence Sufficiency.

## Key changes

- `GET` and `POST /cases/{id}/ai-insights` now return `insight.evidence_check` = `{status: ok | flag | no_media | unavailable, flags, summary, confidence}`. It comes from the same single Gemini call, which now also receives up to 2 of the report's own photos (images only) next to the redacted text. The 15 s per call and 35 s total limits are unchanged.
- Fail closed: an unreadable photo makes the evidence check `unavailable` and the call is made with text only, so the rest of the insight is still returned. A missing or malformed evidence answer is `unavailable` or an empty `ok`, never a flag. `no_animal` is dropped when the local YOLO result stored for that file found a dog or cat.
- Cache key now includes which photos are used (hashed ids and addresses) and the prompt version (bumped to 2, so earlier cached insights are made again).
- Only our own uploads or an https Cloudinary link are fetched as evidence. The audit log records the evidence status, flags and photo count, never text.
- New column `case_ai_insights.evidence_check` by migration `backend/migrations/2026-11-24_case_ai_insights_evidence.sql`. The start-up check now also requires it.
- `AiInsightsCard`: an Evidence Check section (amber callout listing "Blurry photo", "No animal detected", "Photo may contradict description" with the AI's reasoning; a quiet note for ok and for no photo).
- `REPORT_LIFECYCLE_AND_FEATURES.md`: removed "(planned)" from the evidence check. `CASE_AI_INSIGHTS.md` documents it. The proposal file `AI_REPORT_ANALYSIS_PROPOSAL.md` is not in the repository, so the behaviour follows the request text.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 79 checks passed, including no_media, ok, blurry, no_animal, contradicts_description, PII in the prompt and in the evidence summary, the YOLO override, the 2-photo cap, the cache key with photos, unreadable photo, malformed evidence, Gemini timeout, and Gemini OFF.
- `npx tsc -b`: no errors. `npx eslint` on the changed frontend files: 0 problems.
- Not checked: a real Gemini call with a real photo, and the card in a running app.
