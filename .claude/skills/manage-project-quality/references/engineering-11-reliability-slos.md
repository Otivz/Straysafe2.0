# Reliability, SLOs, and Error Budgets

Use this review when defining service reliability or deciding whether delivery speed is outrunning operational health.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-11-01 | User-centered SLI | Reliability should represent user experience. | Does each indicator measure a user-visible success or latency outcome? |
| ENG-11-02 | Achievable SLO | A target should guide decisions, not promise perfection. | Is the objective based on business need and measured historical behavior? |
| ENG-11-03 | Error budget | Teams need a shared release-versus-reliability signal. | Is remaining error budget visible and tied to an agreed response? |
| ENG-11-04 | Multi-window alerts | Fast and slow burns require different detection windows. | Do alerts identify material budget consumption without paging on noise? |
| ENG-11-05 | Dependency objectives | Upstream limits constrain the service objective. | Are critical dependency availability and latency assumptions recorded? |
| ENG-11-06 | Graceful degradation | Partial service can preserve essential workflows. | Are noncritical features shed safely when dependencies or capacity fail? |
| ENG-11-07 | Recovery objectives | Recovery needs measurable targets. | Are RTO and RPO defined and tested for important data and workflows? |
| ENG-11-08 | Reliability review | Objectives must evolve with product behavior. | Are SLOs reviewed after incidents and material architecture changes? |
