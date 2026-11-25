# Case AI Insights on every case category

- **Date:** 2026-11-25 16:11 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/case_ai_insights.py`, `backend/tests/test_case_ai_insights.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `docs/01-system/CASE_AI_INSIGHTS.md`, `docs/README.md`
- **Authorization:** Developer's request in the Claude Code session that the AI Insights card apply to every case category, after being told it showed only on Safety, Injured and Other cases.
- **Type:** Feature

## Intent

Give the Leader the same AI summary, evidence check and guidance on animal complaints, missing pets and found animals, fitted to how each of those pages works.

## Key changes

- Backend: every kind of case now gets an insight; `not_applicable` is no longer answered. A Lost Pet case (including one filed through the lost-pet form) never gets a category mismatch, and the prompt tells the model so, because a Lost Pet case can never be switched.
- The guidance knows the case page (`case_page`: `standard`, `complaint`, `monitored`) and offers only that page's steps. Complaint page: "Verify what happened" and "Check who is responsible" (never the offense, letters, summons or fines). Monitored page: no review, assessment or status step; new steps "Review the possible match" and "Check the new sighting", plus follow-ups, a referral, ownership claims and, for a found animal only, Possible Pet Owners. New facts: unchecked sightings, possible recovery leads and waiting possible matches (monitored), whether a person responsible is recorded (complaint). Counts and yes/no only.
- Frontend: the card is shown on the complaint page and on the monitored page (under "Needs you"), with the next steps opening those pages' own dialogs. The monitored page shows no suggested priority (it has no priority to set). The card reads the cache again when sightings or the waiting possible match change.

## Validation evidence

- `python tests/test_case_ai_insights.py`: 118 checks passed (the Lost Pet check now expects an insight with no category mismatch; new checks for the complaint steps, the monitored steps, possible matches on both reports, Possible Pet Owners only for a found animal, sightings, and that a complaint answer keeps only complaint steps).
- `npx tsc -b`: no errors. `npx eslint` on `AiInsightsCard.tsx`, `MonitoredCasePage.tsx`, `ComplaintPage.tsx` and `api.ts`: 0 problems.
- Not checked: a real Gemini call on each kind of case, and the card on the complaint and monitored pages in a running app.
