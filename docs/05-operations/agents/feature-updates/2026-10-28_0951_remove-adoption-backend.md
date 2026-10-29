# Adoption removed from the backend (Batch 1)

- **Date:** 2026-10-28 09:51 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:**
  - Deleted: `backend/app/routes/adoptions.py`, `backend/app/routes/adoption_chat.py`, `backend/app/routes/adoption_tasks.py`, `backend/app/routes/adoption_certificates.py`, `backend/app/schemas/adoption.py`, `backend/app/schemas/adoption_tasks.py`, `backend/app/utils/adoption_assignments.py`, `backend/app/utils/adoption_authority.py`, `backend/app/utils/id_security.py`, `backend/app/utils/pet_adoption.py`, `backend/scripts/migrate_adoption_9_stages.py`, `backend/scripts/backfill_adoption_promotion_history.py`, `backend/scripts/backfill_approved_adoption_pets.py`, `backend/scripts/repair_adopted_animal_whereabouts.py`
  - Deleted tests: `backend/tests/test_adoption_authority.py`, `backend/tests/test_adoption_available_again.py`, `backend/tests/test_adoption_catalog_handover.py`, `backend/tests/test_adoption_certificate.py`, `backend/tests/test_adoption_chat.py`, `backend/tests/test_adoption_local_times.py`, `backend/tests/test_adoption_single_record.py`, `backend/tests/test_adoption_task_superseded.py`, `backend/tests/test_adoption_tasks.py`, `backend/tests/test_id_security.py`, `backend/tests/test_pet_adoption_lock.py`
  - New test: `backend/tests/test_local_times.py` (the non-adoption checks kept from `test_adoption_local_times.py`)
  - Edited: `backend/app/main.py`, `backend/app/models/report.py`, `backend/app/routes/admin.py`, `backend/app/routes/chat.py`, `backend/app/routes/holding.py`, `backend/app/routes/pets.py`, `backend/app/routes/reports.py`, `backend/app/routes/sidebar.py`, `backend/app/schemas/chat.py`, `backend/app/schemas/pet.py`, `backend/app/services/analytics_service.py`, `backend/app/tasks/unassigned_checker.py`, `backend/app/utils/pet_record_access.py`, `backend/app/utils/push_categories.py`, `backend/scripts/run_admin_readiness_audit.py`
  - Edited tests: `backend/tests/test_account_self_edit.py`, `backend/tests/test_analytics.py`, `backend/tests/test_chat_isolation.py`, `backend/tests/test_inactive_staff_assignments.py`, `backend/tests/test_multi_animal_split.py`, `backend/tests/test_pet_behavior_history.py`, `backend/tests/test_pet_record_access.py`, `backend/tests/test_phase_2_stability.py`, `backend/tests/test_phone_validation.py`, `backend/tests/test_push_notifications.py`, `backend/tests/test_sidebar_badges.py`
  - Docs: `docs/06-future-proposals/REMOVE_ADOPTION_PLAN.md` (new), `docs/README.md`, this record
- **Authorization:** the developer: the panel did not approve adoption; "1. yes" to removing it from the whole system; "4. after the 7 days Impound is the only option also it can extend the hold whenever it wants to"; then "Lets do it remove the adoption feature".
- **Type:** Fix (scope reduction: removes a feature the panel rejected)

## Intent

Adoption is not part of StraySafe. Batch 1 of `REMOVE_ADOPTION_PLAN.md` removes it from the backend so no endpoint, job, count, notification or status can create or show adoption work.

## Key changes

- The 4 adoption routers are no longer registered; their route, schema and helper files are deleted, along with the adoption startup migrations and one-off adoption scripts. `ensure_adoption_tasks_schema` is now `ensure_extra_columns()` and keeps only the non-adoption columns.
- The 9 adoption models and `HoldingAnimal.adoptions` are removed. The tables themselves stay in the local database (empty) until Batch 3.
- Holding: status 6 (For Adoption) and 7 (Adopted) are refused with HTTP 400. Only Barangay staff and administrators can mark an animal Impounded. The overdue notice now asks staff to impound or extend the hold.
- Counts and badges: adoption counts removed from admin, report badge counts, the sidebar badge and analytics (`holding_and_adoption`, `total_adoptions`).
- The adoption monitoring-schedule job, push category, push links and adoption chat branches are removed. An old `Adoption` chat thread is never opened.
- Pet records: ownership and edit access no longer consider adoption; editable holding statuses are 1 and 2.
- Kept on purpose (harmless, decided in Batch 3): `facility_status` rows 6 and 7, the `push_adoptions` preference column, the `Adoption` chat thread enum value, and the holding columns `adoption_catalog_notes`, `promoted_at`, `promoted_by`.

## Validation evidence

- Every router imports; the models build 53 tables, none of them adoption.
- Full isolated backend suite (every `tests/test_*.py` using a throwaway SQLite database): 77 of 77 files pass. `test_pet_record_access.py` and `test_pet_behavior_history.py` used status 6 as "in care"; their setup now uses status 2 (Healthy).
- Not yet done: the frontend still calls the removed endpoints until Batch 2 (those calls now return 404).
