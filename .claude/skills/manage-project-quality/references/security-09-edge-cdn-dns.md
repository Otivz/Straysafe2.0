# Edge, CDN & DNS

## Phase 9: Edge, CDN & DNS

**When to run this:** When configuring or auditing anything sitting in front of your origin — CDN, WAF, DNS, email auth.

**Goal of this pass:** Confirm the edge layer actually stops what it's supposed to, and that DNS/email records can't be hijacked or spoofed.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 10

---

## What to Check — Phase 9: Edge, CDN & DNS

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-09-01 | `16_Edge_CDN_Security/01_waf_rules.md` | Cloudflare WAF Rules | High | Send a known attack pattern (e.g. a basic SQLi string) through the WAF in log mode first, confirm detection, then verify it's actually blocked once enforced. |
| SEC-09-02 | `16_Edge_CDN_Security/02_ddos_protection.md` | DDoS Protection | High | Confirm the true origin IP isn't discoverable/reachable directly, bypassing the CDN/DDoS layer entirely. |
| SEC-09-03 | `16_Edge_CDN_Security/03_bot_management.md` | Bot Management | Medium | Run a scripted login-attempt simulation against the login endpoint and confirm the bot-management layer flags/blocks it before it reaches the app. |
| SEC-09-04 | `16_Edge_CDN_Security/04_cdn_caching_authenticated_content.md` | CDN Caching of Authenticated Content | Critical | Request the same authenticated URL as two different logged-in users through the CDN and confirm User B never sees User A's cached response. |
| SEC-09-05 | `16_Edge_CDN_Security/05_cache_poisoning.md` | Web Cache Poisoning | Critical | Send a request with an unusual header (e.g. X-Forwarded-Host: evil.com) and confirm it can't influence what gets cached and served to other visitors. |
| SEC-09-06 | `16_Edge_CDN_Security/06_zero_trust_access.md` | Cloudflare Zero Trust / Access | Medium | Attempt to reach an internal app through the Zero Trust proxy without a valid per-app identity policy match and confirm access is denied. |
| SEC-09-07 | `17_DNS_Email_Domain_Security/01_dnssec.md` | DNSSEC | Medium | Run a DNSSEC validation check (e.g. via a public DNSSEC debugger) against the domain and confirm the chain resolves without validation errors. |
| SEC-09-08 | `17_DNS_Email_Domain_Security/02_spf_dkim_dmarc.md` | SPF, DKIM & DMARC | High | Send a test email through an online authentication checker and confirm SPF, DKIM, and DMARC all pass and align. |
| SEC-09-09 | `17_DNS_Email_Domain_Security/03_subdomain_takeover.md` | Subdomain Takeover (added) | Critical | Audit every CNAME record pointing at a third-party service and confirm none point to a deprovisioned/unclaimed resource that could be claimed by an attacker. |
| SEC-09-10 | `17_DNS_Email_Domain_Security/04_certificate_transparency_monitoring.md` | Certificate Transparency Monitoring | Medium | Query crt.sh for the domain and confirm every listed certificate maps to a known, authorized issuance process. |
