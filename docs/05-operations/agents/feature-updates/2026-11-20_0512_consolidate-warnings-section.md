# Consolidate duplicate Warnings sections in ActionsTab

- **Date:** 2026-11-20 05:12 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`
- **Authorization:** Direct user request to remove the duplicate Warnings section and keep a single centralized Warnings section with all features retained.
- **Type:** Polish

## Intent

Eliminate the duplicate `Official Warnings` (`CaseWarningsSection`) and `Warning & compliance observations` (`WarningCard` list) sections in `ActionsTab.tsx` while retaining acknowledgment status, owner response/clarification display, and direct conversation links in the remaining centralized section.

## Key changes

- `frontend/src/admin/pages/case/ActionsTab.tsx`:
  - Removed `<CaseWarningsSection c={c} hideSendButton />` and its import.
  - Enhanced `WarningCard` to display owner acknowledgment status (`Acknowledged` / `Awaiting Acknowledgment`), the `Owner Response / Clarification` block when present, and a `Conversation` link button (`adminPath('/messages/${w.threadId}')`) when `w.threadId` is present.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
