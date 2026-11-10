# Barangay Referral log

- **Status:** Current (backend). The screens come in Phase 3 of the [Subdivision-only plan](../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md).
- **Since:** 2026-11-05. **Reworked 2026-11-09:** a case can have several referrals, to any outside organisation, and a reported outcome never closes the case (see [Any organisation](#any-organisation-2026-11-09) and [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md)).
- **Code:** `backend/app/models/barangay_referral.py`, `backend/app/schemas/barangay_referral.py`, `backend/app/routes/barangay_referrals.py`. Tests: `backend/tests/test_barangay_referrals.py`.

## Purpose

StraySafe serves the subdivision only. The Barangay is an external party with no StraySafe account. When a case needs the Barangay, the Subdivision Leader refers it, contacts the Barangay outside the system, and records here what the Barangay reports back. Everything recorded is labelled as reported by the Barangay and names the leader who recorded it, so it is never shown as something StraySafe did.

## Data

| Table | One row per | Main fields |
|---|---|---|
| `barangay_referrals` | referral (several per report) | the organisation (`org_type`, `org_name`; for a Barangay referral also `barangay_id`, the subdivision's own Barangay, San Vicente), referred by and when, reason, reference number, contact method (call, visit, message, letter, other) and contact person, urgency, its own status (`referral_status`), what the organisation reported (`external_outcome`, `remaining_follow_up`, `follow_up_at`), and the older Barangay outcome with its date, note, recorder and time |
| `barangay_referral_updates` | update | type (acknowledged, dispatched, picked up, held, impounded, claimed, adopted, not found, other), source (`barangay_reported` or `straysafe_user`), the date the Barangay reported it, note, evidence link (https), recorder and time |

Both tables are created by the backend at startup (`create_all`) and are listed in `Database3.4_subdivision.sql`.

## Endpoints

Only the Subdivision Leader of the report's subdivision and the Administrator. Residents and Barangay accounts get 403.

| Method and path | What it does |
|---|---|
| `GET /referrals/?open_only=` | Referrals the user may see, newest first |
| `GET /reports/{id}/referral` | The referral of one report, with its updates |
| `POST /reports/{id}/referral` | Refers the case to the Barangay. Statuses 1 and 2 move to 4 (Referred to Barangay) with a history entry; a case in any other open status keeps its status (and moves forward to In progress); an older status-4 case only gets its referral record. Keeps or writes the endorsement letter. No rescue request is created and no Barangay account is notified. The reporter is notified. **No registered animal and no earlier assessment is needed.** |
| `POST /referrals/{id}/updates` | Records one Barangay update |
| `POST /referrals/{id}/outcome` | Records what the Barangay reported happened and completes the referral. **It does not close or change the case.** |

## Rules

- A case can have several referrals. A second referral to the Barangay is refused only while an earlier one is still open (`409`). Merged reports (status 18) and closed cases cannot be referred; any other open case can. **No animal record (Pet Record) is needed**: an urgent safety referral can go first.
- An update never changes the report status, custody, the facility, the pin, or any holding record. A "held" or "impounded" update is only what the Barangay said; StraySafe never shows the animal as held (the location rule).
- Dates the Barangay reported cannot be in the future or before the referral.
- The final outcome (claimed, released, resolved, deceased, not found) is **recorded as reported and never applied**: the case keeps its status and stays open until the Subdivision Admin closes it with a documented disposition (`POST /cases/{id}/close`). It is accepted once per referral, and its timeline entry starts "Reported by Barangay San Vicente on <date>, recorded by <leader>", with the case's status as it was. (Until 2026-11-09 it closed the report with status 9, 10, 11, 12 or 17; reports closed that way keep those statuses.)
- An update from the Barangay moves the **referral** from `sent` to `in_progress`; the outcome completes it. The case is unaffected.
- No updates after the outcome.
- Every write adds an audit entry (`Create Barangay Referral`, `Record Barangay Update`, `Record Barangay Outcome`).
- The three endorsement letters and rescues that existed before are left as they are; a leader or the Administrator can open a referral record for an older status-4 case to log its updates.

## Any organisation (2026-11-09)

`GET/POST /cases/{id}/referrals` and `POST /cases/{id}/referrals/{rid}/updates` (Leader of the subdivision or Administrator) refer a case to **any outside organisation** (`barangay`, `animal_control`, `veterinary`, `animal_welfare`, `wildlife`, `other`) and record its updates. Each referral has its own status (`sent`, `acknowledged`, `in_progress`, `completed`, `declined`, `no_response`). The organisation finishing its part completes the referral and never closes the case; a date for what is left becomes a follow-up linked to the referral. An open referral to the same organisation is not duplicated. These routes create no endorsement letter and move the case to In progress (legacy status 7, not 4). Both families of routes write the same records. There are no new roles or portals for the organisations.

## Admin letter preview and print

The Admin report view uses the same referral-letter text for its on-screen excerpt, full preview and generated print document. Actual stored object/string letter content is preserved verbatim. Missing or whitespace-only content uses a neutral description of the external referral; it does not assert impounding, physical transfer, quarantine, a Barangay acknowledgement or digital certification.

The wrapper is labelled Barangay Referral Letter. Recorded-by attribution uses the stored letter leader name, or Not recorded when absent; an assigned case handler is not inferred to be the recorder. A stored letter issuance date is labelled Date Issued; otherwise the report creation date is labelled Report Date. This presentation does not create or modify referral, custody, letter or acknowledgement records.

## Current subdivision dashboard and earlier endorsements

The subdivision dashboard counts current status-4 referrals separately from legacy dispatch/approval statuses 5 and 13. It no longer fetches or promotes retired claims, holding or rescue-request queues, and its remaining shortcuts point to current reports/pet records. Referral counts do not establish physical custody.

The endorsement archive still opens current external-referral records and saved earlier rescue endorsements. Earlier assignment names, timestamps and recorded rescue status remain readable, labelled as historical. Opening an earlier record performs a read; its mission is not polled every five seconds and no Live/awaiting-dispatch claim is made. Timeline entries are built only from the report, saved endorsement date, actual recorded assignment and stored rescue status; a closed report does not invent a deployed team or a secured animal. Current referral updates remain labelled as reported by the Barangay and recorded by the Subdivision Leader.
