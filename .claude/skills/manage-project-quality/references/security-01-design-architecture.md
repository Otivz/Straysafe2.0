# Design & Architecture

## Phase 1: Design & Architecture (Pre-Code)

**When to run this:** Before writing code — during system/feature design, RFCs, or architecture review.

**Goal of this pass:** Catch design-level flaws (missing trust boundaries, over-broad data collection, no threat model) that are cheap to fix now and expensive to fix after code exists.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 5

---

## What to Check — Phase 1: Design & Architecture (Pre-Code)

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-01-01 | `15_Architecture_Compliance/01_privacy_by_design.md` | Privacy by Design | Medium | Review the most recent feature's design doc and confirm data collection was scoped to only what the feature actually needs. |
| SEC-01-02 | `15_Architecture_Compliance/02_threat_modeling.md` | Threat Modeling | High | Pull the data-flow diagram for the highest-risk service and confirm a STRIDE (or equivalent) pass was actually performed and mitigations tracked to closure. |
| SEC-01-03 | `15_Architecture_Compliance/04_defense_in_depth.md` | Defense in Depth | Medium | Pick one critical asset and map every independent control protecting it; confirm there isn't a single point whose failure alone exposes it. |
| SEC-01-04 | `15_Architecture_Compliance/06_zero_trust_network.md` | Zero Trust Network Architecture | High | From inside the internal network, attempt to reach a service without presenting valid per-request authentication and confirm it's still denied. |
| SEC-01-05 | `15_Architecture_Compliance/08_secure_sdlc.md` | Secure SDLC (added) | Medium | Confirm the most recent feature had security requirements defined at design time, not bolted on after code review. |
