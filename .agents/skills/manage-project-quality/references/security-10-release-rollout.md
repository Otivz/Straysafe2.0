# Release & Rollout

## Phase 10: Release Rollout (Beta ? Canary ? GA)

**When to run this:** During the actual release process, from closed beta through general availability.

**Goal of this pass:** Confirm blast radius stays small at each stage and there's always a fast way back out.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 7

---

## What to Check — Phase 10: Release Rollout (Beta ? Canary ? GA)

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-10-01 | `09_Release_Pipeline_Stages/02_internal_qa_testing.md` | Stage 2: Internal QA Testing | Medium | Confirm the QA environment's test data is synthetic/anonymized, not a raw copy of production customer PII. |
| SEC-10-02 | `09_Release_Pipeline_Stages/03_closed_beta_group_testing.md` | Stage 3: Closed Beta / Group Testing | Medium | Confirm the beta feature flag can be disabled instantly and test that toggling it off removes it from a live beta user's session. |
| SEC-10-03 | `09_Release_Pipeline_Stages/04_staged_canary_rollout.md` | Stage 4: Staged / Canary Rollout | High | Confirm the automated rollback trigger (e.g. error-rate threshold) actually fires a rollback during the canary phase, not just logs a warning. |
| SEC-10-04 | `09_Release_Pipeline_Stages/05_general_availability_release.md` | Stage 5: General Availability (GA) Release | Medium | Confirm a rollback plan and on-call briefing exist and are actionable even after reaching 100% rollout. |
| SEC-10-05 | `09_Release_Pipeline_Stages/06_post_release_monitoring_support.md` | Stage 6: Post-Release Monitoring & Support | Medium | Confirm there is a defined SLA for triaging user-reported issues after a release and that it's actually being met on recent releases. |
| SEC-10-06 | `09_Release_Pipeline_Stages/07_maintenance_patch_management.md` | Stage 7: Maintenance & Patch Management | High | Pick a recent critical CVE affecting a used dependency and confirm it was patched within the defined SLA window. |
| SEC-10-07 | `09_Release_Pipeline_Stages/08_deprecation_end_of_life.md` | Stage 8: Deprecation & End-of-Life | Medium | Confirm a recently EOL'd endpoint/feature is fully decommissioned (404/410), not left dormant and reachable. |
