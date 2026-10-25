# Agent Workflow Quality

## Engineering Topic 18: Agent Workflow Quality

**When to run this:** When a product depends on coding agents to discover instructions, select work, inspect evidence, or produce durable results.

**Goal of this pass:** Make agent-assisted workflows predictable, testable, understandable, and safe across supported tools.

## Concepts — Topic 18: Agent Workflow Quality

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-18-01 | Instruction discovery | A correct policy has no effect when the agent cannot find it. | Does each supported agent discover the canonical instructions and required skill from a clean session? |
| ENG-18-02 | One authoritative policy | Duplicated instructions drift and conflict. | Do tool-specific files point to one canonical policy instead of copying it? |
| ENG-18-03 | Bounded task selection | Broad prompts cause unnecessary context and inconsistent work. | Does the workflow guide the user to one phase, topic, target, and exclusion set before review? |
| ENG-18-04 | Evidence-bounded conclusions | Fluent output can appear more certain than its sources. | Do evaluated scenarios keep missing observables Unverified and distinguish facts from recommendations? |
| ENG-18-05 | Approval behavior | Agents must stop at consequential boundaries. | Do scenarios verify that writes, active tests, credentials, and external actions require the documented approval? |
| ENG-18-06 | Cross-agent consistency | Tool differences can change outcomes and terminology. | Are core scenarios exercised on each supported agent or explicitly marked unsupported or unverified? |
| ENG-18-07 | Recoverable continuation | Users need a clear next step after interruption or partial work. | Can the workflow detect existing setup, open worksheets, and stale skills without restarting from scratch? |
| ENG-18-08 | Evaluation evidence | Prompt claims need repeatable behavioral evidence. | Are scenario inputs, expected boundaries, observed results, agent versions, and known limitations retained without sensitive content? |
