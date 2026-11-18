# Archived Warning Templates Appear Only Under "Archived"

- **Date:** 2026-11-18 08:20 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `docs/README.md`
- **Authorization:** Developer request in the Claude Code session: "If its archive it should disapear in the all and active and all archive should stay in the archive."
- **Type:** Polish

## Intent

An archived template cannot be used for letters, so it should not appear alongside the templates in use.

## Key changes

- The **All** and **Active** filters list only templates that are not archived; **Archived** lists only archived ones. The counts on the filter buttons follow the same rule.
- Empty states: when every template is archived, All/Active says "No active templates" and points to Archived; an empty Archived explains that archived templates are kept there with their history (no "Create template" button there).
- Archiving and activating are unchanged (same API); an archived template moves to Archived after the list reloads.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed. Not viewed in a browser.
