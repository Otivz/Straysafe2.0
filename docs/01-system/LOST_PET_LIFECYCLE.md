# Lost Pet lifecycle (end to end)

Status: **Current**. Written 2026-11-11 from the code in `backend/app/services/lost_pet_lifecycle.py`, `backend/app/routes/lost_pet_alerts.py` and the Resident and Leader interfaces. Supersedes the "Leader publishes the notice" and "Spotted here" parts of [LOST_PET_SIGHTING_PING.md](LOST_PET_SIGHTING_PING.md), which keeps the map, timeline and privacy background. Registration-first filing (a Lost Pet report is about the resident's own registered pet) is in [PET_REGISTRATION_AND_MATCH_REVIEW.md](PET_REGISTRATION_AND_MATCH_REVIEW.md).

## What a Lost Pet report does now

```
resident files a Lost Pet report (own registered pet)
  └─ one transaction: validate ownership/eligibility → refuse a second active report for the pet → create the case + the pet snapshot
     → create AND publish the Community notice → mark the pet "Lost" → write the history lines → notify
        (nothing for the Leader to approve or acknowledge; a retried filing returns the first report)

neighbours see a compact notice ──┬─ "I saw this pet"                  → an ordinary SIGHTING (tells the owner; nothing else)
                                  └─ "I may have this pet safely with me" → a POSSIBLE RECOVERY (a lead for the owner and the Leader)
                                        └─ a CONVERSATION between the owner and that neighbour
                                             ├─ direct messages, only when BOTH agreed (private, in the app)
                                             └─ Subdivision Leader mediation, when EITHER asks (no reason) → the Leader gets a request

the search ends in exactly one of these ways
  ├─ the owner confirms "My pet is home" in the app ──┐   the same operation:
  ├─ the Leader records the owner's phone / in-person ─┘   record the confirmation → resolve the notice → close the case → pet Active → finish conversations/follow-ups → tell people
  └─ anything else (withdrawn, merged, no further sightings, ...) keeps its own reason and never says "recovered"
```

## Rules the code enforces

### Publication (one transaction)
- `POST /reports/` for a Lost Pet report calls `lost_pet_lifecycle.publish_lost_pet_notice` just before the commit, so the case, the pet snapshot, the notice, the pet's "Lost" state, the history lines and the notifications are made together or not at all (`test_lost_pet_lifecycle.py` checks the rollback).
- `ReportCreate.client_request_id` is the retry key (stored on `reports.client_request_id`, lost reports only). The same key from the same person returns the report already filed; a different key for a pet that already has an active report is refused (409 `LOST_REPORT_EXISTS`). The Resident app sends one key per unchanged draft.
- `case_policy.publication_mode` is `immediate` for a missing pet whatever an older stored setting says; `GET /cases/categories` reports `lost_pet: "immediate"`; the Leader's settings page shows "Published at once, always." Found-animal notices keep the request-and-review flow and the subdivision's publication setting.
- A Leader can still publish a notice for an older Lost Pet report that has none (`POST /lost-pet-alerts/reports/{id}/request`); that is the only manual publication left for lost pets.

### Community
- `GET /lost-pet-alerts/community/summary`: the newest 4 of each kind and the totals. `GET /lost-pet-alerts/active?alert_type=&q=&species=&limit=&offset=`: searched (name, breed, kind, colour, last-seen place), filtered (dog / cat / other) and paged **on the server** (limit at most 50, newest first by `activated_at`, then id). The Resident overview shows the four newest and "View all (N)"; the directory reads 20 at a time with "Show more".
- Only active notices are listed. A private complaint is never a notice. Every free-text field a notice shows passes through `utils/public_text.py`: phone numbers, e-mail addresses and house/lot numbers are refused when written (`require_public_text`) and masked when older text is shown (`redact_public_text`).

### Sightings and possible recoveries (`lost_pet_sightings.sighting_type`)
| | Ordinary sighting (`seen`) | Possible recovery (`secured`) |
|---|---|---|
| Who may write it | any resident of the subdivision, including the owner on behalf of someone | a neighbour only (never the owner) |
| Who sees it | owner and Leader; neighbours see a generalized area (~110 m) and "A neighbor" | the owner, the Leader and its writer only |
| Writer's name | Leader: full name. Owner and neighbours: "A neighbor" | Leader: full name. Owner: first name only. Others: never shown |
| Private care note ("where it is now") | none | owner, Leader, writer |
| Notification | owner (`lost_pet_sighting`) | owner (`lost_pet_secured`) |
| Opens a conversation, Leader task, or recovery | **no** | opens a conversation; **never** a recovery |
| Appears in case activity | yes ("A neighbor reported seeing the pet ...") | yes |

The Leader marks either kind verified or dismissed with a note; who did it and when are kept (`reviewed_by`, `reviewed_at`) and shown beside the report. An observation entered on someone else's behalf retains its `on_behalf` provenance after refresh. A dismissed observation remains in history but is not the latest credible lead.

### How the owner and the neighbour get in touch (`lost_pet_coordinations`, `lost_pet_coordination_messages`)
One conversation per possible recovery. `mode` is `none` (nobody agreed), `direct` (both agreed) or `leader` (either asked the Leader).
- Message submissions carry a stable `client_request_id`: a retry by the same sender in the same conversation returns the original message, without another notification; conflicting reuse is refused. Message contents are not copied into notification previews.
- Direct messaging opens only when **both** `owner_consent` and `finder_consent` are true; the server refuses a message otherwise (409). Messages are private text (1000 characters), readable only by the two parties, also after the conversation ended. The Leader cannot read them (404). Phone numbers and addresses are never shared by the system.
- Either party can ask the Leader to help with **no reason** (`POST /coordinations/{id}/mediation`). That sets `mode = leader`, closes direct messaging, tells the other party, tells the Leaders once (`lost_pet_leader`, whose `related_id` is the *report*), moves the case to "In progress", and shows the requester that it was requested. Asking again reuses the request.
- The Leader sees both people and their phone numbers **only** once mediation was requested. The contact work is recorded with the existing contact log ("Record owner coordination") and follow-ups ("Schedule next step"); "Mark as finished" resolves the request with a note. Finishing a request never marks the pet recovered.

### Barangay assistance (existing referral infrastructure)
- A referral can be written down without contacting anyone: `ReferralIn.contacted = false` saves it as status `to_contact` ("Not contacted yet") with no contact method. It becomes contact only when the Leader records an attempt (`ReferralUpdateIn.contact_method / contact_person / contact_detail`, a status, what happened, the next action). "Tried, no answer" (`no_response`) is a recorded attempt.
- A `to_contact` referral is a task on the Leader dashboard until the attempt is recorded. "Handed off" closure needs a referral that is not `to_contact`.
- There are no Barangay accounts or roles; guards are not default responders.

### Recovery: exactly two paths, one operation (`confirm_recovery`)
- `POST /lost-pet-alerts/{id}/recovered`: the **owner** says "My pet is home" (the Resident app asks for an explicit confirmation first). `POST /lost-pet-alerts/{id}/record-recovery`: the **Subdivision Leader** records that the owner confirmed by phone or in person (`source` is `phone` or `in_person`; `confirmed_at` is when the owner said so; the Leader's own account is recorded as the recorder). `POST /reports/{id}/confirm-reunited` delegates to the same operation for a lost pet (staff are refused). A Leader cannot declare a recovery alone.
- In one transaction it: records `recovered_at`, `recovery_source`, `recovery_confirmed_by` (the owner), `recovery_recorded_by`, `recovery_recorded_at`, `recovery_note`; closes the notice as `recovered`; closes the case (disposition `pet_recovered`) with the neutral history line and the audit entry; puts the pet back to Active; finishes open conversations and cancels pending follow-ups; thanks the neighbours who reported (`lost_pet_recovered`) and tells the Leader (owner path) or the owner (Leader path).
- The pet, case and alert are locked and re-read before recovery; sightings and coordination use the same ordering where those records overlap. Authorization is checked before even an idempotent response. Asking again, from two devices or after a retry, returns `already: true` and changes and tells nothing. The Leader must belong to the notice's subdivision and respect its handler assignment. SQLite checks lock intent and replay behavior; actual MySQL concurrency remains unverified until exercised on an authorized disposable MySQL target.
- A sighting, a possible recovery, a Barangay update and the generic "Close case" never establish a recovery: `closure_outcome_for` never returns `recovered`; the generic closure refuses `pet_recovered` for a lost pet (409); the legacy `PUT /reports/{id}/status` 9 on a lost pet is refused (409).
- Other endings keep their own reason: `withdrawn_by_reporter` (set only by the owner's own withdrawal, `PATCH /reports/{id}/cancel`; a Leader is never offered it) closes the notice as `withdrawn`; a merge closes it as `merged`; "no further sightings", "unresolved" and "handed off" close it as `not_found`. In each case the pet is restored to Active unless another active lost report names it.

### Leader screens
- **Dashboard**: "Needs your attention" ranks urgent safety cases, then requests to help an owner and a neighbour, then a Barangay nobody has contacted, then overdue follow-ups. A missing-pet report is **not** a task for being new, and the "New reports" count excludes it; missing pets are listed separately ("Missing pets").
- **Missing-pet case** (`pages/case/LostPetOverview.tsx`): the registered pet and owner → where it was last seen (with the map) → possible recoveries and sightings (newest first, with review) → getting in touch → Barangay assistance → related reports; the History tab is the chronological record. The header's one action is "Record owner confirmation" (or "Reopen case"); there is no Start review, Mark in progress or manual status for a lost pet, and no "create notice". "Close without recovery…" is in the menu; its dialog disables "Missing pet recovered" and never offers "Withdrawn by the reporter".

## Notifications

| `type` | `related_id` is | Recipient | Opens |
|---|---|---|---|
| `lost_pet_alert` | the alert | residents / owner (notice live) | the notice |
| `lost_pet_sighting` | the alert | owner | the notice's sightings |
| `lost_pet_secured` | the alert | owner | the notice (possible recovery) |
| `lost_pet_coordination` | the alert | the other party | the notice (conversation) |
| `lost_pet_recovered` | the alert | neighbours who reported | the notice |
| `lost_pet_leader` | the **report** | Leaders | the case |

The Resident app routes every `lost_pet_*` type except `lost_pet_leader` to the notice (`/community/alert-{id}`), never to a report; the Leader app opens `lost_pet_leader` on the case.

## Data

Additive only (`backend/app/db_migrations/case_alignment.py`; canonical `Database3.4_subdivision.sql` / `.txt`, now 53 tables):
- `reports.client_request_id`.
- `lost_pet_alerts`: `recovered_at`, `recovery_source`, `recovery_confirmed_by`, `recovery_recorded_by`, `recovery_recorded_at`, `recovery_note` (+ two foreign keys to `users`).
- `lost_pet_sightings`: `sighting_type` (default `seen`), `on_behalf` (second-hand observation, default false), `care_note`.
- New tables `lost_pet_coordinations` and `lost_pet_coordination_messages`; the latter has a nullable unique message `client_request_id`. The additive migration also upgrades a preexisting partial message table without deleting messages.
- Referral status `to_contact` and disposition `withdrawn_by_reporter` are values in existing text columns (no schema change).

`run_case_alignment(strict=True)` runs when `app.main` is imported: it adds what is missing, one `ALTER` per table on MySQL, and never drops or rewrites. **It has not been run against the application database**. The definitions are prepared, and isolated tests use throwaway SQLite/fake MySQL only. Target-server schema compatibility and real MySQL concurrency have not been verified. Starting the configured backend would apply the migration; inspect the target schema and obtain database authorization before that startup. See [DATABASE_FILES_AND_MIGRATIONS.md](../05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md).

## Files

Backend: `services/lost_pet_lifecycle.py` (the rules), `routes/lost_pet_alerts.py`, `routes/reports.py` (filing, withdrawal, `confirm-reunited`), `utils/case_closure.py` (the central closure hook), `utils/public_text.py`, `services/case_lifecycle.py`, `services/case_work.py`, `services/case_view.py` (`lost_pet` block of `GET /cases/{id}`), `services/case_notes.py` (work queue `coordinations`), `utils/push_categories.py`.
Resident: `pages/community/{CommunityPage,NoticeDirectoryPage,NoticePage,LostNotice,SecuredPetPage,SightingPage,SightingHistoryPage}.tsx`, `components/CoordinationPanel.tsx`, `lib/useCoordinationMessages.ts`, `live/{api,adapters,actions,LiveDataProvider}.ts(x)`.
Leader: `pages/DashboardPage.tsx`, `pages/case/{CaseDetailPage,LostPetOverview,RelatedReportsBlock}.tsx`, `dialogs/{LostPetDialogs,CoordinationDialogs,ClosureDialogs}.tsx`, `data/selectors.ts`, `live/{api,adapters,actions}.ts`.

## Tests

`backend/tests/test_lost_pet_lifecycle.py` (publication, retry, atomicity, public text, ordinary sighting, possible recovery, consent and mediation, Barangay `to_contact`, both recovery paths, idempotency, authorization, non-recovery closures, Community search and paging, masking, dashboard), plus the updated registration-first, sighting-ping, lifecycle, status-sync, found-animal and migration tests. Frontend: `residentLiveAdapters`, `residentLostPetFlow`, `residentRegistration`, `adminLostPet` (Vite-loaded real modules, stubbed API). The browser journey `frontend/tests/liveInterfaces.browser.mjs` drives the real backend on a throwaway SQLite database through the whole flow.

## Decisions to confirm and known limits

- **Names**: an ordinary sighting's writer is shown only to the Leader; the owner sees a possible recovery's writer by first name (the writer is told so on the form). This replaces the earlier behaviour where the owner saw every reporter's full name while the app told reporters their name is never shown.
- **Messages** are text only, polled every 15 s while the screen is open; there is no push for them, no attachments, no retention or deletion policy yet (stakeholder decision needed), and no moderation: the Leader cannot read them by design.
- **Cross-subdivision**: a Leader acts only on their own subdivision's notices (the system Administrator on all); covered by the backend tests.
- **Barangay**: a referral records what the Leader did; whether the Barangay really acted is outside the system.
- The stored `publication.lost_pet` value is kept for compatibility and ignored.
