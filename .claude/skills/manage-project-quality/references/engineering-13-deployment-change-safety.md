# Deployment and Change Safety

Use this review for release pipelines, migrations, feature rollouts, and rollback design.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-13-01 | Small reversible changes | Small batches limit diagnosis and rollback cost. | Can the change be disabled or reverted without unrelated work? |
| ENG-13-02 | Progressive delivery | Early signals reduce blast radius. | Is rollout staged by environment, cohort, region, or percentage? |
| ENG-13-03 | Automated verification | Human-only checks miss repeatable regressions. | Are build, test, policy, and artifact checks required before promotion? |
| ENG-13-04 | Migration compatibility | Code and data often deploy at different times. | Do schema changes support old and new application versions during rollout? |
| ENG-13-05 | Health-based rollback | Rollback decisions should use defined signals. | Are stop and rollback thresholds tied to service and business health? |
| ENG-13-06 | Artifact promotion | Rebuilding can change what was tested. | Is the verified immutable artifact promoted between environments? |
| ENG-13-07 | Change traceability | Operators need to connect behavior to releases. | Can a running version be traced to source, build, approvals, and configuration? |
| ENG-13-08 | Post-deployment observation | Success requires evidence after deployment. | Is there an owned observation window with a clear completion decision? |
