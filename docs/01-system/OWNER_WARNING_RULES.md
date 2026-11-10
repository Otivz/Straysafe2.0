# Owner warnings, repeated incidents and leader identity verification

Phase 6 of the restore plan. These rules apply to official owner warnings, repeat incidents during an owner observation, and the handling leader's identity verification. The server enforces each rule; the screens only show what is allowed.

## Who may issue a warning

`POST /warnings/` is refused unless all of these hold:

| Rule | Refusal |
| --- | --- |
| The actor is a Subdivision Leader (role 2). Barangay staff, Admins and residents can't issue warnings | `403` |
| The warning is for a report (the incident) in the leader's own subdivision | `400` / `403` |
| The leader handles the report (`assigned_leader_id`), when it has one | `403` |
| The recipient is a resident account | `400` |
| With a known pet, the recipient is that pet's registered owner, and the pet has an owner account | `400` |
| The chosen pet matches the report's linked pet | `409` |
| The case isn't in the retired Barangay rescue workflow (a rescue record, or status 5, 6 or 13). A **referral no longer blocks a warning** (status 4 and an endorsement letter are not a block any more) | `403` |
| The case is **open** (not Closed) | `409` |
| Its concern is one an owner can be warned for: Animal Nuisance or Animal Safety Concern (older categories are read as those; a lost-pet, found-animal, injured or other concern is not) | `409` |
| The owner was **confirmed** with evidence in the case's ownership review, and the warning goes to that owner | `409` |
| The incident was **verified** (assessment, or the older on-site verification) | `409` |
| A **confirmed** subdivision policy covers the concern: `policy_id` optional when exactly one applies, required when several do | `409` / `422` / `404` |
| An inherited pet identity was re-checked first (existing rule) | `409` |

These checks run in this order (the same order the Admin screen explains it) and are enforced on the server, whatever the screen shows ([CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md)). A subdivision with no confirmed policy cannot issue warnings until one is configured.

A pet with no owner account never gets an account warning. The leader logs a **verbal warning** instead (see below). The second-warning action on an observation follows the same rules: it is leader-only and refused (`409`) for an owner without an account. It previously issued the warning to user #1.

## One warning per incident and tier

An incident is a report. For the same incident, pet and violation:

- the same tier can't be issued twice;
- a later warning must be a higher tier (Notice → 1st Warning → 2nd Warning → Final Notice / Escalation), never a lower one.

A **logged repeat incident** is a different report, so it can receive its own warning. A warning on a repeat never opens a second observation for the same pet.

`GET /warnings/suggestion?violation_type=&report_id=` suggests the tier from the pet's (or owner's) history for that violation. It also returns default instructions, the observation period of the applicable policy (`observation_days`) and the matching comply-by date; both are empty when the policy defines no period. The leader's warning form is prefilled from it, and the leader can change both the tier and the remarks.

## Policy, observation period and fines

- The warning records the policy it was issued under (`policy_id`, `policy_title`, `policy_reference`) and the policy's observation period (`observation_days`, with the due date in `follow_up_at`).
- **The period is the policy's.** A policy that defines none means **no observation period**: no observation is started and no number of days is assumed. The old fixed 3 days are gone from the warning path; a warning with a period starts an observation of exactly that many days, and the owner is told that number.
- Warnings issued before policies existed (no `policy_id`) are kept as they were. They read with empty policy fields, and an observation that had to be tracked for one is read as the 3 days that applied then.
- **No fine is ever worked out by the system.** `fine_amount` is whatever the issuer typed, and 0 otherwise.
- Issuing a warning is case work: the case moves to In progress (never backward, never out of Closed).

## Who may read warnings

| Viewer | `/warnings/pet/{id}`, `/warnings/report/{id}`, `/warnings/user/{id}`, `/warnings/{id}`, `/warnings/` |
| --- | --- |
| Resident | Only notices issued to them (another resident's list is empty or `403`) |
| Subdivision Leader | Warnings for reports in their subdivision (or, without a report, owners in it) |
| Barangay staff | Warnings in their barangay |
| Admin | All |

## Acknowledgement

`PATCH /warnings/{id}/acknowledge` with `{"confirmed": true}`. Only the warned owner can acknowledge; staff can't do it for them. It is refused (`400`) unless the acknowledgement checkbox was ticked. Acknowledging again changes nothing. The owner sees their notices for a report on its page (`ReportWarningNotices`) and in the warning modals on My Pets and the home page. Each acknowledge button is disabled until the checkbox is ticked.

## Verbal warnings (owners without an account)

`POST /owner-followups/{id}/verbal-warning` with `method` (`phone` or `in_person`), `tier`, `notes`, and optionally the incident `report_id` (the observed report or a logged repeat). It is for the handling leader only, during an open observation, and only when the owner has no account. It is saved as a follow-up contact entry with contact type **Verbal Warning**, and the report history gets a note. The same tier for the same incident can't be logged twice. No account warning is created.

## Repeated incidents

- **Detection.** Another report linked to the pet under observation, filed since the observation started, is a possible repeat. Merged duplicates, reports in the observed case and already logged incidents are excluded. Inherited links that haven't been re-checked don't count.
- **Alert once.** The handling leader gets one `followup_repeat_report` notification per report. It is sent when a pet match is linked, when the observation is opened, or by the periodic follow-up check, whichever comes first.
- **Banner.** `GET /owner-followups/{id}/repeated-reports` lists possible repeats and logged ones. Barangay staff can read it; only the handling leader can log.
- **Logging.** `POST /owner-followups/{id}/repeated-incidents` with `report_id` and `notes`. The report must exist and be related: about the same pet, or, when the observation has no pet record, in the same subdivision. It is refused for the observed report itself, a merged duplicate, or a report already logged.
- **Incidents and warnings.** `GET /warnings/followup/{id}/incidents` lists the observed incident and each logged repeat with its warnings. Each comes with a prefill: date, comply-by date, instructions and suggested tier.

## Pet history (staff only)

`GET /owner-followups/pet/{pet_id}/summary` returns the pet's observations in the staff member's area, its repeat incidents, and counts of observations, repeats, official warnings and verbal warnings. It is shown as a staff summary at the top of the existing pet history; residents get `403`.

## Leader identity verification

`POST /leader-identity/matches/{match_id}` with `method` and `reason` (at least 15 characters). `GET /leader-identity/reports/{report_id}` shows each staff-confirmed pet match and whether it can be verified.

It is allowed only when **all** of these hold:

- the actor is the Subdivision Leader handling the case, in its subdivision, and the case is open;
- staff confirmed the match (`CONFIRMED_MATCH`) to a pet that has an owner, and the report isn't already linked to it;
- the owner **rejected** it, or **didn't answer within 24 hours** of the staff confirmation;
- the pair has no owner-first confirmation request (Manual Matching; there the owner's answer stands);
- there is no pending dispute on the report, no conflict with the case's pet, and it isn't a multi-animal group report;
- it hasn't been verified already.

Methods: In-Person Inspection, Microchip / Tag Check, Owner Interview, Photo Comparison with Documents.

Effect: the report is linked to the pet, with history entries on the report and the pet. The owner gets a `leader_identity_verified` notification saying they can file a formal dispute on the report, using the existing dispute flow. It does **not**:

- change the owner's answer on the match;
- count as ownership proof at handover (`owner_already_on_record` ignores a leader-only verification);
- touch adoption ownership or consent.

## Code and tests

- Backend: `app/utils/warning_rules.py`, `app/routes/warnings.py`, `app/routes/owner_followups.py` (verbal warnings, repeats, summary, second-warning fix), `app/utils/owner_followups.py` (repeat detection), `app/utils/leader_identity.py`, `app/routes/leader_identity.py`, `app/utils/owner_returns.py` (handover exclusion)
- Tables (created at startup, non-destructive): `followup_repeated_incidents`, `leader_identity_verifications`
- Frontend: `RepeatedReportBanner.tsx`, `LeaderIdentityConfirm.tsx` (Subdivision report view), `ReportWarningNotices.tsx` (owner report view), `PetRecords/PetFollowUpSummary.tsx`, the acknowledgement checkbox on My Pets and the home page, and the server-suggested tier and prefill in the leader's warning form
- Tests: `python tests/test_owner_warning_rules.py` from `backend/` (isolated SQLite)
