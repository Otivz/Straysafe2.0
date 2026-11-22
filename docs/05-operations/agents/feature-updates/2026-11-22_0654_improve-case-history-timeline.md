# Improve Case History Timeline

- **Date:** `2026-11-22 06:54 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `backend/app/services/case_view.py`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/components/Timeline.tsx`, `docs/05-operations/agents/feature-updates/2026-11-22_0654_improve-case-history-timeline.md`
- **Authorization:** User request — FEATURE 14: IMPROVE CASE HISTORY TIMELINE ("Make case history easier to read and understand.")
- **Type:** `Feature`

## Summary

- Exposed read-only `audit_events` (`old_values`, `new_values`, `action`, `actor_name`, `created_at`) in `backend/app/services/case_view.py` (`GET /cases/{id}`) without modifying any existing `StatusHistory`, `Report`, or `AuditLog` records.
- Updated `frontend/src/admin/live/adapters.ts` to:
  - Enrich `StatusHistory` timeline events with structured before-and-after `changes` (`field`, `before`, `after`) when matching `AuditLog` entries or explicit `"from X to Y"` text exist.
  - Surface `CASE_PRIORITY_CHANGED` audit entries directly in the case timeline (e.g. `Priority changed: Normal → Urgent` with the recorded reason).
  - Explicitly mark `before: null` when a historical event does not include a prior value, instead of inventing previous values.
- Updated `EventTimeline` in `frontend/src/admin/components/Timeline.tsx` to:
  - Group timeline events by calendar date (`Today · ...`, `Yesterday · ...`, or exact formatted date) with per-day event counts.
  - Display exact event dates and clock times (`fmtDate(e.at) · fmtTime(e.at)`) directly in every event's metadata row.
  - Render before-and-after change chips (`Field: Before → After`) and explicitly label missing prior values as `"Previous value not recorded"`, while preserving the original event title and detail text.
