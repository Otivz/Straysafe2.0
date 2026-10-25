# Testing Types

## Engineering Topic 8: Types of Testing

**When to run this:** When designing a test strategy for a new project/feature, or auditing whether the current test suite has coverage gaps.

**Goal of this pass:** Confirm the right mix of test types is in place for what's actually being built — not every project needs every type, but the choice should be deliberate.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 8: Types of Testing

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-08-01 | Unit test | Tests one function/module in isolation — fast feedback, but doesn't catch integration problems. | Do core business-logic units have direct unit test coverage, isolated from external dependencies? |
| ENG-08-02 | Integration test | Tests that multiple components work together correctly (e.g. app + real DB) — catches what unit tests can't. | Are integration tests run against real (or realistic) dependencies, not just mocks, for critical paths? |
| ENG-08-03 | End-to-end test | Tests a full user flow through the real system — the closest simulation of actual usage, but slow and more brittle. | Do the most critical user journeys have E2E coverage, kept to a small, high-value set rather than everything? |
| ENG-08-04 | Snapshot test | Catches unintended changes to output (UI render, API response shape) by diffing against a saved reference. | Where snapshot tests are used, are snapshots actually reviewed on change, not blindly re-approved? |
| ENG-08-05 | Contract test | Verifies that a service's API still matches what its consumers expect, without needing a full integration environment. | For services with external consumers, are contract tests in place to catch breaking API changes before deploy? |
| ENG-08-06 | Load test | Confirms the system holds up under expected (and above-expected) traffic before it meets that traffic in production. | Has the system been load-tested at a realistic multiple of expected peak traffic? |
| ENG-08-07 | Chaos test | Confirms the system degrades gracefully under real failure conditions, not just happy-path load. | Has chaos testing been run against the critical paths (see also Debugging Production Issues)? |
| ENG-08-08 | Mutation test | Checks whether the test suite would actually catch a real bug by deliberately introducing small code mutations and seeing if tests fail. | Has mutation testing been run at least once to sanity-check that the test suite isn't just achieving coverage without catching bugs? |
| ENG-08-09 | Smoke test | A fast, shallow check that the basic system is up and functional — meant to catch catastrophic failures immediately after deploy. | Does every deploy run a fast smoke test before being considered successful? |
| ENG-08-10 | Regression test | Confirms a previously fixed bug doesn't come back — without it, the same bug can resurface silently. | Does every fixed bug get a corresponding regression test added to the suite? |
