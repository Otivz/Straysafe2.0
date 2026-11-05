# Subdivision-only Phase 3a: leader referral screens

- **Date:** 2026-11-05 11:00 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/components/Referral/BarangayReferralCard.tsx` (new), `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdReports.tsx`, `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx`, `frontend/src/components/RescueTimeline.tsx`, `frontend/src/utils/caseTimeline.ts`, `frontend/src/components/SubdSidebar.tsx`, `frontend/src/components/Navbars/SubdBottomNav.tsx`, `frontend/src/components/Navbars/SubdNavbar.tsx`, `frontend/src/routes/AppRoutes.tsx`, `frontend/tests/barangayReferral.browser.mjs` (new), `backend/app/schemas/barangay_referral.py`, `backend/app/routes/barangay_referrals.py`, `backend/tests/test_barangay_referrals.py`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-11-05_1100_subdivision-only-phase3a-leader-referral-screens.md`
- **Authorization:** The developer's instruction "phase 3" on 2026-11-05, with these choices: after an owner confirms a match, show "your Subdivision Leader will help" instead of filing a claim; keep the Admin's old pages with write buttons hidden; deliver Phase 3 in four parts and stop after each; old `/brgy` URLs show an information page. This record covers part 3a only.
- **Type:** Feature

## Intent

Part 3a of [SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md](../../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md): the Subdivision Leader's screens use the Barangay Referral log instead of rescue requests.

## Key changes

- **Refer to Barangay** (`SubdViewReport.tsx`, `SubdReports.tsx`): the button and form are renamed ("Refer to Barangay", "Record referral"), add "Barangay contacted by" and an optional reference number, and call `POST /reports/{id}/referral` instead of `POST /rescue-requests/`. The letter upload and the status change to 4 (`PATCH /reports/{id}/status`) are kept, so the status change's side effects (such as closing an open owner observation as escalated) still run; the referral route accepts a case already at status 4. Server error messages are shown.
- **Referral card** (`components/Referral/BarangayReferralCard.tsx`, new): replaces the "Escalated to Barangay" card. Shows the Barangay, referral date and leader, contact method, reference number, reason, the Barangay updates ("Reported by Barangay, recorded by <leader>", optional evidence link) and the outcome. Actions: record a Barangay update (with optional evidence uploaded to Cloudinary), record the outcome (only at status 4; warns it closes the case), or create the referral record for a status-4 case that has none.
- **Timeline** (`caseTimeline.ts`, `RescueTimeline.tsx`): `useCaseReferral` loads the referral (leader and Admin only; others get nothing); its updates are added as external entries. "Referred to Barangay" and "Reported by Barangay" entries are classified before the keyword rules, so a Barangay "held" or "impounded" update is never shown as a StraySafe holding event. The timeline refreshes after each card change.
- **Barangay Referrals page** (`EndorsementArch.tsx`, route `/subd/endorsements`): lists referrals (`GET /referrals/`) plus older rescue-request endorsements as read-only history; labels "Open" and "Closed" replace "In Review" and "Accepted"; the preview shows the referral card; no live dispatch polling for referrals.
- **Navigation:** sidebar drops "Barangay Holding" and "Pet Claims" and renames "Endorsement Archive" to "Barangay Referrals"; the bottom-nav holding button opens Barangay Referrals; `/subd/holding-facility` and `/subd/pet-claims` redirect there; the claim notification opens the reports list.
- **Backend:** the referral response also returns `letter_title` and `letter_file_url` (the endorsement letter) for the list.
- **Not changed (later parts):** Case Summary and print already show the closing entry's "Reported by Barangay San Vicente on …" remarks; other leader wording such as "Rescue status" and "Official endorsement" is Phase 4. `EscelatedMissions.tsx` is not routed and is left for code deletion.

## Validation evidence

- `node frontend/node_modules/typescript/bin/tsc -b frontend`: exit 0.
- `frontend/tests/barangayReferral.browser.mjs` (headless Chrome, mocked API, Vite on 5173): refer (letter, status 4, referral with visit and reference number, no rescue request), record an update (labelled external), timeline entries, sidebar, referral list, the two redirects, 390 px without horizontal scroll, no browser errors: all pass.
- Existing frontend tests still pass: `notificationNavigation.test.mjs`, `caseStagesObservation.test.mjs`, `historyCaseSummary.browser.mjs`, `locationIntelligence.browser.mjs`, `caseSummary.browser.mjs`.
- `backend/tests/test_barangay_referrals.py`: 47 of 47; `backend/tests/test_barangay_gate.py`: 50 of 50.
