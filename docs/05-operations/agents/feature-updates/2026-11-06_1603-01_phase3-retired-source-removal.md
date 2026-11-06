# Phase 3 B09: remove proven-unused retired source and branches

- **Date:** 2026-11-06 16:03 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/Subd_Leaders/EscelatedMissions.tsx`, `frontend/src/pages/Barangay_Staff/BrgyManualMatching.tsx`, `frontend/src/utils/matchingScope.ts`, `frontend/src/components/AdminSidebar.tsx`, `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/tests/fixtures/phase2Holding.tsx`, `frontend/tests/phase2Holding.browser.mjs`, `frontend/tests/fixtures/phase5Pets.tsx`, `frontend/tests/phase5Pets.browser.mjs`, `frontend/tests/fixtures/phase6to8.tsx`, `frontend/tests/phase6to8.browser.mjs`, `frontend/tests/barangayReferral.browser.mjs`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/01-system/CLAIM_ELIGIBILITY_RULES.md`, `docs/01-system/ADOPTION_ELIGIBILITY_RULES.md`, `docs/03-development/audits/ADMIN_SUBD_BARANGAY_TRACES_2026-11-06.md`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/03-development/implementation-reports/BARANGAY_TRACE_REMOVAL_FOLLOWUP_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1603-01_phase3-retired-source-removal.md`
- **Authorization:** User explicitly requested "phase 3" of the Admin/Subdivision Barangay trace removal checklist; actual tool label Codex was explicitly selected earlier.
- **Type:** Fix

## Intent

Delete only retired source proven unused by application routes/imports, retain archival dependencies and verify supported matching/navigation behavior.

## Key changes

- Removed three unmounted Subdivision pages, an unmounted Barangay matching wrapper and its exclusively used wording utility after static/dynamic/lazy/fixture searches.
- Removed stale Admin sidebar aliases, wrapper-only matching wording/navigation branches and an unreachable Barangay destination inside an Admin-only adoption action.
- Replaced direct retired-page fixtures with actual route redirects/Admin archives. Updated older matching regression fixtures to the existing shared Potential Match Review UI; owner-confirmation rules remain unchanged.
- Preserved read-only Admin archive imports, retired URL information, role-3 blocking, historical data/statuses and legitimate resident owner-return flows. No backend, schema, dependencies or environment files changed in Phase 3.
- Updated current docs/checklist and added a linked implementation follow-up. Remaining hazard audience, policy wording and shared legacy presentation concerns are explicitly open, not silently classified as cleared.

## Validation evidence

- Holding regression passed 14 scenarios; pet regression 26; current matching/owner/observation regression 24 across mobile/desktop/dark; real-Leaflet map regression 14. All use synthetic fixtures and mocked/blocked backend requests.
- Referral regression passed old holding/claims/escalation URLs, `/brgy/*` retirement information, stored role-3 blocking, referral creation/updates/timeline and mobile navigation. Existing Phase 1 print/account and Phase 2 presentation suites passed.
- Existing backend account/provisioning/invitation/retirement scripts passed 44 + 28 + 50 = 122 checks in their own throwaway SQLite databases, after initial sandbox temporary-file restrictions were bypassed by approved execution. No application database used.
- Final TypeScript/production build passed with existing large-chunk warning; source/test scans find no references to the removed modules and no glob-based loader. `git diff --check` passed.
- Strict documentation audit at 16:03 UTC retained the same 12 pre-existing broken-link/agent-pointer findings. Live deployment/GPS/printing and remaining presentation follow-ups are unverified.
