# Manual cat claiming charge

- **Date:** 2026-11-02 08:10 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/claim_assessment.py`, `backend/app/main.py`, `backend/app/utils/claim_fees.py`, `backend/app/routes/claim_assessments.py`, `backend/tests/test_claim_fees.py`, `frontend/src/utils/claimCharges.ts`, `frontend/src/components/ClaimAssessmentPanel.tsx`, `frontend/src/components/ClaimFeeSettingsCard.tsx`, `frontend/tests/claimCharges.test.mjs`, `frontend/tests/fixtures/claimFees.tsx`, `frontend/tests/claimFees.browser.mjs`, `docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md`, `docs/04-testing/README.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE – Manual Cat Claiming Charge Input". FREEZE was OFF.
- **Type:** Feature

## Intent

For cats, authorized Barangay staff type the claiming charge on each assessment: a charge description, the amount in pesos and the reason or basis. Alternatively they record that no charge applies. The system never assigns, assumes or computes a cat amount. The dog fine (RA 9482, ₱500–₱1,000) is unchanged.

This replaces the earlier cat rule (2026-11-01), in which a cat fine existed only as a range the Head Officer configured.

## Key changes

- **New columns** `claim_assessments.charge_description` and `no_charge_applicable`.
  - For an existing database, `ensure_claim_assessment_cat_charge_columns()` in `main.py` adds them at startup. It is non-destructive.
  - For a cat, the reason or basis is stored in `fine_legal_basis`.
- **Cat quote:** manual entry, with no default, range, schedule or legal basis. Configuring a cat schedule is now refused (400), and an earlier one is not applied.
- **Validation:** amounts must be ≥ 0 and ≤ ₱1,000,000 with at most 2 decimals; letters, NaN and infinity get 422. The server also refuses (400):
  - a missing amount, description or reason / basis;
  - "no charge" sent together with an amount;
  - the cat-only fields sent for a dog.
- **Adjustments** now record changes to the charge description, the basis and "no charge applicable", alongside the amount. Each change keeps the previous and new value, the staff member, the time and the reason.
- **Create audit** includes the description, the basis and the no-charge flag.
- **Panel:** a Cat Claiming Charge section with:
  - a charge description (typed, or picked from wordings that carry no amount);
  - an amount in ₱ (a text field that accepts only digits with up to 2 decimals);
  - a reason / basis;
  - a "No claiming charge applies to this cat" checkbox;
  - the signed-in staff member as "Assessed by", and "Date assessed: recorded automatically".

  The confirmation and the breakdown show the description, the amount or "No charge applicable", and the basis, marked as entered manually.
- **Settings:** the configurable cat fine was removed. A note explains that cat charges are entered per assessment.
- **Unchanged:** permissions (Barangay staff and Admin enter or modify; Subdivision personnel and residents can only view), the handover gate, payment, waiver and the dog fine.

## Validation evidence

- **Backend:**
  - `tests/test_claim_fees.py`: 66/66 checks passed on its own temporary SQLite file. The cat sections were rewritten to cover:
    - nothing added automatically;
    - required amount, description and basis;
    - negative amounts, letters and 3 decimals refused;
    - the leader and residents refused;
    - the saved staff member and date;
    - the total equal to the entered amount;
    - an adjustment trail for the amount and the description;
    - the payment gate;
    - "no charge" with a reason, and "no charge" with an amount refused;
    - the dog and cat fields kept separate;
    - a cat schedule refused;
    - a cat charge combined with the configured impounding and boarding fees.
  - Every backend test script that sets its own SQLite database ran: **98 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run.
- **Frontend:**
  - `node --test tests/*.test.mjs`: 86/86, including 3 new peso-amount tests.
  - `claimFees.browser.mjs` passed 14 scenarios at 390 and 1280 px, including:
    - manual cat entry: invalid amounts refused, description and basis required, exact total;
    - "no charge" with a reason;
    - the settings note.
  - `phase5Pets.browser.mjs` passed 26 scenarios.
  - Both browser suites made zero backend requests, on a local Vite server on port 5175, stopped afterwards.
  - `npx vite build` passed.
  - ESLint: changed files clean.
  - `npx tsc -b` reports only the two errors already present in `MediaLightbox.tsx` and `AIMatchReviewModal.tsx`.
- **Not verified:** the startup column migration against the local MySQL database. It was not run, so that database was not touched.
