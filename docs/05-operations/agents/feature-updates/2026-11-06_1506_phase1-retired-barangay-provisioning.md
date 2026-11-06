# Phase 1 B01: retire Barangay account provisioning

- **Date:** 2026-11-06 15:06 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `backend/app/utils/retired.py`, `backend/app/routes/users.py`, `backend/tests/test_barangay_provisioning_retired.py`, `frontend/src/pages/Admin/AdminUserManagement.tsx`, `frontend/tests/adminRetirementPhase1.browser.mjs`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1506_phase1-retired-barangay-provisioning.md`
- **Authorization:** User explicitly requested "phase 1" after the ordered Barangay trace removal checklist and explanation of B01/B02.
- **Type:** Fix

## Intent

Complete the authorized Phase 1 item while preserving historical accounts, stored letters and external referrals.

## Key changes

- Add a shared retirement-switch-aware guard for new role-3 identities and head-officer authority. Apply it to both account creation paths, actual role/head changes and assign-head before position/account mutations. Preserve normal public resident registration and enabled legacy behavior.
- Refuse setup-invitation resends to retired Barangay identities.
- Remove Admin role-3 provisioning, head designation handlers/controls and Barangay position suggestions. Existing accounts remain visible through a historical filter with no write actions; the default list shows supported portal roles. No stored users are deleted or converted by this change.
- Add isolated backend coverage and a mocked browser regression; update current testing guidance and mark B01 complete.

## Validation evidence

- `test_barangay_provisioning_retired.py`: 44 checks passed against its throwaway SQLite database with mocked invitations.
- Existing `test_admin_invite.py`: 28 checks passed. Existing `test_barangay_gate.py`: 50 checks passed. All three scripts are isolated; no application database used.
- `PHASE1_ADMIN_TEST_URL=http://127.0.0.1:5180 node frontend/tests/adminRetirementPhase1.browser.mjs`: passed supported account creation/editing, role/position restrictions and read-only historical account UI at 390 and 1280px with mocked APIs.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains.
- `git diff --check`: passed. Strict documentation audit retains the same 12 pre-existing findings.
- A focused API-layer permission review is recommended because these paths assign account authority: `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`. Relevant evidence is the guard call sites, permitted-role matrix and isolated rejected-write/session tests. No worksheet or security certification is claimed.
