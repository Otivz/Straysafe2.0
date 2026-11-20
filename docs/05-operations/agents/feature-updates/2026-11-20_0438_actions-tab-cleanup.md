# Remove redundant Activity Timeline and action buttons from Follow-ups section

- **Date:** 2026-11-20 04:38 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Direct user request to remove redundant Activity Timeline, Send Warning, and Create Referral UI elements from the Follow-ups (Actions & follow-ups) section.
- **Type:** Polish

## Intent

Keep the Case Detail "Actions & follow-ups" tab focused on managing and viewing follow-up records by removing UI elements that duplicate the existing History tab and Actions controls, while preserving all underlying warning, referral, follow-up, and history functionality.

## Key changes

- `frontend/src/admin/pages/case/ActionsTab.tsx`:
  - Removed the `Activity timeline` panel, the `actionTimeline` helper, and unused timeline imports.
  - Passed `hideSendButton` to `CaseWarningsSection` and `hideCreateButton` to `CaseReferralsSection`.
- `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`:
  - Added optional `hideSendButton?: boolean` prop (default `false`) to `CaseWarningsSection` to hide the header `Send Warning` button when rendered inside `ActionsTab`.
- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`:
  - Added optional `hideCreateButton?: boolean` prop (default `false`) to `CaseReferralsSection` to hide the header and empty-state `Create Referral` buttons when rendered inside `ActionsTab`.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0 (no TypeScript errors).
