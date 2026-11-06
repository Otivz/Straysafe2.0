# Subdivision-only Phase 1: Barangay access gate

- **Date:** 2026-11-05 10:18 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5 and Claude Sonnet 5.5)
- **Files changed:** `backend/app/utils/retired.py` (new), `backend/app/main.py`, `backend/app/utils/auth.py`, `backend/app/routes/auth.py`, `backend/app/routes/matches.py`, `backend/app/routes/pets.py`, `backend/app/services/email_service.py`, `backend/app/services/push_service.py`, `backend/app/tasks/unassigned_checker.py`, `backend/tests/test_barangay_gate.py` (new), `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-11-05_1018_subdivision-only-phase1-barangay-gate.md`
- **Authorization:** The developer's Subdivision-only decisions of 2026-11-04 (Hybrid approach; retire holding, adoption, claiming and impound; delete the Barangay user last) and the explicit instruction "start phase 1" on 2026-11-05.
- **Type:** Feature

## Intent

Phase 1 of [SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md](../../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md): StraySafe serves the subdivision only. The Barangay no longer signs in, and its workflows are kept as read-only history. No data is deleted and no schema changes.

## Key changes

- **One switch, off by default** (`backend/app/utils/retired.py`): `BARANGAY_WORKFLOWS_ENABLED` environment variable; unset means Subdivision-only. Setting it to `1` restores the two-client behavior exactly.
- **Barangay accounts (role 3) refused:** in `get_pending_user` (covers every dependency built on it), `get_optional_user`, the unused `get_actor_user` helpers, and every sign-in path: password login, `finish_login` (login code and 2FA), Google sign-in, OTP verification, token refresh (cookie cleared). Message: "Barangay accounts are no longer used in StraySafe…".
- **Retired workflows read-only:** the dependency `retired_workflow` is attached on the nine `include_router` lines in `main.py` (rescue, rescue alias, holding, claims, adoption chat, adoption tasks, adoption certificates, claim assessments, adoptions). Reads stay open; writes are refused for every role, except the kept routes in `KEPT_WRITE_ROUTES`: `POST /rescue-requests/` (leader escalation until Phase 3), `POST /claims/` and `PATCH /claims/{claim_id}/status` (owner-return step).
- **No email or push to Barangay accounts:** central checks in `queue_email` (by `user_id`, or by address when no `user_id`) and in the push `skip_reason`. In-app notification rows are still written but cannot be read.
- **Overdue-holding reminder task off** when the switch is off; its role list fixed from `[3, 4, 5]` to `[3, 4]` (role 5 does not exist).
- **Not changed:** Barangay push links in `utils/push_categories.py` (needed if the switch is turned on), `require_barangay_approval`, and the frontend (Phase 3).

## Validation evidence

- `backend/tests/test_barangay_gate.py` (throwaway SQLite): **50 of 50 checks pass**.
- Full backend suite (`backend/tests/test_*.py`, each script run once with the `.env` values):
  - Original code at `73f0ebf` (clean worktree): 121 of 122 pass; `test_multi_animal_split` already failing.
  - Changed code with `BARANGAY_WORKFLOWS_ENABLED=1`: 122 of 123 pass, identical per file to the original plus the new test.
  - Changed code, default (gate on): 77 of 123 pass. The 46 failures were each inspected: every one comes from a role-3 (Barangay or Head Officer) account being refused, or a retired-workflow write being refused, including follow-on errors in the same test. Residents, leaders and the Administrator are not blocked in kept features (for example `test_claim_identity`: roles 2 and 4 still decide claims; only the role-3 subtest fails).
  - Tests that need `BARANGAY_WORKFLOWS_ENABLED=1` until they are rewritten in Phase 5: `test_account_self_edit`, `test_admin_2fa`, `test_adoption_authority`, `test_adoption_catalog_handover`, `test_adoption_certificate`, `test_adoption_chat`, `test_adoption_eligibility`, `test_adoption_task_superseded`, `test_adoption_tasks`, `test_announcement_access`, `test_announcement_security`, `test_app_stay_signed_in`, `test_case_gating`, `test_case_review`, `test_case_review_multireport`, `test_change_password`, `test_chat_governance`, `test_claim_fees`, `test_claim_identity`, `test_claims_scope`, `test_facility_and_map_sync`, `test_false_alarm_auth`, `test_holding_leader_barangay_view`, `test_holding_list_queries`, `test_holding_stay_limit`, `test_inactive_staff_assignments`, `test_live_dispatch_and_pickup`, `test_location_custody`, `test_lost_pet_sighting_ping`, `test_manual_matching`, `test_matches_gaps`, `test_monitoring_logs`, `test_owner_observation_updates`, `test_owner_return`, `test_owner_warning_rules`, `test_pet_adoption_lock`, `test_pet_behavior_history`, `test_pet_handover_sync`, `test_pet_owner_confirmation`, `test_pet_record_access`, `test_report_edit_auth`, `test_report_print_log`, `test_report_visibility`, `test_sidebar_badges`, `test_sidebar_ids` (plus the already-failing `test_multi_animal_split`).
- Some older scripts use the configured database (`straysafe_subdivision`), never `straysafe_db`.

## Known effects and follow-ups

- The frontend still shows Barangay pages and leader holding or claim actions; they now receive 403 until Phase 3 hides them.
- Security note (pre-existing, not exploitable today): `get_actor_user` in `routes/pets.py` and `routes/matches.py` trusts an `x-user-id` header. Nothing calls it; deleting it is recommended.
