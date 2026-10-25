# Security Assurance Reference

This index routes reviewers to the smallest relevant phase. The phase files are canonical; generated worksheets record evidence and status.

## Review contract

- Passive repository review is the default.
- Active testing requires explicit authorization, a named non-production target, stop conditions, rate limits, and synthetic data.
- Use `Pass`, `Fail`, `Unverified`, or `N/A`. Missing evidence is `Unverified`.
- Record evidence, remediation, owner, and verification for every actionable finding.
- Unresolved Critical or High failures block release unless an accountable owner approves a time-bounded exception.

## Current baselines

Reviewed 2026-10-14; review due 2027-01-14.

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP API Security Top 10:2023](https://owasp.org/API-Security/)
- [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0)
- [NIST Secure Software Development Framework 1.1](https://csrc.nist.gov/pubs/sp/800/218/final)
- [NIST Incident Response Recommendations, SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-the-agentic-ai-future/)

Draft standards may inform future work, but must not be represented as finalized requirements.

## Phase index

1. Design and architecture
2. Local development
3. Database and backend
4. API layer
5. Frontend and UI
6. Application security testing
7. CI/CD and release engineering
8. Cloud infrastructure
9. Edge, CDN, and DNS
10. Release and rollout
11. Post-release monitoring and incident response
12. Ongoing operations
13. Agentic AI and tooling

Run `agent-docs list security`, then create only the needed worksheet with `agent-docs security worksheet <phase>`.
