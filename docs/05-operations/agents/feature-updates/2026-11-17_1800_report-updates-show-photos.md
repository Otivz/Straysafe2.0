# Show Attached Photos and Videos in a Report's Updates

- **Date:** 2026-11-17 18:00 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/resident/data/types.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/components/ui.tsx`, `docs/README.md`
- **Authorization:** Developer report in the Claude Code session: "It works completely in the browser, it uploads on the cloudinary but ... no image shown" in the report's Updates list.
- **Type:** Fix

## Intent

"Add information" uploads its photos and saves them on the case chat message (`media_url`), but the resident's Updates timeline only showed the message text, so the photo was invisible.

## Key changes

- `ReportUpdate` gained an optional `mediaUrl`.
- `updateFromChat` keeps the message's `media_url`. A message whose text is only the placeholder "Photo" (the extra photos of one update, sent as their own messages by `sendUpdate`) shows just the photo, titled "You added a photo".
- `UpdateTimeline` shows the photo under the text (tap opens it full size), or a playable video for `.mp4`/`.mov`/`.webm` links.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the three files reported no problems.
- Not yet checked in the browser or the app.
