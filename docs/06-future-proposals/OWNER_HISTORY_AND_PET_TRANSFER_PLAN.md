# Owner History and Pet Ownership Transfer: plan

- **Status:** Proposal. Nothing here is built and none of it is current scope until accepted.
- **Written:** 2026-11-03, from the code as of that day.
- **Origin:** the developer asked whether an owner history is useful, and how a pet given to a neighbor should be handled.
- **Timing:** not for the capstone defense (feature freeze about 5 days before; see [DEFENSE_PLAN](../02-project/DEFENSE_PLAN.md)). Phase 0 is a small check that can be done anytime. The rest can be listed in Chapter 5 as recommendations.

## 1. Summary

Two separate ideas:

1. **Owner history:** a private, consolidated view of one owner's warnings, observations and incidents, so officials can see repeated incidents and whether an owner complied. It combines records the system already keeps.
2. **Resident-initiated ownership transfer:** a pet's current owner gives the pet to someone else (for example a neighbor) and the pet keeps its record. Today only an Administrator can start a reassignment.

Principles for both:

- **Pet history follows the animal.** A verified bite or chase stays on the pet when the owner changes.
- **Responsibility belongs to the owner at the time.** Warnings and observations stay with the person they were issued to. A new owner does not inherit them.
- **Officials' decision support only:** no owner score, rating or automatic penalty.
- **Private by default.** No access for other residents or the public.

## 2. What exists today

Verified in the code on 2026-11-03.

| Area | Where | What it does |
|---|---|---|
| Warnings | `owner_warnings` (`models/warning.py`) | Tied to the **person** (`user_id`), with `pet_id`, `report_id`, `issued_by`, level, status and acknowledgement. `visible_warnings` (`utils/warning_rules.py`): residents see only their own; staff see what they may read. |
| Observations | `owner_followups`, `followup_contact_logs`, `owner_observation_updates` | The 3-day owner observation: owner, leader, status (observing, complied, closed, escalated, cancelled), extension. |
| Repeat incidents | `followup_repeated_incidents` | Repeat sightings logged against an open observation. |
| Pet behavior | pet record (declared and verified bite and chase fields) | Verified from incident reports; follows the pet. |
| Pet history | `pet_history` | The animal's record changes. |
| Claims and handover | `pet_claims`, `owner_returns` | Claims on held animals and completed handovers. |
| Ownership change | `pet_owner_confirmations` (`models/pet_owner_confirmation.py`), `routes/pet_ownership.py` | A proposed owner must **accept** before `pets.owner_id` changes. Records `previous_owner_id`, `proposed_owner_id`, `source` and status. A separate **claim** route lets a resident claim an unregistered pet; the leader or staff decide. |
| Adoption ownership | `adoption_ownership_history` | Ownership after an adoption. Adoption keeps its own process. |
| Audit | `audit_logs` | Actor, action, target, old and new values. |

## 3. Gaps

1. **A resident cannot start a transfer.** `POST /pets/{id}/assign-owner` refuses reassigning an established owner unless the actor is a System Administrator (403 for leaders, staff and residents). The acceptance step exists, but only an admin can start it, so "my neighbor gave me their dog" has no resident path.
2. **No previous-owner history for a pet.** `previous_owner_id` is on each confirmation, but there is no per-pet view of past owners, dates and reasons, and no rule for who may see them.
3. **No consolidated owner history.** Warnings, observations and incidents are reachable from separate screens.
4. **Transfer reason and verification are not captured.** A confirmation has no reason such as "given to a neighbor", and no staff-verified path when one side has no account.

## 4. Proposal A: Owner History section

A read-only **Owner History** section inside existing case and profile screens (not a new standalone page).

**Contents, per owner:**

- Registered animals, with the date the person became the registered owner (from the ownership records).
- **Confirmed incidents**, each linked to its original report. Unverified reports are shown separately and labelled; they are never counted as confirmed incidents.
- Official warnings (level, date, issuer) and whether they were acknowledged.
- Observation outcomes: complied, extended, closed or escalated, with dates.
- Claims and completed handovers.

**Not included:** any score, rating, "risk" label, or automatic action. No ranking of owners.

**Who can see it** (recommended; each existing endpoint's scope must be checked before this is built):

| Viewer | Access |
|---|---|
| Owner | Their own animals, notices, confirmed incidents and outcomes. Staff-only notes excluded. |
| Subdivision Leader | Relevant owner history within their own subdivision. |
| Barangay staff | History for cases they handle or receive through escalation. |
| Administrator | Administration, corrections and audit. |
| Other residents, public | None. |

**Privacy:** a record about one person's incidents is personal data under RA 10173. Keep to purpose and proportionality: officials handling a case only, the minimum fields, names but not phone, email or address, and an audit entry when staff open it, the same pattern as the case-record print log. Show a short purpose line on the section ("For handling this case").

**Suggested data approach:** a read-only query that assembles the records above; no new table at first. A `GET /owners/{user_id}/history` (role-checked per row, like `visible_warnings`) feeding a shared panel, similar to the history Case Summary panel.

## 5. Proposal B: resident-initiated ownership transfer

**Flow:**

1. The **current owner** opens the pet profile and chooses **Give this pet to another resident**, picks the recipient and gives a reason (for example "Given to a neighbor").
2. The **recipient** accepts or declines. Until they accept, the original owner stays registered. The existing confirmation and acceptance step is reused.
3. On acceptance the system records the completed transfer: previous owner, new owner, date, reason and who verified it.
4. The pet appears under the new owner's My Pets. **No duplicate record is created.**
5. **If either person has no account**, the Subdivision Leader verifies and records the handover (staff-assisted), with the same record.

**What moves with the pet:** registration and identification, vaccinations, verified behavior and incident history.
**What stays with the previous owner:** warnings issued to them, observations, responsibility for earlier incidents, personal documents and contact details.

**Visibility of previous-owner details:** the new owner sees that a transfer happened, its date and reason, and the pet's relevant history. The previous owner's name and details are limited to the people involved and authorized staff.

**Open cases:** a pet with an open observation, an unresolved report, an unpaid claim or a pending dispute should not be transferable until the case is closed, or only with leader approval. Decide the exact rule in Phase 2.

**Out of scope:**

- Adoption through the Barangay keeps its own process.
- A lost or found pet returned to its owner keeps the existing owner-return flow.
- A transfer is not a sale and carries no fee.

## 6. Phases and checklist

### Phase 0: Verify what exists (small, can be done now)

- [ ] Run one admin-started transfer (A to B, B accepts) on a throwaway database and record what moves: pet record, behavior history, warnings, observations.
- [ ] Confirm the previous owner's warnings and observations stay with them.
- [ ] Confirm what the new owner and other residents can see about the previous owner.
- [ ] List every endpoint that reads warnings, observations or incidents and its access rule (input to Proposal A's permission table).
- [ ] Record the findings in this document.

### Phase 1: Previous-owner record for a pet

- [ ] Add a per-pet ownership history: previous owner, new owner, date, reason, who verified.
- [ ] Capture the reason on every ownership confirmation.
- [ ] Rules for who sees it (see section 5), enforced on the server.
- [ ] Tests: the record is written once on acceptance; a decline or cancel writes none; hidden from other residents.
- [ ] Database change needed: ask the developer before any schema change or migration.

### Phase 2: Resident-initiated transfer

- [ ] A resident request path to propose a transfer of their own pet to another resident; the recipient accepts or declines.
- [ ] The staff-assisted path when someone has no account.
- [ ] The rule for pets with open cases.
- [ ] Notifications to both people; audit entries for the request, acceptance, decline and cancel.
- [ ] Tests: only the registered owner can start it; warnings stay with the previous owner; the pet is not duplicated; the previous owner's details are hidden from the new owner as specified.

### Phase 3: Owner History section

- [ ] The read-only endpoint, with per-viewer scoping and an audit entry when staff open it.
- [ ] The section on the leader and barangay case pages, then the admin page.
- [ ] The owner's own view without staff-only notes.
- [ ] Unverified reports labelled and excluded from confirmed counts; no scores.
- [ ] Tests: each viewer sees only their scope; a new owner sees none of the previous owner's warnings.

### Phase 4: Review and records

- [ ] Security and privacy review (API-layer authorization and the personal data in the history), using the kit's worksheet.
- [ ] Documentation, a change record per phase, and the manuscript wording if it is adopted.

## 7. Risks and decisions needed

- **Privacy and profiling:** an owner history can look like a record of residents. Keep it case-scoped, unscored and audited, and be ready to explain its purpose to the panel.
- **Misuse of transfers:** an owner could transfer a pet to dodge warnings. Warnings stay with the person, and the transfer is recorded with date, reason and verifier. Blocking transfers during an open case reduces the risk.
- **Wrong recipient:** the recipient must accept (as now) so a wrong account can't receive a pet.
- **Decisions for the developer:**
  1. May a transfer happen during an open case, never, or with leader approval?
  2. Should the new owner see the previous owner's name, or only that a transfer occurred?
  3. Should the owner's history include other households' reports against them, or only officially verified incidents (recommended)?
  4. Is this for after the defense (recommended)?

## 8. For the defense

If asked "what if someone gives away their pet?":

> A pet keeps its record, including verified behavior, but warnings stay with the person they were issued to. An ownership change needs the new owner's acceptance. Today only an Administrator can start one; letting the current owner request a transfer, with a leader-verified path when someone has no account, is our recommended next step.
