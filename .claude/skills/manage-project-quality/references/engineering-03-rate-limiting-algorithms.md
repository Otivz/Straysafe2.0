# Rate Limiting Algorithm Choices

## Engineering Topic 3: Rate Limiting Algorithm Choices

**When to run this:** When designing or reviewing a rate limiter. This topic focuses on selecting the appropriate algorithm; the API security phase separately verifies that protective limits exist and are effective.

**Goal of this pass:** Make sure the chosen algorithm actually matches the traffic pattern being protected against, instead of defaulting to whatever's easiest to implement.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 3: Rate Limiting Algorithm Choices

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-03-01 | Fixed window | Simple to implement but allows a burst of 2x the limit right at the window boundary. | If fixed window is used, is the boundary-burst behavior acceptable for this endpoint? |
| ENG-03-02 | Sliding window log | Precise (tracks every request timestamp) but memory-heavy at scale. | If precision matters and volume is low/medium, is sliding window log a better fit than fixed window? |
| ENG-03-03 | Sliding window counter | Approximates the sliding log with much less memory by weighting two adjacent fixed windows. | For high-volume endpoints needing better accuracy than fixed window, is sliding window counter being used instead of the log variant? |
| ENG-03-04 | Token bucket | Allows controlled bursts up to the bucket size while enforcing a steady refill rate — good for bursty-but-bounded traffic. | Does the traffic pattern need to allow short bursts, and if so, is token bucket the chosen algorithm? |
| ENG-03-05 | Leaky bucket | Smooths bursty input into a constant output rate — good for protecting a downstream system that can't handle spikes at all. | Is there a downstream system that needs a strictly constant request rate, and if so, is leaky bucket used to enforce it? |
| ENG-03-06 | Distributed rate limiting | A per-instance limiter is meaningless behind a load balancer with multiple app servers — limits get multiplied by instance count. | If the app runs on more than one instance, is the rate limit state shared (e.g. via Redis) rather than per-instance? |
| ENG-03-07 | Client-side throttling | Reduces wasted requests and improves UX, but is never sufficient alone since a client can be bypassed or malicious. | Does the client throttle its own request rate, and is server-side enforcement still present as the actual control? |
| ENG-03-08 | Adaptive rate limiting | Static limits can be too strict in quiet periods or too loose under load; adaptive limits adjust to current system health. | Does the limiter adjust based on current load/error rate, or is it a single static number regardless of system state? |
| ENG-03-09 | Concurrency limiting | Limits in-flight requests, not just requests-per-second — protects against slow requests piling up and exhausting resources. | Is there a cap on concurrent in-flight requests per client, separate from the requests-per-second limit? |
| ENG-03-10 | Back pressure | Signals upstream to slow down instead of silently dropping or queuing indefinitely when a system is overloaded. | When downstream capacity is exceeded, does the system push back (429/503, queue limits) rather than accepting unbounded work? |
