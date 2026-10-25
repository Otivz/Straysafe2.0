# Engineering review protocol

## Purpose

Engineering reviews improve maintainability, reliability, performance, testability, operability, and cost efficiency. They guide design and practice; they are not automatically release gates.

## Statuses

- `Applied`: the practice is implemented and supported by evidence.
- `Partial`: useful parts exist, but a material gap remains.
- `Recommended`: the practice would provide value and is not currently applied.
- `Unverified`: available evidence cannot establish the state.
- `N/A`: the practice does not apply; record why.

If the review discovers a security vulnerability, data-loss risk, or correctness defect, report that separately rather than disguising it as an advisory recommendation.

## Review approach

1. Identify the system constraint or decision under review.
2. Inspect representative code, configuration, tests, telemetry, and design records.
3. Evaluate tradeoffs in the project's actual scale and failure model.
4. Prefer measurable recommendations with a verification method.
5. Avoid importing enterprise complexity into a project that does not need it.
