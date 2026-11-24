# Analytics: AI Trend & Hotspot Summary

- **Date:** 2026-11-24 08:08 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/analytics_ai_summary.py`, `backend/app/models/analytics_ai_summary.py`, `backend/app/models/__init__.py`, `backend/app/db_migrations/analytics_ai_summary.py`, `backend/migrations/2026-11-24_analytics_ai_summary.sql`, `backend/app/main.py`, `backend/app/routes/analytics.py`, `backend/tests/test_analytics_ai_summary.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/lib/useAiSummary.ts`, `frontend/src/admin/components/AiTrendSummary.tsx`, `frontend/src/admin/pages/ReportsPage.tsx`, `docs/01-system/ANALYTICS_AI_SUMMARY.md`, `docs/01-system/REPORT_LIFECYCLE_AND_FEATURES.md`, `docs/README.md`
- **Authorization:** Developer's request in the Claude Code session to implement section 2B of `AI_REPORT_ANALYSIS_PROPOSAL.md`: an AI Trend & Hotspot Summary on the Subdivision Admin Analytics page.
- **Type:** Feature

## Intent

Give the Subdivision Leader a plain-words reading of the Analytics numbers (trend, hotspots, repeat complaint patterns, a copyable monthly digest) without any personal data leaving the server and without the AI deciding anything.

## Key changes

- `GET` and `POST /analytics/ai-summary` (`from`, `to`, optional `refresh=true`), scoped to the Leader's subdivision. Aggregated statistics for the range and the period of equal length before it are computed from the same payload the page's charts use: category, priority and outcome counts with changes, referral counts by type and status, a weekly trend, top general areas, and repeat-complaint counts by rule.
- Zero PII: no reporter, owner, respondent (or id), contact, organisation name or address is sent. An area is named only when 2 or more cases share it, address-like areas are dropped, braces and quotes are stripped from data words, and the answer is redacted again before storing.
- Fail closed: Gemini OFF or no key is `disabled` (nothing is shown); a timeout, error or invalid JSON is `unavailable` with a rule-based summary (source `rules`) or the cached AI one; too little activity is `insufficient_data` and Gemini is not called.
- Cached in the new table `analytics_ai_summaries` by subdivision, date range and statistics hash; opening or refreshing the page never calls Gemini. Audited without any text. `POST` limited to 10 per minute.
- Migration `backend/migrations/2026-11-24_analytics_ai_summary.sql`; the start-up check requires the table.
- ReportsPage: an "AI Trend & Hotspot Summary" card ("AI summary · Advisory only", Generate / Refresh, trend summary, repeat complaint patterns, collapsible monthly digest with Copy digest) and a hotspot note directly above "Case locations in this period". Shown only on the connected app, for ranges of at most 366 days.
- Docs: new `ANALYTICS_AI_SUMMARY.md`, indexed in `docs/README.md`; `REPORT_LIFECYCLE_AND_FEATURES.md` notes the advisory, cached behaviour.

## Validation evidence

- `python tests/test_analytics_ai_summary.py`: 49 checks passed (no PII in the statistics or the prompt, minimum area size, address-like and injected area text, repeat counts by rule, caching and refresh, new data and other subdivisions, Gemini OFF and no key, timeout and invalid JSON fall back to rules, a failed refresh keeps the cached summary, insufficient data, scope, validation, audit log without text, cleaning of the answer).
- `test_analytics.py`, `test_case_analytics.py` and `test_case_ai_insights.py` pass. `test_analytics_accuracy.py` fails with "deque mutated during iteration" on an unmodified copy of HEAD as well, so that failure was there before this change.
- `npx tsc -b`: no errors. `npx eslint` on `ReportsPage.tsx`, `AiTrendSummary.tsx`, `useAiSummary.ts` and `api.ts`: 0 problems.
- Not checked: a real Gemini call, and the card in a running app.
