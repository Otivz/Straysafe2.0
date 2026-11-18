# Simplify the Warning Letter Templates Page

- **Date:** 2026-11-18 08:15 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `docs/README.md`
- **Authorization:** Developer request in the Claude Code session: "UI Improvement: Simplify the Warning Letter Templates Page" (`/warning-templates`): fewer details on each template card, one card per template, compact actions, filters kept, no backend or versioning changes.
- **Type:** Polish

## Intent

The template cards showed every placeholder, the subject with placeholders, a source badge and more, which made the page long and hard to scan.

## Key changes

- **Each card shows only:** name, Default (when it is), Active/Archived, warning level, current version, placeholder count, a description clamped to two lines, and "Updated <date> by <name>". The subject preview, the full placeholder list and the Editor/DOCX badge were removed from the list; they remain in Edit, Preview and History.
- **Layout:** cards in two columns on wide screens, one on narrow screens; actions are compact and aligned, with Archive/Activate pushed to the right.
- **Actions by status:** an active template shows Edit, Preview, History, Set as default (when it is not the default) and Archive. An archived one shows Preview, History and Activate (the backend refuses to issue letters from an archived template).
- **Versions:** the list was already one card per template (`template_id`), with versions under History, so nothing was merged. Two cards with the same name are separate template records (for example the same DOCX imported twice); each of them now shows its number and creation date so they can be told apart.
- **"Supported placeholders" reference panel:** collapsed by default (Show/Hide) to shorten the page.
- Heading, Import DOCX, New template and the All/Active/Archived filters are unchanged. No backend, model, API or versioning change.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed. ESLint on the page: one existing `react-hooks/set-state-in-effect` error (the `load` effect), not from this change.
- Not viewed in a browser against the backend.
