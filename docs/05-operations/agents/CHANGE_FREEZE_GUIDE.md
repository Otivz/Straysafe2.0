# Change freeze guide

This guide explains how to use the switches in `AGENTS.md` to control AI coding agents during active development and polishing stages.

## Overview

The governance switches in `AGENTS.md` provide immediate, human-readable control over AI agent behavior:

- **CHANGE RECORDS (`ON` / `OFF`):** When enabled, requires AI coding agents to create an immutable record in `docs/05-operations/agents/feature-updates/` for every code modification.
- **FREEZE (`ON` / `OFF`):** When enabled, restricts autonomous changes to polishing and bug fixes within documented scope, requiring explicit confirmation before touching each file.

## How switches work

AI coding agents read repository instructions at the start of a session.

1. Open `AGENTS.md`.
2. Locate the `## Switches` section.
3. Change the value to `ON` or `OFF` (e.g. `FREEZE: ON`).
4. Start a fresh AI session so the agent loads the updated rules.

Coding-agent pointer files import `AGENTS.md` with a `@AGENTS.md` line, so the switches above are not copied between files.

## AI agent configuration locks

Some AI coding tools support permission configurations:

- **Claude Code:** Project settings in `.claude/settings.json` can enforce read-only or restricted modes. To unlock permissions, switch between active and inactive configuration files (e.g., `.claude/settings.json` and `.claude/settings.off.json`).
- **Autonomous and YOLO modes:** Regardless of tool mode (auto-accept, bypass permissions, YOLO), the directives in `AGENTS.md` apply as strict behavioral policy for all AI agents.

## Change freeze protocol

When `FREEZE: ON` is active:

1. **Scope verification:** All edits must align with `docs/01-system/overview.md`. Any out-of-scope addition must be explicitly flagged to the developer before implementation.
2. **Per-file confirmation:** The agent must state the filename and intended changes, then pause and wait for explicit developer approval before creating, editing, or deleting files.
3. **Validation commands:** Before running tests, type checks, builds, or documentation audits, inspect the repository-defined command for side effects. Run it without additional approval only when the repository documents it as local and non-destructive; otherwise ask first.
