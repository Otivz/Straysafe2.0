# Change record: Circular New Conversation Button Below Conversations on Resident Messages Page

- **Date:** 2026-11-20 02:23 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/messages/MessagesPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_0223_resident-messages-circle-new-conversation.md`
- **Authorization:** User request "put the new conversation below the message and make it shape as circle"
- **Type:** Polish

## What changed and why

1. **Resident Messages Page Layout (`MessagesPage.tsx`):**
   - Moved the **New Conversation** action below the **Conversations** list instead of above it.
   - Styled the **New Conversation** trigger as a `56px × 56px` circular primary icon button (`!h-14 !w-14 !rounded-full`) with `MessageSquarePlus` and `aria-label="New Conversation"`.
2. **Verification:**
   - Verified TypeScript and Vite production build (`npm run build --prefix frontend`).
