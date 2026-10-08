# StraySafe 2.0: Potential Matches and Duplicate Reports Audit

**Scope:** AI Potential Matches (Registered Pet Look-Alikes and Suspected Duplicate Sightings), the Merge Duplicates process, linking reports to pet records, and the owner's two-way confirmation.
**Basis:** Consultation priority #2 (Duplicate Protection) and section 4 (Human Intervention in Critical Decisions) of `Audit_IMplementation.md`.
**Status:** Remediation applied and tested (see sections 4 and 6). The remaining improvements are listed in section 5.

---

## 1. Summary

| Area | Before this audit | Now |
|---|---|---|
| AI only suggests, a human decides | ✅ Already true | ✅ Unchanged |
| Ongoing duplicates are merged into one case; a report after a resolved case is a new case | ✅ Already true | ✅ Unchanged |
| **One active case has only one registered pet** | ❌ Could be broken in 4 ways | ✅ Enforced on every path |
| Owner confirmation before a pet link | ⚠️ Could be skipped by direct linking | ✅ Required unless no owner exists |
| Unmerging restores the original state | ⚠️ The main case kept a pet it got from the duplicate | ✅ Inherited pet is released |
| Owner disagrees with "Not a Match" | ❌ Dead end, nobody could act | ✅ One re-review, then formal dispute |
| "Add Record" hidden once the case has a pet | ⚠️ Only checked the report itself | ✅ Checks the whole case |
| Report descriptions readable | ❌ Raw `Custody: … \| Pattern: … \| Notes: …` string | ✅ Labelled fields and separate notes |

---

## 2. How the process works

### 2.1 Key terms

- **Case:** one animal. It is the **first-filed report** (the main case) plus every report merged into it as a duplicate. Merged reports have `duplicate_of_report_id` set to the main case and status 18 (Merged – Duplicate).
- **Potential match:** a `report_matches` row created by the AI. It is one of two kinds:
  - **Registered Pet Look-Alike:** report ↔ registered pet (`matched_pet_id`).
  - **Suspected Duplicate Sighting:** report ↔ report (`matched_report_id`).
- **Case pet identity:** the registered pet a case is tied to. A case is tied to a pet when **either**:
  1. a report in the case is linked to the pet (`reports.pet_id`), **or**
  2. staff confirmed a look-alike match for that pet that the owner has **not** rejected (the owner's answer may still be pending).

### 2.2 How the AI creates suggestions (`matches.scan_and_generate_matches_for_report`)

| Step | Registered Pet Look-Alikes | Suspected Duplicates |
|---|---|---|
| Which reports are scanned | Active reports that are not resolved, not merged, and not impounded | Same |
| Candidates | Registered pets with status Active/Lost/Found/Rescued and the same species | Active reports of the same species within **±7 days**, within **1.5 km** or in the same subdivision |
| Excluded | Pets already decided by a human for this report. **All pets, if the case already has a pet identity** | Report pairs already decided (Not a Match covers the whole case) |
| Scoring | Rule-based score (free) on every candidate. Gemini Vision only on the 10 strongest (`VISION_CANDIDATES_PER_SCAN`) | Same |
| Saved if | Score ≥ **50** and the vision verdict is not "NOT A MATCH" or "LOW CONFIDENCE" | Score ≥ **65**, same vision condition |
| Rescan | Deletes only unreviewed AI suggestions. Human decisions and owner responses are kept | Same |

### 2.3 Human review: Registered Pet Look-Alike

```
AI suggestion ──► Staff decision ──► Owner confirmation ──► Linked to pet record
                  (Confirm / Not a       (Yes / No)              (both agreed)
                   Match / Unable)
```

- **Two-way rule:** a sighting is linked to the pet record only when **both** staff and the pet owner confirm. For a **community animal** (pet with no owner), staff confirmation alone links it.
- **Owner says "Not my pet":** the match is closed as Not a Match. Any staff-only link is removed and "Add New Record" becomes available.
- **Owner disputes a staff "Not a Match"** (new): the match goes back to *Pending Verification* **once**, with the owner's reason. Staff decide again, and that decision is final. After that, the owner can only file a formal dispute on the report.

### 2.4 Human review: Suspected Duplicate / Merge Duplicates

- Confirming a duplicate or using **Merge Duplicates** joins the **whole cases**, not just the two reports. The **first-filed** report stays the main case. Merges are all-or-nothing and need a written reason (at least 5 characters).
- **Not a Match** on a duplicate pair closes every open suggestion between the two cases, so the AI stops pairing them.
- A merge is refused when:
  - either case is closed or resolved (`MERGE_CLOSED_STATUSES = 3, 9, 10, 11, 12, 14, 18`);
  - it is outside the leader's subdivision, or another officer is handling the case;
  - the species or breed differs;
  - more than 25 reports are selected;
  - **the cases are tied to different registered pets** (new).
- **Unmerge** separates a report back into its own case and records the reason in both histories.

---

## 3. Rules and where they are enforced

| # | Rule | Enforced in |
|---|---|---|
| R1 | AI never decides. Every match, merge, and pet link needs a human with written notes | `matches.verify_match`, `reports._require_merge_notes` |
| R2 | The first-filed report is the main case. No chains of duplicates of duplicates | `reports._merge_group`, `reports._merge_one` |
| R3 | A report filed after its case is resolved is a **new case**. Closed cases can't be merged into | `MERGE_CLOSED_STATUSES`, scan filters |
| R4 | Not a Match applies to the whole case | `case_groups.reject_report_match` |
| R5 | **One active case = one registered pet identity** | `case_groups.case_pet_claims`, `pet_conflict_for_case`, `group_pet_conflict` |
| R6 | Once a case has a pet, other pets can't be confirmed (API refuses with 409) and the UI shows them as locked | `verify_match`, `match_identity_lock` → `identity_lock_reason` |
| R7 | Cases tied to different pets are **never merged automatically**. They are flagged as a pet identity conflict for human review | `confirm_report_match`, `_merge_group`, `preview_report_match` |
| R8 | A duplicate's confirmed pet becomes the case's pet when merged. Linking a duplicate also links the main case | `_merge_one`, `link_confirmed_pet_match` |
| R9 | Unmerging releases a pet the main case only got from that duplicate | `case_groups.release_inherited_pet` |
| R10 | A pet with an owner is linked only through the two-way look-alike flow. Direct linking is allowed only for: a community animal, the owner's own report, or a pet record the officer just created from the report | `case_groups.require_direct_pet_link` (used by `link-pet` and the status update) |
| R11 | The owner can dispute a staff Not a Match **once**. The second staff decision is final | `matches._reopen_for_owner_dispute`, `owner_dispute_count` |
| R12 | Subdivision Leaders act only within their subdivision and on cases they handle | `verify_subdivision_scope`, `require_review_permission` |
| R14 | A staff decision on a pet match can be reversed by the case handler with a reason, while the case is open. The owner's own rejection can't be overridden by staff | `matches.reverse_pet_match_decision` |
| R13 | Every decision is written to the report history, the pet history, and the audit log | `StatusHistory`, `PetHistory`, `log_activity` |

---

## 4. Findings and changes made

| # | Finding | Risk | Change | Files |
|---|---|---|---|---|
| F1 | The case check only looked at the linked pet. A staff confirmation waiting on the owner didn't count, so Pet A and then Pet B could both be confirmed | Two owners notified for one animal; wrong handover | Case identity now includes staff-confirmed matches the owner hasn't rejected | `utils/case_groups.py` |
| F2 | **Merge Duplicates** (`/reports/merge-group`, `/reports/{id}/merge`) had no pet check | Reports of two different pets merged | `_merge_group` refuses a pet identity conflict across the whole cases | `routes/reports.py` |
| F3 | `link-pet`, the status update with `pet_id`, and warnings could attach a second pet | Same as F1 | All three check the case identity first | `routes/reports.py`, `routes/warnings.py` |
| F4 | AI rescans kept suggesting other pets for a case that already had one | Noise; invites wrong confirmations | Scan skips pet look-alikes once the case has an identity | `routes/matches.py` |
| F5 | Direct linking set a pet without the owner's confirmation | Inconsistent with the two-way rule (defense risk) | Direct links limited to the R10 cases; everything else goes through the look-alike flow | `utils/case_groups.py` |
| F6 | Unmerge left the main case linked to a pet it only inherited | The main case keeps a wrong identity | Inherited pet is released, with a history note | `routes/reports.py` |
| F7 | Owner says "my pet" after staff said Not a Match: recorded but no one could act | Owner stuck; staff can't re-confirm | One-time reopen to Pending Verification, notification to the leader, final second decision | `routes/matches.py`, `models/report_match.py` (+ `owner_dispute_count` column, auto-migrated) |
| F8 | "Add Record for this Animal" showed when only another report in the case had the pet | Duplicate pet records created | Report API returns `case_pet_id`; the button shows "Case Already Identified as Pet #X" | `schemas/report.py`, `SubdViewReport.tsx`, `SubdReports.tsx`, `BrgyReportView.tsx` |
| F9 | Locked or conflicting suggestions looked actionable | Confusing review | 🔒 lock reason on cards; Confirm disabled with the reason in the review modal | `AIPotentialMatchesList.tsx`, `AIMatchReviewModal.tsx` |
| F10 | Report descriptions shown as one raw `Custody: … \| Pattern: … \| Notes: …` string | Notes mixed with structured data | Labelled fields plus "Reporter's notes" in detail views; notes-only summary in cards and lists | `ReportDescription.tsx`, `utils/reportDescription.ts`, about 20 pages |

### 4.1 Data correction applied

Report #27 (merged into Case #9) was confirmed as **two** pets before the fix: "No Name" (Pet #3, community record) and **Kippy** (Pet #4, owner-confirmed, claim approved, handover completed).

- **Match #39:** closed as Not a Match, with a correction note.
- **Report #27 and main case #9:** linked to **Kippy (Pet #4)**.
- **Records:** report history, Pet #3 history, and an audit log entry (`CORRECT_PET_IDENTITY`) were written.
- **Check:** a scan of all 10 cases found no other conflicts.

---

## 5. Remaining gaps and recommended improvements

### Priority 1: before the defense

| # | Gap | Recommendation |
|---|---|---|
| G1 | ~~A confirmed match can't be reversed from the UI~~ **Done.** | **Reverse Decision** in the review modal (`POST /matches/{id}/reverse`): only the officer handling the case or an Admin can do it, and a reason of at least 10 characters is required. Confirmed becomes Not a Match: the pet link is removed from the report, and from the main case if it only came from there, and the owner is notified. A staff Not a Match is reopened for review. Refused for an owner's own rejection, for duplicate pairs (use Unmerge), and for closed cases. Logged with old and new values (`REVERSE_AI_MATCH_DECISION`) |
| G2 | **The AI thresholds (50 / 65, 1.5 km, 7 days) are not validated** | Run a labelled test set: record true and false positives and negatives at each threshold and in low light, at other angles, with partial views and different breeds. Put the table in the paper (consultation priority #1) ✅ **Harness built; validation needs your labelled set.** `backend/scripts/evaluate_thresholds.py labels.csv [--vision] [--out results.md]` scores hand-labelled pairs (read-only). It reports the confusion matrix at 50 / 65, a threshold sweep (30–90), a breakdown per condition (low light, angle, partial view, breed) and true duplicates falling outside 1.5 km / 7 days. The thresholds are **not validated** until it is run on a real labelled set. |
| G3 | **Duplicate pet records** (e.g. Pet #3 "No Name" is likely Kippy) | Add Archive / Merge Pet Records for staff, so the AI stops suggesting the duplicate record ✅ **Done:** archiving already existed and the AI already skips archived pets. New **Merge Duplicate Record** (staff, pet detail panel): `POST /pets/{id}/merge-into` (`keep_pet_id`, reason required). Same species only, never across different owners. Reports, suggestions, claims, history, vaccinations, warnings, disputes, QR scans, owner confirmations, adoptions and returns move to the kept record. Empty fields on the kept record are filled, nothing is overwritten. The duplicate is archived with `merged_into_pet_id`, not deleted. A duplicate suggestion on a report that already has one for the kept record is closed. Cases are re-synced. Logged as `MERGE_PET_RECORD`. |
| G4 | The owner's plain "Yes, this is my pet" on a staff-rejected match reopens it **without a reason** | Require a reason, as the "Request a Second Review" box does ✅ **Done:** reopening a staff Not a Match now needs `second_review_reason` (at least 5 characters, the owner's own words). A plain Yes (or the automatic text sent with a claim) is refused with a pointer to Request a Second Review. |

### Priority 2: process quality

| # | Gap | Recommendation |
|---|---|---|
| G5 | Locked suggestions stay listed as open | Close them automatically as "Superseded by Pet #X" so the queue reflects real work ✅ **Done:** when a case is confirmed as a pet, open suggestions for other pets on its reports become `SUPERSEDED_BY_CASE`, pointing at the confirmation. They leave the queue, and deciding or answering them is refused with an explanation. They reopen automatically if the confirmation goes (unmerge, reversal). Live data: nothing to supersede. |
| G6 | `AddPetModal` creates the pet **before** `link-pet`. If the link is refused, an orphan pet record remains | Check eligibility first (`GET /reports/{id}` → `case_pet_id`), or create and link in one backend call ✅ **Done:** `POST /pets/?for_report_id=` checks the link first (handler, approval, review permission, case not already identified), then creates and links the pet in one transaction. A refused link leaves no pet record behind. |
| G7 | Duplicate detection is limited to the **same subdivision or within 1.5 km** | Allow duplicates across neighbouring subdivisions within the radius (escalated to the Barangay for review) ✅ **Done:** the search already crossed subdivision lines within 1.5 km. A pair across subdivisions is now the Barangay's to review: Barangay staff can decide or merge it without an escalation. Subdivision Leaders see "different subdivisions, the Barangay reviews this pair" instead of a generic 403. Barangay staff and both leaders are notified once. |
| G8 | The formal dispute (report counter-claim) is not linked to the match it disputes | Pre-fill the dispute from the match and show the match history to the Barangay reviewer ✅ **Done:** `report_disputes.match_id`. Filing from the owner's match links it and pre-fills the pet (or links that pet's match on the report). Reviewers (Subdivision and Barangay report views) see the match's AI score, staff decision, owner answer and the audit trail. Residents never receive the trail. |
| G9 | The `VERIFY_AI_MATCH` audit log stores the old **status** only | Also store the old and new `report.pet_id`, case id, and owner status (consultation section 11: Who, What, Which Record, When, Old Value, New Value) ✅ **Done:** `VERIFY_AI_MATCH` now stores, before and after: report, report pet link, case id, matched pet/report and the owner's confirmation status. |

### Priority 3: technical

| # | Gap | Recommendation |
|---|---|---|
| G10 | `GET /reports/{id}` calls Gemini to fill in missing AI fields **while reading** (slow page, network calls in tests) | **Done** (AI performance audit RC5): opening a report never calls Gemini; missing suggestions are filled by a queued AI job. |
| G11 | `google.generativeai` package is deprecated | **Done** (AI performance audit P3): migrated to `google-genai`; the old package is removed. |
| G12 | Two `uvicorn` servers were running on port 8000 (`.venv` and global Python) | **Not an issue:** there was only one server; the `.venv` launcher starts the global Python, which looked like two processes. |

---

## 6. Test evidence

New test file: `backend/tests/test_pet_identity.py`. **63/63 checks pass.** It covers:

- **Look-alikes:** Pet A confirmed (owner pending) locks Pet B and C in both the UI and the API. An owner rejection unlocks them. A community animal links immediately.
- **Duplicates:** Report B joining Report A's case can't be confirmed or directly linked as another pet.
- **Conflicts:** two reports confirmed as different pets can't be matched or merged, and the case preview shows the conflict.
- **Reverse case:** the duplicate's pet becomes the case pet. Unmerge releases it, unless the main case has its own confirmation.
- **Direct linking:** a pet with an owner is refused. A pet the officer just created and a community animal are allowed.
- **Owner dispute:** reopen once, re-confirm links, a second dispute is refused, an owner's own rejection can't be reopened, the identity lock still applies.
- **Case pet:** the main case gets the pet linked through a duplicate. `case_pet_id` is returned while the owner is pending.
- **Reverse Decision:** a confirmed match is reversed and the pet link removed from the report and main case, after which the right pet can be confirmed. A staff Not a Match is reopened. Refused for an owner's rejection, duplicate pairs, closed cases, and officers not handling the case.
- **Rescans:** a rescan adds no pet look-alikes to a case that already has a pet.

Regression suites still passing: `test_match_cases` (28), `test_merge_many` (28), `test_case_review` (26), `test_case_gating` (20), `test_case_closure` (9), `test_owner_return` (51), `test_pet_owner_confirmation` (11), `test_report_edit_auth` (28), `test_ai_audit_fixes` (28), and the rest of the backend suite. Frontend: `tsc` type-check clean. The screens have not yet been tested by clicking through them in a browser.

---

## 7. Talking points for the panel

- "AI only **suggests** look-alikes and duplicates. A Subdivision Leader or Barangay officer decides, with written notes, and every decision is logged."
- "Ongoing duplicate reports are merged into **one case**, and the first report filed stays the main case. A report filed after the case is resolved becomes a **new case**."
- "**One case, one registered pet.** Once an officer confirms a pet, the system blocks any other pet for that case. If two reports were already confirmed as different pets, they are **not merged automatically**: it is flagged as a pet identity conflict for human review."
- "A sighting is added to a pet's record only when **both the officer and the owner** agree. If they disagree, the owner gets one re-review, and after that a formal dispute handled by the Barangay."
