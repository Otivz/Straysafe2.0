# Pet claiming fines and fees

**Status:** Current (2026-11-01)

When an owner claims an impounded animal, Barangay staff assess the claiming charges. The owner pays them, or they are waived with an authorized reason, before the handover. This document describes how the system handles those charges.

## Legal basis and amounts

| Charge | Species | Amount | Source |
| --- | --- | --- | --- |
| Dog Impounding Fine | Dog | ₱500 to ₱1,000, chosen by staff | Republic Act No. 9482 (Anti-Rabies Act of 2007), Section 11(6). Fixed in code (`backend/app/utils/claim_fees.py`), not editable. |
| Cat Claiming Charge | Cat | Typed in by authorized Barangay staff on each assessment, or recorded as "No charge applicable" | The reason / basis staff enter with it |
| Impounding Fee | Dog or Cat | Only the range configured by the Barangay | As above |
| Boarding Fee (per day) | Dog or Cat | Configured daily rate × days at the facility | As above |

- **No amounts are invented.** The only built-in amount is the RA 9482 dog fine. Impounding and boarding fees exist only after the Barangay Head Officer (or an Admin) configures them with their legal basis. Nothing is pre-filled.
- **Cat claiming charge: manual entry (2026-11-02).** For a cat, staff enter:
  - **Charge description:** typed, or picked from a few wordings that carry no amount;
  - **Amount (₱):** digits with at most 2 decimals, not negative, up to ₱1,000,000;
  - **Reason / basis.**

  Or they tick **No claiming charge applies to this cat** and give the reason.
- **Validation (server and form):**
  - an empty amount, letters, signs, separators, exponents or more than 2 decimals are refused;
  - a missing description or reason is refused;
  - "no charge" can't come with an amount.
- **Nothing is added automatically for a cat.** There is no default, range, schedule or computed cat amount. A cat schedule can no longer be configured, and any earlier one is not applied.
- **The assessing staff member and the date are recorded automatically.**
- **Cats never get the dog fine, and dogs never take the cat fields.** For a dog, the server refuses a charge description, a basis or "no charge".
- **One species, one fine category.** The species is detected first, from the registered pet, then the holding record, then the report. A dog gets only the Dog Impounding Fine and a cat only the Cat Claiming Charge; never both. If the species is unknown, nothing can be assessed until it is recorded.
- **Fines are kept separate from service fees.** The assessment stores the fine, impounding fee and boarding fee as separate items, each with its own legal basis, then the total.
- The developer confirmed the ₱500–₱1,000 dog fine range on 2026-11-02. The system cannot verify legal citations itself: the Barangay should still confirm the exact RA 9482 paragraph cited, and the text of any ordinance it configures, before go-live.

## Workflow

1. Owner submits the claim.
2. Barangay staff verify ownership and approve the claim. Assessment is only possible on an **Approved** claim.
3. Staff assess the charges. The form shows the species label, the allowed range and legal basis for each charge, and the total before confirmation. A separate confirmation step saves it.
4. The owner pays at the Barangay. Staff record the payment with the official receipt (OR) or reference number. The amount must equal the total due. **Recording a payment does not complete the handover.**
5. Staff mark the handover complete. The animal becomes **Returned to Owner** and is removed from adoption ([ADOPTION_ELIGIBILITY_RULES](ADOPTION_ELIGIBILITY_RULES.md)).

- **Handover gate:** while any claim on the case has an assessment that is unpaid (status Assessed, total above zero), every owner-return path is refused with HTTP 409:
  - claim Handover Complete;
  - the owner's own Pet Received confirmation;
  - holding release to owner;
  - report resolution;
  - rescue return.

  The check runs inside `record_owner_return` and on the claim status endpoint.
- **No assessment:** a claim with no assessment, or with a total of zero, is not held back. The Barangay claim screen says no charges were assessed, so staff can assess first if charges apply.
- **Waiver:** staff can waive unpaid charges with a reason of at least 10 characters. A waived assessment allows the handover.
- **Rejected claim:** rejecting the claim cancels its unpaid assessment. The record and its change history stay.
- **One active assessment per claim.** To redo one, cancel it with a reason, then assess again.

## Permissions

| Role | Can do |
| --- | --- |
| Barangay staff (role 3), Admin (role 4) | Assess, adjust, waive, cancel, record payment |
| Barangay Head Officer, Admin | Configure or remove the impounding fee and boarding fee (with legal basis) |
| Subdivision Leader (role 2) | View the charges on claims in their subdivision, read-only. Cannot collect. |
| Resident (role 1) | View the charges on their own claims |

Visibility follows the existing claim visibility rule (`claim_visible_to`).

## Audit

- Every change creates a row in `claim_assessment_changes`, which is never deleted. Each row records:
  - the action: created, adjusted, waived, payment_recorded or cancelled;
  - for adjustments, the field with its previous and new value;
  - the reason;
  - the staff member and time.
- Adjustments, waivers and cancellations require a reason.
- An adjustment records each changed value with its previous and new value: the amount, and for a cat the charge description, the reason / basis and "no charge applicable". Earlier values stay in the history; nothing is overwritten silently.
- The system audit log records these actions:
  - `CREATE_CLAIM_ASSESSMENT`
  - `ADJUST_CLAIM_ASSESSMENT`
  - `WAIVE_CLAIM_ASSESSMENT`
  - `RECORD_CLAIM_PAYMENT`
  - `CANCEL_CLAIM_ASSESSMENT`
  - `CONFIGURE_CLAIM_FEE`
  - `DEACTIVATE_CLAIM_FEE`
- Changing a fee schedule replaces the active one and keeps the old row inactive. Existing assessments keep their amounts.
- The owner gets an in-app notification when charges are assessed, adjusted, waived or marked paid.

## Itemized breakdown

Each assessment shows:
- the claim reference (`CLM-xxxxx`), animal ID (`P-xxxxx`), animal name and species;
- the owner;
- the fine category and amount with its legal basis. For a cat: Species Cat, the charge description, the manually entered amount (or "No charge applicable") and the reason / basis;
- the impounding fee and the boarding fee with its days;
- the total due;
- the assessment date and assessing staff member;
- once settled, the payment (amount, OR number, who recorded it and when) or the waiver (reason, who and when).

## Implementation

- Data model: `backend/app/models/claim_assessment.py` defines the tables `claim_fee_schedules`, `claim_assessments` and `claim_assessment_changes`, created at startup. The cat charge columns `charge_description` and `no_charge_applicable` are added to an existing `claim_assessments` table by `ensure_claim_assessment_cat_charge_columns()` in `main.py`. This is non-destructive and needs no manual migration. For a cat, `fine_legal_basis` holds the reason / basis that staff entered.
- Rules: `backend/app/utils/claim_fees.py`.
- API: `backend/app/routes/claim_assessments.py`, prefix `/claim-assessments`.
- Handover gate:
  - `backend/app/routes/claims.py`;
  - `backend/app/utils/owner_returns.py` (`record_owner_return`).
- UI:
  - `frontend/src/components/ClaimAssessmentPanel.tsx`, used by the Barangay, Subdivision and resident claim pages;
  - `frontend/src/components/ClaimFeeSettingsCard.tsx`, under Barangay Settings → Claiming Fines & Fees.
- Tests:
  - `backend/tests/test_claim_fees.py`;
  - `frontend/tests/claimFees.browser.mjs` with `frontend/tests/fixtures/claimFees.tsx`.
