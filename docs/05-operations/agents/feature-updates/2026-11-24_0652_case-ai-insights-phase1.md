# Case AI Insights (Suggested), Phase 1

- **Date:** 2026-11-24 06:52 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/utils/pii_redactor.py`, `backend/app/models/case_ai_insight.py`, `backend/app/models/__init__.py`, `backend/app/db_migrations/case_ai_insights.py`, `backend/migrations/2026-11-24_case_ai_insights.sql`, `backend/app/main.py`, `backend/app/services/case_ai_insights.py`, `backend/app/schemas/case.py`, `backend/app/routes/cases.py`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/01-system/CASE_AI_INSIGHTS.md`, `docs/README.md`
- **Authorization:** Developer's request in the Claude Code session to implement Phase 1 of the "AI in report analysis" proposal: a cached, suggest-only AI Insights card on the Subdivision Admin Case Assessment view.
- **Type:** Feature

## Intent

Help the Subdivision Leader triage: a short summary, a suggested priority and a category check, from Gemini, without the AI ever changing the case and without personal data leaving the server.

## Key changes

- `GET` and `POST /cases/{id}/ai-insights` (cached per redacted content hash, fail closed, gated by the existing Gemini Admin toggle) and `PUT /cases/{id}/category` (the Leader's audited category switch).
- `pii_redactor.py` and an allow-list payload: no reporter, contact, suspected owner or respondent data is sent; free text is redacted before sending and the answer is redacted again before storing.
- Audit log: generation, failure, category change, and applied versus overridden AI suggestions for priority and category.
- New table `case_ai_insights` by migration `backend/migrations/2026-11-24_case_ai_insights.sql`. The backend refuses to start until it is applied (same convention as other migrations).
- Admin `AiInsightsCard` (collapsible, "AI suggestion · Review before applying", Apply priority, Switch category, Generate and Refresh), hidden when AI is off or for Lost Pet cases.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 50 checks passed (redaction, allow-list payload, caching, Gemini OFF, timeout and invalid JSON fail closed, suggest-only, applied versus overridden audit).
- `test_gemini_setting.py` and `test_effective_priority.py` pass. `test_case_lifecycle.py`, `test_case_notes_queue.py` and `test_case_gating.py` fail identically on an unmodified copy of HEAD, so those failures were there before this change.
- `npx tsc -b`: no errors in the changed files; one existing error in `src/admin/pages/CasesPage.tsx` (`reportedByText`) comes from an uncommitted local edit to `admin/live/adapters.ts`. `npx eslint` on the changed frontend files: 0 problems.
- Not checked: a real Gemini call and the card in a running app.
