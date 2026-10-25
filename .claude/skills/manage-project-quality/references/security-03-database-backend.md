# Database & Backend

## Phase 3: Database & Backend Layer

**When to run this:** While building/reviewing server-side business logic and the data access layer.

**Goal of this pass:** Confirm the backend enforces authorization and business rules itself, and that the data layer doesn't quietly reintroduce injection or over-fetching risk.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 12

---

## What to Check — Phase 3: Database & Backend Layer

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-03-01 | `05_Backend_Handling/01_business_logic_validation.md` | Business Logic Validation | High | Attempt to call the 'ship order' step of a checkout flow while skipping the 'payment' step and confirm the server rejects the out-of-order transition. |
| SEC-03-02 | `05_Backend_Handling/02_file_upload_handling.md` | File Upload Handling | Critical | Upload a file with a .jpg extension but executable/script magic bytes inside, and confirm the server validates content type by inspecting bytes, not just the extension. |
| SEC-03-03 | `05_Backend_Handling/03_orm_database_security.md` | ORM & Database Layer Security | High | Search the codebase for any raw-query escape hatches in the ORM and confirm every one uses parameter binding, not string concatenation. |
| SEC-03-04 | `05_Backend_Handling/04_background_job_queue_security.md` | Background Job & Queue Security | Medium | Submit a queued job payload with malformed/malicious data directly (bypassing the API layer) and confirm the worker validates it the same way the API would. |
| SEC-03-05 | `05_Backend_Handling/05_error_handling_stack_traces.md` | Error Handling & Stack Trace Exposure | Medium | Send a malformed request (bad JSON, wrong content-type) to a production endpoint and confirm the response is a generic error, not a stack trace or file path. |
| SEC-03-06 | `03_Access_Control_Session_Auth/02_backend_access_control.md` | Backend Access Control | Critical | Using User A's valid session, request User B's resource ID directly and confirm a 403, not the data. |
| SEC-03-07 | `03_Access_Control_Session_Auth/05_rbac_abac.md` | RBAC / ABAC Models (added) | Medium | Pick a long-lived test account and diff its current granted permissions against what its role should have today, looking for accumulated excess access. |
| SEC-03-08 | `06_Data_Protection_Secrets/01_encryption_at_rest.md` | Encryption at Rest | High | Confirm via cloud console/CLI that the database volume, backups, and object storage all show encryption-at-rest enabled, not just the primary disk. |
| SEC-03-09 | `06_Data_Protection_Secrets/02_encryption_in_transit.md` | Encryption in Transit | High | Attempt to connect to the database and any internal service-to-service endpoint over plaintext and confirm the connection is refused, TLS-only. |
| SEC-03-10 | `06_Data_Protection_Secrets/03_pii_data_classification.md` | PII & Data Classification | Medium | Pull a sample data export/report and check whether it exposes any field classified as higher-sensitivity than the export's intended audience. |
| SEC-03-11 | `06_Data_Protection_Secrets/04_key_management.md` | Key Management (KMS) | Critical | Confirm encryption keys live in a KMS/HSM (not a config file or env var) and walk through the documented key-revocation procedure end to end. |
| SEC-03-12 | `06_Data_Protection_Secrets/05_tls_certificate_management.md` | TLS Certificate Management | High | Run an SSL/TLS scan (e.g. against the Mozilla Observatory or testssl.sh) on each public endpoint and confirm TLS 1.2+ only, no weak ciphers, valid expiry. |
