# StraySafe 2.0: Pet Match Confirmation After Report Merging (Audit)

**Question:** after Report 2 is merged into Report 1, why does Report 2 still show the same pet as *unconfirmed* when Report 1's match was already confirmed by the owner and staff?
**Status:** ✅ **Implemented** (steps 1–8). Tests T1–T12 pass (`backend/tests/test_merge_pet_identity.py`, 37 checks). Step 8 applied after a backup (Phase 0 of `OWNER_CONFIRMATION_REQUESTS_AUDIT.md`): Reports #13 and #15 inherited Boyet (Pet #3) from Match #4, and their pending suggestions #12 and #15 became `COVERED_BY_CASE` (logged `ONE_TIME_CASE_PET_SYNC`). Later change to T6 (matches audit G5): a pending suggestion for *another* pet on a confirmed case is now closed as `SUPERSEDED_BY_CASE` instead of staying locked, and it reopens automatically if the confirmation goes.
**Method:** the exact scenario was reproduced through the real API on a throwaway database (section 2), then each symptom was traced to the code.

---

## 1. Summary

| | Finding |
|---|---|
| **Is the data corrupted?** | No. The database holds what the code wrote. Report 1's confirmation is intact, with who confirmed it and when. |
| **Where is the problem?** | **Backend logic** (merging doesn't carry a confirmed pet identity to the other reports, and doesn't settle their pending suggestions for that pet), **API scoping** (a report's match list only shows its *own* match rows), and **frontend presentation** (the duplicate's page shows that pending row as if nothing were confirmed). |
| **Main cause** | A pet match (`report_matches`) belongs to **one report**, while the confirmed identity belongs to the **case**. Merging joins the reports into one case but never reconciles the per-report match rows. |
| **Is the one-pet-per-case rule broken?** | No. A *different* pet is still blocked. The gap is only for the **same** pet: the duplicate's pending suggestion for it stays open, confirmable, and asks the owner to confirm again. |

---

## 2. Reproduction (real API, throwaway database)

| Step | Result |
|---|---|
| 1. Leader confirms Kippy on **Report 1**; owner confirms | Match #1: `CONFIRMED_MATCH` + `OWNER_CONFIRMED`; Report 1 `pet_id` = Kippy; Report 2 `pet_id` = *empty* |
| 2. **Merge** Report 2 into Report 1 | Report 2 `duplicate_of` = 1. Report 1 `pet_id` = Kippy. **Report 2 `pet_id` = still empty** |
| | Match #1 (Report 1): `CONFIRMED_MATCH`, `OWNER_CONFIRMED`. **Match #2 (Report 2, same pet): `AI_SUGGESTED`, `PENDING`** |
| 3. Report 2's page (`GET /matches/report/2`) | Shows **only match #2, as pending, not locked**. Report 1's confirmed match is **not shown**. Meanwhile `GET /reports/2` says `case_pet_id = Kippy`. **The same page says both "case identified as Kippy" and "Kippy: unconfirmed".** |
| 4. Leader confirms match #2 | Allowed (200). Match #2 becomes `CONFIRMED_MATCH` with owner `PENDING`, and **the owner is notified to confirm the same pet again**. |
| 5. Unmerge Report 2 | Report 1 keeps Kippy (correct: its own confirmation). Report 2 is empty (correct here, since it never inherited anything). |
| Reverse: the *duplicate* holds the confirmed match | The main case gets `pet_id` = Kippy (copied at merge), but **its own pending suggestion for Kippy stays `AI_SUGGESTED`, unlocked**. |
| Different pet suggested on the case | Correctly **locked** as an identity conflict (one pet per case works). |

---

## 3. How the data is stored today

| Table / field | Scope | Meaning |
|---|---|---|
| `reports.duplicate_of_report_id` | per report | Which main case a merged report belongs to (the case = main report + its duplicates) |
| `reports.pet_id` | per report | The report is linked to this registered pet (set when a match is fully confirmed) |
| `report_matches` row | **per report** (`source_report_id`) | One AI suggestion: this report ↔ one pet (or one other report) |
| `report_matches.status` | per row | `AI_SUGGESTED` / `PENDING_VERIFICATION` / `CONFIRMED_MATCH` / `NOT_A_MATCH` / `UNABLE_TO_VERIFY` = the **staff** decision |
| `report_matches.owner_confirmation_status` | per row | `PENDING` / `OWNER_CONFIRMED` / `OWNER_REJECTED` = the **owner's** half |
| `reviewed_by`, `reviewer_role`, `verified_at`, `verification_notes`, `owner_notes` | per row | Who confirmed and when (the evidence trail to preserve) |
| `case_pet_claims()` (computed, `utils/case_groups.py:54`) | **per case** | The case's pet identity: any member's `pet_id`, or a staff-confirmed match the owner hasn't rejected |

**The mismatch:** confirmations are recorded per report row, while identity is read per case. Merging changes the case without touching the rows.

---

## 4. Why "Confirmed" and "Unconfirmed" appear together (root causes)

| # | Layer | Cause | Code |
|---|---|---|---|
| C1 | Backend (merge) | `_merge_one` copies the **duplicate's** `pet_id` to the main case, but never gives the duplicate the **main case's** confirmed pet. Report 2 stays unlinked, so it doesn't appear in the pet's record or history either. | `routes/reports.py:4820` |
| C2 | Backend (merge) | `settle_case_suggestions` closes only **report ↔ report** suggestions inside the case. Pending **pet** suggestions on the merged reports are left open, including ones for the pet the case is already confirmed as. | `utils/case_groups.py:155` |
| C3 | Backend (identity lock) | `match_identity_lock` / `pet_conflict_for_case` only block a **different** pet. A pending suggestion for the **same** pet is treated as fine and stays confirmable. | `utils/case_groups.py:218, 284` |
| C4 | Backend (verify) | Confirming that same-pet suggestion re-runs the whole two-way flow: a second staff confirmation and a **second "Please confirm: is this Kippy?" notification** to the owner. | `routes/matches.py:1368` |
| C5 | API | `GET /matches/report/{id}` returns only rows whose `source_report_id` is that report. A merged report never sees the case's confirmed match. | `routes/matches.py:1231` |
| C6 | Frontend | `AIPotentialMatchesList` shows the API rows as they are, so the pending row appears as "Suggested". The **case badge** (`CasePetBadge`) uses `case_pet_id` and says "Case Already Identified". The two contradict each other on one screen. | `AIPotentialMatchesList.tsx`, `CasePetBadge.tsx` |
| C7 | Backend (scan) | Merged reports are skipped by the AI scan (`matches.py:729`), so no *new* suggestions appear. Old pending ones are never cleaned up either. | `routes/matches.py:729` |
| C8 | Backend (unmerge) | `release_inherited_pet` only reviews the **main** case's inherited pet. Once C1 is fixed, a separated duplicate will also need its inherited link reviewed. | `utils/case_groups.py:258` |

---

## 5. Recommended approach (safest)

**Principle: copy the identity, never copy the confirmation.** The owner's and staff's confirmation stays on the original match row, with who and when. Other reports in the case *refer* to it instead of getting fake "confirmed" rows. This preserves the evidence trail and creates no records nobody actually made.

1. **Inherit the case's confirmed pet on merge (fixes C1).**
   - When the case has a **fully confirmed** pet (staff confirmed, and the owner confirmed or it's a community animal), every member report without a `pet_id` gets it, recorded as **inherited**.
   - New nullable column `reports.pet_inherited_from_match_id` points at the confirmation that justifies it. Each report also gets a history note ("Linked to Kippy through merged Case #1, confirmed in Match #1 by Leader X on date") and a pet-history entry, so the sighting appears in the pet's record.
   - Applied both ways: at merge time, and later when a match inside an existing case becomes fully confirmed.
2. **Settle same-pet suggestions as "covered", don't confirm them (fixes C2, C3, C4).**
   - Pending suggestions on member reports for the **same** pet are closed with a new status **`COVERED_BY_CASE`**. A new column `report_matches.covered_by_match_id` points at the confirming match.
   - Their own `owner_confirmation_status` stays `PENDING`: nobody confirmed them, and the record says so.
   - They can't be confirmed again, and no new owner notification is sent.
   - Suggestions for **other** pets are untouched (they stay locked as conflicts, as today; see G5).
3. **Staff-confirmed but owner still pending.** Don't inherit yet (the identity isn't confirmed). Lock same-pet suggestions on the other reports with "Awaiting the owner on Report #1", so the owner isn't asked twice. Inheritance happens when the owner confirms.
4. **Conflicts (two different confirmed pets).** Already refused at merge time (`group_pet_conflict`, "Pet identity conflict"). No change; just keep it covered by tests.
5. **Show the case's confirmation on every member report (fixes C5, C6).** `GET /matches/report/{id}` also returns the case's confirming match, marked `via_case_report_id`. The duplicate's page then shows **"✓ Confirmed via Report #1 · owner + staff · date"**, with covered rows grouped beneath it as "Covered by the case confirmation", never as "Suggested".
6. **Unmerge (fixes C8).** When a report is separated:
   - its inherited pet link is removed (only if `pet_inherited_from_match_id` is set; its own confirmations are kept);
   - its `COVERED_BY_CASE` suggestions return to `AI_SUGGESTED`, so a person decides again;
   - the main case's inherited pet is still handled by `release_inherited_pet`;
   - everything is written to report history and the audit log.
7. **Audit log.** One `INHERIT_CASE_PET_IDENTITY` entry per affected report, with old and new `pet_id` and the confirming match id (also covers the consultation's "old value / new value" point).

Why not just set the duplicate's match to `CONFIRMED_MATCH` + `OWNER_CONFIRMED`? That would show an owner confirmation that never happened, and erase *who* confirmed and when. It fails the "preserve the original confirmation records" requirement.

---

## 6. Implementation plan

| Step | Change | Files |
|---|---|---|
| 1 | Columns `reports.pet_inherited_from_match_id`, `report_matches.covered_by_match_id`; allow status `COVERED_BY_CASE` (auto-migration + `Database3.3.txt`) | `models/report.py`, `models/report_match.py`, `main.py`, `Database3.3.txt` |
| 2 | `sync_case_pet_identity(db, root, actor)`: find the case's fully confirmed match; inherit `pet_id` on members; mark same-pet suggestions `COVERED_BY_CASE`; write history, pet history and audit | `utils/case_groups.py` |
| 3 | Call it after merge (`_merge_group`), after a match becomes fully confirmed (`link_confirmed_pet_match`), and after a reversal or unlink (to undo) | `routes/reports.py`, `routes/matches.py` |
| 4 | Lock same-pet suggestions while the owner is still pending elsewhere in the case | `utils/case_groups.py` (`match_identity_lock`) |
| 5 | Unmerge: undo inheritance and covered rows for the separated report | `routes/reports.py` (unmerge), `utils/case_groups.py` |
| 6 | `GET /matches/report/{id}`: include the case's confirming match (`via_case_report_id`) | `routes/matches.py`, `schemas/report_match.py` |
| 7 | Frontend: "Confirmed via Report #N" card; covered rows shown as covered; no Confirm buttons on them | `AIPotentialMatchesList.tsx`, `AIMatchReviewModal.tsx` |
| 8 | One-time check on existing data: report any case whose members show the same pet as both confirmed and pending (read-only first) | script |

---

## 7. Test cases

| # | Scenario | Expected |
|---|---|---|
| T1 | Report 1 fully confirmed as Pet A; Report 2 (pending suggestion for A) merged in | Report 2 `pet_id` = A (inherited, pointing at match #1); its suggestion is `COVERED_BY_CASE`; match #1 unchanged (same reviewer, owner, time) |
| T2 | Same as T1 | No new owner notification; Report 2's suggestion can't be verified again (409) |
| T3 | Same as T1, Report 2's page | Shows "Confirmed via Report #1" with the original confirmer and date; no "Suggested" row for A |
| T4 | Reverse: the duplicate is confirmed, the main case has a pending suggestion for A | Main case `pet_id` = A; its suggestion `COVERED_BY_CASE` |
| T5 | Report 1 staff-confirmed, **owner pending**; merge | Nothing inherited; Report 2's same-pet suggestion locked "awaiting owner"; after the owner confirms → T1 state |
| T6 | Report 2 has a pending suggestion for **another** pet B | B untouched (stays locked as a conflict); not auto-confirmed |
| T7 | Report 1 confirmed A, Report 2 confirmed B | Merge refused, "Pet identity conflict"; nothing changed |
| T8 | Unmerge Report 2 after T1 | Report 2 `pet_id` cleared (inherited only); suggestion back to `AI_SUGGESTED`; Report 1 keeps A; history and audit written |
| T9 | Report 2 had its **own** confirmation for A, then unmerged | Report 2 keeps A (not inherited) |
| T10 | Match #1 reversed later (Reverse Decision) | Inherited links that pointed at match #1 are removed; covered suggestions reopened |
| T11 | Three-report case | All members inherit; each audit entry points at the same confirming match |
| T12 | Pet A's record | Report 2's sighting appears in the pet's history as "linked through merged case" |

---

## 8. Note on existing data

Cases already merged before the fix may hold the inconsistency (a same-pet pending suggestion next to a confirmed one). Step 8 lists them read-only first. Applying `sync_case_pet_identity` to them can then be a reviewed one-time action, not an automatic migration.
