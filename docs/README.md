# Project documentation

This directory is the maintained project record. Documentation grows with the project; security and engineering worksheets remain separate, scoped reviews.

## Start here

1. The three starter documents (`01-system/overview.md`, `02-project/README.md`, `05-operations/README.md`) were replaced with facts verified from the repository on 2026-10-25. Statements marked **Unverified** or **Unknown** there still need evidence; update them as it is gathered. `audit documentation --strict` fails while a starter marker or its untouched starter text remains.
2. Choose how to complete the baseline:
   - AI-assisted: install the project skill with `npx @ghostbyte/agent-docs-kit@latest skill install --target project`, restart the AI session if needed, then ask it to use `$manage-project-quality` and inspect repository evidence.
   - Manual: run `npx @ghostbyte/agent-docs-kit@latest list documentation`, then open one focused area with `documentation guide <area>`.
3. Run `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict --report --format markdown`.
4. Run `npx @ghostbyte/agent-docs-kit@latest next` whenever you need the next project-specific action.

Generated structure is not proof of completeness. Keep unknowns explicit, label planned behavior as planned, and never assign a security result without evidence.

## Maintain documentation with every change

Every repository change receives a documentation-impact check before it is complete:

1. Inspect the changed behavior, configuration, tests, dependencies, and operating assumptions.
2. Update only the affected areas below. Do not touch every document merely to create activity.
3. Support current-state claims with repository or authorized operational evidence.
4. Record durable decisions, material implementation changes, test evidence, and operational changes in the appropriate area.
5. Run `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` after the update. Add `--report --format markdown` when a durable point-in-time audit is needed.
6. In the change or review summary, list the documentation updated or explain why no documentation change was necessary.

For AI-assisted work, the protected root `AGENTS.md` created when absent carries the same maintenance contract. Existing `AGENTS.md` files are never overwritten; merge this policy into existing instructions deliberately. Optional coding-agent pointer files import `AGENTS.md` instead of copying it, so the policy keeps one source. Manual users follow this section directly.

The workflow is AI-first and agent-assisted, not an unattended background service. `AGENTS.md` does not execute by itself: a compatible coding agent must be active, must load the repository instructions, and must be allowed to edit these records. Run `npx @ghostbyte/agent-docs-kit@latest suggest reviews --staged` before a commit, or compare a pushed branch with `npx @ghostbyte/agent-docs-kit@latest suggest reviews --base <git-ref>`, to receive advisory review candidates. These commands do not edit files or perform an audit.

Documentation maintenance does not automatically start a security or engineering review. This workspace must be initialized before those worksheets can be created. Keep documentation active for every material change, then recommend the narrowest relevant review when the change introduces a security risk, release concern, design tradeoff, reliability question, or testing gap. Explain the reason and evidence needed; create and complete a worksheet only when that review is actually selected.

## Document index

Status values: **Current** (matches the code when last checked), **Reference** (accurate background, may lag the code), **Needs update** (known to disagree with the code), **Archived**.

### In this folder

| Document | Status | Notes |
|---|---|---|
| [01-system/overview.md](01-system/overview.md) | Current | System boundary, roles, services, known gaps |
| [02-project/README.md](02-project/README.md) | Current | Requirements, decisions, milestones, status, stale records |
| [04-testing/README.md](04-testing/README.md) | Current | Test inventory; results not re-run |
| [02-project/DEFENSE_PLAN.md](02-project/DEFENSE_PLAN.md) | Current | Capstone defense plan: roles, countdown, outline, demo script, risks, panel questions |
| [02-project/MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md](02-project/MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md) | Current | Manuscript Chapter 1 (STRAYSAFEEE1.pdf) checked against the system, rated 8.4/10 |
| [03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md](03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md) | Current | Chat isolation findings, fixed 2026-10-25; duplicate-thread merge still to run |
| [03-development/audits/HEATMAP_AUDIT_2026-10-27.md](03-development/audits/HEATMAP_AUDIT_2026-10-27.md) | Current | Heat map findings and five-phase checklist; Phases 0 and 1 done |
| [01-system/HEATMAP_RULES.md](01-system/HEATMAP_RULES.md) | Current | Rules for pins, heat and hotspots (statuses, 50 m / 3 / 5 thresholds, original sighting) |
| `03-development/audits/STRAYSAFEEE1_SYSTEM_ALIGNMENT_2026-10-26.md` | Missing | Listed here before but the file does not exist in the repository or its history; Chapter 1 compared with current code; manuscript corrections, priority/claim implementation gaps, and unverified research claims |
| [05-operations/README.md](05-operations/README.md) | Current | Local setup, run, validate, build; deployment, monitoring and recovery are not set up |
| [05-operations/LOCAL_NETWORK_IP_AND_APK_SETUP_GUIDE.md](05-operations/LOCAL_NETWORK_IP_AND_APK_SETUP_GUIDE.md) | Current | Guide for finding PC IP and changing address in the APK without rebuilds |
| [AI_TECHNOLOGIES.md](01-system/AI_TECHNOLOGIES.md) | Reference | AI technology notes; last verified against code: Unverified |
| [NOTIFICATION_UI_IMPROVEMENTS.md](03-development/implementation-reports/NOTIFICATION_UI_IMPROVEMENTS.md) | Reference | Notification panel changes |
| [Adoption details UI change record](05-operations/agents/feature-updates/2026-10-25_1347_adoption-details-ui.md) | Reference | Initial tabbed redesign, compact assignments, certificate viewer, and browser evidence |
| [Adoption lifecycle without sideways scrolling](05-operations/agents/feature-updates/2026-10-25_1354_lifecycle-no-sideways-scroll.md) | Current | Wrapping lifecycle stages at every screen width; extends the adoption details redesign |
| [ERD/](01-system/ERD/00_ERD_MODULE_OVERVIEW.md) | Reference | Entity-relationship diagrams and database design; match with the ORM is Unverified |
| [DFD/](01-system/DFD/00_DFD_OVERVIEW.md) | Reference | Data-flow diagrams (context, level 1, level 2) and review notes |
| [06-future-proposals/TUNNEL_INTEGRATION_RESEARCH_AND_PLANNING.md](06-future-proposals/TUNNEL_INTEGRATION_RESEARCH_AND_PLANNING.md) | Reference | Tunnel integration research, mobile compatibility, and implementation plan |
| [06-future-proposals/LATE_REPORTS_FOR_CLOSED_CASES_PLAN.md](06-future-proposals/LATE_REPORTS_FOR_CLOSED_CASES_PLAN.md) | Reference | Plan only: link a late report to a case closed or impounded within 7 days; leader decides |
| [06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md](06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md) | Reference | Phase 1 (backend) built; leader card (Phase 2) next, a static UI preview shows meanwhile: for a complaint about a registered pet, the leader contacts the owner and observes for 3 days, then resolves or escalates |

### Moved from the repository root (2026-10-27)

These were loose files in the repository root; they were moved with `git mv` (history kept) and their links updated. Change records written before the move still name the old root paths.

| Document | Status | Notes |
|---|---|---|
| [05-operations/setup.md](05-operations/setup.md) | Needs update | Names `STRAYSAFE_DB_URL` and `Database.txt`; see [operations](05-operations/README.md) |
| [05-operations/DEPLOYMENT_GUIDE.md](05-operations/DEPLOYMENT_GUIDE.md) | Current (plan) | Phased plan: Aiven, Cloudinary, Render, Vercel; nothing deployed |
| [05-operations/tunnel.md](05-operations/tunnel.md) | Current | Active Cloudflare tunnel URL, setup steps, mobile connection instructions |
| `STRAYSAFE_MAP_AUDIT_AND_IMPROVEMENTS.md` | Deleted | Removed in commit `5e46d00`; last version: `git show 8cb074f:STRAYSAFE_MAP_AUDIT_AND_IMPROVEMENTS.md`. Cited by the project and testing records as history |
| [02-project/CHAPTER_1_2_SYSTEM_CHECK.md](02-project/CHAPTER_1_2_SYSTEM_CHECK.md) | Reference | Older manuscript version; superseded for Chapter 1 by the 2026-10-26 check |
| [01-system/ANALYTICS_SPECIFICATION.md](01-system/ANALYTICS_SPECIFICATION.md) | Current | Implemented dashboards (updated 2026-10-24) |
| [03-development/AI_TODO.md](03-development/AI_TODO.md) | Current | AI status and remaining work (2026-10-20) |
| [03-development/implementation-reports/MULTI_ANIMAL_REPORT_PLAN.md](03-development/implementation-reports/MULTI_ANIMAL_REPORT_PLAN.md) | Current | Implemented 2026-10-20 |
| [03-development/implementation-reports/PET_RECORD_DUPLICATE_PREVENTION_PLAN.md](03-development/implementation-reports/PET_RECORD_DUPLICATE_PREVENTION_PLAN.md) | Current | Implemented 2026-10-15 |
| [03-development/implementation-reports/PUSH_NOTIFICATION_IMPLEMENTATION.md](03-development/implementation-reports/PUSH_NOTIFICATION_IMPLEMENTATION.md) | Current | Web push implemented; Android push not started |
| [06-future-proposals/LIVE_GPS_RESPONDER_TRACKING_PLAN.md](06-future-proposals/LIVE_GPS_RESPONDER_TRACKING_PLAN.md) | Reference | Plan only, nothing built |
| [02-project/SYSTEM_PRESENTATION_FLOW.md](02-project/SYSTEM_PRESENTATION_FLOW.md) | Reference | Presentation script; match with the code Unverified |
| [05-operations/agents/CLAUDE_HANDOFF.md](05-operations/agents/CLAUDE_HANDOFF.md) | Reference | Session handoff, 2026-10-25 |
| [01-system/tech_stack_details.txt](01-system/tech_stack_details.txt), [01-system/architectural_design.txt](01-system/architectural_design.txt) | Needs update | Disagree with the code (see [project](02-project/README.md)) |
| [01-system/MESSAGING_GOVERNANCE.md](01-system/MESSAGING_GOVERNANCE.md) | Unknown | Messaging rules and audit checklist (was `message.md`); not reviewed |
| [archive/outdated/project_structure.txt](archive/outdated/project_structure.txt) | Archived | Folder layout from May 2026, superseded by the repository itself |


## Areas

- `01-system/`: system scope, architecture, data, and security design
- `02-project/`: requirements, roadmap, decisions, and status
- `03-development/`: implementation notes and engineering reviews
- `04-testing/`: test plans, security audits, and evidence
- `05-operations/`: setup, deployment, runbooks, and agent operations
- `06-future-proposals/`: proposals that are not current commitments
- `archive/`: superseded material retained for traceability
