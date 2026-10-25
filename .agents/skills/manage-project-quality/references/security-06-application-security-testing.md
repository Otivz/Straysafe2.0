# Application Security Testing

## Phase 6: Application Security Testing (QA / Staging)

**When to run this:** A dedicated security test pass in QA/staging before release — after features are functionally complete.

**Goal of this pass:** Review deeper vulnerability classes in an explicitly authorized, isolated test environment with synthetic accounts and data. Confirm coverage against current OWASP baselines without placing production systems, third parties, or real credentials at risk.

> Safety boundary: begin with passive code and configuration review. Active tests require written scope, stop conditions, rate limits, synthetic data, and a non-production target. Never probe cloud metadata, external hosts, or real user accounts.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 14

---

## What to Check — Phase 6: Application Security Testing (QA / Staging)

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-06-01 | `02_Web_Vulnerabilities/01_sql_injection.md` | SQL Injection | Critical | Review parameterization and run a scanner only against an authorized disposable test dataset; record the tool, scope, rate limit, and evidence. |
| SEC-06-02 | `02_Web_Vulnerabilities/04_ssrf.md` | Server-Side Request Forgery (SSRF) | Critical | Use a controlled callback endpoint inside the test environment; never target real cloud metadata or third-party systems. |
| SEC-06-03 | `02_Web_Vulnerabilities/05_idor.md` | Insecure Direct Object Reference (IDOR) | Critical | Log in as User A, capture an object ID from a request, then repeat the identical request as User B and confirm access is denied. |
| SEC-06-04 | `02_Web_Vulnerabilities/08_path_traversal.md` | Path Traversal | Critical | Submit ../../../../etc/passwd and URL-encoded/unicode variants in any file-path parameter and confirm access stays within the intended directory. |
| SEC-06-05 | `02_Web_Vulnerabilities/09_insecure_deserialization.md` | Insecure Deserialization | Critical | Tamper with a serialized object/cookie (flip a field, change a type) and submit it; confirm the server rejects it rather than deserializing blindly. |
| SEC-06-06 | `02_Web_Vulnerabilities/10_broken_authentication.md` | Broken Authentication | Critical | Use synthetic accounts and generated passwords in an isolated environment to verify throttling and lockout without using breached credentials. |
| SEC-06-07 | `02_Web_Vulnerabilities/11_ssti.md` | Server-Side Template Injection (SSTI) (added) | Critical | Submit template syntax such as {{7*7}} or ${7*7} into user-controlled text fields and check whether the output evaluates to 49. |
| SEC-06-08 | `02_Web_Vulnerabilities/12_xxe.md` | XML External Entity (XXE) Injection (added) | Critical | Submit an XML payload with a DOCTYPE defining an external entity pointing to a local file and confirm the parser refuses to resolve it. |
| SEC-06-09 | `02_Web_Vulnerabilities/13_mass_assignment.md` | Mass Assignment (added) | High | Add an unexpected field such as "isAdmin": true to a normal profile-update request body and confirm it is ignored, not applied. |
| SEC-06-10 | `02_Web_Vulnerabilities/14_race_conditions.md` | Race Conditions (added) | High | Fire 20 identical concurrent requests at a discount/redeem endpoint and confirm only one succeeds, not all twenty. |
| SEC-06-11 | `02_Web_Vulnerabilities/15_request_smuggling.md` | HTTP Request Smuggling (added) | Critical | Prefer configuration review and vendor-supported test tooling; active ambiguity tests require an isolated proxy chain and explicit authorization. |
| SEC-06-12 | `19_Security_Checklists/01_owasp_top10_checklist.md` | OWASP Top 10 Checklist | Reference | Use this as a coverage tracker after running folders 01-18 — check off each OWASP Top 10 category once its dedicated checklist items have been executed. |
| SEC-06-13 | `19_Security_Checklists/02_api_security_checklist.md` | OWASP API Security Top 10 Checklist | Reference | Use this as a coverage tracker after running folder 01 (API_Security) and relevant items from 02/03 — confirm each OWASP API Top 10 category is addressed. |
| SEC-06-14 | `19_Security_Checklists/03_pentest_checklist.md` | Penetration Test Checklist (added) | Reference | Use this as the top-level structure for any full engagement: confirm scope/RoE are signed before folder-by-folder testing begins. |
