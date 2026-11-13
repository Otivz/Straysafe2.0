# Lost and found possible matches

- **Status:** Current (2026-11-12). Built after the developer approved the Leader Lost & Found workflow design and said "proceed".
- **Scope:** Lost Pet reports and Found / Unidentified Animal reports only. No other category is touched.
- **Source of truth:** `backend/app/services/lost_found_matching.py`, `backend/app/routes/lost_found.py`, `backend/app/models/lost_found_match.py`; on the Leader's side `frontend/src/admin/` (the files are listed at the end).
- **Not applied to a database by hand.** The new table is created by `Base.metadata.create_all` at the next backend start, like the earlier Lost Pet tables. Nothing here was run against the configured database.

## What it does, in one paragraph

A missing-pet report and a found-animal report of the same subdivision may describe the same animal. The moment either one is filed, whichever comes first, the system compares what the two reports **say** (kind of animal, colours, size, distinguishing features, collar, how far apart the places are, how long after it was last seen the animal was found) and writes a **possible match**. It tells **only the Subdivision Leader**. Nothing is linked and no resident hears anything until a Leader **confirms** the match. Confirming links the two reports (nothing is merged or hidden), tells both residents, and gives the owner and the finder the way to get in touch that already exists for a possible recovery. A link is never ownership and never a recovery: only the owner's confirmation records a recovery ([LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md)).

## Rules

| Rule | Where it is enforced |
|---|---|
| A match is made in **both directions**: filing a found report checks the open lost reports, filing a lost report checks the open found reports. | `suggest_for_report`, called after the filing commits (`routes/reports.py`) |
| The check **never blocks filing**: if it fails, the report is still filed and a later scan finds the match. | `suggest_after_filing` (catches everything, rolls back its own work) |
| Only **open** reports of the **same subdivision** are compared; a duplicate report is skipped. | `suggest_for_report` |
| The **kind of animal is a hard rule**: a dog is never suggested for a cat (the other kinds count as "other"; an unknown kind is not a conflict). | `compare` |
| A pair is suggested **once**: ruled-out pairs stay on record and are never suggested again. A found report that is already linked is not suggested for another lost report. | `seen_pairs`, `_linked_found_ids` |
| Matching reads **words, never photos**. | `facts_of` |
| Only a Leader of that subdivision (or the Administrator) can see or decide a match; a resident and Barangay staff get nothing from these routes. | `routes/lost_found.py`, `match_for_leader` |
| **Confirm** needs a waiting match whose two reports are both open and whose found report is not already linked to another lost report. | `decide` |
| A found report links to **one** lost report. When it is confirmed for one, its other waiting suggestions become `moot` (with a staff note on the other lost report). | `decide` |
| A lost report can have **several** confirmed found reports, each confirmed on its own. | `decide` |
| **Rule out** keeps the match, tells nobody, and can be **reviewed again** (back to waiting) while both reports are open. | `decide` |
| Both reports and their histories stay as they are. The link is a `case_links` row of type `same_animal`; the timeline of each report gets one neutral line. | `case_work.link_reports`, `LP.history_line` |
| Staff-only notes (why it was suggested, what the Leader decided) go to the audit log as `CASE_NOTE`, never to the timeline a resident reads. | `_note` |
| Every decision is audited (`LOST_FOUND_MATCH_CONFIRMED`, `LOST_FOUND_MATCH_REJECTED`). | `decide` |

## The score

Weights are **defaults, not policy**; they are constants in `compare` and are meant to be tuned once real reports exist.

| What is compared | Points |
|---|---|
| Kind of animal | different kinds: excluded. Same: +15 |
| Colours | same +25 · mostly the same +15 · some in common +6 · different −20 |
| Size | same +5 · one step apart +2 · very different −10 |
| Distinguishing features (white chest, tabby stripes, odd eyes, notched ear, white paw, white-tipped tail, floppy ears, short tail) | +12 for each one both reports mention (at most +30) · none in common −5 |
| Collar or tag | same +8 · different −4 (collars come off) |
| Distance between the two places | ≤150 m +15 · ≤400 m +10 · ≤800 m +5 · over 1,500 m −10 |
| Time | found 0 to 72 h after last seen +12 · up to 7 days +6 · more than 3 weeks −5 · found more than 12 h **before** it was last seen −40 |

**Strong** is 70 or more, **possible** is 40 to 69, below 40 is not suggested. Each match keeps the score and the sentences that spoke in favour ("Same colours: white and golden", "Both have a white chest", "Very close: about 25 m apart"). The comparison the Leader reads is recomputed from the reports when it is opened.

## Who is told what

| Moment | Who | What |
|---|---|---|
| A match is suggested | the Subdivision Leader(s) | `lost_found_review`: "Possible lost and found match to review"; it opens the report that was just filed. No resident, ever, at this point. |
| A Leader confirms or manually links the pair | both residents (`lost_found_bridge`, related ID is the thread) | The owner and the finder get one new 1-to-1 communication bridge. Both residents see it in Home attention. It never copies an existing private conversation or establishes recovery. |
| A Leader removes the link | both residents (`lost_found_unlinked`, related ID is the thread) | The existing bridge closes and remains readable to its two resident participants. A later relink creates a fresh bridge. |
| A Leader rules a match out | nobody | |

Notifications carry **no names, phone numbers or addresses**. The finder's own words and distinguishing marks are not copied into the conversation: they are how the real owner proves the animal is theirs.

## Data

One new table, `lost_found_matches` (see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)): the pair (unique on `lost_report_id` + `found_report_id`), `score`, `level`, `reasons`, `status` (`pending`, `confirmed`, `rejected`, `moot`), who decided and when, and what a confirmation created (`link_id`, `coordination_id`). The suggestions are **not** a status of the case: no case status changes.

## API (Leader only)

| Route | Purpose |
|---|---|
| `GET /lost-found/matches` | The subdivision's matches, waiting ones first (strongest first), then the decided ones. `?status=`, `?report_id=`. Each side carries the report's photo, colours, place and the reporter. |
| `GET /lost-found/matches/{id}` | One match with the side-by-side comparison rows and the reasons in favour. |
| `POST /lost-found/matches/{id}/decision` | `{"decision": "confirm" \| "reject" \| "reopen"}`. Answers with the match as it now stands. |
| `POST /lost-found/scan` | Checks the subdivision's open reports for matches (older reports have none yet). The Administrator names the subdivision. |
| `GET /cases/work-queue` | Also lists `possible_matches` (waiting, both reports open). |

## What the Leader sees (`frontend/src/admin/`)

- **Dashboard.** "Possible matches to review (n)" above "Needs your attention": one row per match (both animals, strong or possible, why, "Review match"), and a line in the greeting. "Missing and found animals" lists both kinds. A missing pet or a found animal is **not** counted as "a new report waiting for review".
- **The comparison.** One dialog from the dashboard or from either report: both reports side by side (photo, owner or finder, their words), why they may match, a row-by-row table, and one decision: **Same animal: link them**, **Not the same animal**, or **Decide later**. It states what a link does and does not do. A ruled-out match opens with **Review again**.
- **A missing-pet or found-animal report is one calm page** (2026-11-12, after the developer's review of the first version, which had five competing buttons, four tabs and a bright "Record owner confirmation" on a report that was only being monitored). No tabs, no status or priority to set, no toolbar. From top to bottom:
  1. **One status**, said once: "Under monitoring" (the resting state), "Needs you · n" while something needs the Leader, "Resolved" or "Closed".
  2. **The animal and what happened**, with who to talk to beside it: the photo, the name, what it looks like, when and where it was last seen or found in the reporter's own words (the map is one tap away), and the owner (or the finder) with a phone number and an e-mail that can be tapped. Nothing here is a task.
  3. **The one place that says whether anything is asked of the Leader.** Calm: "Nothing needs you right now" and the situation in a line (sightings, related reports, Barangay, neighbours notified, next check). Otherwise "Needs you": a short list, each item with the one button that deals with it, the strong colour only on the first. When it is dealt with, the report is back to being monitored.
  4. **Only what exists**: sightings, linked reports (and the ones ruled out), help from the Barangay, and, for a found animal, "Who does it belong to?" behind one line.
  5. **One activity list that writes itself**: what the system and the residents did, and what the Leader did through the page (a contact, a follow-up finished, linking two reports, asking the Barangay). Nothing is typed in by hand: there is no "add a note" on these two kinds of report. And **"Resolve this report"** behind one line.
- **What needs the Leader**, most pressing first (`frontend/src/admin/data/monitored.ts`, `needsYou`): the owner and a neighbour asked for help getting in touch; a neighbour says they may have the pet; a possible match (strong before possible); a claim on a found animal; a follow-up that is due; a Barangay call that was only written down; a Barangay that has been silent for three days. A call that was just made, or just went unanswered, is not asked about again at once. The possible-recovery record the system makes when a Leader links two reports is never listed as a sighting or asked about as a lead (`LINK_RECORD_NOTE` mirrors the wording the server writes; change both together).
- **Occasional actions sit where they belong**, not in a toolbar: contacting a person is beside that person ("Contact the owner", "Contact the reporter" or "Contact the finder"); asking the Barangay is beside "Barangay not asked"; creating a neighbour notice for a found animal is beside "No neighbour notice"; the owner's confirmation that the pet is home, and closing without a recovery, are under "Resolve this report". Only the owner's confirmation records a recovery: a Leader records what the owner told them.
- **Ask the Barangay** is one predefined choice (six kinds of help) and an optional note, with "Already contacted them?" starting at "Not yet". A referral that is only written down says nobody was contacted and is asked about on the page until the Leader records the attempt.
- **Contact the owner / reporter / finder** opens a real case conversation. Merely opening it records a neutral event, never a claim that contact succeeded. Sending a Leader message automatically records the actual contact and Activity; no separate log form is needed. Existing phone/in-person contact records and other case categories retain their history.

## Messages and the bridge

All conversations are strictly **person-to-person (1-to-1)**; there are no 3-way group chats:

1. **Subdivision Leader ↔ Resident (`direct`, 1-to-1):** The top "Who to contact" section opens **Contact the owner**, **Contact the reporter**, or **Contact the finder** (including for any linked report's finder or owner). It targets the incident's original account, never a later registry owner, and creates or reuses a 1-to-1 conversation containing only that resident and the authorized Subdivision Leader. The Subdivision Leader can always contact the reporter/owner/finder of any open report individually. Every message sent by the Subdivision Leader automatically writes to that report's Activity (`CaseContactLog` with `method="message"` and `StatusHistory`).
2. **Owner ↔ Finder (`bridge`, 1-to-1 resident-to-resident):** A confirmed Lost/Found pair (either from a suggested match decision or linked manually) immediately opens a **1-to-1 communication bridge** strictly between the original owner and the finder (`["owner", "finder"]`). The Subdivision Leader is not a member of the resident-to-resident bridge and does not read or send messages in it. Both residents see the unread/new conversation in **Home -> Needs your attention**, ahead of the ordinary capped reminders, and can reopen it from their own report and recent conversations. No general inbox or new main navigation destination is added.

- The resident route is `/resident-app/conversations/{thread_id}`. `GET /case-messages` supplies participant-authorized summaries; `GET /case-messages/{id}` supplies that 1-to-1 conversation's messages. Sending uses `POST /case-messages/{id}/messages` with a stable `client_request_id`; reading uses `/read` with the last displayed message ID.
- A resident sees only their own conversations, minimal first names/roles and their own report link. No phone, email, address, old private transcript or other report evidence is added by the system. The bridge explicitly lists its two resident participants before a message is sent. Independently submitted secured-pet leads retain their separate mutual-consent workflow.
- Leader messages write their contact log, Activity and audit in the same transaction on the target report. Opening, linking and unlinking write neutral events automatically; a read receipt is not misrepresented as successful contact.
- Message retries reuse the saved message without duplicate Activity or notifications. Writes re-check current authorization and closed state under locks. Mark-read acknowledges only the displayed snapshot, preserving a newer message as unread.
- **Automatic closure when a case/report closes or is unlinked:** Unlink closes the resident-to-resident bridge, not the underlying reports. Whenever a case/report is closed (by owner in-app recovery confirmation, Leader recording owner recovery confirmation, generic case closure, reporter withdrawal, or status transition), every open conversation involving that report—both Subdivision Leader-to-resident (`direct`) and resident-to-resident (`bridge`)—is automatically closed in the database (`status = "closed"`, `can_reply = false`, with a closing system message). Earlier messages remain read-only to their authorized participants. Re-linking makes a fresh bridge; it never silently reopens or copies the old conversation.
- New assistance is **Barangay only**, enforced by the backend and derived from the report's subdivision. The UI offers no alternate organisation. Historical referrals to other organisations remain visible as records; they are not rewritten or offered as new assistance.

Three tables (`case_message_threads`, `case_message_members`, `case_messages`) join the `lost_found_matches` table in the additive startup schema checks. Canonical SQL/TXT snapshots contain the same 57 model tables. No migration or configured-backend startup was executed for this continuation; SQLite/fake-MySQL tests do not verify real MySQL concurrency.

## Left alone on purpose

The legacy AI matching (`report_matches`, `routes/matches.py`) is separate and untouched: it notifies owners when it suggests, which would break "nothing is told until a Leader confirms". The recovery process, the case statuses and the lifecycle are unchanged.

## Decisions to confirm (defaults were used)

1. **Undoing a confirmed link is implemented.** Unlink synchronizes the case association and match, ends the group conversation, keeps messages and records the action on both reports. The people are notified; no recovery is inferred.
2. **A found report whose lost report was recovered** stays open and monitored; the Leader closes it. The finder is told the pet is home through the possible-recovery conversation, but the found report is not closed for them.
3. **How a report that never matches ends** (closure wording, after how long).
4. **Two owners for one found animal**: a found report links to one lost report.
5. **Photos** are not used in matching.
6. **Scoring weights, the two thresholds and the wording** are illustrative.
7. **Linking by hand is implemented.** The monitored page offers "Link a report". An eligible Lost/Found pair uses `same_animal` and the same canonical linking operation as a match decision; it opens the bridge immediately. Other categories keep their existing association behavior.
8. **Size** comes from the report only. A registered pet's size is not used (its default is "Medium", which would be a guess).
9. **A missing pet's identity decision** ("the team confirmed this is the pet") was part of the Assessment tab and is not on the page: the owner reports their own registered pet. Say if a lighter way to record it is wanted.
10. **The server status of a found animal stays `reported`**; "Under monitoring" is what the screens say. The Cases list's "Reported" filter still counts them.

## Tests

| Suite | What it proves |
|---|---|
| `backend/tests/test_lost_found_matching.py` (62 checks) | both directions and either filing order; kind of animal; strong and possible; nothing told before a decision; confirm, rule out, review again; moot; several found reports per lost report; closed reports; the failure of the check never blocks filing; scans; permissions and subdivision scope; the work queue |
| `frontend/tests/adminLostFound.test.mjs` | the adapter, which matches are waiting, a report seen from either side, "monitored from the start", what deciding sends |
| `frontend/tests/adminMonitoredCase.test.mjs` (13 tests) | the page's logic: nothing is asked of a report just filed; what needs the Leader and in which order; the system's link record is never a lead; a Barangay is asked about only after days of silence; the situation line and its actions; the animal, the people and the activity |
| `frontend/tests/liveLostFound.browser.mjs` | the whole path in a real browser on the real backend (throwaway database): suggested, nobody told, the dashboard, the comparison, rule out and review again, confirm; the calm page of a missing pet and of a found animal (no tabs, no toolbar, one strong button at most, one status); the Barangay choice; each item dealt with from where it is asked, and the report back to being monitored; 1-to-1 Leader contact and 1-to-1 resident-to-resident bridge; mobile and desktop widths |

## Files

Backend: `backend/app/models/lost_found_match.py`, `backend/app/services/lost_found_matching.py`, `backend/app/routes/lost_found.py`, `backend/app/main.py`, `backend/app/models/__init__.py`, `backend/app/routes/reports.py` (the check after filing), `backend/app/services/case_notes.py` (work queue), `backend/app/utils/push_categories.py`, `backend/tests/e2e_server.py`.

Leader app: `frontend/src/admin/live/api.ts`, `live/adapters.ts`, `live/actions.ts`, `live/LiveDataProvider.tsx`, `data/types.ts`, `data/actions.ts`, `data/context.ts`, `data/selectors.ts`, `components/MatchParts.tsx`, `components/Badge.tsx`, `dialogs/MatchDialogs.tsx`, `dialogs/ActionDialogs.tsx`, `dialogs/CoordinationDialogs.tsx`, `dialogs/ReviewDialogs.tsx`, `pages/DashboardPage.tsx`, `pages/CasesPage.tsx`, `pages/PetDetailsPage.tsx`, `data/monitored.ts`, `pages/case/CaseDetailPage.tsx`, `pages/case/MonitoredCasePage.tsx`, `pages/case/monitored/Hero.tsx`, `Lane.tsx`, `Sections.tsx`, `Activity.tsx`, `pages/case/AssessmentTab.tsx`, `pages/case/CaseDialogs.tsx`, `pages/case/dialogState.ts`, `layout/AdminLayout.tsx`, `styles/pages.css`.
