# Adoption eligibility after an owner claim or handover

An animal that went back to its original owner is never adopted out. The server enforces this rule; the screens follow it.

## When an animal counts as returned to its owner

`owner_handover_evidence()` in `app/utils/adoption_eligibility.py` decides from the **records**, not only the current status, across every report of the merged case. The animal counts as returned if **any** of these holds:

| Evidence | Where it comes from |
| --- | --- |
| The holding record is Claimed by Owner (facility status 3, shown as "Returned to Owner") | Handover discharge |
| An owner-return record exists for the case, or for this holding record | `report_returns`, written by every owner handover (claims, holding page, report pages, rescue) |
| A pet claim of the case is Handover Complete or Pet Received | `pet_claims` |
| A report of the case has custody Claimed by Owner or Reunited with Owner | `reports.custody_status` |

A claim that is only **submitted** or **approved** does not count. Approval sets the report to Claimed by Owner (status 9) before the handover, so report status 9 alone is not evidence; the animal stays where it is until the handover is completed. No new status field was added.

## What happens at the handover

Every owner handover ends in `finalize_owner_handover()` (`app/utils/owner_returns.py`):

- **Staff:** claim Handover Complete, holding status Claimed by Owner, report and rescue owner returns.
- **Owner:** their own claim **Pet Received** confirmation. Before this change, this path didn't discharge the holding record.

It then:

1. **Discharges** every holding record of the case, plus the record named by the return, as Claimed by Owner with the handover date, and writes a timeline entry. Before this change, only a holding record on the exact report was discharged, so a merged case's record could stay "in care".
2. **Takes the animal out of adoption** (`retire_from_adoption()`):
   - **Catalog:** the listing is removed (catalog notes and promotion cleared, timeline "Removed from Adoption Catalog").
   - **Applications:** open ones (Pending or Approved, not yet handed over to an adopter) are **Cancelled** with the reason "The animal was claimed and handed over to its owner, so it is no longer available for adoption", and their tasks are closed.
   - **Notices:** each applicant is told, and other Barangay head officers are told (not the officer who did it).
   - **Audit:** `ADOPTION_ELIGIBILITY_REVOKED` records whether the listing was removed and which applications were closed.

The claim's own status (Handover Complete / Pet Received), the handover date and the responsible staff member are stored by the existing claim and return records.

## Entry points that refuse a returned animal

Each refusal is `409` with: "This animal is no longer eligible for adoption because it has already been claimed and handed over to its owner." It is audited as `ADOPTION_BLOCKED_OWNER_RETURNED`, with the user, the action and the reason, through its own session so the caller's unsaved changes are never committed.

| Entry point | Route |
| --- | --- |
| Add to Adoption Catalog | `POST /adoptions/promote/{holding_id}` |
| Change status to For Adoption (6) or Adopted (7) | `PATCH /holding/{holding_id}`. Reopening the record to another status first doesn't get around it, because the return record decides. |
| Adoption application | `POST /adoptions/apply` |
| Approve an application | `PUT /adoptions/review/{id}` (decision Approved), and the initial approval |
| Adoption handover | staff handover, adopter confirmation, handover completion |
| Mark as Adopted | `_release_animal_from_facility` (every path that sets status 7) |
| Public catalog and detail | `GET /adoptions/catalog` never lists a returned animal, even for staff views; `GET /adoptions/catalog/{id}` is `404` |

Animals still in Barangay care keep the existing rules (stay limit, impoundment, linked owned pet, reservations).

## Existing records

`reconcile_returned_listings()` runs in the operations watcher every 10 minutes, including its first pass. It finds animals that are listed or have open applications although the records show a return. For each one it:

- removes the listing and sets the holding record to Claimed by Owner;
- closes open applications with the reason and notices above.

Nothing is deleted: the animal, its ownership and return history, and the adoption applications stay on record. Until the watcher runs, the catalog already hides such animals.

## Screens

- **Barangay holding page:**
  - Status 3 reads **Returned to Owner**. A record whose history shows a return gets that label even if its stored status lags behind.
  - The **Adopt** / **Promote to adoption** actions don't appear for it; trying to open the promotion shows the message above.
  - The detail shows a "Returned to Owner" notice.
  - For Adoption and Adopted are disabled in its status form.
- **Responses:** `GET /holding/...` returns `adoption_eligible` and `adoption_block_reason` for every animal.
- **Subdivision holding page:** status 3 reads "Returned to Owner" too.

## Code and tests

- Backend: `app/utils/adoption_eligibility.py`, `app/utils/owner_returns.py`, `app/routes/adoptions.py`, `app/routes/holding.py`, `app/routes/claims.py`, `app/schemas/holding.py`, `app/models/report.py` (transient fields), `app/tasks/unassigned_checker.py`
- Frontend: `src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`, `src/pages/Subd_Leaders/SubdHoldingFacility.tsx`
- Tests: `python tests/test_adoption_eligibility.py` from `backend/` (isolated SQLite); `node frontend/tests/phase2Holding.browser.mjs` (returned-animal scenario)

**Lists (2026-11-02):** `owner_handover_evidence_map()` applies the same rules to many animals in a fixed number of queries. `GET /holding/` uses it, together with one database time and one pet lookup for the whole list. Single-record checks still use `owner_handover_evidence()`.
