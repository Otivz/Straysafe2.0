# Case AI Insights: guidance (next steps, missing information, case recap)

- **Date:** 2026-11-25 15:55 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/app/models/case_ai_insight.py`, `backend/app/db_migrations/case_ai_insights.py`, `backend/migrations/2026-11-25_case_ai_insights_guidance.sql`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/01-system/CASE_AI_INSIGHTS.md`, `docs/README.md`
- **Authorization:** Developer's request in the Claude Code session to build the "Case AI Guidance Plan" (`CASE_AI_GUIDANCE_PLAN_2026-11-25.md`, pasted in the session), based on the current `/cases` system rather than the older report routes ("sige", after the plan was reviewed against the code).
- **Type:** Feature

## Intent

Help the Subdivision Leader see what to do next on a case, what the report still lacks, and what has happened so far, without the AI doing or deciding anything.

## Key changes

- One more part in the same single Gemini call: `guidance` with next steps, missing information (with one draft question to copy) and a recap.
- Next steps come only from a fixed list of actions that each open an existing screen of the case page (status, follow-up, complete follow-up, referral and claim review dialogs, the assessment form, the Overview tab). The server offers only the ones that fit the case now and drops any other. Warnings and closing are never suggested.
- Differences from the pasted plan, because of the current system: no "claim the case" step (an unassigned case can be worked by any Leader in the `/cases` workflow); no "ask reporter" or "visit site" steps (no screen of their own; a follow-up covers them); no "check duplicate reports" step (the candidates are computed live by another endpoint); the timeline is built from the same sources as the History tab (case audit events, follow-ups, referrals, contacts, claims, warnings) in fixed words, not from raw `status_history` remarks; the prompt version was not bumped, so existing insights stay visible and get guidance on the next Refresh.
- The case state is kept out of the content hash: the guidance stores a `case_signature`, and when the case changes the card says so and drops steps that no longer fit.
- Each part is checked on its own; a closed case keeps only the recap; all text is redacted again; the audit log records action ids and counts, never text.
- New nullable column `case_ai_insights.guidance` (migration `2026-11-25_case_ai_insights_guidance.sql`, additive, safe to re-run); the start-up check requires it.
- The card shows the recap, the numbered next steps with an Open button, the missing items and the draft question with Copy, plus the "case changed" note. It reads the cache again in the background when the case's status, priority, assessment, follow-ups, referrals or claims change.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 106 checks passed (79 before plus 27 new: no name, contact, coordinate, landmark or free text in the guidance input or prompt; only allowed ids offered; unknown, not-allowed and duplicate actions dropped; caps; PII removed from the answer; missing or malformed guidance kept the rest; a recap alone is enough; old rows read as `none`; Apply priority keeps the insight and marks the guidance stale; Start review drops the `start_review` step; overdue follow-up, needs-more evidence, possible match and wildlife rules; closed case keeps only the recap; timeline cap; suggest only; audit log without text).
- `test_analytics_ai_summary.py` (49), `test_case_analytics.py` (23) and `test_analytics.py` pass. The start-up check was run on an empty SQLite database: it names the guidance migration when the column is missing and passes once it is there.
- `npx tsc -b`: no errors. `npx eslint` on `AiInsightsCard.tsx`, `AssessmentTab.tsx` and `api.ts`: 0 problems.
- Not checked: a real Gemini call (answer quality, the draft question's language, time against the 15 s / 35 s limits) and the card in a running app.
