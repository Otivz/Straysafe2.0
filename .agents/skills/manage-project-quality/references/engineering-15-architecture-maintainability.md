# Architecture & Maintainability

## Engineering Topic 15: Architecture & Maintainability

**When to run this:** When a system is becoming difficult to change, a major feature crosses module boundaries, or architectural structure needs review.

**Goal of this pass:** Keep responsibilities, dependency direction, change cost, and failure boundaries understandable without adding unnecessary abstraction.

## How to use this reference

Review representative code, dependency relationships, tests, and recent changes. Recommend structure only when the observed change and maintenance costs justify it.

## Concepts — Topic 15: Architecture & Maintainability

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-15-01 | Clear module responsibilities | Mixed responsibilities make changes unpredictable. | Can each important module be described by one bounded responsibility? |
| ENG-15-02 | Dependency direction | Cycles and inward leaks make replacement and testing difficult. | Do dependencies flow toward stable interfaces without avoidable cycles? |
| ENG-15-03 | Public versus internal contracts | Accidental APIs become compatibility burdens. | Are exported interfaces intentional, documented, and tested separately from internals? |
| ENG-15-04 | Change coupling | Frequently co-changing files reveal hidden boundaries. | Do recent changes show modules that must always move together and should be reorganized? |
| ENG-15-05 | Complexity control | Deep branching and oversized functions hide defects. | Are complex paths identified and simplified or directly protected by focused tests? |
| ENG-15-06 | Failure boundaries | Uncontained failures spread operational impact. | Are errors contained, translated, and recovered at deliberate component boundaries? |
| ENG-15-07 | Duplication decisions | Both copy-paste and premature abstraction increase maintenance cost. | Is repeated logic consolidated only when its behavior and lifecycle are genuinely shared? |
| ENG-15-08 | Architecture verification | Diagrams drift unless behavior checks support them. | Do tests or dependency checks protect the most important architectural boundaries? |
