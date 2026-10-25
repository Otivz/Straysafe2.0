# Cloud Cost Saving

## Engineering Topic 7: Cloud Cost-Saving Techniques

**When to run this:** During a cost review, before scaling up infrastructure, or when a cloud bill increase needs investigating.

**Goal of this pass:** Work through the standard cost levers systematically instead of just cutting the first expensive-looking line item.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 7: Cloud Cost-Saving Techniques

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-07-01 | Spot instances | Substantially cheaper than on-demand, but can be reclaimed with short notice — only right for interruption-tolerant workloads. | Are interruption-tolerant workloads (batch jobs, stateless workers) running on spot instead of on-demand? |
| ENG-07-02 | Autoscaling | Paying for peak capacity 24/7 wastes money during predictable low-traffic periods. | Does capacity actually scale down during known low-traffic periods, not just scale up under load? |
| ENG-07-03 | Reserved capacity | Committing to steady-state baseline load ahead of time is cheaper than paying on-demand rates for it continuously. | Has the stable, predictable-load portion of infrastructure been covered by reserved/committed-use pricing? |
| ENG-07-04 | Right-sizing | Over-provisioned instances (low CPU/memory utilization) are a direct, ongoing waste that compounds over time. | Have instance sizes been checked against actual utilization recently, not just set once at launch and left alone? |
| ENG-07-05 | Storage tiering | Infrequently accessed data doesn't need to sit on the most expensive, fastest storage tier. | Is cold/infrequently-accessed data moved to a cheaper storage tier rather than left on the default hot tier? |
| ENG-07-06 | CDN offloading | Serving static/cacheable content from origin instead of a CDN costs more in bandwidth and origin load. | Is static and cacheable content served from a CDN rather than hitting origin servers for every request? |
| ENG-07-07 | Serverless for spiky loads | Paying for always-on servers to handle infrequent, spiky workloads is wasteful compared to pay-per-invocation. | Are low-frequency, spiky workloads running serverless rather than on dedicated always-on infrastructure? |
| ENG-07-08 | Idle resource cleanup | Unattached volumes, unused load balancers, and orphaned snapshots accumulate cost silently over time. | Is there a recurring process to find and remove idle/orphaned cloud resources? |
| ENG-07-09 | Compression | Uncompressed data transfer and storage costs more in both bandwidth and storage fees than it needs to. | Is compression enabled where it's cheap to apply (asset delivery, log storage, backups)? |
| ENG-07-10 | Multi-region arbitrage | Compute/storage/egress pricing varies meaningfully by region — running in the highest-cost region without a reason is avoidable spend. | Has region choice been checked against pricing, not just picked for proximity or default? |
