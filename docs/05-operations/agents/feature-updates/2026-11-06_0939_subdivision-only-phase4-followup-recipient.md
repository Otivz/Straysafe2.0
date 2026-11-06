# Subdivision-only Phase 4: follow-up referral recipient

- **Date:** 2026-11-06 09:39 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `backend/app/utils/owner_followups.py`, `backend/tests/test_owner_followups.py`, `docs/01-system/OWNER_FOLLOWUP_RULES.md`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_0939_subdivision-only-phase4-followup-recipient.md`
- **Authorization:** Developer request to implement Phase 4 only of the Subdivision-only restructuring; no Phases 5 or 6.
- **Type:** Fix

## Intent

Display the actual receiving Barangay on referred owner follow-ups without altering the observation or warning workflow.

## Key changes

- Both former hard-coded San Vicente captions now say Referred to Barangay <name>, preferring the referral record and falling back to the subdivision's Barangay; missing names use Referred to the Barangay.
- Mark the Barangay handling caption as outside StraySafe. Retain existing API keys, state classification, warnings, dates and transitions.
- Add isolated checks for a different subdivision Barangay, a different recorded recipient, external attribution and unchanged state; document the fallback.

## Validation evidence

- TypeScript build check: exit 0.
- test_owner_followups.py: 40 baseline checks, 44/44 after.
- test_under_observation_flow.py: 33/33; test_report_status_sync.py: 33/33.
- All use isolated SQLite. The integration runner emits existing missing-email-log warnings from its background test database; assertions and exit code pass.
