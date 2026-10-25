# Cloud Infrastructure

## Phase 8: Cloud Infrastructure & Deployment

**When to run this:** Before first deploying to a new environment, and periodically thereafter for drift.

**Goal of this pass:** Confirm IAM, network, storage, and container configuration follow least privilege and don't expose more than intended.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 11

---

## What to Check — Phase 8: Cloud Infrastructure & Deployment

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-08-01 | `07_Cloud_Infra_Deployment/01_environment_separation.md` | Environment Separation | Critical | Attempt to reach the staging environment unauthenticated from the public internet and confirm it requires auth or is not publicly indexable. |
| SEC-08-02 | `07_Cloud_Infra_Deployment/02_iam_policy_review.md` | Cloud IAM Policy Review | Critical | Export all IAM policies and grep for '*:*' or overly broad wildcard actions/resources; confirm each is justified or scoped down. |
| SEC-08-03 | `07_Cloud_Infra_Deployment/03_blue_green_canary_rollback.md` | Blue-Green / Canary Deployment & Rollback | High | Trigger a rollback in staging and time how long it takes to reach the previous stable version; compare against your defined rollback-time target. |
| SEC-08-04 | `07_Cloud_Infra_Deployment/04_container_k8s_security.md` | Container Orchestration (Kubernetes) Security | High | Run 'kubectl auth can-i --list' as a low-privilege service account and confirm it cannot perform cluster-admin-level actions. |
| SEC-08-05 | `07_Cloud_Infra_Deployment/05_cloud_storage_misconfig.md` | Cloud Storage Misconfiguration | Critical | List every storage bucket/container and confirm none allow anonymous public read/write except explicitly intended public assets. |
| SEC-08-06 | `07_Cloud_Infra_Deployment/06_infra_as_code_scanning.md` | Infrastructure-as-Code Scanning | High | Run an IaC scanner (e.g. tfsec/Checkov) against the current Terraform/CloudFormation config and confirm zero unresolved high/critical findings. |
| SEC-08-07 | `07_Cloud_Infra_Deployment/07_container_image_security.md` | Container Image Security | High | Run a CVE scanner (e.g. Trivy/Grype) against the production container image and confirm no unpatched critical CVEs, and that it isn't tagged 'latest'. |
| SEC-08-08 | `07_Cloud_Infra_Deployment/08_network_segmentation_cloud.md` | Cloud Network Segmentation | High | From a low-trust workload/VPC, attempt to reach a sensitive internal service directly and confirm network policy blocks it. |
| SEC-08-09 | `07_Cloud_Infra_Deployment/09_post_deploy_monitoring.md` | Post-Deployment Monitoring | Medium | During the next deploy, confirm an on-call owner is actively watching error-rate/latency dashboards for the defined post-deploy window. |
| SEC-08-10 | `07_Cloud_Infra_Deployment/10_feature_flag_safety.md` | Feature Flags & Kill Switches | Medium | Toggle a high-risk feature flag off in staging and confirm the code path is actually disabled immediately, not just hidden in the UI. |
| SEC-08-11 | `07_Cloud_Infra_Deployment/11_deploy_pipeline_iam_scoping.md` | Least-Privilege IAM for Deployment | Critical | Inspect the CI/CD service account's IAM role and confirm a staging-deploy credential cannot touch production resources. |
