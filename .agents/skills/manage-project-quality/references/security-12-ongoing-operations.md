# Ongoing Operations

## Phase 12: Ongoing Operations

**When to run this:** On a recurring cadence for a live, already-shipped system (see UPDATE_CADENCE.md for suggested frequency).

**Goal of this pass:** Confirm the things that quietly rot over time — vendor access, backups, mobile clients, compliance obligations — are still actually true.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 18

---

## What to Check — Phase 12: Ongoing Operations

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-12-01 | `12_Third_Party_Integration_Vendor_Risk/01_vendor_security_assessment.md` | Vendor Security Assessment | Medium | Pull the most recently onboarded critical vendor's security questionnaire/SOC 2 report and confirm it was reviewed before data sharing began. |
| SEC-12-02 | `12_Third_Party_Integration_Vendor_Risk/02_data_processing_agreements.md` | Data Processing Agreements & Contracts | Medium | Confirm a signed DPA exists for every vendor receiving personal data, and that sub-processor disclosures are on file (consult legal for interpretation). |
| SEC-12-03 | `12_Third_Party_Integration_Vendor_Risk/03_saas_integration_permission_scoping.md` | SaaS Integration Permission Scoping | Medium | Review the OAuth scopes granted to each connected third-party app and confirm none exceed what that integration actually needs. |
| SEC-12-04 | `12_Third_Party_Integration_Vendor_Risk/04_third_party_integration_handling.md` | Third-Party Integration Handling | High | Simulate a slow/failed response from a third-party API dependency and confirm your service times out gracefully instead of hanging or failing open. |
| SEC-12-05 | `12_Third_Party_Integration_Vendor_Risk/05_webhook_security.md` | Webhook Security (added) | High | Send a webhook payload with an invalid or missing signature and confirm the receiving endpoint rejects it rather than processing it. |
| SEC-12-06 | `13_Backup_DR_Resilience/01_backup_job_monitoring.md` | Backup & Error Logs | Medium | Check the last 30 days of backup job logs and confirm every failure triggered an alert, not just a silent log entry. |
| SEC-12-07 | `13_Backup_DR_Resilience/02_chaos_engineering_basics.md` | Chaos Engineering Basics | Medium | Run a small-blast-radius experiment (e.g. kill one non-critical instance) in staging and confirm monitoring/alerting actually fires. |
| SEC-12-08 | `13_Backup_DR_Resilience/03_disaster_recovery_failover_testing.md` | Disaster Recovery / Failover Testing | High | Execute a real failover to the backup region and measure actual RTO/RPO against the documented targets, then test failback too. |
| SEC-12-09 | `13_Backup_DR_Resilience/04_backup_restore_testing.md` | Backup Restore Testing | High | Restore the latest backup into an isolated environment and verify data completeness/integrity, not just that the restore job reported success. |
| SEC-12-10 | `13_Backup_DR_Resilience/05_load_stress_testing.md` | Load & Stress Testing | Medium | Load-test the system to 150% of expected peak traffic and confirm it degrades gracefully (queuing/throttling) rather than crashing outright. |
| SEC-12-11 | `13_Backup_DR_Resilience/06_natural_disaster_scenarios.md` | Natural Disaster Scenarios | Medium | Run a tabletop exercise simulating a regional outage and confirm the documented communication plan is actually followed by the team. |
| SEC-12-12 | `18_Mobile_App_Security/01_certificate_pinning.md` | Certificate Pinning (Mobile) | High | Intercept app traffic with a proxy presenting a non-pinned trusted certificate and confirm the app refuses to connect. |
| SEC-12-13 | `18_Mobile_App_Security/02_secure_local_storage_mobile.md` | Secure Local Storage (Mobile) | High | Pull app data off a rooted/jailbroken test device and confirm tokens/PII aren't sitting in plaintext files or SharedPreferences. |
| SEC-12-14 | `18_Mobile_App_Security/03_jailbreak_root_detection.md` | Jailbreak / Root Detection | Medium | Run the app on a rooted/jailbroken device with a common detection-bypass tool active and confirm the app's protection still triggers or degrades safely. |
| SEC-12-15 | `18_Mobile_App_Security/04_mobile_api_key_protection.md` | Mobile API Key / Secret Protection | High | Decompile/extract strings from the shipped app binary and confirm no high-privilege static API key or secret is embedded. |
| SEC-12-16 | `15_Architecture_Compliance/03_consent_management.md` | Consent Management | Medium | Attempt to withdraw consent for a non-essential data use as a test user and confirm the system actually stops that use promptly. |
| SEC-12-17 | `15_Architecture_Compliance/05_regulatory_compliance_mapping.md` | Regulatory Compliance Mapping | Medium | Confirm each applicable regulation (GDPR/HIPAA/PCI-DSS/etc.) has specific controls mapped to it with an owner (not legal advice — confirm interpretation with counsel). |
| SEC-12-18 | `15_Architecture_Compliance/07_data_subject_rights_handling.md` | Data Subject Rights Handling | High | Submit a test data-deletion request and confirm the data is actually removed from backups/logs within the promised timeframe, not just the primary DB. |
