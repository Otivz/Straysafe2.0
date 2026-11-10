# Case workflow: backend and database

- **Status:** Current (backend only). The Leader app (`/subd-admin`) calls these endpoints; see [NEW_INTERFACES_INTEGRATION](NEW_INTERFACES_INTEGRATION.md).
- **Since:** 2026-11-09.
- **Code:** `backend/app/utils/case_vocab.py`, `case_state.py`, `case_status_sync.py`, `case_policy.py`; `backend/app/services/case_lifecycle.py`, `case_work.py`, `case_claims.py`, `case_view.py`; `backend/app/routes/cases.py`, `ownership_claims.py`; `backend/app/models/case_records.py`; `backend/app/db_migrations/case_alignment.py`. Changed existing code is listed in the [change record](../05-operations/agents/feature-updates/2026-11-09_0643_database-backend-alignment.md).
- **Tests** (`backend/tests/`): `test_case_alignment_migrations.py`, `test_case_status_sync.py`, `test_case_lifecycle.py`, `test_found_animal_claims.py`, `test_case_privacy_scope.py`, `test_case_analytics.py`.
- **Vocabulary source:** the approved Admin UI, `frontend/src/admin/data/constants.ts` and `types.ts`. The identifiers below are the same ones.

## Workflow

`REPORT -> ASSESS -> COORDINATE -> MONITOR -> DOCUMENT OUTCOME -> CLOSE`. Only four global statuses exist. Warnings, referrals, follow-ups, ownership claims and recovery are **case details** kept in their own records, never extra statuses. No step needs a registered animal (a Pet Record): a case can be assessed, referred, followed up, linked and closed without one.

## The four statuses and the legacy ladder

`reports.case_status` holds `reported`, `under_review`, `in_progress` or `closed`. The older 18-step ladder (`reports.current_status_id`) is **kept**: every legacy screen and route still reads and writes it. A flush hook (`case_status_sync.py`) keeps the two in step whichever one a code path changes, so nothing legacy was edited to follow the new status.

| Legacy status | Reads as |
|---|---|
| 1 Reported | reported |
| 2 Verified, 15 Disputed, 16 Under Investigation | under_review |
| 4 Referred to Barangay, 5 Rescue In Progress, 6 Picked Up, 7 Under Observation, 8 Impounded, 13 Approved | in_progress |
| 3 Rejected, 9 Claimed by Owner, 10 Released, 11 Incident Resolved, 12 Deceased, 14 False Alarm, 17 Animal Cannot Be Found, 18 Merged | closed |

- A legacy status change makes `case_status` follow it. A `case_status`-only change writes the matching legacy status (reported 1, under review 2, in progress 7, closed by disposition). Both changed and they disagree: the legacy status wins. A legacy status that already reads as the target is kept (a Referred case stays 4).
- `case_status = NULL` (a row older than the column) is read from the legacy status, so every read path (`case_state.case_status_of`) works before and after the data migration.
- The hook registers before the existing closure hook (`utils/case_closure.py`), so a closure made through any path still closes the rescue request, the neighbourhood alert and the owner observation exactly as before.
- A legacy path that leaves Closed clears the closure, counts a reopening and writes an audit entry (`CASE_REOPENED_LEGACY`).
- `verification_status` (legacy) and `incident_verification` (new) work the same way: a legacy write clears the newer decision so the legacy value reads through; the assessment writes both. A pet link sets `identity_status` (an inherited link nobody re-checked is only a possible match).

## Rules enforced on the server

All in `services/case_lifecycle.py`, applied to every endpoint below. A screen can only show what the server allows.

- **Who:** the Subdivision Leader of the report's subdivision, or the Administrator. When a case is assigned to an officer, only that officer (or the Administrator) updates it; an unassigned case can be worked by any leader of the subdivision. Residents and Barangay accounts get 403. A merged duplicate (status 18) cannot be worked on.
- **Moves by hand:** reported -> under_review or in_progress; under_review <-> in_progress. Nothing moves into or out of Closed by hand: closing and reopening have their own endpoints.
- **Recording work moves a case forward, never back, never out of Closed:** an assessment, a follow-up or a contact -> at least under_review; a referral or a warning -> at least in_progress.
- **Assessment** records incident verification (`not_reviewed`, `verified`, `partial`, `unverified`, `invalid`), evidence sufficiency, urgency (`not_assessed`, `immediate`, `possible`, `none`), animal identity (`unidentified`, `possible_match`, `identified`) and ownership (`unknown`, `claimed`, `under_review`, `confirmed`, `disputed`, `unconfirmed`). Only what is sent changes. Ownership can be `confirmed` only with a resident owner and at least one piece of evidence other than pet registration (registration is declared by the owner, so it is never the only basis).
- **Priority** is the UI's four levels. `urgent` is an assessed immediate risk on a High case, not a stored level: the stored `priority_level` enum is unchanged.
- **Closing** needs a disposition and a reason (5+ characters). Three groups, never assumed to be a resolution:

| Disposition | Outcome group | Legacy status written | Needs |
|---|---|---|---|
| `resolved_intervention` | resolved | 11 | nothing |
| `owner_compliance` | resolved | 11 | a complied observation or a resolved warning on the case |
| `pet_recovered` | resolved | 9 | a Lost Pet case |
| `handed_off` | unresolved | 17 | at least one referral on record |
| `no_further_sightings` | unresolved | 17 | nothing |
| `unresolved_other` | unresolved | 17 | nothing |
| `invalid_report` | invalid | 14 | nothing |
| `duplicate_report` | invalid | 14 | an active link to a related report |

- **Closing's side effects** are done once, in one transaction: pending case follow-ups end with the case (unless `end_open_items` is false), a post-closure check can be scheduled, and the central closure hook closes the rescue request, the neighbourhood alert (a found-animal notice too) and the owner observation. Referrals, warnings and claims are **not** changed: they are the case's history. The audit entry (`CASE_CLOSED`) keeps the reason and the open items left behind; the timeline gets a neutral line (the label, never the reason, because residents can read the timeline); the reporter is notified.
- **Reopening:** authorized staff (any leader of the subdivision, or the Administrator), with a reason; the case goes back to under_review, the closure is cleared, `reopened_count` goes up, and the audit entry (`CASE_REOPENED`) keeps the closure that was undone. Earlier referrals, warnings and the post-closure check stay.
- A closure made before this work (a legacy status with no stored disposition) is read from its legacy status and shown as derived (`derived_from_legacy_status`). It is never written back.

## Case details

- **Referrals** (`barangay_referrals`, name kept): any outside organisation (`barangay`, `animal_control`, `veterinary`, `animal_welfare`, `wildlife`, `other`), several per case, each with its own status (`sent`, `acknowledged`, `in_progress`, `completed`, `declined`, `no_response`). The organisation's outcome is recorded as what it reported and **never closes the case**; a date for what is left becomes a follow-up. An urgent safety referral does not wait for an assessment or an animal record. An open referral to the same organisation is not duplicated. The Barangay-only URLs (`/reports/{id}/referral`, `/referrals/...`) keep working on the same records (see [BARANGAY_REFERRAL_LOG.md](BARANGAY_REFERRAL_LOG.md)).
- **Follow-ups** (`case_followups`): a thing to do or check, with a due date inside the subdivision's configured bounds (below). Done, cancelled (with a reason), or recorded as already done.
- **Contact logs** (`case_contact_logs`): who, how, what came of it. A denial of ownership is recorded as a dispute of ownership (unless ownership was confirmed with evidence); it does not close the case.
- **Links** (`case_links`): two reports about the same thing, in the same subdivision. Nothing is hidden or merged and each report keeps its own status. Unlinking keeps the row (who ended it and why). The pair can be linked again later.
- **Found-animal notice, sightings and ownership claims:** see below.

## Found animals, notices and claims

- A found-animal notice is a **neighbourhood alert of type `found_animal`** (`lost_pet_alerts.alert_type`; every earlier row is `lost_pet`). It reuses the alert's request, review, publish, sighting and closure machinery ([LOST_PET_SIGHTING_PING.md](LOST_PET_SIGHTING_PING.md)). It has no owner and no registered pet.
- **Submitting a report, reviewing it and publishing a notice are separate acts.** Filing never publishes (every report starts Private). A resident's request for a notice waits for the Leader unless the subdivision's publication policy says `immediate` for that kind of notice. A sensitive report, a nuisance and a safety concern are never published at once, and a sensitive report can never be a notice at all.
- Neighbours see the animal's looks and the **area** of the last-seen place and of each sighting (3 decimals of a degree, about 110 m), not the pin, and never the distinguishing marks or the finder's own words (they are how the real owner proves ownership). The Leader and the Administrator see everything; a lost pet's owner keeps the exact pin.
- **Ownership claims** (`ownership_claims`): made by a resident of the subdivision on a **published** notice, one open claim per resident, never by the person who reported the animal. The Subdivision Admin reviews (`under_review`, `needs_info`, `accepted`, `rejected`); the claimant is told. **A claim, accepted or not, never establishes ownership.** Accepting one leaves the case reading `under_review`; two open claims read `disputed`; ownership is confirmed only by the separate decision with evidence in the assessment. A claim cannot be made on a closed case.

## Warnings and policies

An owner warning (`POST /warnings/`) is refused on the server unless **all** of these hold (the same order the Admin screen explains it):

1. the case is open;
2. its concern is one an owner can be warned for (Animal Nuisance or Animal Safety Concern, including the older categories read as those);
3. the owner was **confirmed** with evidence, and the warning goes to that owner;
4. the incident was **verified**;
5. a **confirmed** subdivision policy covers the concern (`policy_id` is optional when exactly one applies, required when several do).

The warning records the policy it was issued under. The observation period is the **policy's**: a policy without one starts no observation and no number of days is assumed (the hard-coded 3 days are gone). The system never works out a fine: `fine_amount` is what the issuer typed, 0 otherwise. A referral no longer blocks a warning (only the retired Barangay rescue workflow does). Warnings issued before policies existed are kept as they were; they read with empty policy fields, and their observation is read as the 3 days that applied then.

**A subdivision with no confirmed policy cannot issue warnings.** Configure and confirm at least one under `PUT /cases/settings/{subdivision_id}` first.

## Subdivision settings

Held in the existing `system_settings` table, one JSON row per subdivision (`setting_key = 'case_settings:<subdivision_id>'`); no new table. Defaults when there is no row: every category on, no policies, follow-ups default to 7 days (minimum 0, maximum 90), and every notice is reviewed before it is published.

```json
{ "categories": {"lost_pet": true, "found_animal": true, "nuisance": true, "safety": true, "injured": true, "other": true},
  "policies": [{"id": "roam", "title": "...", "reference": "...", "summary": "", "applies_to": ["nuisance", "safety"],
                "observation_days": null, "status": "confirmed"}],
  "followups": {"default_days": 7, "min_days": 0, "max_days": 90},
  "publication": {"lost_pet": "review", "found_animal": "review"},
  "office": {"address": "", "phone": "", "email": "", "hours": ""} }
```

`office` is how residents reach the subdivision office (the resident Contact screen); it is empty until the Leader fills it in, and nothing is invented while it is.

A category the subdivision turned off is refused when a report is filed. The reporting coverage area (`coverage_settings`) is already checked on the server for a report's pin, and now for a notice's last-seen pin; sightings were already checked.

## Categories and animal types

Six categories: Lost Pet, Found / Unidentified Animal, Animal Nuisance, Animal Safety Concern, Injured / Distressed Animal, Other Animal Concern. The migration adds the missing ones by name and never changes an existing row. Older categories keep working and are read as one of the six: Injured -> injured; Aggressive and Rabies Risk -> safety; Roaming Animal -> nuisance; Rescue Needed -> injured; Lost Pet -> lost pet.

Animal types: Dog, Cat, Bird, Small mammal, Reptile, Livestock, Wildlife, Other (and the older Unknown). They can be given as an id (`small_mammal`) or a label. No pet registration is needed.

## Privacy and authorization

- **Staff reads are scoped.** `GET /reports/` (a Leader: their subdivision only, `403` for another's id; a Barangay account: its barangay), `GET /reports/{id}` (`404` outside scope), `GET /reports/admin-badge-counts` and `POST /reports/{id}/print-log` follow the same scope as the write routes. The Administrator sees all.
- **Another resident gets an allow-list**, not a redacted copy (`report_visibility.RESIDENT_SAFE_FIELDS`): a field added to the report later stays private until it is added there on purpose. Never the reporter, the owner (only the label "Registered Owner", or the contact an owner published on their own lost-pet report), the handler, the internal assessment, referrals, warnings, claims, observations or AI risk findings. Every pin (the report's, the original, the pickup and the timeline's) is rounded to the area. The reporter, the pet's owner and staff keep the exact pin. A public report is still open to any resident (existing rule, unchanged).
- **Sensitive complaints** (`reports.is_sensitive`; "Animal Nuisance" by default, or chosen by the reporter, or set in the assessment) can never be made public. The rule is enforced in the single writer of visibility (`set_visibility`), so no route can bypass it, and marking a public report sensitive makes it private again.
- Nothing internal is ever written to the timeline (`status_history`), which residents can read: it gets neutral lines only. The detail goes to the audit log.

## Endpoints

Staff, Leader of the subdivision or Administrator (`routes/cases.py`):

| Method and path | What it does |
|---|---|
| `GET /cases/{id}` | The whole case: status, assessment, identity, ownership, closure, referrals, follow-ups, contacts, warnings, claims, links, open items, allowed moves, warning eligibility |
| `POST /cases/{id}/status` | A manual move |
| `PUT /cases/{id}/assessment`, `PUT /cases/{id}/priority` | Record the assessment; change the priority |
| `GET /cases/{id}/closure-options`, `POST /cases/{id}/close`, `POST /cases/{id}/reopen` | Dispositions and whether each is available; close; reopen |
| `GET/POST /cases/{id}/referrals`, `POST /cases/{id}/referrals/{rid}/updates` | Referrals to any organisation |
| `GET/POST /cases/{id}/followups`, `POST .../{fid}/complete`, `POST .../{fid}/cancel` | Follow-ups |
| `GET/POST /cases/{id}/contacts` | Contact logs |
| `GET/POST /cases/{id}/links`, `POST .../{lid}/unlink` | Links between related reports |
| `GET /cases/{id}/warning-eligibility` | What a warning needs, and the first thing missing |
| `GET /cases/{id}/claims`, `POST /cases/{id}/claims/{cid}/review` | Ownership claims |
| `GET/PUT /cases/settings/{subdivision_id}` | Subdivision settings and policies |
| `GET /cases/categories` | The six categories with the stored id a report is filed with and whether the subdivision accepts each; the subdivision's name and city, its office contact details and its publication policy (any signed-in user, own subdivision). `stored_categories` lists every category row with the kind of concern it is read as (`category_id`, `family`), because a report keeps the category it was filed under: an older report is Injured, Aggressive, Rabies Risk, Roaming Animal or Rescue Needed, which the server reads as injured, safety, safety, nuisance and injured |
| `GET /cases/summaries?limit&offset&status` | One short row per case (newest first, paged, at most 200 a page): what the Admin list, dashboard and map load first. `status` is `open`, `reported`, `under_review`, `in_progress` or `closed`, read the way `case_state` reads a case (an older row with no `case_status` included) |
| `GET /cases/work-queue` | The open follow-ups, ownership claims, referrals and warnings of the open cases, so the dashboard needs no per-case request |
| `GET/POST /cases/{id}/notes` | Internal staff notes (`CASE_NOTE` rows of the audit log: no new table, never on the resident-visible timeline) |
| `POST /cases/{id}/warnings/{wid}/observations` | A compliance observation on a warning (`WARNING_OBSERVATION` audit rows). `conclude: "compliant"` marks the warning Resolved (which is what the `owner_compliance` closure rule reads) and ends the legacy observation as `complied` **without** resolving the case; `"non_compliant"` ends it as `closed`. Either way the warning's end-of-observation follow-up is completed and one neutral line is added to the timeline. The case closes only through `POST /cases/{id}/close` |

Residents: `POST /reports/{id}/ownership-claims`, `GET /reports/{id}/ownership-claims/mine`, `GET /ownership-claims/mine` (every claim they made, across cases), `POST /ownership-claims/{id}/info` (the claimant answers "more information needed": the answer is added to their statement, dated, and the claim goes back under review; only a claim in `needs_info` takes it) and `POST /ownership-claims/{id}/withdraw`. `GET /reports/?mine=true` lists only the reports the signed-in person filed (the resident scope still applies on top). A report as its reporter, its pet's owner or staff read it carries `case_outcome` (`{label, outcome, closed_at}`, the neutral wording of how a closed case ended, never the officer's reason); other residents never get it (it is not in `RESIDENT_SAFE_FIELDS`). `GET /lost-pet-alerts/mine` lists a resident's own notices in every state, `GET /lost-pet-alerts/all` the Leader's notices in every state. Notices: `POST /lost-pet-alerts/reports/{id}/request` with `"alert_type": "found_animal"`, then `POST /lost-pet-alerts/{id}/activate`. Analytics: `GET /analytics/subdivision` and `/analytics/admin` gain a `case_lifecycle` block ([ANALYTICS_RULES.md](ANALYTICS_RULES.md)).

## Database

Tables and columns are listed in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) and `Database3.4_subdivision.sql`. Summary: 27 columns on `reports`, 11 on `barangay_referrals` (+ `barangay_id` may be empty, and the one-referral-per-report unique key replaced by a plain index), `status_after` on `barangay_referral_updates`, 5 on `owner_warnings`, `alert_type` on `lost_pet_alerts`, four new tables, five category rows. The migration is `backend/app/db_migrations/case_alignment.py`, called from `main.py` after the older `ensure_*` functions. It is idempotent, never drops or rewrites existing data, fills the new columns only where they are still empty, batches the column additions into one statement per table (MySQL 8 keeps only 64 instant additions per table), and does not stop at one failing step: the others run, the failed step is tried once more, and the schema is then verified. A missing table or column the models read makes `main.py` refuse to start (`CaseAlignmentError`, naming what is missing); a lesser gap (an index, a foreign key, the wider ENUM, the old unique key, a category) starts with one ERROR line per gap saying what it costs. Steps SQLite cannot do (ENUM widening, the unique-key drop, nullability, foreign keys) are MySQL only. See [DATABASE_FILES_AND_MIGRATIONS.md](../05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md) for how to run, check and roll it back, and for the tests that must not be run against the application database.

## Not done, on purpose

- The new Admin and Resident interfaces are connected to these endpoints (see [NEW_INTERFACES_INTEGRATION.md](NEW_INTERFACES_INTEGRATION.md)); they are still not the production default, and the legacy portals are unchanged.
- Notices for lost and found animals reuse the neighbourhood alert; there is no separate "notice" table. The `safety_advisory` notice type of the Admin interface is an announcement (category Animal Advisory or Emergency), which has a title, a text and photos but no case and no location.
- A closure made before this work has no date unless a legacy path stamped `closed_at`, so it is not counted as "closed in a period" in the new analytics block.
- Residents can still open a public report of another subdivision (existing rule).
