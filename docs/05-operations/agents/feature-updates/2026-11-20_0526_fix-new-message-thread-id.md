# Fix thread_id property on ApiCaseConversationDetail in NewMessagePage

- **Date:** 2026-11-20 05:26 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen High)
- **Files changed:** `frontend/src/resident/pages/messages/NewMessagePage.tsx`
- **Authorization:** Follow-up fix discovered while running `npm run build` (`tsc -b`) to diagnose frontend loading behavior.
- **Type:** Fix

## Intent

Fix a TypeScript build error in `NewMessagePage.tsx` where `created?.conversation_id` was referenced instead of `created?.thread_id` on `ApiCaseConversationDetail`.

## Key changes

- `frontend/src/resident/pages/messages/NewMessagePage.tsx`:
  - Changed `created?.conversation_id` to `created?.thread_id`.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`) — exited with code 0.
