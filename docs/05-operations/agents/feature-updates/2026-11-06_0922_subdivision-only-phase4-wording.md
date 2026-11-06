# Subdivision-only Phase 4: external Barangay wording

- **Date:** 2026-11-06 09:22 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdReports.tsx`, `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `frontend/src/pages/Admin/AdminReport.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/src/pages/Admin/AdminDashboard.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/components/RescueTimeline.tsx`, `frontend/tests/barangayReferral.browser.mjs`, `frontend/tests/adminArchive.browser.mjs`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_0922_subdivision-only-phase4-wording.md`
- **Authorization:** Developer request to implement Phase 4 only of the Subdivision-only restructuring; no Phases 5 or 6.
- **Type:** Polish

## Intent

Describe referrals and external Barangay work accurately on active resident, leader and Administrator screens.

## Key changes

- Replace Rescue Status / Not Yet Initiated with the actual case status; replace referral actions and captions that said escalate, endorse or dispatch.
- The Admin referral document describes an external recipient, not an invented custody handover; saved letter content and stored history remarks remain unchanged.
- Update the leader observation and referral pages and dashboard links. Warning tiers, observation workflow and network actions remain unchanged.
- Keep external-update attribution. Fix the referral browser assertion to use the submitted update date and wait for the refreshed card.

## Validation evidence

- TypeScript build check: exit 0.
- barangayReferral.browser.mjs and adminArchive.browser.mjs: pass, including external attribution and responsive checks.
- historyCaseSummary.browser.mjs: pass, including history pages at both widths and all three PDF/print scenarios; summary and print implementation unchanged.
- Before edits the referral test expected November 5 even though its date input uses the device date; this caused a baseline failure on November 6. The assertion now checks the selected date.
