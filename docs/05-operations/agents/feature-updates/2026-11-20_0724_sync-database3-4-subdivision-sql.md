# Sync Database3.4_subdivision.sql and .txt with all branch schema updates

- **Date:** 2026-11-20 07:24 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen High)
- **Files changed:** `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `docs/README.md`
- **Authorization:** Direct user request to update `Database3.4_subdivision.sql` with all database schema changes on the branch.
- **Type:** Fix

## Intent

Bring `Database3.4_subdivision.sql` (and its identical copy `Database3.4_subdivision.txt`) fully in sync with every model and SQL migration introduced on the `update` branch so fresh database initializations include all current tables, columns, and constraints.

## Key changes

- `Database3.4_subdivision.sql` & `Database3.4_subdivision.txt`:
  - `pets`: added `colors` (`json DEFAULT NULL`).
  - `pet_tags`: added `last_scanned_at` (`datetime DEFAULT NULL`) and changed `ix_pet_tags_pet_id` to `UNIQUE KEY uq_pet_tags_pet_id (pet_id)`.
  - `reports`: widened `animal_type` from `ENUM` to `varchar(100) DEFAULT 'Unknown'` and added `animal_colors` (`json DEFAULT NULL`).
  - `pet_match_confirmation_requests`: added `thread_id`, `follow_up_count`, `last_follow_up_at`, `events`.
  - `owner_warnings`: added `warning_category`, `warning_subject`, `additional_details`, `supporting_documents`, `admin_notes`, `workflow_status`, `owner_response`, `owner_responded_at`, `thread_id`, `client_request_id`.
  - `barangay_referrals`: added `priority_level`, `supporting_documents`, `additional_notes`, `assistance_provided`, `actions_completed`.
  - `barangay_referral_updates`: added `responder_name`, `assistance_provided`, `progress_notes`, `follow_up_instructions`, `additional_notes`, `supporting_documents`.
  - `lost_found_matches`: added `analysis`, `algorithm`, `history`, `visual`, `review_note`.
  - `case_message_threads`: made `report_id` nullable and added `subject`, `close_trigger`.
  - `case_message_members`: added `last_delivered_message_id`.
  - Added new table `qr_collar_requests` matching `backend/app/models/qr_collar_request.py`.

## Validation evidence

- `git diff --stat Database3.4_subdivision.sql Database3.4_subdivision.txt` — verified identical updates across both files.
