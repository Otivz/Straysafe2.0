# Local Development

## Phase 2: Local Development

**When to run this:** During day-to-day coding, before opening a pull request.

**Goal of this pass:** Prevent secrets, unpinned/unvetted dependencies, and known-bad coding patterns from ever reaching a shared branch.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 7

---

## What to Check — Phase 2: Local Development

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-02-01 | `08_Release_Engineering_Version_Control/01_secure_coding_guidelines.md` | Secure Coding Guidelines | Low | Confirm the team's secure-coding cheat sheet is linked from the PR template/onboarding docs, not just filed away unused. |
| SEC-02-02 | `08_Release_Engineering_Version_Control/02_semantic_versioning.md` | Semantic Versioning | Low | Check the last 3 releases and confirm any breaking change actually bumped the MAJOR version. |
| SEC-02-03 | `10_Dependency_Supply_Chain/01_backend_dependency_scanning.md` | Dependency & SCA Scanning | High | Run the SCA scanner manually against the current backend dependency tree and confirm it matches what CI reports, with no critical CVEs unpatched past SLA. |
| SEC-02-04 | `10_Dependency_Supply_Chain/02_dependency_version_pinning.md` | Dependency Version Pinning | Medium | Delete the lockfile locally and reinstall; confirm CI fails the build if the regenerated lockfile differs from the committed one. |
| SEC-02-05 | `10_Dependency_Supply_Chain/03_frontend_dependency_scanning.md` | Frontend Dependency Scanning | Medium | Run npm audit / yarn audit and manually review any newly added package for typosquatting risk or suspicious post-install scripts. |
| SEC-02-06 | `06_Data_Protection_Secrets/06_secrets_management.md` | Secrets Management (added) | Critical | Run a secret-scanning tool (e.g. gitleaks/truffleHog) across the full git history, not just HEAD, and confirm zero committed credentials. |
| SEC-02-07 | `09_Release_Pipeline_Stages/01_local_dev_testing.md` | Stage 1: Local / Developer Testing | Low | Confirm a fresh local dev environment setup never requires copying real production credentials or data. |
