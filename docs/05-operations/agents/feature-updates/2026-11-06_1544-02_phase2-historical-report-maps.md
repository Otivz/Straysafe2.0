# Phase 2 B05: historical dispatch positions and GPS directions

- **Date:** 2026-11-06 15:44 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `docs/01-system/HEATMAP_RULES.md`, `frontend/tests/adminSubdRetirementPhase2.browser.mjs`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1544-02_phase2-historical-report-maps.md`
- **Authorization:** User explicitly requested "phase 2" of the Barangay trace removal checklist (B03-B07).
- **Type:** Fix

## Intent

Complete this Phase 2 cleanup item while preserving external referrals, actual historical records and supported subdivision workflows.

## Key changes

- Replace responder live-location subscription with a single earlier-position read for a legacy status-5 report, labelled Historical Dispatch even if its saved active flag is true.
- Remove live/en-route team banners and team/hall routing origins from both inline and expanded maps. Keep the hall only as an explicitly geographic reference.
- Use validated viewer GPS for directions; unreliable/denied/unavailable GPS stops navigation with feedback instead of substituting another origin.
- Preserve actual sighting/custody pins. Unknown historical facility coordinates no longer fall back to the hall.

## Validation evidence

- Targeted 390/1280px tests passed for current sighting/referral, stale active dispatch, known/unknown historical custody, map parity, one-time position reads and GPS success/denial. All 14 existing real-Leaflet map scenarios and current referral browser checks passed.
- `RETIREMENT_PHASE2_TEST_URL=http://127.0.0.1:5180 node frontend/tests/adminSubdRetirementPhase2.browser.mjs`: complete B03-B07 suite passed at 390/1280px with mocked APIs and map props; no case/custody/ownership mutations or uncaught errors.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains.
- `git diff --check`: passed. Strict documentation audit retains the same 12 pre-existing findings.
- Real GPS/providers, deployed configuration and production data were not exercised. No migrations or historical record rewrites were performed.
