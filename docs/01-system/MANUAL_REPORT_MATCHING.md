# Manual Report Matching

How staff search, compare and decide whether a report matches another report or a registered pet, without Gemini AI. Manual Matching is always available and is the active mode whenever Gemini is disabled, not configured or failing. Disabling Gemini never blocks report submission, filtering, candidate retrieval, staff verification or saving decisions.

## Who can use it

| Role | Page | Reports in scope |
| --- | --- | --- |
| Subdivision Leader (2) | `/subd/manual-matching` | Own subdivision's reports and registered pets |
| Barangay Staff (3) | Retired portal; no matching page | Legacy API compatibility only when the retirement switch is explicitly enabled |
| Admin (4) | API only | All |

Leaders can open it from **Match with reports** / **Check registered pets** on the Subdivision report view. These open `/subd/manual-matching?report=ID` (add `&kind=pet` for pets) with that report selected. The unused Barangay matching page and its wording-only scope prop were removed during cleanup Phase 3; every `/brgy/*` URL still opens retirement information. Owner confirmation and server-side scope checks are unchanged.

Residents get `403`. Role-3 sessions are refused by default. The following cross-subdivision rules describe retained API compatibility: deciding a pair follows the same rules as AI suggestions (`app/utils/case_review.py`): a pair across two subdivisions is decided by Barangay staff or an Admin, and a Barangay staff member can decide a subdivision's pair only when the barangay handles that report or the subdivision has no active leader.

## Data scope

The server enforces the scope in SQL in `backend/app/utils/matching_scope.py`. The active workspace describes subdivision records only. The Barangay scope rules below remain backend compatibility rules, not an active portal: role-3 access is blocked unless the legacy switch is explicitly enabled.

**Barangay Staff: reports** (search, report-to-report candidates, source reports, pairs, decisions). The pool covers reports in their barangay that are one of:
- **Barangay-managed:** the case, or a report merged into it, has a Barangay-handled status (4, 5, 6, 7, 8, 13), a rescue, an endorsement letter, an escalation in its status history (4 or 13) or a holding intake.
- **A published Lost Pet report:** category 6, made Public by the Leader (or verified), and not rejected, dismissed or merged. This includes reports filed by subdivision residents, because the owner published them.

Internal subdivision records that were never endorsed or escalated, and Lost Pet reports kept Private, are left out. Opening one, using it as a source, pairing it or deciding on it returns `403`.

**Barangay Staff: registered pets** (pet candidates, pet detail, `match-pair`, `pet-confirmations`, pet decisions). The pool covers pets that are one of:
- owned by a resident of the barangay who lives outside any subdivision;
- registered by a Barangay staff member of that barangay;
- tied to a Barangay-managed case in the barangay, as the case's linked pet or through a claim on it. This is the formally endorsed or transferred route.

The private subdivision pet registry is never searched. A pet outside the pool returns `403` on detail, `match-pair`, Send Confirmation and decisions, and no match row is created.

**Subdivision Leaders:** reports in their subdivision, as before. Pets whose owner lives in their subdivision, plus ownerless community pets registered by someone from their subdivision. Pets from other subdivisions or barangays are no longer listed and return `403`.

**Admins:** everything.

Within these pools the owner-first confirmation workflow is unchanged. When Barangay staff send a confirmation for an endorsed or Barangay pet, the owner gets the confirmation card and the chat message. The final verification stays with staff.

The Barangay page shows the scope in a banner. When no pet matches, it shows: "No matching Barangay-registered or endorsed pets found. Private subdivision pet registries are protected and only appear here once formally endorsed to the Barangay."

## AI status

`GET /manual-matching/status` returns `state`, `ai_available`, `manual_mode_active` and `reason`, from `gemini_status()` in `app/utils/ai_suggestions.py`:

| State | Meaning |
| --- | --- |
| `disabled` | The Admin turned Gemini OFF (`system_settings.gemini_vision_matching`) |
| `not_configured` | No `GEMINI_API_KEY` on the server |
| `error` | The latest real Gemini request failed within the last 15 minutes and none has succeeded since |
| `operational` | None of the above |

The `error` state is kept in memory per server process. It resets on restart and is not shared between workers. When Gemini is operational, the existing AI matching workflow runs unchanged and the page shows an "AI matching active" banner. Otherwise it shows **AI Disabled · Manual Matching Mode**.

## Filtering

`GET /manual-matching/reports` and `GET /manual-matching/reports/{id}/candidates` accept:

| Filter | Source |
| --- | --- |
| `report_type` = `lost` / `stray` | `category_id` 6 (Lost Pet) or any other category |
| `animal_type` = `Dog` / `Cat` | `reports.animal_type` |
| `breed`, `color` | Text contained in the reporter's value or the photo-analysis value (`ai_possible_breed`, `ai_dominant_color`) |
| `gender` = `Male` / `Female` | Reports have no sex field. The value comes from `holding_animals.sex` or the linked pet's `pets.gender` |
| `location` | Text in the landmark, the original landmark or the subdivision name |
| `features` | Up to 6 words, each found in the description, condition, coat pattern or color |
| `date_from`, `date_to` | `reports.created_at` |
| `radius_km` (≤ 50) with `lat`, `lng` | A bounding box in SQL, then an exact haversine check. For candidates the center defaults to the source report's location |
| `include_closed` | Off by default: excludes closed or resolved statuses and reports already merged under another case |

Every query goes through SQLAlchemy with bound parameters. LIKE wildcards in user text are escaped. Results are newest first and are never ranked by similarity.

## Results and comparison

Each card shows the report ID, report type, first photo, characteristics, location, date and time, current status and the reporter. Staff see the reporter's name and phone; Admins also see the email. A candidate card also shows the pair's current decision, the distance from the source report, and **shared details**: plain facts such as "Both dogs" or "Shares color: brown". These are not a score, and no AI confidence percentage is produced or shown. "Compare side by side" opens both reports with all their photos, the full description and an aligned attribute table.

## Registered pets

`GET /manual-matching/reports/{id}/pet-candidates` lists registered pets that could be the animal in a report. It uses the same pool as the AI scan: status Active, Lost, Found or Rescued; not merged into another pet; not impounded; and passing `is_pet_eligible_for_matching` (valid name and type, a usable photo, an active owner account). Only pets in the user's [data scope](#data-scope) are listed.

| Filter | Source |
| --- | --- |
| `animal_type` | `pets.pet_type` |
| `breed` | `pets.breed` |
| `color` | `color_markings`, `primary_color`, `secondary_color`, `tertiary_color` |
| `gender` | `pets.gender` |
| `features` | `distinctive_markings`, `color_markings`, `notes` |
| `location` | `registered_address` |
| `pet_status` | `Active`, `Lost`, `Found` or `Rescued` |
| `radius_km` | From the report to the pet's last-seen spot or registered home, whichever is closer. Pets with neither location are left out when a radius is set |

There is no date filter for pets. A report that is already linked to a pet, or whose case already is, gets no pet candidates and a `blocked_reason` instead.

Pet cards show the name, reference code, photo, characteristics, pet status, registered address, last-seen time and owner. Every staff member sees the owner's name, as on AI pet matches. The owner's phone is shown only when the owner lives in the staff member's area ("outside your area" otherwise); Admins also see the email. Pets outside the data scope are never listed or shown. The comparison puts the report and the pet record side by side on the same attribute rows.

### Manual comparison display

Whether a match is shown as **manual** or **AI** depends on the record's saved method, never on the current AI setting or the page that opened it. The method is `matching_mode`, set from `ai_evidence.engine` on every match response. Opening an AI suggestion from Manual Matching keeps it an AI record. `match-pair` no longer rewrites its method or score.

**Manual record of a report and a registered pet.** Staff (Potential Match Review), the owner on My Pets (confirmation request) and the owner on the match review page all see the same two cards, built by `ManualComparisonCards` with the rules in `frontend/src/utils/manualMatchFields.ts`. No AI analysis, generated description, score or conclusion is shown.

- **Stray Report**, as the reporter submitted it:
  - photo;
  - report ID;
  - animal type, breed, color and size;
  - distinguishing marks, from the reporter's own Markings and Pattern text;
  - original sighting location;
  - date and time reported;
  - report description (the reporter's notes);
  - observed condition;
  - custody as reported, report type and number of animals, when present.
- **Registered Pet**, as saved in the registration:
  - photo;
  - pet name and pet ID (with reference code);
  - animal type, breed, color and size;
  - distinguishing marks;
  - registered address;
  - owner's name;
  - pet description (the record's notes);
  - sex and age;
  - neutered status, when recorded.

A missing value shows **Not Provided**. AI-detected values (`ai_possible_breed`, `ai_dominant_color`, `ai_coat_pattern` and the rest) are never used to fill a gap. The owner's confirmation-request payload no longer sends the AI coat pattern.

An owner's answer never confirms a match. Staff review it and make the final decision.

**AI records** keep the AI Matching Analysis with the saved AI results. A manual report-to-report pair keeps its field table, without AI fallbacks.

### No AI wording or scores on manual records (2026-11-02)

A manual (staff-identified) record never shows AI terminology, an AI score or an AI-generated conclusion, wherever it appears:
- **Report match lists:** the badge "Staff-Identified Potential Match" (never "AI Suggested"), and "Staff-identified match" instead of a percentage.
- **Duplicate banner and merge dialog:** no "% AI match" and no AI note.
- **Direct match chat:** the method comes from the record, not from a score of 0.
- **Pet claims (Barangay, Subdivision, resident):**
  - "Staff-identified match" instead of the AI similarity;
  - no score verdict or automated comparison;
  - excluded from the AI score filter buckets and from the average score, with a "Staff-identified (manual)" filter;
  - the resident progress step says staff identified the match;
  - no AI metrics card.
- **Dispute history:** "Matching method: Staff-identified".

**Server side:**
- Claims, Manual Matching pairs and dispute history carry `matching_mode` and send no `similarity_score` / `match_score` for manual records. Older claims that saved a placeholder score are shown without it; nothing is rewritten.
- Manual records are stored with score 0 (Send Confirmation used to store 50) and neutral wording ("Staff-identified potential match (manual comparison)").

AI records keep their saved analysis and score.

### Owner confirmation first

Registered-pet matches in Manual Matching are **owner-first**. Staff never finalize a pet match before the registered owner explicitly says the reported animal is theirs, and an owner NO blocks that pet for the report.

```text
Potential Match
  → staff: Send Confirmation              → Awaiting Owner Confirmation
  → owner: "Yes, this is my pet"          → Owner Confirmed
      → staff final verification: Confirm Verified Match → Verified Match (report linked to the pet's record)
                                  Reject Match           → Rejected Match
                                  Request Further Verification → Needs Further Verification (final decision later)
  → owner: "No, this is not my pet"       → Owner Rejected (can't be confirmed; staff check another pet)
  → staff: Cancel request (unanswered only, reason required) → Cancelled (a new request may be sent)
```

**Staff (Send Confirmation).** `POST /manual-matching/pet-confirmations` with `report_id`, `pet_id` and an optional `message`. It requires the same review permission as any match decision. The report must be open and not already tied to a pet, the pet must be eligible and not impounded, and it must have an active registered owner. The request is saved as Awaiting Owner Confirmation, the owner gets a `pet_match_confirmation` notification, and the report's status history gets a note without the pet's or owner's name. Nothing is matched or linked yet.

Only one request per report and pet: a new one is refused while the latest is awaiting, owner-confirmed, needs further verification, owner-rejected or final. It is allowed only after a cancellation. `POST /manual-matching/pet-confirmations/{id}/cancel` withdraws an unanswered request. `GET /manual-matching/pet-confirmations?report_id=&pet_id=` returns the pair's full request history.

**Owner (My Pets).** `GET /pet-match-confirmations/mine` lists the owner's requests, pending first, then history. A request appears only while the user still owns the pet. Each shows the question "Is this the animal you registered as your pet?", the reported animal's photos, breed, color, features, location (landmark and subdivision only), date reported and description, next to the owner's own pet. No reporter details and no coordinates are included. `POST /pet-match-confirmations/{id}/respond` with `answer` `YES` or `NO` and an optional note. It is accepted only from the pet's current registered owner and only while the request is awaiting. Staff can't answer for the owner. The answer and its time are saved, and the staff member who sent the request and the report's assigned leader get a `pet_match_confirmation_result` notification. An answer never finalizes anything.

**Staff final verification.** `POST /manual-matching/decisions` with `pet_id` is refused (`409`) unless the latest request is Owner Confirmed or Needs Further Verification. The decision then goes through `verify_match`, which applies identity locks, closed cases, impounded pets, notifications and the audit log. It reuses the pair's existing `report_matches` row if the AI already made one. The owner's YES is carried onto the match, so **Confirm Verified Match** links the report to the pet's record at once. The final decision, staff member and time are stored on the request. `link_case` is not available for pets.

**No bypass.** `verify_match` itself calls `enforce_owner_first()` (`app/utils/pet_match_confirmation.py`). Once a request exists for a report and pet, `/matches/{id}/verify` and every other path refuse a final decision while the request is awaiting, refuse Confirm after an owner NO, and refuse a second final decision. Pairs with no request (or only a cancelled one) keep the existing AI pet-match flow unchanged. That flow is staff verification first, then the owner's confirmation before the link.

Pet merges move confirmation requests to the kept pet record. Push notifications for both new types use the pet-match category and open the same pages as the notification bell: My Pets for the owner, and the report's registered-pet candidates for staff.

## Decisions

`POST /manual-matching/decisions` with `report_a_id`, either `report_b_id` or `pet_id` (exactly one), `decision`, `notes` (5–2000 characters) and, for report pairs only, `link_case`.

| UI action | Stored decision |
| --- | --- |
| Confirm Match | `CONFIRMED_MATCH` |
| Reject Match | `NOT_A_MATCH` |
| Needs Further Verification | `UNABLE_TO_VERIFY` |

Rules:

- **Explicit confirmation.** The UI asks the staff member to review and confirm before saving. The decision is stored under their user ID and role.
- **One row per pair.** The pair's single `report_matches` row is reused in either order, including a row the AI created earlier. A new row has `similarity_score = 0` and `ai_evidence.engine = "manual"`, and existing match screens label it "Manual staff match" instead of a percentage. Repeating the pair's current decision returns `409` and creates nothing.
- **Append-only log.** Every decision adds a row to `manual_match_decisions` with both report IDs (or the report ID and `pet_id`), staff ID and role, timestamp, decision, previous status, notes, linked case and Gemini state. Rejected and changed decisions are never deleted. An `audit_logs` entry (`MANUAL_MATCH_DECISION`) and a status-history note on both reports are also written.
- **No automatic merge.** Confirming only records the match; both reports stay as they were. Linking both into one case happens only if the staff member ticks **Also link both reports into one case** (`link_case`). That runs the existing case merge (`confirm_report_match`): the later report becomes "Merged — Duplicate" under the earlier one, which Unmerge can reverse.
- **Reject** also closes other open AI suggestions between the same two cases (`reject_report_match`). It is refused for reports already merged together; unmerge them first.
- Pairs whose suggestion is covered or superseded by the case's decision return `409`.
- Reports are locked (`SELECT … FOR UPDATE`, lower ID first) while a decision is saved, so two reviewers cannot record the same pair at once.
- On a confirmed match, the reporter of each Lost Pet report in the pair is notified.
- A database error rolls back the whole decision, and the UI shows the server's message. The page then reloads candidates, results and history.

AI rescans keep human decisions: they only update or remove `AI_SUGGESTED` rows and skip pairs that already have a decision.

## History

`GET /manual-matching/history` (optional `report_id`, `pet_id` and `decision`) lists decisions newest first, with the pet's name for pet decisions. Leaders and staff see only decisions where the report, and the other report if there is one, are in their scope.

## Code and tests

- Backend: `backend/app/routes/manual_matching.py`, `backend/app/utils/matching_scope.py` (data scope), `backend/app/routes/pet_match_confirmations.py` (owner side), `backend/app/models/manual_match.py`, `backend/app/models/pet_match_confirmation.py`, `backend/app/utils/pet_match_confirmation.py` (owner-first rules), `gemini_status()` in `backend/app/utils/ai_suggestions.py`
- Frontend: `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`, `frontend/src/pages/Subd_Leaders/SubdManualMatching.tsx`; entry buttons in `SubdViewReport.tsx`; owner panel `frontend/src/components/PetMatchConfirmationRequests.tsx` on My Pets. The retained shared Potential Match Review modal opens from candidate cards. Phase 3 browser evidence: `frontend/tests/phase6to8.browser.mjs` (current review, pending/YES/NO gates, owner response and observation).
- Tests: `python tests/test_manual_matching.py` from `backend/` (isolated SQLite); `node --test frontend/tests/manualMatchFields.test.mjs`
- Table: `manual_match_decisions` is created at startup by `Base.metadata.create_all`. If an earlier version of the table already exists, `ensure_manual_match_pet_column()` in `main.py` adds `pet_id` and makes `report_b_id` nullable. `pet_match_confirmation_requests` (report, pet, owner, requesting staff and time, owner response and time, cancellation, final decision, staff and time, match) is also created by `create_all`. Rows are never deleted. All are non-destructive, with no manual migration step.
