# Centralized Case Priority Management

- **Date:** `2026-11-21 20:13 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_2013_centralized-case-priority-management.md`
- **Authorization:** User request — FEATURE 9: CENTRALIZED CASE PRIORITY MANAGEMENT ("Remove duplicate priority controls from Assessment and use the existing header priority dialog as the only place to change priority.")
- **Type:** `Feature`

## Summary

- Investigated and verified backend priority management in `backend/app/services/case_lifecycle.py` and `backend/app/utils/case_vocab.py`:
  - Selecting `urgency: 'immediate'` in `save_assessment` sets `report.urgency_level = 'immediate'` and `report.priority_level = 'High'`, which `case_vocab.priority_of` evaluates as `urgent` automatically without requiring a separate priority request or `alsoSetUrgent` checkbox.
  - Lowering an automatically assigned `urgent` priority via `PriorityDialog` (`case/changePriority` -> `PUT /cases/{id}/priority`) requires a non-empty `reason` (`!reason.trim()` validation in `BasicDialogs.tsx`), and lowering `urgency` away from `immediate` on an automatically prioritized Urgent report inside `AssessmentTab.tsx` requires an `urgencyNote` reason of at least 5 characters (`save_assessment` in `case_lifecycle.py`).
- Replaced the inline priority override `<Select>` and `"Also set the case priority to Urgent"` `<Checkbox>` in `AssessmentTab.tsx` with a read-only current case priority chip (`<PriorityMark priority={c.priority} />`) and a **"Change Priority"** button that opens the existing header priority dialog (`openDialog({ kind: 'priority' })`).
- Preserved the priority change reason requirement both in `PriorityDialog` and when lowering urgency on an automatically prioritized Urgent report in `AssessmentTab.tsx`.
