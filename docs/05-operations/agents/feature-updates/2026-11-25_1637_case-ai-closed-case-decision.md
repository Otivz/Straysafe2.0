# Case AI Insights: the decision and why on a closed case

- **Date:** 2026-11-25 16:37 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `docs/01-system/CASE_AI_INSIGHTS.md`
- **Authorization:** Developer's request in the Claude Code session (with a screenshot of a closed lost-pet case) that a closed case's AI summary say what was decided and why.
- **Type:** Fix

## Intent

On a closed case the recap only said that the case was closed. It now says what the decision was and the reason behind it.

## Key changes

- The guidance input of a closed case now carries a `closure` block built from the report's recorded closure: the decision label, its outcome group, the date and the reason text. All ways of closing write these fields, including a pet the owner confirmed is home.
- The reason is free text: it is redacted like the report's own words, and the names of the closer, the assessor, the assigned Leader, a complaint's respondent, the reporter and the pet's owner are masked as well.
- A closed case's answer has a new `decision` (1 to 3 sentences, "Decision and why"); the recap becomes "How it got there" (the steps that led to it). The prompt forbids inventing a reason and says to state when little was recorded. The recap no longer recites internal field values such as the case page or priority label.
- Insights made while the case was closed before this change show "The case changed since this was made": Refresh makes the decision.
- No database change.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 127 checks passed (9 new: no closure block on an open case; decision, outcome, date and reason on a closed one; no phone, address, honorific name, reporter name or closer's name in what is sent; the prompt asks for a decision only when closed and forbids inventing a reason; a closed case keeps the decision and recap only and PII in the decision is removed; no usable decision or recap is `unavailable`; an older closure has a line and no invented reason; the audit log records only that a decision was made).
- `npx tsc -b`: no errors. `npx eslint` on `AiInsightsCard.tsx` and `api.ts`: 0 problems.
- Not checked: a real Gemini answer on a closed case (whether the reason is paraphrased faithfully) and the card in a running app.
