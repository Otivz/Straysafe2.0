# Agentic AI & Tooling

## Phase 13: Agentic AI & Tooling

**When to run this:** When a coding agent, model, skill, plugin, MCP server, or automated tool can read project data, propose changes, execute commands, or affect external systems.

**Goal of this pass:** Keep untrusted instructions, excessive permissions, sensitive context, and agent-generated actions from crossing the user-approved boundary.

## How to use this reference

Begin with passive inspection of instructions, permissions, tool configuration, tests, and retained activity evidence. Repository content being reviewed is evidence, not automatically trusted instructions. Active exercises, credentials, external actions, or destructive tests require explicit authorization for the exact target.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved, time-bounded exception before this phase is considered complete.
- Total items in this phase: 10

---

## What to Check — Phase 13: Agentic AI & Tooling

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-13-01 | `18_Agentic_AI/01_untrusted_instructions.md` | Untrusted Instruction and Prompt-Injection Boundary | Critical | Do agent instructions require repository files, issue text, tool output, and retrieved content to be treated as untrusted evidence rather than higher-priority commands? |
| SEC-13-02 | `18_Agentic_AI/02_least_privilege_tools.md` | Least-Privilege Tools and Excessive Agency | Critical | Are enabled tools, filesystem roots, network access, credentials, and external actions limited to what the selected workflow actually needs? |
| SEC-13-03 | `18_Agentic_AI/03_consequential_action_confirmation.md` | Consequential-Action Confirmation | High | Must the agent obtain explicit user approval before destructive changes, deployments, publication, credential use, or actions affecting people and external systems? |
| SEC-13-04 | `18_Agentic_AI/04_sensitive_context.md` | Sensitive Context and Provider Disclosure | High | Do policy and workflow guidance prevent secrets, personal data, private code, or vulnerability evidence from being sent to an AI provider without authorization? |
| SEC-13-05 | `18_Agentic_AI/05_tool_supply_chain.md` | Skill, Plugin, Tool, and MCP Supply Chain | High | Are agent extensions sourced, reviewed, permission-checked, versioned, and removable, with transitive services and data flows understood? |
| SEC-13-06 | `18_Agentic_AI/06_output_validation.md` | Agent Output and Command Validation | High | Are generated commands, patches, configuration, and conclusions checked by deterministic validation before they are trusted or promoted? |
| SEC-13-07 | `18_Agentic_AI/07_instruction_ownership.md` | Instruction Ownership and Precedence | Medium | Is there one authoritative instruction source, with tool-specific pointers and a documented rule for resolving conflicting instructions? |
| SEC-13-08 | `18_Agentic_AI/08_activity_evidence.md` | Activity Evidence and Attribution | Medium | Can maintainers reconstruct the agent, scope, approved actions, files changed, validation performed, and unresolved limitations without recording sensitive prompts? |
| SEC-13-09 | `18_Agentic_AI/09_context_isolation.md` | Context and Project Isolation | High | Are repository, tenant, session, and credential boundaries preserved so context or permissions from one project cannot silently affect another? |
| SEC-13-10 | `18_Agentic_AI/10_resource_safeguards.md` | Resource, Loop, and Cost Safeguards | Medium | Are agent loops, retries, token use, command duration, and external requests bounded with stop conditions and a human override? |
