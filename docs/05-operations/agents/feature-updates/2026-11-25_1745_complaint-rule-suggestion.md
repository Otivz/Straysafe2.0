# Animal complaints: a suggested rule (suggest-only)

- **Date:** 2026-11-25 17:45 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/app/services/complaints.py`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/admin/styles/case.css`, `docs/01-system/CASE_AI_INSIGHTS.md`
- **Authorization:** Developer's request in the Claude Code session ("Smart Rule Suggestion sa Animal Complaints, suggest-only"), after a discussion of the design and "do kung ano sa tingin mo mas better choice".
- **Type:** Feature

## Intent

Help the Leader find the subdivision rule a complaint's behaviour falls under (for example barking every night and the excessive-noise rule), without ever choosing it for them: the rule decides how offenses are counted and what letter, summons and fine follow.

## Key changes

- The existing single Gemini call of the AI Insights (no extra call, cache or migration; the guidance is JSON) also gets the confirmed animal-complaint rules (id, title, what the rule covers) while a complaint has no rule chosen, and returns up to 2 `rule_suggestions` with a reason. The server keeps only offered ids, each once; a malformed answer is ignored; "no clear match" is a real answer (`rules_asked`). The prompt says to judge the behaviour only, never who is responsible, whether it happened or the offense number, and to return none rather than guess.
- No rules are offered for other kinds of case, for a closed complaint, once a rule (or "none applies") is saved, or when the incident is unverified or invalid. A pending rule or one for another kind of concern is never offered.
- The Verify dialog shows "AI suggestion · you decide" above "Which rule was broken?": each suggested rule with its reason, what the rule covers and a "Use this rule" button. It only reads the cached insight (never asks Gemini), never fills the dropdown, and says "no clear match" or how to get a suggestion when there is none. The AI card shows the same under "Suggested rule".
- Audit: the generated entry lists the suggested ids; saving a verified incident writes `CASE_AI_RULE_SUGGESTION_APPLIED` or `CASE_AI_RULE_SUGGESTION_OVERRIDDEN` (a suggested rule chosen, or another rule or "none applies"); ids only. A hook in `complaints.verify` calls it after the Leader's choice is saved; it changes nothing about that choice.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 161 checks passed (22 new: only confirmed rules that cover complaints are offered; no names, phone or address in the input; the prompt wording; no rule, no suggestion; other kinds of case get none; made-up, pending and other-concern ids dropped; at most 2; reasons redacted; "no clear match" kept; malformed answers ignored; closed case none; the cache is read without calling Gemini; audit ids only; applied and overridden through the real `complaints.verify` service for a suggested rule, another rule, "none applies" and no insight; a chosen rule or an invalid incident ends the suggestions).
- `test_complaint_leads_matching.py` passes. `test_complaint_management.py` fails while filing its first report ("Please upload at least one photo or video"), before it reaches Verify; the photo requirement was added earlier, not by this change.
- `npx tsc -b`: no errors. `npx eslint` on the changed frontend files: 0 problems. `npx vite build` (temporary folder) builds.
- Not checked: real Gemini answers (whether Taglish descriptions match the rules well) and the dialog in a running app. The suggestion is only as good as the rule summaries in Settings, Policies.
