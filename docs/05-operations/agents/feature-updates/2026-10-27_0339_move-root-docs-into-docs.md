# Loose root documents moved into `docs/`

- **Date:** 2026-10-27 03:39 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** moved with `git mv` (old → new):
  - `ANALYTICS_SPECIFICATION.md` → `docs/01-system/ANALYTICS_SPECIFICATION.md`
  - `architectural_design.txt` → `docs/01-system/architectural_design.txt`
  - `tech_stack_details.txt` → `docs/01-system/tech_stack_details.txt`
  - `message.md` → `docs/01-system/MESSAGING_GOVERNANCE.md`
  - `docs/AI_TECHNOLOGIES.md` → `docs/01-system/AI_TECHNOLOGIES.md`
  - `docs/ERD/` → `docs/01-system/ERD/`
  - `docs/DFD/` → `docs/01-system/DFD/`
  - `CHAPTER_1_2_SYSTEM_CHECK.md` → `docs/02-project/CHAPTER_1_2_SYSTEM_CHECK.md`
  - `SYSTEM_PRESENTATION_FLOW.md` → `docs/02-project/SYSTEM_PRESENTATION_FLOW.md`
  - `MULTI_ANIMAL_REPORT_PLAN.md` → `docs/03-development/implementation-reports/MULTI_ANIMAL_REPORT_PLAN.md`
  - `PET_RECORD_DUPLICATE_PREVENTION_PLAN.md` → `docs/03-development/implementation-reports/PET_RECORD_DUPLICATE_PREVENTION_PLAN.md`
  - `PUSH_NOTIFICATION_IMPLEMENTATION.md` → `docs/03-development/implementation-reports/PUSH_NOTIFICATION_IMPLEMENTATION.md`
  - `docs/NOTIFICATION_UI_IMPROVEMENTS.md` → `docs/03-development/implementation-reports/NOTIFICATION_UI_IMPROVEMENTS.md`
  - `AI_TODO.md` → `docs/03-development/AI_TODO.md`
  - `setup.md` → `docs/05-operations/setup.md`
  - `DEPLOYMENT_GUIDE.md` → `docs/05-operations/DEPLOYMENT_GUIDE.md`
  - `tunnel.md` → `docs/05-operations/tunnel.md`
  - `CLAUDE_HANDOFF.md` → `docs/05-operations/agents/CLAUDE_HANDOFF.md`
  - `LIVE_GPS_RESPONDER_TRACKING_PLAN.md` → `docs/06-future-proposals/LIVE_GPS_RESPONDER_TRACKING_PLAN.md`
  - `project_structure.txt` → `docs/archive/outdated/project_structure.txt`
  
  Links updated in: `docs/README.md`, `docs/archive/README.md`, `docs/01-system/overview.md`, `docs/01-system/DFD/04_DFD_REVIEW.md`, `docs/02-project/README.md`, `docs/02-project/DEFENSE_PLAN.md`, `docs/03-development/AI_TODO.md`, `docs/04-testing/README.md`, `docs/05-operations/README.md`; this record `docs/05-operations/agents/feature-updates/2026-10-27_0339_move-root-docs-into-docs.md`.
- **Authorization:** the developer's request "Can you organize my file structure", with the scope "Docs only" chosen when asked.
- **Type:** Polish

## Intent

The repository root held about 20 loose documents. `docs/README.md` already listed them as "not yet moved under `docs/`". They now sit in the area folders that `AGENTS.md` assigns, so the root holds only code folders, agent instruction files and project configuration.

## Key changes

- Moves as listed above; history kept. `message.md` was renamed to `MESSAGING_GOVERNANCE.md` because the old name did not say what it is. `project_structure.txt` (May 2026 layout) was archived and listed in `docs/archive/README.md`.
- Every relative Markdown link to a moved file, and every relative link inside a moved file, was rewritten by script. The docs index section "At the repository root" became "Moved from the repository root (2026-10-27)".
- Not moved: `AGENTS.md` and the agent pointer files (`CLAUDE.md`, `CODEX.md`, `COPILOT.md`, `CURSOR.md`, `GEMINI.md`), which `AGENTS.md` keeps at the root; `Database3.3.txt` (database seed named by setup docs and records); `package.json`, `pyrightconfig.json`; all code under `backend/` and `frontend/`.
- Not edited: earlier change records and `docs/archive/` (records are permanent), so they still name the old root paths. Code comments that mention a document by bare file name (for example `MULTI_ANIMAL_REPORT_PLAN.md`) were left as they are.

## Validation evidence

- Link check over all tracked Markdown files: 2 broken relative links before the move and the same 2 after (`SYSTEM_AUDIT.md` in `AI_TODO.md`, and `03-development/audits/STRAYSAFEEE1_SYSTEM_ALIGNMENT_2026-10-26.md` in `docs/README.md`; both files do not exist). No link broken by the move.
- `.gitignore` ignores `setup.md` by name; the moved file stays tracked because it was already tracked.
