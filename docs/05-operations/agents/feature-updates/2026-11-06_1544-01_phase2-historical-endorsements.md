# Phase 2 B04: historical endorsement provenance

- **Date:** 2026-11-06 15:44 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Subd_Leaders/EndorsementArch.tsx`, `docs/01-system/BARANGAY_REFERRAL_LOG.md`, `frontend/tests/adminSubdRetirementPhase2.browser.mjs`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1544-01_phase2-historical-endorsements.md`
- **Authorization:** User explicitly requested "phase 2" of the Barangay trace removal checklist (B03-B07).
- **Type:** Fix

## Intent

Complete this Phase 2 cleanup item while preserving external referrals, actual historical records and supported subdivision workflows.

## Key changes

- Label saved earlier dispatch data as historical; remove Live, awaiting-dispatch sync and automatic-activity claims.
- Remove five-second mission polling. The current referral/document list retains its slower refresh and existing update actions.
- Show only recorded report/endorsement dates, real assignment data and saved rescue status. Do not infer a deployed team or secured animal from a resolved report.
- Preserve saved letters, actual staff names and current externally reported referral updates.

## Validation evidence

- Targeted desktop/mobile tests passed for both earlier/current letters, real assignment preservation, provenance and absence of a five-second mission poller. Existing referral browser regression passed.
- `RETIREMENT_PHASE2_TEST_URL=http://127.0.0.1:5180 node frontend/tests/adminSubdRetirementPhase2.browser.mjs`: complete B03-B07 suite passed at 390/1280px with mocked APIs and map props; no case/custody/ownership mutations or uncaught errors.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains.
- `git diff --check`: passed. Strict documentation audit retains the same 12 pre-existing findings.
- Real GPS/providers, deployed configuration and production data were not exercised. No migrations or historical record rewrites were performed.
