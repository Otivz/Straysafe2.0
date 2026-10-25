# Documentation governance

## Purpose

Documentation governance keeps project intent, implementation facts, decisions, and operating knowledge findable and current. It reduces context loss for humans and agents. It does not, by itself, prevent repository mutation.

## Recommended project layout

```text
.agent-docs/
  config.json
docs/
  README.md
  01-system/
  02-project/
  03-development/
    audits/
    engineering-reviews/
  04-testing/
    security-audits/
    evidence/
  05-operations/
  06-future-proposals/
  archive/
```

Keep the layout proportional to the project. Do not create empty documents merely to satisfy a tree. Every index must describe what belongs beneath it and identify authoritative documents.

## Audit sequence

1. Locate local instructions and the documentation index.
2. Compare claimed behavior with code, configuration, tests, and deployment files.
3. Find broken links, duplicate authorities, stale dates, unresolved placeholders, and undocumented operational dependencies.
4. Classify each document as `Current`, `Needs update`, `Reference`, or `Archived`.
5. Propose the smallest repair that restores a single clear source of truth.

## Continuous change loop

For each material repository change, inspect behavior, configuration, tests, dependencies, and operating assumptions. Update only the documentation areas affected by the evidence, then run the configured documentation audit. Summarize the records updated or explain why the change has no documentation impact. This loop is continuous; security and engineering worksheets remain separate reviews chosen for a specific risk, release gate, or engineering question.

An `AGENTS.md` policy directs a compatible coding agent but does not start one. The user or development environment must run the agent and grant appropriate repository access. `agent-docs suggest reviews` may be called manually, from an explicitly configured Git hook, or from CI to display path-based candidates; its output is advisory and is not an audit result.

## Change records

Record what changed, why it changed, files affected, validation performed, and approval when required by the project. Prefer commit-linked records. Treat a "change freeze" as a declared collaboration policy unless a technical hook or CI rule actually enforces it.
