# Case AI Insights (Suggested)

Status: Current. Phase 1 of the "AI in report analysis" proposal, added 2026-11-24; advisory Evidence Check added the same day.

A collapsible "AI Insights (Suggested)" card on the Subdivision Admin Case Assessment tab. It shows a 2-3 sentence summary, a suggested priority (Urgent, High or Normal) with a confidence and a reason, a check that the report is filed under the right kind of concern, and an advisory **Evidence Check** of the attached photo. The card is labelled "AI suggestion · Review before applying".

## Rules

- **Suggest only.** The AI never changes a case's status, priority or category. "Apply priority" calls the ordinary `PUT /cases/{id}/priority`, and "Switch category" calls `PUT /cases/{id}/category`. Both are the Leader's own action and both are audited.
- **No personal data leaves the server.** The text sent to Gemini is built from an allow-list: kind of concern, animal fields, description and condition. It never includes the reporter, who a report was filed for, contact details, a suspected owner, complaint respondent details, the location or media. The free text then goes through `app/utils/pii_redactor.py`, which masks phone numbers, emails, block/lot/unit and street references, honorific names ("Mang Tony") and every name tied to the report. The model's answer is redacted again before it is stored. A bare name nobody told the redactor about can still get through in free text: the Leader should treat the summary as a draft.
- **Fail closed.** If Gemini is OFF, has no key, times out (15 s per call, 35 s in all), errors or returns invalid JSON, `GET` and `POST /cases/{id}/ai-insights` still answer 200 with status `disabled` or `unavailable`, and the case page works as before. A switched-off AI hides the card. Lost Pet reports get no insight (`not_applicable`).
- **Admin control.** It uses the existing Admin Settings Gemini toggle (`gemini_vision_matching`). No separate setting was added.
- **Cached.** One row per report and content hash in `case_ai_insights`. Changing the report's content (including its category) makes a new hash, so the old insight stops matching. Changing only private data (contact, reporter) does not. `GET` never calls Gemini; `POST` (Generate or Refresh) always does and is limited to 10 per minute.
- **Audit log.** `CASE_AI_INSIGHT_GENERATED` and `CASE_AI_INSIGHT_FAILED` (no report text) on each run. When the Leader later changes the priority or category with an insight on file: `CASE_AI_SUGGESTION_APPLIED` if they chose what was suggested, `CASE_AI_SUGGESTION_OVERRIDDEN` if not. A category switch itself is `CASE_CATEGORY_CHANGED`.

## Evidence Check (advisory)

The same single Gemini call also looks at up to 2 of the report's own photos (never a video; the report's main photos before timeline or Leader evidence uploads) next to the redacted text, and answers `evidence_check` inside `insight`:

`{ status: "ok" | "flag" | "no_media" | "unavailable", flags: ["blurry" | "no_animal" | "contradicts_description"], summary, confidence }`

- `blurry`: no photo is clear enough to identify the animal or the incident. `no_animal`: no dog or cat (or the reported animal) is visible. `contradicts_description`: the photo clearly conflicts with the report, for example a cat in the photo for a "dog" report.
- **Suggest only.** It never rejects a photo, and never changes the evidence sufficiency, status, priority or category. The Leader still decides Evidence Sufficiency in Assessment. The card shows an amber "AI suggestion" callout for `flag`, a quiet note for `ok` ("Evidence photo matches report details") and for `no_media` ("No photo attached to check").
- **The local detector can overrule `no_animal`.** If YOLO already found a dog or cat in that file when it was filed (`report_media.ai_detection_confidence`), `no_animal` is dropped.
- **Fail closed.** A photo that cannot be read (only our own uploads or an https Cloudinary link are fetched) makes the evidence check `unavailable` and Gemini is called with the text only, so the summary, priority and category check are still made. If the model leaves the evidence part out or sends junk, it is `unavailable` or an empty `ok`, never a flag. A Gemini timeout or error is the usual `unavailable` answer for the whole insight. Gemini OFF sends nothing, photos included.
- **Cache key.** The content hash covers the redacted text and which photos are used (their ids and stored addresses, hashed). A new or replaced photo, or changed text, needs a Refresh; changing only private data or adding a photo beyond the cap does not. Insights made before this check existed no longer match and are made again.
- **Photos are not redacted.** A photo can show a face or a house number. The prompt tells the model not to describe people or read out text, and the resident form already warns against showing faces and house numbers, but a photo that shows them is still sent to Gemini when the Leader generates insights.
- The audit log records the evidence status, the flags and how many photos were checked, never the summary text.

## Endpoints (Subdivision Leader or Administrator of the report's subdivision)

| Endpoint | Purpose |
|---|---|
| `GET /cases/{id}/ai-insights` | Cached insight for the current content, or `not_generated`, `disabled`, `not_applicable` |
| `POST /cases/{id}/ai-insights` | Make or refresh it now; `unavailable` on any AI failure |
| `PUT /cases/{id}/category` | The Leader moves the case to another kind of concern (never to or from Lost Pet) |

Answer: `{ status, message, insight: { summary, suggested_priority, priority_confidence, priority_reason, category_check: { mismatch, suggested_category, suggested_category_label, reason }, evidence_check: { status, flags, summary, confidence }, model, generated_at } }`.

## Database

New table `case_ai_insights`, created only by `backend/migrations/2026-11-24_case_ai_insights.sql`, and its `evidence_check` column, added only by `backend/migrations/2026-11-24_case_ai_insights_evidence.sql` (apply the table first). Both are additive and safe to re-run. The backend refuses to start until both are applied.

## Code

`backend/app/services/case_ai_insights.py`, `backend/app/utils/pii_redactor.py`, `backend/app/models/case_ai_insight.py`, `backend/app/routes/cases.py`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`. Tests: `backend/tests/test_case_ai_insights.py`.
