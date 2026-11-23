# Possible Pet Owner Verification

Status: Current (2026-11-20). Backend: `backend/app/services/owner_verification.py`, `backend/app/routes/owner_verification.py`. Leader screen: `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`. Resident screen: `frontend/src/resident/pages/reports/OwnershipVerificationCard.tsx` in the conversation page. Tests: `backend/tests/test_owner_verification.py`.

When the Pet Registry matching points at a registered pet, the Subdivision Leader of the case can ask that pet's owner, through the existing case conversations, whether the reported animal is theirs. **A possible match never confirms ownership.** The owner must say the animal is theirs, and only the Leader (or the Administrator) verifies it afterwards. Neither a score nor a silence decides anything, and the registry's owner is never changed by this flow.

## Built on existing parts

No second messaging, matching or verification system was added:

| Need | Existing part reused |
| --- | --- |
| Possible owners | `report_matches` rows for registered pets, made by the Pet Registry matching (`routes/matches.py`, scored by [MULTI_ATTRIBUTE_MATCHING.md](MULTI_ATTRIBUTE_MATCHING.md)) or by a staff member (manual) |
| Verification record | The owner-first request `pet_match_confirmation_requests` ([MANUAL_REPORT_MATCHING.md](MANUAL_REPORT_MATCHING.md), "Owner confirmation first"), created with the same checks as Send Confirmation (`create_confirmation_request`) |
| Conversation | A `direct` case conversation (`case_message_threads`, [RESIDENT_MESSAGING.md](RESIDENT_MESSAGING.md)) tied to the report. The possible owner is a member in the role `pet_owner`, with no report of their own. It closes with the case, like every report conversation |
| Owner's answer | `POST /pet-match-confirmations/{id}/respond` (YES / NO with an optional note), or a reply in the conversation |
| Final verification | `POST /manual-matching/decisions` with `pet_id`, which goes through `verify_match` and is refused until the owner said YES (`enforce_owner_first`) |
| Notifications | The `notifications` table and push categories (`case_message`, `resident_message`, new type `owner_verification`) |

## Who can use it

- **Contact, follow up, mark unreachable, verify:** the Subdivision Leader of the report's subdivision, or the Administrator. On an assigned case, only the assigned officer can act. Residents get `403`.
- **Pets shown:** only pets inside the Leader's data scope (`utils/matching_scope.py`). A pet registered in another subdivision is never listed. A pet with no owner account is not a possible owner.
- **Reports:** every case except a Lost Pet report, which names its own owner. The Leader app does not show the section for wild animals.
- **The possible owner:** sees only their own conversation (it is not found for anyone else) and answers only their own request.

## Statuses

| Shown on the case | Request status underneath | Meaning |
| --- | --- | --- |
| Possible Owner Identified | no request, or `CANCELLED` | The matching found the pet. Nobody has been asked yet |
| Awaiting Owner Response | `AWAITING_OWNER_CONFIRMATION` | The owner was contacted. Follow-ups are allowed |
| Owner Confirmed – Pending Admin Review | `OWNER_CONFIRMED`, `NEEDS_FURTHER_VERIFICATION` | The owner selected Confirm Ownership. Supporting evidence only; the Leader decides |
| Owner Declined – Pending Admin Review | `OWNER_REJECTED` | The owner selected Decline Ownership. Supporting evidence only; the Leader still decides, and other possible owners can be contacted |
| Ownership Verified | `VERIFIED_MATCH` | The Leader verified it. The report is linked to the pet's record; the registered owner is unchanged |
| Ownership Not Verified | `REJECTED_MATCH` | The Leader decided it is not their pet. Other possible owners can still be contacted |

**The administrator has the final say (2026-11-20).** The owner's answer never decides ownership by itself. Either answer sets the case's ownership to `under_review`; a NO no longer closes the match as Not a Match. After either answer the Leader may record any final decision (Verify ownership, Not the owner, Needs more information).
| Unable to Contact | `UNABLE_TO_CONTACT` (new) | The Leader recorded that the owner could not be reached. It counts as neither a YES nor a NO, and the owner can be contacted again |

## The flow

1. **Possible Pet Owners section.**
   - **Where:** on the Overview tab of a case, and as a section of a found-animal page.
   - **For each possible owner:**
     - the resident's name;
     - the pet's name, reference, species, breed, colour and photo;
     - the registered address (or the subdivision);
     - the status, the request's details and the full verification history.
   - **Matching attributes:** each with its explanation. A score, classification and coverage appear only when the existing matcher produced them; a staff-identified (manual) match shows none.
   - **Who is listed and how they are ranked** (`services/owner_verification.py`, since 2026-11-22):
     - Every registered pet of the reported species in the report's subdivision is a candidate. A pet with a stored matcher result keeps that score; any other pet is scored live on breed (30), colour and coat (30), physical description (20) and location (15), normalized over what could be compared.
     - Location uses the distance to the owner's registered address, or a street or block named in the report (`Block`/`Blk`, street names of several words). No subdivision names or lot numbers are built in.
     - **Strong signals are bonuses, not weights,** added to either kind of score, and shown as a "Lost report & QR tag" row and at the top of the reasons:
       - the pet is marked **Lost**: +15, or +20 when its lost-pet report is within 14 days of this report;
       - someone scanned the pet's **QR tag and sent a found message** from 3 days before the report onward: +25, at least 90, and the pet is listed first.
     - The classification can only go up with a bonus (75+ Strong, 52+ Potential). A bonus never confirms ownership: the owner must still answer and the Leader must still verify.
2. **Contact Possible Owner.**
   - **The message:** the Leader edits the prefilled message, then sends it. The template is the agreed text; the subdivision name comes from the report.
   - **The conversation:** the server creates the request and opens the conversation (subject "Ownership verification: Report SS-…"). It starts with a system line describing the reported animal (type, breed, colour, size, subdivision, date), followed by the Leader's message.
   - **Direct link:** the Leader's message ends with a link to the verification page, `/resident-app/ownership/{request_id}`. A resent message never gets the link twice.
   - **Contact log and notification:** the message is logged as a contact in the case's activity. The owner gets one unread `ownership_verification` notification (related id = the request), which opens the verification page. It replaces the plain "new message" notification for the same conversation, so the owner is not notified twice.
   - **Repeats:** a repeated submission (same `client_request_id`) returns the same request. A second request for the same pet while one is pending or decided is refused.
3. **The owner's side.**
   - **What they see:** the verification page (and the same card at the top of the conversation) shows the reported animal's photos beside their own registered pet's photo, the species, breed, colour, size, sex and markings, the Leader's message, and **Confirm Ownership** / **Decline Ownership** with an optional note. After answering, they see their answer with its date and time, the status, and the history.
   - **What happens to the answer:** it is written into the conversation and recorded on the request. The Leader who asked (or the assigned officer) gets an `owner_verification` notification that opens the case.
   - **Plain replies:** they reach the Leader as an ordinary `resident_message`.
4. **No answer.**
   - **Follow-ups:** each is sent in the same conversation, counted (`follow_up_count`) and dated (`last_follow_up_at`), and the owner is notified.
   - **Unable to contact:** needs a reason. It ends the request without an answer.
   - **Contacting again:** creates a new request and continues the same conversation while it is still open. The earlier request stays in the history.
5. **Final verification.** After either answer, the Leader chooses **Verify ownership**, **Not the owner** or **Needs more information**, with notes. The decision goes through the existing `verify_match`. The owner is told in the conversation and by notification.

## History and audit

**History on the request.** `events` on each request is append-only. Each entry has the kind, the status after it, the time, who acted and a note. The kinds are:
- `identified`: when the matching found the pet, with the match;
- `requested`;
- `contacted`: the conversation and message;
- `follow_up`: with the attempt number;
- `owner_confirmed` / `owner_denied`: with the owner's note;
- `unable_to_contact`: with the reason;
- `cancelled`;
- `final_decision`: with the decision and the notes.

**Audit log.** The audit rows carry ids and statuses, never the message text:

| Action | When |
| --- | --- |
| `POSSIBLE_OWNER_IDENTIFIED` | Once per match, written at the first contact, with the time the matching found it |
| `POSSIBLE_OWNER_CONTACTED` | Contact, with the Leader, the message id and the time |
| `OWNER_VERIFICATION_FOLLOW_UP` | Each follow-up, with the attempt number and the time |
| `OWNER_VERIFICATION_RESPONSE` | The owner's answer |
| `OWNER_VERIFICATION_UNABLE_TO_CONTACT` | Unable to contact, with the reason |
| `OWNER_VERIFICATION_DECIDED` | The final decision, with the Leader responsible |

The existing `SEND_PET_MATCH_CONFIRMATION`, `OWNER_PET_MATCH_RESPONSE`, `MANUAL_MATCH_DECISION` and `VERIFY_AI_MATCH` rows are still written by the shared code. The conversation's messages are kept, and the case timeline gets neutral lines with no names, because residents can read it.

## Privacy

- **To the possible owner:** never the reporter's name, contact details, free-text description or condition, nor the exact pin. The system line and the answer card describe the animal only. The Leader appears as "Subdivision Leader".
- **To the Leader:** a possible owner's name and registered address, for pets in their own scope only. No phone or email is added by this section; the registered-pet panel keeps its own rules.
- **Push and lock-screen text:** never message contents (`utils/push_categories.py`).
- **The registry:** ownership is never transferred or edited here. Verifying links the report to the pet's record through the existing `verify_match`.

## API

| Method and path | Body | Who |
| --- | --- | --- |
| `GET /owner-verification/reports/{report_id}` | | Leader of the case, Administrator |
| `POST /owner-verification/reports/{report_id}/contact` | `pet_id`, `message` (1–2000), `client_request_id` | Assigned officer or Leader, Administrator |
| `POST /owner-verification/requests/{id}/follow-up` | `message`, `client_request_id` | Same |
| `POST /owner-verification/requests/{id}/unable-to-contact` | `note` (5–1000) | Same |
| `GET /pet-match-confirmations/{id}/verification` | | The pet's owner only (404 for anyone else) |
| `POST /pet-match-confirmations/{id}/respond` | `answer` YES/NO, `note` | The pet's owner |
| `POST /manual-matching/decisions` | `report_a_id`, `pet_id`, `decision`, `notes` | Leader, Administrator |

`GET /case-messages/{id}` now also returns `verification` for a verification conversation: the owner's question card, or the status for staff. It returns null for anyone else and for every other conversation.

## Schema

Four columns on `pet_match_confirmation_requests`: `thread_id` INT NULL, `follow_up_count` INT NOT NULL DEFAULT 0, `last_follow_up_at` DATETIME NULL, `events` JSON NULL.
- **How they are added:** at start-up by the case alignment step (`ensure_pet_match_confirmation_columns`), or by hand with `backend/migrations/2026-11-20_possible_owner_verification.sql`. Both are additive and idempotent.
- **New status:** `UNABLE_TO_CONTACT` fits the existing status column.
- **New member role:** `pet_owner` fits `case_message_members.role` (VARCHAR(10)).

## Limits

- Possible owners come from the matches that already exist for the report. If none exist yet, the section says so. A new registry scan is still the existing `POST /matches/scan/{report_id}`, which has no button in the Leader app.
- Requests sent from the retired Manual Matching screens (with the legacy chat) have no conversation, so they show their status and history without an "Open conversation" link.
- Timestamps in the request history use the application server's clock, like the rest of the owner-first request, while the conversation uses the database clock.
