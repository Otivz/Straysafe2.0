# API Design and Compatibility

Use this review before introducing or changing a public, partner, or service-to-service API.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-10-01 | Explicit contracts | Machine-readable contracts reduce client/server drift. | Is the current request, response, and error contract versioned with the implementation? |
| ENG-10-02 | Backward compatibility | Uncoordinated breaking changes create outages. | Are removals and semantic changes gated by a documented migration window? |
| ENG-10-03 | Consistent errors | Predictable errors make clients safer and observable. | Do errors use stable codes, safe messages, and correlation identifiers? |
| ENG-10-04 | Idempotency | Retries must not duplicate important side effects. | Do retryable writes use an idempotency strategy with a defined lifetime? |
| ENG-10-05 | Pagination and limits | Unbounded reads create latency and cost failures. | Are page size, ordering, cursors, and maximum limits explicit? |
| ENG-10-06 | Deprecation telemetry | Owners need evidence before retiring a version. | Can maintainers identify remaining callers of deprecated behavior? |
| ENG-10-07 | Contract tests | Integration assumptions should fail before deployment. | Do provider and consumer tests cover critical compatibility promises? |
| ENG-10-08 | Safe defaults | Optional fields and defaults affect long-lived clients. | Can old clients ignore additions without changing behavior unexpectedly? |
