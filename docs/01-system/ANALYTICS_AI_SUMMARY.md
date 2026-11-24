# Analytics AI Trend & Hotspot Summary

Status: Current. Section 2B of the "AI in report analysis" proposal, added 2026-11-24.

A card on the Subdivision Admin Analytics page that reads the page's own numbers back in plain words: a trend summary, repeat complaint patterns and a monthly digest (with a "Copy digest" button), plus a hotspot explanation shown directly above the "Case locations in this period" map. It is labelled "AI summary · Advisory only" and "Review against the data below". It describes numbers; it changes nothing.

## Rules

- **Zero personal data leaves the server.** Gemini receives only aggregated, anonymised statistics for the selected range and the period of equal length before it: received and closed totals, counts by category, priority, outcome and referral type and status, a weekly trend, period-over-period changes, the top general areas, and repeat-complaint counts by rule. Never a reporter, owner or respondent (not even an id), a phone number, an email, an organisation name or a house address. An area is named only when 2 or more cases share it, so one household cannot be singled out. An area text that still looks like an address after redaction (`app/utils/pii_redactor.py`) is dropped. Braces and quotes are stripped from the words that do go in, the prompt tells the model the data is not instructions, and the answer is redacted again before it is stored. Only counted, non-voided complaint offenses are used, and only as counts (how many offenses, how many households had a repeat, the areas with 2 or more).
- **The numbers are the Analytics payload's.** The statistics come from `analytics_payload` (the same code the page's charts read), so the text cannot disagree with the charts. Data of other subdivisions is never read.
- **Fail closed.** Gemini OFF or no key: status `disabled`, and the card and the hotspot note are simply not shown. A timeout (15 s per call, 35 s in all), an error or invalid JSON: status `unavailable`, with a plain **rule-based** summary built from the same numbers (`source: "rules"`, labelled "Rule-based summary · AI unavailable") or, when a cached AI summary exists, that one. Fewer than 3 reports received plus cases closed: `insufficient_data`, and Gemini is not called. The page keeps working in every case.
- **Admin control.** It uses the existing Admin Settings Gemini toggle (`gemini_vision_matching`).
- **Cached.** One row per subdivision, date range and hash of the statistics in `analytics_ai_summaries`. New data is a new hash, so a stale summary never shows. `GET` never calls Gemini; `POST` without `refresh` returns the cache and calls Gemini only when there is none; `refresh=true` always calls it. Opening or refreshing the Analytics page never calls Gemini by itself. Only the AI's own answers are cached, never the rule-based fallback.
- **Audit log.** `ANALYTICS_AI_SUMMARY_GENERATED` and `ANALYTICS_AI_SUMMARY_FAILED` record the range, a hash prefix and the model, never any text. `POST` is limited to 10 per minute.
- **Range.** From 1 to 366 days, the end date not in the future. The card is not shown for a longer custom range.

## Endpoints (Subdivision Leader of the subdivision, or the Administrator)

| Endpoint | Purpose |
|---|---|
| `GET /analytics/ai-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | The cached summary, or `not_generated`, `disabled`, `insufficient_data`. Never calls Gemini |
| `POST /analytics/ai-summary?from=&to=[&refresh=true]` | The cached summary, or make it now; `unavailable` on any AI failure |

A Leader cannot ask for another subdivision (403); an Administrator may add `subdivision_id`. Answer: `{ status, source, message, range, trend_summary, hotspot_explanation, repeat_patterns: [], monthly_digest, model, generated_at }`. `not_generated` is the one status beyond `ready | disabled | unavailable | insufficient_data`: it means nothing is cached yet for these numbers.

## Database

New table `analytics_ai_summaries`, created only by `backend/migrations/2026-11-24_analytics_ai_summary.sql` (additive, safe to re-run). The backend refuses to start until it is applied.

## Code

`backend/app/services/analytics_ai_summary.py`, `backend/app/routes/analytics.py`, `backend/app/models/analytics_ai_summary.py`, `frontend/src/admin/components/AiTrendSummary.tsx`, `frontend/src/admin/lib/useAiSummary.ts`, `frontend/src/admin/pages/ReportsPage.tsx`. Tests: `backend/tests/test_analytics_ai_summary.py`.
