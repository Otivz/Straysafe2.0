# Prevent horizontal scrolling in Resident messaging interface

- **Date:** 2026-11-20 05:30 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen High)
- **Files changed:** `frontend/src/admin/components/MessageThread.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/src/resident/pages/reports/OwnershipVerificationCard.tsx`, `frontend/src/resident/pages/messages/NewMessagePage.tsx`
- **Authorization:** Direct user request to eliminate horizontal scrolling and ensure responsive vertical-only scrolling in the resident messaging UI.
- **Type:** Fix

## Intent

Ensure long unbroken strings, links, badges, and cards inside the resident messaging views wrap within mobile screen bounds so only vertical scrolling is used and no content clips or triggers horizontal scrolling.

## Key changes

- `frontend/src/admin/components/MessageThread.tsx`:
  - Added `overflow-x-hidden` and `min-w-0` on the scroll container, list, message rows, bubble wrappers, and bubbles (`max-w-full min-w-0`).
  - Applied `break-words [overflow-wrap:anywhere]` to message bodies, system notices, and inline links so unbroken text and long paths wrap cleanly.
- `frontend/src/resident/pages/reports/ConversationPage.tsx`:
  - Added `min-w-0 overflow-x-hidden` on the root chat container, `min-w-0` on header/composer flex children, `shrink-0` on the status pill, and `[overflow-wrap:anywhere]` on the info panel text.
- `frontend/src/resident/pages/reports/OwnershipVerificationCard.tsx`:
  - Added `min-w-0` on the comparison grid and animal cards, `[overflow-wrap:anywhere]` on detail values, and `max-h-[45dvh] overflow-y-auto overflow-x-hidden` on the collapsible card wrapper.
- `frontend/src/resident/pages/messages/NewMessagePage.tsx`:
  - Added `min-w-0 overflow-x-hidden` on the composition container.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
