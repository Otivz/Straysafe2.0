# Production Debugging

## Engineering Topic 4: Debugging Production Issues

**When to run this:** Before an incident happens — this is about having the right tooling and habits in place, not what to do during a live fire.

**Goal of this pass:** Confirm the team has the observability primitives needed to actually diagnose a production issue quickly, not just react to alerts.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 4: Debugging Production Issues

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-04-01 | Correlation IDs | Without a shared ID, tracing one user's request across multiple services means grepping logs by timestamp and guessing. | Does every request get a correlation/request ID that's propagated across all services it touches and included in every log line? |
| ENG-04-02 | Distributed tracing | Shows exactly where time is spent across a multi-service call chain — impossible to reconstruct from logs alone at scale. | Is distributed tracing (e.g. OpenTelemetry) instrumented across service boundaries? |
| ENG-04-03 | Feature flag rollback | Turning off a bad feature via flag is faster and safer than a code rollback/redeploy under incident pressure. | Can the riskiest recent features be disabled via flag without a deploy? |
| ENG-04-04 | Canary analysis | Rolling out to a small subset first catches regressions before they hit 100% of traffic. | Are risky changes rolled out to a canary/subset with automated comparison against the baseline before full rollout? |
| ENG-04-05 | Replay traffic | Re-running real production requests against a fix confirms it actually resolves the issue, not just a synthetic test case. | Is there a way to replay real production traffic (or a sample) against a candidate fix before it ships? |
| ENG-04-06 | Heap dumps | A heap dump is often the only way to root-cause a memory leak instead of guessing from symptoms. | Is heap-dump capture available (manually or via crash trigger) for services with memory-related symptoms? |
| ENG-04-07 | Chaos testing | Deliberately injecting failure in a controlled way surfaces weaknesses before real, uncontrolled failure does. | Has chaos testing (killing instances, injecting latency/errors) been run against critical paths? |
| ENG-04-08 | Synthetic monitoring | Catches outages and regressions from the outside, the way a real user would experience them, independent of internal metrics. | Are synthetic checks running against critical user journeys from outside the infrastructure? |
| ENG-04-09 | Error budgets | Gives a quantified, agreed-upon threshold for how much unreliability is acceptable, so incident response isn't a judgment call every time. | Is there an agreed error budget per service, and does exceeding it trigger a defined response (e.g. freeze on new features)? |
| ENG-04-10 | Postmortems | Without a blameless, written record, the same class of incident tends to recur because the lesson isn't institutionalized. | Does every significant incident get a blameless postmortem with concrete follow-up actions that are actually tracked to completion? |
