# Move Resident New Message button to bottom-right and open dedicated composition page

- **Date:** 2026-11-20 04:45 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen High)
- **Files changed:** `frontend/src/resident/pages/messages/MessagesPage.tsx`, `frontend/src/resident/pages/messages/NewMessagePage.tsx`, `frontend/src/resident/ResidentApp.tsx`
- **Authorization:** Direct user request to move the New Message button to the bottom-right corner and navigate to a dedicated message composition page instead of opening a modal/sheet.
- **Type:** Polish

## Intent

Improve the resident messaging UX and navigation speed by replacing the modal/sheet-based New Conversation composer with a dedicated route (`/resident-app/messages/new`) and placing the New Message action button in the bottom-right corner of the Messages page.

## Key changes

- `frontend/src/resident/pages/messages/NewMessagePage.tsx`:
  - Created a dedicated message composition page reusing `Field`, `Input`, `Textarea`, `Button`, `FormError`, `useBack`, `usePageTitle`, `useSubmit`, `useResidentData`, and `residentApi.startGeneralConversation`.
  - Styled to match `ConversationPage` (`100dvh` responsive card layout with back navigation, Subdivision Administration header, form body, and footer actions).
  - Navigates directly to `/conversations/:conversationId` (with `replace: true`) upon sending, refreshing conversations in the background.
- `frontend/src/resident/pages/messages/MessagesPage.tsx`:
  - Removed `NewConversationSheet` and modal state.
  - Moved the New Message button to a sticky bottom-right `Link` to `/messages/new`.
- `frontend/src/resident/ResidentApp.tsx`:
  - Registered `<Route path="messages/new" element={<NewMessagePage />} />`.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0 (no TypeScript errors).
