# Post-release Monitoring & Incident Response

## Phase 11: Post-Release: Monitoring, Logging & Incident Response

**When to run this:** Immediately after release, and as ongoing production operations.

**Goal of this pass:** Confirm you'd actually notice if something went wrong, and that the team knows what to do when it does.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 9

---

## What to Check — Phase 11: Post-Release: Monitoring, Logging & Incident Response

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-11-01 | `11_Logging_Monitoring/01_audit_logging.md` | Audit Logging | High | Perform a sensitive action (e.g. role change) and confirm the audit log captures actor, action, timestamp, source IP, and result — then try to alter that entry. |
| SEC-11-02 | `11_Logging_Monitoring/02_log_injection.md` | Log Injection (added) | Medium | Submit a username or field containing newline characters and fake log-line content, then confirm it doesn't forge a fake log entry when written. |
| SEC-11-03 | `11_Logging_Monitoring/03_siem_alerting.md` | SIEM & Alerting (added) | Medium | Trigger 10 failed logins for one account in a short window and confirm a SIEM alert fires with a linked response runbook. |
| SEC-11-04 | `14_Incident_Response_Security_Ops/01_bug_bounty_responsible_disclosure.md` | Bug Bounty & Responsible Disclosure | Medium | Fetch https://yourdomain.com/.well-known/security.txt and confirm it publishes a working contact and safe-harbor statement. |
| SEC-11-05 | `14_Incident_Response_Security_Ops/02_manmade_adversarial_scenarios.md` | Man-Made / Adversarial Scenarios | Medium | Run a phishing simulation against staff and measure the click-through and report rate against your baseline target. |
| SEC-11-06 | `14_Incident_Response_Security_Ops/03_red_team_purple_team_exercises.md` | Red Team / Purple Team Exercises | High | Run a scoped red-team exercise with written rules of engagement and measure how quickly the detection/response team noticed and reacted. |
| SEC-11-07 | `14_Incident_Response_Security_Ops/04_incident_response.md` | Incident Response Drill (added) | High | Run a tabletop IR drill for a plausible scenario (e.g. leaked API key) and confirm every role knows their escalation step without looking it up. |
| SEC-11-08 | `14_Incident_Response_Security_Ops/06_security_awareness_training.md` | Security Awareness Training | Low | Confirm every engineer completed secure-coding training within the last 12 months and that a recent incident's lessons were folded into the material. |
| SEC-11-09 | `14_Incident_Response_Security_Ops/07_vulnerability_management_sla.md` | Vulnerability Management SLA | High | Pull open vulnerabilities from the tracker and confirm none of Critical/High severity are past their defined remediation SLA. |
