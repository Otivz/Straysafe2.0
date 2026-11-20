# Case Assessment History and Activity Logging

- **Date:** 2026-11-19 09:41 (UTC)
- **AI tool:** Antigravity (Gemini 2.5)
- **Files changed:** `backend/app/utils/case_vocab.py`, `backend/app/services/case_lifecycle.py`, `backend/app/utils/report_visibility.py`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/components/Timeline.tsx`, `frontend/src/resident/live/adapters.ts`, `docs/README.md`
- **Authorization:** User request to implement Assessment History and Activity Logging when clicking Save Assessment
- **Type:** Feature

## Intent

When an administrator clicks **Save Assessment** on a case, persist the incident verification status, decision basis explanation, evidence sufficiency, urgency, and assessment notes, and automatically record an audit entry in the case's History timeline. Ensure previous assessment records are preserved (audit trail), distinct activities are logged on subsequent updates, multi-line explanations and notes format cleanly on the timeline, filter counts ("Assessment") accurately reflect assessment events, and resident views sanitize internal staff remarks.

## Key changes

1. **`backend/app/utils/case_vocab.py`**:
   - Added human-readable status labels dictionaries (`INCIDENT_VERIFICATION_LABELS`, `IDENTITY_STATUS_LABELS`, `OWNERSHIP_STATUS_LABELS`) mapping internal status codes to clean UI text (e.g. `verified` -> `Verified`, `partial` -> `Partly Verified`, `not_reviewed` -> `Not Yet Reviewed`).

2. **`backend/app/services/case_lifecycle.py`**:
   - Updated `save_assessment` to detect whether an assessment was previously recorded (`was_assessed_before`).
   - If assessment content is submitted, write a `StatusHistory` record with actor ID, timestamp, and formatted remarks:
     - Activity header: `Assessment Submitted: <Decision>.` or `Assessment Updated: <Decision>.`
     - Detail lines: `Explanation: <incident_basis>` and `Notes: <assessment_notes>`.
   - Log separate history entries for animal identity decisions and ownership reviews when recorded.
   - Built-in deduplication in `history()` prevents duplicate entries from accidental double clicks.

3. **`backend/app/utils/report_visibility.py`**:
   - In `redact_response`, redact internal assessment remarks for non-staff viewers to a neutral `"Case assessed by administrator."` so internal assessment basis and notes remain private.

4. **`frontend/src/admin/live/adapters.ts`**:
   - Updated `eventKindOf` to recognize `/identit/` -> `'identity'` and `/ownership/` -> `'ownership'` in addition to `/assess/` -> `'assessment'`.
   - Enhanced `eventFromHistory` to split multi-line status remarks (`\n`) into a header `title` (first line) and structured `detail` (subsequent lines), allowing `TimelineEvent` to capture both title and explanation/notes.

5. **`frontend/src/admin/components/Timeline.tsx`**:
   - Added `whitespace-pre-line` to `EventTimeline`'s `e.detail` paragraph so multi-line explanations and notes display with clean paragraph line breaks.

6. **`frontend/src/resident/live/adapters.ts`**:
   - Updated `updateFromHistory` so resident timelines render assessment events as `"Case assessed by administrator"`.

## Validation evidence

- Ran `npm run build --prefix frontend`: TypeScript typecheck (`tsc -b`) and Vite production bundle succeeded with 0 errors.
- Ran backend lifecycle and assessment tests via `.venv\Scripts\python -m unittest discover -s backend/tests -p "test_case_lifecycle.py"`: all assessment, urgency, status transition, and permission test assertions passed.
- Verified instant refresh: `LiveDataProvider.tsx` dispatches `loadCase(id)` immediately upon completion of `case/saveAssessment`, updating case state and the History tab without requiring a page reload.
