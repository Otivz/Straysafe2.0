# Claim eligibility and lost-pet labels

Current subdivision-only boundary: the standalone Subdivision claim-review page was removed in cleanup Phase 3. `/subd/pet-claims` still redirects to referrals; `/brgy/*` shows retirement information. Supported owner-return endpoints and resident claim components remain. The rules below describe retained server eligibility and legacy compatibility, not restored Barangay portal access.

Phase 7 of the restore plan. A pet claim exists so an owner can get back an animal that someone is holding. The server enforces these rules; the screens show only what applies.

## Is the animal held?

`case_custody()` in `app/utils/claim_custody.py` decides this once for the whole merged case, across every report in it:

| Situation | Held? |
| --- | --- |
| An open holding record (not discharged; not Claimed, Deceased, Transferred out or Adopted) | Yes: holding place |
| Custody **Secured by Resident** on an open case | Yes: resident |
| Custody Secured in Facility / In Barangay Facility / Impounded, or status Picked Up (6) / Impounded (8), on an open case whose holding records aren't all discharged | Yes: holding place, or rescue team for Picked Up |
| An approved claim: the report status **before** the approval (approval sets Claimed by Owner) | As that status says |
| Facility custody or Impounded left on a case whose holding records are **all discharged** | No (stale data) |
| Adopted: holding status Adopted, custody Adopted, or an approved, handed-over adoption | **Never**, even if older data says otherwise |
| Already returned to the owner (an owner-return record, or custody Claimed by Owner / Reunited) | No |
| A plain sighting, or a closed case | No |

## What needs a held animal

| Action | Rule |
| --- | --- |
| File a claim (`POST /claims/`) | Held animal, or the case already has an **approved** claim for this pet (its documents can still be updated). Checked before anything is saved, so an unowned pet is never assigned to the filer of a refused claim |
| Add evidence (`POST /claims/{id}/evidence`) | Same. Refused on a claim that is already Handover Complete, Pet Received or Not Needed |
| Approved, Evidence Requested, Pending Review | Held animal |
| Handover Complete, Pet Received | An approved claim may finish (continuation), or the animal must be held. **Never** for an adopted animal |
| Rejected | Always allowed |

A refusal is `409` with the reason, for example "Nobody has picked up or is holding this animal, so there is nothing to claim yet." The existing authorization (owner-only filing, staff-only decisions) is unchanged.

When a claim is approved, the report's previous status is saved (`status_before_approval`).

## Claims that aren't needed

Every claim response carries `custody` (`held`, `holder`, `reason`, `adopted`, `returned`, `not_needed`) plus the owner's answer and any closure.

- **Owner:** `POST /claims/{id}/whereabouts` with `answer` `home` or `still_missing` and an optional note. Only the pet's owner can answer, and only while nobody holds the animal. The latest answer is kept, and the handling leader (or the subdivision's leaders) is notified.
- **Staff:** `POST /claims/{id}/close-not-needed` with a `reason` of at least 10 characters. Only staff who can see the claim, and only for an open claim whose animal nobody holds. The claim becomes **Not Needed**, the report history gets the reason, and the owner is notified. A Not Needed claim takes no more decisions or evidence.
- **Erroneous approval:** if the claim was Approved and its approval set the report to Claimed by Owner, closing it restores the saved earlier status, with a history entry. It is never undone after a completed return or an adoption.

`ClaimNotNeededPanel` shows the explanation, the owner's answer and the matching action on the resident claims page and on both staff claims pages. Approve and Request Evidence are disabled there when the animal isn't held.

## Lost-pet labels and Pet Recovered

A **lost-pet report** is category Lost Pet (6), or a report filed through the lost-pet form (`[LOST PET REPORT]` in its description). A report that is merely linked to a registered pet, such as a roaming owned-pet complaint, is not one.

- `POST /reports/{id}/confirm-reunited` (**Pet Recovered**) is refused (`409`) for residents unless the report is a lost-pet report. The existing actor rules (reporter, the pet's owner but not a later adopter, or staff), open-case rule and holding-place rule still apply. Staff keep their existing access.
- On the resident report page, "Lost Pet", "Lost Pet Recovery Case" and "Registered Lost Pet" are shown only for lost-pet reports; other linked reports say "Registered Pet". The Pet Recovered button and its form appear only on lost-pet reports.
- My Pets **Resolve Case** opens only an open lost-pet report for that pet, never a complaint about it.
- A roaming owned-pet complaint stays on its complaint and observation path with the Subdivision Leader. The owner keeps formal dispute access.

## Code and tests

- Backend: `app/utils/claim_custody.py`, `app/routes/claims.py`, `app/routes/reports.py` (`confirm-reunited`), `app/models/pet_claim.py`, `app/schemas/pet_claim.py`
- Schema: `pet_claims` gains the status **Not Needed** and the columns `status_before_approval`, `owner_whereabouts`, `owner_whereabouts_note`, `owner_whereabouts_at`, `closed_reason`, `closed_by` and `closed_at`. Startup adds them when missing (non-destructive).
- Frontend: `ClaimNotNeededPanel.tsx`, `BrgyPetClaims.tsx` (unmounted legacy compatibility component), `PetClaimsDashboard.tsx`, `ResiViewReport.tsx`, `ResidentPet.tsx`
- Tests: `python tests/test_claim_eligibility.py` from `backend/` (isolated SQLite)
