# Adoption eligibility after an owner claim or handover

- **Date:** 2026-11-01 19:07 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/adoption_eligibility.py`, `backend/app/utils/owner_returns.py`, `backend/app/routes/adoptions.py`, `backend/app/routes/holding.py`, `backend/app/routes/claims.py`, `backend/app/schemas/holding.py`, `backend/app/models/report.py`, `backend/app/tasks/unassigned_checker.py`, `backend/tests/test_adoption_eligibility.py`, `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`, `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`, `frontend/tests/fixtures/phase2Holding.tsx`, `frontend/tests/phase2Holding.browser.mjs`, `docs/01-system/ADOPTION_ELIGIBILITY_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE – Fix Adoption Eligibility After Ownership Claim or Handover". FREEZE was OFF.
- **Type:** Fix

## Intent

An animal claimed by and handed over to its original owner must never be listed, applied for or adopted. The rule must be enforced on the server from the ownership and return records, not only the current status. Existing inconsistent records must be cleaned up without deleting history.

## Problems found

- `PATCH /holding/{id}` could set For Adoption (6) or Adopted (7) on an animal already claimed by its owner; the only guard was against Impounded. Changing Claimed → Healthy → For Adoption also worked.
- Promote, apply, application approval, the adoption handovers and the public catalog checked only the holding status and a linked owned pet, never the owner-return or completed-claim records.
- An owner handover discharged only a holding record on the exact report; a merged case's record could stay "in care".
- The owner's own **Pet Received** confirmation created the return record but never discharged the holding record.
- A completed owner handover left the animal's catalog listing and open adoption applications as they were.

## Key changes

- **New `app/utils/adoption_eligibility.py`:**
  - evidence from the holding status, owner-return records, completed claims and returned custody across the merged case. A submitted or approved claim alone doesn't count.
  - a guard that refuses with the required message and audits the blocked attempt in its own session;
  - retirement after a handover: listing removed, open applications Cancelled with a reason, tasks closed, applicant and other Barangay head officers notified, timeline and audit entries;
  - reconciliation for existing records.
- **Owner handover:** every handover path now ends in `finalize_owner_handover()` in `owner_returns.py`. It discharges every holding record of the case and retires the animal from adoption. The claim **Pet Received** path now calls it too.
- **Guards:**
  - promote;
  - holding status change to 6 or 7;
  - apply;
  - application approval (review and initial);
  - staff handover, adopter confirmation and handover completion;
  - `_release_animal_from_facility`.

  The public catalog and its detail never show a returned animal.
- **Holding responses** carry `adoption_eligible` and `adoption_block_reason`.
- **The operations watcher** runs the reconciliation about every 10 minutes, including its first pass.
- **Frontend (Barangay holding page):**
  - status 3 is labelled **Returned to Owner**, also for records whose stored status lags behind;
  - no Adopt / Promote action, and the required message if the promotion is opened;
  - a "Returned to Owner" notice in the detail;
  - For Adoption and Adopted disabled in the status form.

  The Subdivision holding page also labels status 3 "Returned to Owner". No new status fields; existing values reused.

## Validation evidence

- `tests/test_adoption_eligibility.py` in `backend/`: 29/29 checks passed (isolated SQLite). They cover the 7 requested scenarios, plus Pet Received, application approval refused, other staff notified, audit entries, and reconciliation (records kept, repeat run changes nothing).
- **All 102 isolated backend scripts passed.** They ran with `DATABASE_URL=sqlite:///:memory:` as a safeguard and with the Gemini, SMTP, Cloudinary API key/secret/URL and VAPID private-key variables set empty. The 8 scripts that use the configured database were not run.
- **Browser:** `phase2Holding.browser.mjs` passed 20 scenarios, including the new returned-animal scenario at 390 and 1280 px. `phase5Pets.browser.mjs` passed 26 scenarios. Both made zero backend requests on a local Vite server, which was stopped afterwards.
- **Frontend:**
  - `npx vite build` passed;
  - no ESLint findings on changed lines;
  - `npx tsc -b` reports only two errors, in `src/components/MediaLightbox.tsx` (unused `useCallback`) and `src/components/Modals/AIMatchReviewModal.tsx` (unused `openLightbox`). These files were not changed by this work and appear to be under edit elsewhere. Because of them, `npm --prefix frontend run build` (type check then bundle) currently fails.
- No command touched the local MySQL database.
