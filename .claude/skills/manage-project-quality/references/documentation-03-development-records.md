# Development Records

Use this area for implementation guidance and review records that help contributors change the system safely.

| Documentation ID | Record | Purpose | Evidence question |
|---|---|---|---|
| DOC-03-01 | Development setup | Makes a clean environment reproducible. | Can a contributor reach a verified local state from documented prerequisites? |
| DOC-03-02 | Repository map | Reduces rediscovery and misplaced changes. | Are important directories, generated files, and ownership boundaries explained? |
| DOC-03-03 | Coding conventions | Records project-specific rules rather than generic advice. | Are non-obvious conventions linked to automated enforcement where possible? |
| DOC-03-04 | Change records | Captures intent, validation, and rollback for significant work. | Does each important change explain scope, risk, tests, and deployment result? |
| DOC-03-05 | Engineering reviews | Retains evidence and recommendations over time. | Are reviews dated, scoped, owned, and linked to follow-up work? |
| DOC-03-06 | Generated-content policy | Prevents manual edits from being overwritten. | Are source files and regeneration commands clear for every generated artifact? |
| DOC-03-07 | Contribution workflow | Makes review expectations predictable. | Are branch, review, test, and merge requirements current and discoverable? |
| DOC-03-08 | Agent instruction policy | Prevents conflicting or undiscoverable coding-agent behavior. | Is one instruction file authoritative, with supported agent discovery and pointer behavior documented? |
| DOC-03-09 | AI data and tool boundary | Makes agent-assisted development assumptions reviewable. | Are provider data-sharing rules, tool permissions, approval boundaries, and prohibited sensitive inputs explicit? |
