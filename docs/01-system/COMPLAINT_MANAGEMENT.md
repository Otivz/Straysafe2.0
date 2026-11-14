# Complaint management and progressive enforcement

Status: **Current** (2026-11-13). Built from the developer's brief "StraySafe 2.0 — Complaint Management & Progressive Enforcement"
(2026-11-13) and the approved mockup ([COMPLAINT_MANAGEMENT_MOCKUP_2026-11-13.html](../03-development/implementation-reports/COMPLAINT_MANAGEMENT_MOCKUP_2026-11-13.html)).

## What it is

An animal complaint (a resident's "Animal complaint", the `nuisance` concern) stays an ordinary case: it is listed under Cases, has
its history, can be closed and reopened. Complaint management adds, on top of that one case:

- the **complainant's optional suggestion of the owner** (name, house or general address, other details), shown to the Leader as
  "Reported / Suspected Owner — Unverified": a lead, never a finding, never counted, shown only to the reporter and staff;
- three **findings by the Subdivision Leader**: whether it happened (the case's incident verification), which confirmed rule it
  broke, and who is responsible ("Verified Responsible Person — Confirmed by Leader", with evidence; a resident with an account or a
  household recorded by name and house address; a registered pet is never required);
- the **offense count per person and per rule**, suggested by StraySafe and confirmed by the Leader;
- the **enforcement steps** the subdivision's policy asks for, recorded as they really happen.

Screens: the Leader's **Complaints** page (sidebar), each complaint's page (opened from Cases or Complaints), a person's history, and
two optional fields on the rules in Settings. On the Resident side: two optional parts of the complaint form, the "Whose animal" and
"Looked like" rows, a photo reminder on "Review and submit", and a "Verified" line on the complainant's report.

## Counting

An offense counts only when all of these hold: the incident was verified; a confirmed rule (a subdivision policy that applies to
animal complaints) was chosen; a person was confirmed as responsible with evidence (a registered pet profile alone is not enough).

- **Number** = 1 + the person's earlier counted offenses under the **same rule**, by when they happened, inside the rule's optional
  counting window. Different rules are counted separately. StraySafe suggests the number; the Leader confirms it, or records why the
  incident should not count. A suggestion that changed in the meantime is refused ("The history changed").
- **Same occurrence:** when a later complaint was seen within 6 hours and 150 m of an earlier one (or on the same street, without
  pins), StraySafe asks the Leader before anything is counted. "Same occurrence" closes the later complaint as a duplicate and links
  it to the earlier one (counted once there; its reporter hears the outcome when the earlier one closes). "Separate incident" is
  remembered. These are suggestion thresholds, not policy.
- **Corrections:** a different person after a decision is a correction with a reason. The decision is voided (kept, no longer
  counted), what was done stays recorded, a closed complaint reopens. Confirmed numbers are never renumbered; a person page flags an
  offense whose place in the history moved.

## Steps (from the subdivision's policy)

| Offense | Steps |
|---|---|
| 1st | First warning letter, delivered |
| 2nd | Second warning letter (it sets the summons date and place), delivered; summons to the subdivision office: attended, did not attend, or asked for another date (then a new date) |
| 3rd | Fine (the amount is read from the confirmed rule; without one it cannot be imposed): imposed, then paid; meeting at the Barangay with the complainant, the person responsible and the Leader: arranged (also written in the case's Barangay referral log), then held or not, with attendance and outcome |
| 4th and later | None defined: an open question for the subdivision |

Letters: prepared (printed from the Leader app; the letter never names the complainant), issued for delivery (who delivers it),
delivered (when, received by, how known) or not delivered (why). Every attempt is kept; printing is never delivering. Attendance can
be recorded only after the letter that tells them the date was delivered. StraySafe records that a fine was paid; it takes no
payments and keeps no receipts. Every change is an append-only event with who recorded it.

## Owner leads

When confirming who is responsible, StraySafe looks in its own records: residents and recorded households whose name or Block/Lot
matches the complainant's suggestion; registered pets of the same kind whose colour (and size) fits the description, owners on the
same street first; earlier complaints at the same place and who was confirmed then. The complainant, the leads ruled out on this
complaint ("Not this one", with an optional reason) and, when correcting, the current person are left out. "Not identified yet" saves
what was checked. Leads are never proof.

## Privacy

The complaint stays private. The complainant's timeline gets only "Complaint verified", "Complaint could not be verified" and "Action
is being taken under the subdivision's rules"; letters, the summons, the fine and the meeting are staff-only. The suggestion of the
owner is returned only to its reporter and staff (blanked for a linked pet's owner and anyone else). A person's history is the
Leader's only.

## Data and API

Migration (additive, run once): [`backend/migrations/2026-11-13_complaint_management.sql`](../../backend/migrations/2026-11-13_complaint_management.sql);
the backend refuses to start until it is applied (`app/db_migrations/complaint_management.py`). Tables: `complaint_respondents`,
`complaint_findings`, `complaint_offenses`, `enforcement_steps`, `enforcement_step_events`; `reports` gains `seen_at` and
`suspected_owner_name/address/details`. Rules gain the optional `fine_amount` and `count_window_days` (case settings, no migration).
Code: `backend/app/routes/complaints.py`, `app/services/complaints.py`, `app/utils/complaint_rules.py`, `app/schemas/complaint.py`;
Leader `frontend/src/admin/complaints/` and `pages/complaints/`; Resident `pages/report/DetailsPage.tsx`, `ReviewPage.tsx`,
`pages/reports/ReportDetailsPage.tsx`.

| Endpoint | Purpose |
|---|---|
| `GET /complaints` | every complaint's findings, decision and steps; the people responsible |
| `GET /complaints/{id}`, `/leads`, `GET /complaints/people/{id}` | one complaint; owner leads; one person's history |
| `POST /complaints/{id}/verify`, `/responsible`, `/offense`, `/same-occurrence`, `/steps/{step_id}` | the Leader's findings, decision, duplicates and steps |

Reads: the Subdivision Leader (own subdivision) and the Administrator. Writes: the Subdivision Leader handling the case.

## Tests

`backend/tests/test_complaint_management.py` (67 checks: counting per person and rule, unverified and suggestion-only never count,
same occurrence counted once, stale numbers refused, the steps' order, fines without an amount refused, corrections, ruled-out leads,
leads, privacy, scope). Frontend unit tests: `frontend/tests/*.test.mjs`.

## Known limits and open questions

- The older warning endpoint (`POST /warnings/`, [OWNER_WARNING_RULES.md](OWNER_WARNING_RULES.md)) still accepts animal complaints, for
  older records and the observation flows; the Leader app no longer offers "Issue warning" on them. Retiring it on the server is a
  separate decision.
- Letter wording is StraySafe's neutral default (rule title, reference and summary; subdivision and Leader names) until the
  subdivision confirms its own.
- Open stakeholder questions (never guessed): the rules and their references, fine amounts and who may fine, expiry, notice before
  escalation, 4th offenses, person vs household, delivery proof, summons no-shows, how fines are told and paid, the complainant's
  consent to the Barangay meeting, an in-app copy for the person responsible, dangerous-animal reports, paper records, appeals.
