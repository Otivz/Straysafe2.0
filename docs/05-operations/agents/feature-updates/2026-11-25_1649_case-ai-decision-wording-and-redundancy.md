# Case AI Insights: stricter decision wording and less repetition

- **Date:** 2026-11-25 16:49 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/tests/test_case_ai_insights.py`, `docs/01-system/CASE_AI_INSIGHTS.md`
- **Authorization:** Developer's request in the Claude Code session, after reviewing a closed case's AI card, to tighten the "Decision and why" wording and to check the redundancy between the summary, the decision and the recap.
- **Type:** Fix

## Intent

On a closed lost-pet case the decision added a fact the owner's note did not state ("found and picked up"), and the summary, decision and recap all said that the pet was recovered and the case closed.

## Key changes

- The decision follows the recorded reason closely, keeps its meaning when it is in Filipino, and may not add a fact, place, person, action or cause that the reason does not state.
- Each text has its own job. The summary is what was reported (with guidance asked for, it no longer says how the case went or ended); the recap is what happened, in order, without the report's description or (closed) the decision; the decision is what was decided and why.
- Server guard: a recap that is a near copy of the summary or of the decision (most of the shorter text's words are in the other; short texts never count) is dropped, and a guidance left with nothing is `unavailable`.
- No database change.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 139 checks passed (11 new: the decision rules, the summary and recap roles, no decision rule on an open case, the old summary line without guidance, the repeat guard on copies of the summary and the decision, a recap that adds events kept, short texts never a repeat, a guidance with only a repeated recap `unavailable`, and an end-to-end case). `test_analytics_ai_summary.py` (49) and `test_case_analytics.py` (23) pass.
- Not checked: a real Gemini answer: only a new Refresh shows whether the model keeps to the three jobs. The repeat guard is a word-overlap check, so it catches copies, not a paraphrase of the same sentence.
