# Multi-attribute animal matching

- **Date:** 2026-11-19 15:01 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/match_scoring.py`, `backend/app/services/lost_found_matching.py`, `backend/app/routes/lost_found.py`, `backend/app/routes/matches.py`, `backend/app/models/lost_found_match.py`, `backend/app/db_migrations/case_alignment.py`, `backend/app/utils/ai_pipeline.py`, `backend/migrations/2026-11-19_multi_attribute_matching.sql`, `backend/tests/test_multi_attribute_matching.py`, `backend/tests/test_lost_found_matching.py`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/components/MatchParts.tsx`, `frontend/src/admin/dialogs/MatchDialogs.tsx`, `frontend/src/admin/styles/pages.css`, `frontend/tests/adminMonitoredCase.test.mjs`, `frontend/tests/liveLostFound.browser.mjs`, `docs/01-system/MULTI_ATTRIBUTE_MATCHING.md`, `docs/01-system/LOST_FOUND_MATCHING.md`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `docs/README.md`
- **Authorization:** The developer's request in this session, "FEATURE ENHANCEMENT: MULTI-ATTRIBUTE ANIMAL MATCHING LOGIC" (combine location, breed, coat colour, physical description and AI visual similarity into ranked, explained candidates with authorized human review). FREEZE was OFF.
- **Type:** Feature

## Intent

Improve possible-animal identification by scoring candidates on five attributes instead of text points (lost/found) or the photo score alone (Pet Registry), with explanations, honest handling of missing information, and review kept under human control.

## Key changes

- New engine `utils/match_scoring.py`:
  - attribute scorers: Haversine location with proximity classes; normalized breed (Aspin/Puspin/mixed/unknown); coat colour families with patterns, where markings are not coat colours; weighted distinctive-feature description with contradictions; the stored Gemini visual score;
  - weighted combination renormalized over the attributes that could be compared, coverage, a proportional reduction below 50% coverage, classifications, explanations;
  - configuration in `system_settings.matching_config`.
- Lost/found:
  - suggestions store their breakdown, algorithm, history and photo comparison;
  - new statuses: Under review. Decisions carry notes;
  - recalculation keeps earlier results, triggered by rechecks, the AI follow-up job after new photos, or a Leader;
  - AI photo comparison on a Leader's request;
  - suggestion, recalculation, decision and configuration events are audited;
  - the Leader's notification names both references and the similarity.
- Pet Registry: `calculate_match_details` scores registered pets with the engine. Low or insufficient candidates are no longer suggested. Earlier scores are kept in `ai_evidence.history`, and a non-owner resident no longer receives the distance to another resident's registered home.
- New API:
  - `POST /lost-found/matches/{id}/rescore`;
  - `POST /lost-found/matches/{id}/photo-comparison`;
  - `GET`/`PUT /lost-found/matching-config` (`PUT` is Administrator only);
  - `under_review` and `note` on `/decision`.
- Leader app: breakdown panel (overall, classification, coverage, per-attribute score, bar and explanation, unavailable attributes), Recalculate, Compare photos (AI), review notes, Mark as Under review / Not a match / Confirm verified match, earlier results; match cards show score and coverage.
- Schema: five nullable `lost_found_matches` columns (start-up case alignment + SQL file).

## Validation evidence

- `python tests/test_multi_attribute_matching.py`: 58 checks passed.
- `python tests/test_lost_found_matching.py`: 69 passed (score assertions updated to the new engine; 5 new checks).
- `test_case_alignment_migrations` 61, `test_case_alignment_failure_handling` 42, `test_ai_audit_fixes` 28/28, `test_match_cases` 28/28, `test_pet_identity` 64/64, `test_closed_case_suggestions` 14/14, `test_active_case_requests` 17/17, `test_animal_color_tags` 13/13, `test_case_messaging` 105, `test_resident_messaging` 50, `test_case_closure` 12/12: all passed.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the changed frontend files: clean.
- `node --test`: adminLostFound 13/13, adminLiveAdapters 21/21, adminLostPet 12/12, adminMonitoredCase 15/15 (one label assertion updated), residentCaseMessages 6/6.
- `liveLostFound.browser.mjs` button labels updated but not run (needs a live server and browser).
- Not run against the application database; no Gemini call was made (the AI was mocked in tests).
