# Documentation audit fixes in the moved documents

- **Date:** 2026-10-27 03:41 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/01-system/MESSAGING_GOVERNANCE.md`, `docs/01-system/ANALYTICS_SPECIFICATION.md`, `docs/02-project/SYSTEM_PRESENTATION_FLOW.md`, `docs/05-operations/setup.md`, `docs/03-development/AI_TODO.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-10-27_0341_docs-audit-fixes-after-move.md`
- **Authorization:** follow-up to the developer's request "Can you organize my file structure" (see `2026-10-27_0339_move-root-docs-into-docs.md`); `AGENTS.md` requires the strict documentation audit to pass.
- **Type:** Polish

## Intent

Once the root documents moved under `docs/`, `audit documentation --strict` started checking them and failed on problems they already had.

## Key changes

- `MESSAGING_GOVERNANCE.md`: 41 links written as absolute `file:///c:/Users/User/Desktop/Straysafe2.0/...` paths (valid on one PC only) changed to relative paths.
- `ANALYTICS_SPECIFICATION.md`: removed the byte-order mark that hid its H1.
- `SYSTEM_PRESENTATION_FLOW.md`: three extra H1 section titles demoted to H2.
- `setup.md`: added the missing H1 "Local setup".
- `AI_TODO.md`: the dead link to `SYSTEM_AUDIT.md` (deleted in commit `5e46d00`) became plain text with the `git show` command for its last version.
- `docs/README.md`: the row for `03-development/audits/STRAYSAFEEE1_SYSTEM_ALIGNMENT_2026-10-26.md` is marked Missing; the file is not in the repository or its history.

## Validation evidence

- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`: Result PASS (it failed with 46 findings before these fixes).
