# Observability and Telemetry

Use this review when adding telemetry or when production behavior cannot be explained quickly.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-12-01 | Structured logs | Searchable fields beat unstructured narratives. | Do logs contain stable event names, severity, and correlation context? |
| ENG-12-02 | Useful metrics | Metrics should describe demand, errors, latency, and saturation. | Can dashboards explain whether users and resources are healthy? |
| ENG-12-03 | Distributed traces | Cross-service latency needs causal context. | Are trace identifiers propagated across supported boundaries? |
| ENG-12-04 | Cardinality control | Unbounded labels can disable or overprice monitoring. | Are user-generated and high-cardinality values excluded from metric labels? |
| ENG-12-05 | Sensitive-data controls | Telemetry is another data store. | Are secrets and personal data redacted before collection? |
| ENG-12-06 | Actionable alerts | Alerts should lead to a known response. | Does every page identify impact, owner, runbook, and escalation path? |
| ENG-12-07 | Retention and sampling | Cost controls must preserve investigation value. | Are retention and sampling choices documented by telemetry class? |
| ENG-12-08 | Instrumentation tests | Broken telemetry can hide production failures. | Do tests verify critical events and trace propagation without asserting noise? |
