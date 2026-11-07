# Phase 2 B03: current subdivision dashboard

- **Date:** 2026-11-06 15:44 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`, `docs/01-system/BARANGAY_REFERRAL_LOG.md`, `frontend/tests/adminSubdRetirementPhase2.browser.mjs`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1544_phase2-current-dashboard.md`
- **Authorization:** User explicitly requested "phase 2" of the Barangay trace removal checklist (B03-B07).
- **Type:** Fix

## Intent

Complete this Phase 2 cleanup item while preserving external referrals, actual historical records and supported subdivision workflows.

## Key changes

- Remove current dashboard claims/holding cards, recent-claims panels and retired rescue/claims/holding fetches/state.
- Build the priority queue from subdivision report verification, priority and leader assignment rather than a retired rescue queue.
- Count status-4 referrals separately from old statuses 5/13, use external-referral wording, and retain current report/pet shortcuts with a compact three-card summary.
- Retain historical report/status decoding and all underlying records; no case transitions are submitted by this cleanup.

## Validation evidence

- Targeted 390/1280px tests passed for count separation, correct referral navigation and absence of retired queue fetches. Existing referral browser regression and 14 real-Leaflet map scenarios passed.
- `RETIREMENT_PHASE2_TEST_URL=http://127.0.0.1:5180 node frontend/tests/adminSubdRetirementPhase2.browser.mjs`: complete B03-B07 suite passed at 390/1280px with mocked APIs and map props; no case/custody/ownership mutations or uncaught errors.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains.
- `git diff --check`: passed. Strict documentation audit retains the same 12 pre-existing findings.
- Real GPS/providers, deployed configuration and production data were not exercised. No migrations or historical record rewrites were performed.
