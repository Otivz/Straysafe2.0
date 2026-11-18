# Drag-and-Drop Placeholder Boxes in the Warning Letter Template Editor

- **Date:** 2026-11-18 08:08 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/components/PlaceholderEditor.tsx` (new), `frontend/src/admin/lib/placeholders.ts` (new), `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `frontend/src/admin/styles/ui.css`, `docs/README.md`
- **Authorization:** Developer request in the Claude Code session: in the warning template editor, show placeholders as draggable labeled boxes with only their name (e.g. "Resident Name"), without `{{}}`, that can be dragged into the letter content.
- **Type:** Polish

## Intent

Make the Leader's template editor easier to use: no typing or reading `{{resident_name}}` tokens.

## Key changes

- **New `PlaceholderEditor`:** a text box (`contentEditable`) for the subject (one line) and the letter body. Each `{{key}}` shows as a labeled box using the label the API already gives (`ApiPlaceholderDef.label`). Boxes can be dragged in from the list, dragged to another spot or between subject and body (a move, not a copy), and removed with Backspace. Clicking a box in the list still inserts it at the cursor of the field last typed in (keyboard and touch users). Enter adds a line in the body and does nothing in the subject. Pasted or dropped text is inserted as plain text, and typed `{{key}}` text turns into a box when the field loses focus. A key the system does not know shows as an amber box, which will not be filled in.
- **Storage unchanged:** the editor reads and saves the same `{{key}}` template text, so the backend, previews, DOCX imports and existing templates are not affected.
- **Template page:** the placeholder list in the editor, the "Supported dynamic placeholders" panel, and each template's subject and placeholder list show names instead of `{{key}}`.
- **Helpers** (`lib/placeholders.ts`) live outside the component file so Vite fast refresh keeps working.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the new files reported no problems. `WarningTemplatesPage.tsx` keeps one existing `react-hooks/set-state-in-effect` error (the page's `load` effect), not from this change.
- The real component was run in headless Chrome (a throwaway page in the session scratchpad, not added to the repo): 20 scripted checks passed. They covered rendering labels with no braces, the unknown-key style, no change emitted on open, typing, Enter, click-to-insert at the cursor, drop at a point, moving a box within and between fields, typed tokens becoming boxes, Enter ignored in the subject, a plain-text drop, deleting a box, and no non-breaking spaces saved. A screenshot with the admin styles was checked.
- Not checked on the live page against the backend, or with a real mouse drag (the drag checks use synthetic drag events).
