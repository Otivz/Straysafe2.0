# Phase 2 B06: reference settings and retired designation guard

- **Date:** 2026-11-06 15:44 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Admin/AdminAccountSettings.tsx`, `frontend/src/pages/Subd_Leaders/SubdSettings.tsx`, `backend/app/routes/landmarks.py`, `backend/tests/test_retired_landmark_designations.py`, `docs/01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md`, `frontend/tests/adminSubdRetirementPhase2.browser.mjs`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1544-03_phase2-reference-settings.md`
- **Authorization:** User explicitly requested "phase 2" of the Barangay trace removal checklist (B03-B07).
- **Type:** Fix

## Intent

Complete this Phase 2 cleanup item while preserving external referrals, actual historical records and supported subdivision workflows.

## Key changes

- Describe external reference locations and case assignment/referral policies rather than active Barangay rescue headquarters or deployment dispatch.
- Remove new holding-place categories/designation controls from active landmark forms. Display saved historical facility types read-only; preserve existing type/coordinates on ordinary edits and the leader's explicit earlier-designation switch-off behavior.
- Close the corresponding server gap: use the existing retirement gate before new holding-flag or facility-category creation/conversion for Admin and leader requests. Keep ordinary reference editing, historical metadata retention and legacy Admin compatibility intact.
- No endpoint/schema/dependency/environment changes or configured-database edits.

## Validation evidence

- New isolated designation regression passed 25 checks. Existing isolated facility/map synchronization passed 20 checks with the legacy switch enabled only for that process. Targeted desktop/mobile settings checks passed normal creation/editing, reference wording and saved metadata preservation. A focused API-layer permission review is recommended: `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`, using guard call sites, rejection/atomicity tests and compatibility evidence; no security certification is claimed.
- `RETIREMENT_PHASE2_TEST_URL=http://127.0.0.1:5180 node frontend/tests/adminSubdRetirementPhase2.browser.mjs`: complete B03-B07 suite passed at 390/1280px with mocked APIs and map props; no case/custody/ownership mutations or uncaught errors.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains.
- `git diff --check`: passed. Strict documentation audit retains the same 12 pre-existing findings.
- Real GPS/providers, deployed configuration and production data were not exercised. No migrations or historical record rewrites were performed.
