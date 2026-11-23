# QR tag scan moves the missing-pet case forward: plan

Status: **Phase 1 built (2026-11-23); phases 2 and 3 proposed** (2026-11-23; guest rules and the owner's third choice added the same day after the developer's "yes"). Extends [PET_QR_TAGS_PLAN_2026-11-17.md](PET_QR_TAGS_PLAN_2026-11-17.md) (all four phases are built). Nothing here has been coded.

## The idea in one line

When someone scans the tag of a pet that has an **open lost-pet notice** and sends a "found it" message, the case should react by itself: the Leader is told, the case shows real activity, and the owner can answer with one tap. A scan never *finishes* the case.

## What happens today (checked in `backend/app/services/pet_tags.py`, `record_found`)

- The finder's message is stored as a private `pet_tag_scans` row (`kind = found_report`) and the **owner is notified** (`pet_tag_found`).
- If the pet has an open lost-pet alert (status requested or active), the message is filed under that alert (`alert_id`) and listed on the Leader's case.
- It is **deliberately not turned into a sighting**: sightings are shown to neighbours, and a stranger's message is not.
- The pet moves to the top of the Possible Pet Owners list for a found-animal case.
- It does **not** change the case status, appear on the Dashboard, write a history line, or give the owner a one-tap answer.

## What would change

| # | Change                                                                                                                                                                                                                            | Result                                                                                                                                                                                                                                                               |
| - | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | **A history line on the case** when a message arrives: "Someone scanned Mochi's QR tag and left a message" (neutral wording, no finder details)                                                                             | The case's History shows the lead in order                                                                                                                                                                                                                           |
| 2 | **Lift the case to in progress** if it is still `reported` or `under_review`, **only for a signed-in resident's message**                                                                                         | The case reflects real activity. It never moves out of Closed and never goes backwards. A guest's message is a lead only (see Guests)                                                                                                                                |
| 3 | **A Dashboard attention item** "Tag message: Mochi", ordered with the requests for help                                                                                                                                     | The Leader sees it without opening the case; clears when the message is resolved                                                                                                                                                                                     |
| 4 | **The owner's "Found!" card** on the pet page and the lost notice, with the finder's place, note and photo, and three buttons: **"Yes, he's home"**, **"Not yet"** and **"This isn't real / not my pet"** | "Yes" runs the **existing** recovery (`POST /lost-pet-alerts/{id}/recovered`), which closes everything correctly. "Not yet" keeps the case open and adds a history line. "Not real" dismisses the message (it leaves the Dashboard) and changes nothing else |
| 5 | **Leader's "Record owner confirmation"** stays as it is, for an owner who answers by phone or in person                                                                                                                     | No new path to recovery                                                                                                                                                                                                                                              |

## Guests (someone who scans without signing in)

The same message, the same owner notification and the same three choices. The differences:

- **Labelled.** The Dashboard item, the case history and the owner's card say "Guest (not signed in)", so the owner knows it is unverified.
- **A lead only.** A guest's message writes the history line and the Dashboard item but does **not** lift the case's status. A signed-in resident's message does.
- **No photo** (unchanged: "Sign in to attach a photo").
- **No phone shared:** the owner's card says the finder left no way to reach them, since there is no in-app reply to a tag message.
- **Still allowed.** A stranger finding a pet is the most common real case (decision of 2026-11-18).

## Left for later

- **Live location** (following the finder as they move): not planned now (privacy, battery, little value). The finder's place stays one point they chose to share.
- **"Update where it is now"** from the finder: possible later; not in these phases.

## What it will not do (rules to keep)

- **No automatic recovery or closing.** A scan proves someone met the tag, not that they hold the pet. Recovery stays the owner's "My pet is home", or the Leader recording the owner's phone or in-person confirmation ([LOST_PET_LIFECYCLE.md](../01-system/LOST_PET_LIFECYCLE.md)).
- **No public sighting** is created from a message, so neighbours still see nothing about it.
- **No change to the pet's registered location or owner details.** The finder's text is a claim.
- **Nothing more than a lead for repeated or odd scans.** The existing limits stay (3 messages per hour per tag, contact details only in the phone box with consent).
- A scan of a pet with **no open lost notice** only notifies the owner, as today.

## Where it touches

- Backend: `services/pet_tags.py` (`record_found`: history line, status lift), `services/case_status` rules (move to at least in progress), the work queue used by the Dashboard (`services/case_notes.py` or the queue that feeds `attentionItems`).
- Leader app: `admin/data/selectors.ts` (`attentionItems`), the Dashboard card, `admin/components/PetTagBlocks.tsx` (already lists the messages).
- Resident app: the pet page and the lost notice (`resident/pages/pets/`), reusing the recovery call already used by "My pet is home".
- **No database change.** The scan row already carries `alert_id`, `status` and `created_at`.

## Phases

1. **Case reacts** (1, 2): history line and status lift (signed-in residents only), with backend tests.
2. **Leader sees it** (3): Dashboard item and its clearing when messages are resolved.
3. **Owner answers** (4): the "Found!" card with the three choices and the one-tap recovery.

Each phase can be stopped after, and phase 1 changes nothing a user can click.

## Decisions for the developer

1. ~~Should a message lift the case to in progress?~~ Decided 2026-11-23: yes for a signed-in resident's message; a guest's message is a lead only.
2. Should the Dashboard item appear for **every** message, or only the first per scan hour? (Recommended: every unresolved message, grouped by pet.)
3. Should the owner's "Not yet" be recorded and shown to the Leader? (Recommended: yes, as a history line.)
4. Is a **push** to the Leader wanted, or Dashboard only? (Recommended: Dashboard only at first; the owner is already pushed.)

## Checklist (progress)

Tick a line only when its test passes. Step-by-step manual checks for phase 1 are in [QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md](../04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md).

**Phase 1: the case reacts** (built 2026-11-23, backend tests pass)

- [X] A message on a pet with an open notice writes one neutral history line
- [X] A signed-in resident's message moves the case to at least in progress, never out of Closed, never backwards
- [X] A guest's message writes the history line, labelled as a guest, and does not change the status
- [X] A message on a closed case changes nothing on the case
- [X] Neighbours still see no sighting from a message
- [X] A message on a pet with no open notice changes nothing but the owner's notification (test added 2026-11-23)
- [X] Browser check (2026-11-23, throwaway database, 11/11): guest form, owner notified, the Leader's history line without details, status unchanged, the message listed on the case, a signed-in neighbour sent to the sighting buttons, nothing recovered or closed

**Finding from the browser check.** While a lost notice is **active**, a signed-in resident of the same subdivision never sees the message form: the tag page sends them to the existing **I saw this pet** and **I have it safely with me** flows. So in real use the message form, and with it this phase's status lift, is reached mostly by **guests** (history line only) and, less often, by a signed-in person while the notice is still *requested*, or by someone outside the subdivision. The lift works (backend tests), but it rarely fires from the app.

**Phase 2: the Leader sees it** (not built)

- [ ] The Dashboard shows "Tag message: <pet></pet>" grouped by pet, with a guest label where it applies
- [ ] The item clears when the messages are resolved
- [ ] Tests: backend queue, frontend Dashboard item

**Phase 3: the owner answers** (not built)	

- [ ] The owner's "Found!" card shows the place, note, photo and the guest label
- [ ] "Yes, he's home" runs the existing recovery and closes the notice, case and conversations
- [ ] "Not yet" changes nothing but a history line
- [ ] "This isn't real / not my pet" dismisses the message (off the Dashboard) and changes nothing else
- [ ] The finder's phone number is shown only with consent, as today
- [ ] A guest message with no phone says the finder cannot be reached
- [ ] Tests: backend (each choice, idempotent repeat), frontend (owner card)
