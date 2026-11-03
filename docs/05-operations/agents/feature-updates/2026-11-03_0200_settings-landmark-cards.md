# Readable settings landmark cards

- **Date:** 2026-11-03 02:00 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdSettings.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0200_settings-landmark-cards.md`
- **Authorization:** User requested improvement of `/subd/settings` and supplied a screenshot of registered landmark cards with narrow, heavily wrapped text and excess height.
- **Type:** Polish

## Intent

Keep landmark names and descriptions readable when category labels are long, using the existing settings page and actions.

## Key changes

- Place each category badge below the landmark name instead of beside the text column; allow the badge to wrap without truncation.
- Use a consistent icon tile, readable text, lighter surfaces, and a simple heading with a count badge.
- Let each card use its natural height instead of stretching to a taller neighbor.
- Wrap coordinates and actions at narrow widths. Increase Edit/Delete click targets and add landmark-specific accessible labels and visible keyboard focus.
- Existing edit/delete handlers, registration, map, and earlier-care metadata are unchanged. No dependency, API, database, or configuration changes.

## Validation evidence

- `npm --prefix frontend run build`: TypeScript and Vite production build passed; existing large-chunk warning remains.
- Local isolated Chrome preview of the real settings route at 1280 and 390 px, with synthetic officer/landmark data and mocked API/map responses: two cards rendered, no horizontal page overflow, title width at least 175 px. Screenshots visually inspected. No live account or record was read or changed.
- `git diff --check`: passed.
- Required structural documentation audit: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
