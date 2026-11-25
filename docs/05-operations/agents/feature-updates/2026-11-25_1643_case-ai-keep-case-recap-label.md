# Case AI Insights: keep the "Case recap" on a closed case

- **Date:** 2026-11-25 16:43 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `docs/01-system/CASE_AI_INSIGHTS.md`
- **Authorization:** Developer's question in the Claude Code session asking why the case recap had been removed from a closed case.
- **Type:** Fix

## Intent

The earlier change (`2026-11-25_1637_case-ai-closed-case-decision.md`) added a "Decision and why" part to a closed case but also renamed the recap "How it got there" and told the AI to write only the steps that led to the decision. That narrowed the recap, which was not asked for.

## Key changes

- The recap keeps its name, "Case recap", on every case, shown below the "Decision and why" part.
- The prompt no longer asks a closed case's recap to leave out the decision: the recap is the full recap again.
- No database change.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 128 checks passed (one new: a closed case's prompt does not narrow the recap).
- `npx tsc -b`: no errors. `npx eslint` on `AiInsightsCard.tsx`: 0 problems.
- Not checked: a real Gemini answer and the card in a running app.
