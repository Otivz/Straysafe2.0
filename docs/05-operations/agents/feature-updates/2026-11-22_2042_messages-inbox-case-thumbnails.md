# Case Photo Thumbnails in the Leader Messages List

- **Date:** 2026-11-22 20:42 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/MessagesPage.tsx`
- **Authorization:** Developer request to add images to the conversation rows on `/messages` ("adding images is better? reporter and the report media"), then "Okay gooo" to the proposal of one report-photo thumbnail per row and no reporter picture (users have no profile photo field).
- **Type:** Polish

## Intent

Conversations about different cases looked alike (same closing text, same badges). A small picture of the animal lets the Leader tell them apart at a glance.

## Key changes

- Each row of the Messages list starts with a 48 px square thumbnail (`ThreadThumb`):
  - the case's first photo with a stored file, else the registered pet's first photo (the same rule as the Dashboard's missing and found list);
  - with no photo, the icon of the case's animal type;
  - a general conversation (no report) shows a message icon.
- The picture comes from the cases the Leader app already loads (`useAdminData().state.cases`, matched by `report_ref` to the case ID). The inbox request, the backend and the database are unchanged.
- The thumbnail is decorative (`aria-hidden`, empty `alt`); the row text and link are unchanged. Clicking anywhere on the row still opens the conversation.

## Validation evidence

- `cd frontend; npx tsc -b`: exit 0.
- `npx eslint src/admin/pages/MessagesPage.tsx`: no findings.
- Not checked in a browser.
