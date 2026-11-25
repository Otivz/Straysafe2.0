# Case AI Insights (Suggested)

Status: Current. Phase 1 of the "AI in report analysis" proposal, added 2026-11-24; advisory Evidence Check added the same day; Guidance (next steps, missing information, case recap) added 2026-11-25.

A collapsible "AI Insights (Suggested)" card on the Subdivision Admin Case Assessment tab. It shows a 2-3 sentence summary, a suggested priority (Urgent, High or Normal) with a confidence and a reason, a check that the report is filed under the right kind of concern, an advisory **Evidence Check** of the attached photo, and **Guidance**: recommended next steps, missing information with a draft question, and a case recap. The card is labelled "AI suggestion · Review before applying".

**Where it shows (every kind of case, since 2026-11-25).** Safety, Injured and Other Animal Concern: on the Assessment tab of the standard case page. Animal Nuisance: on the complaint page, under "Needs you". Lost Pet and Found Animal: on the monitored page, under "Needs you"; there it shows no suggested priority (that page has no priority to set), and a Lost Pet case never gets a category mismatch (it can never be switched).

## Rules

- **Suggest only.** The AI never changes a case's status, priority or category. "Apply priority" calls the ordinary `PUT /cases/{id}/priority`, and "Switch category" calls `PUT /cases/{id}/category`. Both are the Leader's own action and both are audited.
- **No personal data leaves the server.** The text sent to Gemini is built from an allow-list: kind of concern, animal fields, description and condition. It never includes the reporter, who a report was filed for, contact details, a suspected owner, complaint respondent details, the location or media. The free text then goes through `app/utils/pii_redactor.py`, which masks phone numbers, emails, block/lot/unit and street references, honorific names ("Mang Tony") and every name tied to the report. The model's answer is redacted again before it is stored. A bare name nobody told the redactor about can still get through in free text: the Leader should treat the summary as a draft.
- **Fail closed.** If Gemini is OFF, has no key, times out (15 s per call, 35 s in all), errors or returns invalid JSON, `GET` and `POST /cases/{id}/ai-insights` still answer 200 with status `disabled` or `unavailable`, and the case page works as before. A switched-off AI hides the card. Until 2026-11-25 Lost Pet reports got no insight (`not_applicable`); every kind of case gets one now, and `not_applicable` is no longer answered.
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

## Guidance: next steps, missing information, case recap (advisory)

The same single Gemini call also answers `guidance` inside `insight`:

`{ status: "ok" | "unavailable" | "none", next_steps: [{ action, label, reason }], missing: [], draft_question, decision, recap, stale }` (`decision` only on a closed case)

- **Next steps come from a fixed list, filtered by the case and its page.** The server sends only the actions that fit the case now on the page it is worked on (`case_page`: `standard`, `complaint` or `monitored`) and drops anything else in the answer (at most 3). Each one opens an existing screen; the Leader does the work there:

  | Action | Page | Offered when | Opens |
  |---|---|---|---|
  | `start_review` | standard | Status Reported | Change status dialog |
  | `record_assessment` | standard | Reported or Under review, no assessment saved | (the form below the card) |
  | `mark_in_progress` | standard | Under review, assessment saved | Change status dialog |
  | `request_more_evidence` | standard | Evidence "needs more", no pending follow-up | Follow-up dialog |
  | `schedule_follow_up` | standard, monitored | No pending follow-up | Follow-up dialog |
  | `complete_follow_up` | standard, monitored | A pending follow-up is overdue | Complete follow-up dialog |
  | `create_referral` | standard, monitored | No open referral | Referral dialog |
  | `review_possible_owners` | standard, monitored (found animal only) | Identity is "possible match", not wildlife | Overview tab (standard); on the monitored page the block is further down, no button |
  | `review_claim` | standard, monitored | An ownership claim is waiting | Claim review dialog |
  | `verify_incident` | complaint | Incident not reviewed or partly verified | The complaint's Verify dialog |
  | `find_respondent` | complaint | No person responsible recorded, incident not unverified or invalid | The complaint's "Who is responsible" dialog |
  | `review_possible_match` | monitored | A lost/found possible match is waiting | Possible match dialog |
  | `review_sighting` | monitored | An unchecked sighting or possible recovery lead | Review sighting dialog |

  Issuing a warning and closing a case are never suggested, and on the complaint page neither are the offense, letters, summons or fines: those are the Leader's decisions. There is no "claim the case" step: in the `/cases` workflow an unassigned case can be worked by any Leader of the subdivision (`case_lifecycle.require_case_handler`).
- **What is sent for it.** The case page, the case status and priority, yes/no facts and counts (on the monitored page also unchecked sightings, possible recovery leads and waiting possible matches; on the complaint page whether a person responsible is recorded) (map pin, photo, condition notes, assessment saved, incident, evidence sufficiency, urgency, identity, ownership, pending and overdue follow-ups, open referrals, active ownership claims, warnings issued), and a dated timeline (the latest 20) written in fixed words from enums: report submitted, status and priority changes, assessment recorded, closed or reopened, follow-ups by kind, referrals by organisation type, contacts by method and outcome, ownership claims, warnings by level. Never a remark, note, reason, title, name, contact, landmark or coordinate: those can carry people the redactor does not know.
- **Missing information.** At most 5 short items. The prompt says that `[name]`, `[phone]`, `[email]` or `[address]` in the text means the information exists and was hidden, and that what the facts already show is not missing. The **draft question** is one question the Leader can copy (Copy button, marked "AI draft"); it is asked in the language of the report description (English, Filipino or Taglish), without names. Nothing is sent to anyone.
- **Recap.** 2 to 4 sentences from the timeline and facts.
- **A closed case: the decision and why.** A closed case gets a `decision` and a recap only; next steps, missing items and the question are dropped whatever the model says. The `decision` (1 to 3 sentences, shown as "Decision and why" above the usual "Case recap") says what was decided and why. It is built from the closure recorded on the report (`closure_disposition`, `closure_reason`, `closed_at`), which every way of closing writes: the Leader's close dialog, a recovered pet confirmed by the owner, a duplicate complaint, a withdrawal. What is sent for it: the decision label, its outcome group, the date and the reason text. That reason is free text, so it is redacted like the report's own words, and the names of the people on the case (who closed it, the assessor, the assigned Leader, a complaint's respondent, the reporter, the pet's owner) are masked too. The prompt forbids inventing a reason: if little was recorded it says so. The decision follows the words of the recorded reason closely and may not add a fact, place, person, action or cause that the reason does not state (for example "found" or "picked up").
- **Three texts, three jobs.** The summary says what was **reported** (the animal and the situation), never how the case went or ended. The recap says what **happened** on the case, in order (sightings, contacts, follow-ups, referrals, status changes), and does not repeat the report's description or, on a closed case, the decision. The decision says what was **decided and why**. If the model still makes the recap a near copy of the summary or of the decision (most of the shorter text's words are in the other), the server drops the recap; a guidance left with nothing is `unavailable`. An older closure with no stored outcome gets a plain "Closed (an older record)" line.
- **The case can change without hiding the insight.** The case state is NOT part of the content hash, so "Apply priority" or "Start review" never hides the insight. The guidance stores a `case_signature` of the state it was made from; when the case has changed since, `stale` is true ("The case changed since this was made. Refresh to update it.") and a step that no longer fits the case now is dropped when it is read. The card reads the cache again in the background when the status, priority, assessment, follow-ups, referrals or claims change.
- **Fail closed, part by part.** An unknown or not-allowed action is dropped, lists are capped, every text is redacted again. A guidance with no usable part is `unavailable` ("Guidance unavailable"); the summary, priority, category and evidence check are kept. Insights made before guidance existed read as `none` and get it on the next Refresh. The prompt version was not changed, so existing insights stay visible.
- **No medical or legal advice**, and no decision about responsibility, ownership, an offense or closing; the prompt says so.
- The audit log records the guidance status, the next-step action ids, the number of missing items and whether a question, a recap and a decision were made, never their text.

### Suggested rule for an animal complaint (2026-11-25)

On an animal complaint (Nuisance) the same single Gemini call also suggests which of the subdivision's rules the reported behaviour falls under (for example "tahol nang tahol tuwing gabi" and "Control of Excessive Animal Noise & Habitual Barking"). It only suggests; the Leader chooses the rule in the complaint's **Verify** dialog ("Which rule was broken?"), where it matters because an offense is counted per rule and the letters, summons and fine come from the rule.

- **From confirmed rules only.** The model is given the id, title and "what the rule covers" (the rule's summary in Settings, Policies) of the CONFIRMED rules that apply to animal complaints, and answers with ids. The server drops any other id (made up, pending, or for another kind of concern), keeps each once and at most 2, redacts the reasons again, and a rule's own words are cleaned of braces and quotes before they go in. No rule confirmed: nothing is asked. Other kinds of case are never offered rules.
- **Behaviour only.** The prompt says to judge what the report describes, never who is responsible, whether it really happened or the offense number, and to answer "no clear match" rather than guess: a wrong suggestion is worse than none.
- **Never chosen for the Leader.** The Verify dialog (it only reads the cached insight; it never asks Gemini) shows "AI suggestion · you decide" above the rule choice: each suggested rule with the reason, what the rule covers, and a "Use this rule" button. The dropdown stays empty until the Leader chooses, and "None of the subdivision's rules applies" is always as available. With no clear match it says so; with no insight made yet it says to press "Generate AI Insights" on the complaint page. The AI card shows the same suggestion under "Suggested rule".
- **It ends with the Leader's choice.** Once a rule (or "none applies") is saved for the complaint, or the incident is found unverified or invalid, no rule is offered and an older suggestion is no longer shown. A complaint already closed gets none.
- **Audit.** The generated entry lists the suggested rule ids (never the reasons). When the Leader saves the Verify dialog with a verified incident, `CASE_AI_RULE_SUGGESTION_APPLIED` is written if they chose a suggested rule, `CASE_AI_RULE_SUGGESTION_OVERRIDDEN` if they chose another or "none applies"; ids only.
- The quality of a suggestion depends on the rule's summary in Settings: with a blank summary only the title is available.

## Endpoints (Subdivision Leader or Administrator of the report's subdivision)

| Endpoint | Purpose |
|---|---|
| `GET /cases/{id}/ai-insights` | Cached insight for the current content, or `not_generated`, `disabled` |
| `POST /cases/{id}/ai-insights` | Make or refresh it now; `unavailable` on any AI failure |
| `PUT /cases/{id}/category` | The Leader moves the case to another kind of concern (never to or from Lost Pet) |

Answer: `{ status, message, insight: { summary, suggested_priority, priority_confidence, priority_reason, category_check: { mismatch, suggested_category, suggested_category_label, reason }, evidence_check: { status, flags, summary, confidence }, guidance: { status, next_steps, missing, draft_question, recap, stale }, model, generated_at } }`.

## Database

New table `case_ai_insights`, created only by `backend/migrations/2026-11-24_case_ai_insights.sql`; its `evidence_check` column, added only by `backend/migrations/2026-11-24_case_ai_insights_evidence.sql`; and its `guidance` column, added only by `backend/migrations/2026-11-25_case_ai_insights_guidance.sql`. Apply them in that order. All are additive and safe to re-run. The backend refuses to start until all are applied.

## Code

`backend/app/services/case_ai_insights.py`, `backend/app/utils/pii_redactor.py`, `backend/app/models/case_ai_insight.py`, `backend/app/routes/cases.py`, `frontend/src/admin/pages/case/AiInsightsCard.tsx` (shown by `AssessmentTab.tsx`, `MonitoredCasePage.tsx` and `pages/complaints/ComplaintPage.tsx`). Tests: `backend/tests/test_case_ai_insights.py`.
