# Include authorized report link and animal photos in report-related admin messages

- **Date:** 2026-11-20 04:54 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen High)
- **Files changed:** `backend/app/services/case_messaging.py`, `frontend/src/admin/components/MessageThread.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/reports/ConversationPage.tsx`
- **Authorization:** Direct user request to automatically include a direct link to the corresponding report and up to two animal photos whenever the Subdivision Administrator sends a message related to a report.
- **Type:** Feature

## Intent

Ensure recipients of Subdivision Administrator messages related to a report can easily open the corresponding report (when authorized) and see the animal picture(s) without affecting existing messaging, ownership verification, or access-control behavior.

## Key changes

- `backend/app/services/case_messaging.py`:
  - Added `_append_report_link()` called inside `send()` when staff send a message in a report-linked thread (`t.report_id` set, `t.kind != "general"`). It checks `report_visibility.viewer_access` for the thread's resident member(s) and appends `/resident-app/reports/<ref>` only if authorized (or `/resident-app/ownership/<request_id>` for pending ownership verification), avoiding duplicate links.
  - Added `_thread_animal_photos()` and included `report_photos` (up to 2 image URLs from `ReportMedia`, or 1 per report when `related_report_id` is present) in `view()`.
- `frontend/src/admin/components/MessageThread.tsx`:
  - Extended `withLinks()` to render `/resident-app/reports/<ref>` paths as clickable `View report (<ref>)` links.
- `frontend/src/resident/live/api.ts`:
  - Added `report_photos?: string[]` to `ApiCaseConversationDetail`.
- `frontend/src/resident/pages/reports/ConversationPage.tsx`:
  - Rendered a compact animal photo strip (up to 2 photos + `View report` link when authorized) when `c.report_photos` is present and `OwnershipVerificationCard` is not already shown.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
- `python -m py_compile backend/app/services/case_messaging.py` — exited with code 0.
