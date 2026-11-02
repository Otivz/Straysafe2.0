# Dog and cat claiming fine management

- **Date:** 2026-11-01 20:00 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/claim_assessment.py`, `backend/app/models/__init__.py`, `backend/app/utils/claim_fees.py`, `backend/app/routes/claim_assessments.py`, `backend/app/routes/claims.py`, `backend/app/utils/owner_returns.py`, `backend/app/main.py`, `backend/tests/test_claim_fees.py`, `frontend/src/components/ClaimAssessmentPanel.tsx`, `frontend/src/components/ClaimFeeSettingsCard.tsx`, `frontend/src/utils/claimCharges.ts`, `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`, `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/citizen/PetClaimsDashboard.tsx`, `frontend/tests/claimFees.browser.mjs`, `frontend/tests/fixtures/claimFees.html`, `frontend/tests/fixtures/claimFees.tsx`, `docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md`, `docs/01-system/overview.md`, `docs/04-testing/README.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE – Dog and Cat Claiming Fine Management". FREEZE was OFF.
- **Type:** Feature

## Intent

Barangay staff assess the charges for claiming an impounded animal:
- the RA 9482 dog impounding fine (₱500–₱1,000);
- a separate cat claiming fine, only when configured from an approved ordinance or policy;
- impounding and boarding fees, only when configured.

They record payment with an official receipt, or a waiver with a reason, before the owner handover. Every change is audited. No legal amount other than the RA 9482 dog range is built in.

## Key changes

- **New tables** (created at startup): `claim_fee_schedules`, `claim_assessments`, `claim_assessment_changes`.
- **`app/utils/claim_fees.py`:**
  - species detection;
  - the fixed dog fine;
  - configured schedules (the Barangay's own, then global);
  - boarding days;
  - the quote;
  - `require_case_charges_settled`.
- **`/claim-assessments` API:**
  - schedules: list; configure or remove (Head Officer / Admin, legal basis required);
  - quote;
  - view: resident own, Leader read-only, staff manage;
  - create (Approved claims only);
  - adjust (reason);
  - waive (reason);
  - record payment (OR number; amount equals total);
  - cancel (reason).

  Each action writes a change row and an audit-log entry. The owner is notified.
- **Handover gate:** unpaid charges block the claim's Handover Complete / Pet Received step. `record_owner_return` blocks the holding, report and rescue owner-return paths. A rejected claim cancels its unpaid assessment.
- **Frontend:**
  - `ClaimAssessmentPanel`:
    - Dog/Cat label;
    - range and legal basis;
    - the "No Authorized Fine Configured" warning;
    - total preview and confirmation step;
    - payment, adjust, waive and cancel;
    - breakdown and change history.

    It is shown on the Barangay claims page, where "Mark Handover Complete" is disabled until the charges are settled. The Subdivision claims page shows it read-only and its handover is disabled likewise. The resident claims dashboard shows it read-only.
  - New Barangay Settings tab **Claiming Fines & Fees**: the dog fine shown as fixed, and the configurable cat, impounding and boarding charges.

## Validation evidence

- **Backend:**
  - `tests/test_claim_fees.py`: 46/46 checks passed on its own temporary SQLite file.
  - Related suites pass: case claims 18, claim eligibility 50, claim photos 16, proof reuse 9, claim identity 12 (unittest), adoption eligibility 29, multi-animal split 114, phase-2 custody 18, leader holding view 25, holding privacy 23, stay clock 17.
  - Every backend test script that sets its own SQLite database ran: **97 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty.
  - The 14 scripts that don't name SQLite were not run, so the local MySQL database was never touched.
- **Browser:**
  - `claimFees.browser.mjs` passed 14 scenarios at 390 and 1280 px.
  - `phase5Pets.browser.mjs` passed 26 scenarios. It renders both claims pages.
  - Both made zero backend requests, on a local Vite server on port 5175, stopped afterwards.
  - `petClaimRecords.browser.mjs` and `claimEvidence.browser.mjs` timed out at their page-injection step against this server, so they were not run. They don't load any changed file.
- **Frontend:**
  - `npx vite build` passed.
  - ESLint: no findings in the new files or on changed lines.
  - `npx tsc -b` reports only the two errors already present in `MediaLightbox.tsx` and `AIMatchReviewModal.tsx`, files this work did not change.
- **Not verified:** the RA 9482 Section 11(6) citation and any ordinance text; real payments.
