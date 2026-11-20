-- =============================================================================================================
-- StraySafe 2.0: Possible Pet Owner Verification (2026-11-20)
-- docs/01-system/POSSIBLE_OWNER_VERIFICATION.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- ADDITIVE ONLY: four columns on pet_match_confirmation_requests (the conversation, the follow-up count and date, the
-- status history). Nothing is dropped, renamed or rewritten; existing requests keep their status and get follow_up_count 0.
-- The new status UNABLE_TO_CONTACT fits the existing VARCHAR(40) status column.
-- The backend's start-up case alignment step (app/db_migrations/case_alignment.py, ensure_pet_match_confirmation_columns)
-- makes the same change, so starting the backend applies it. To apply it by hand instead (running it twice changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-20_possible_owner_verification.sql"
-- =============================================================================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_match_confirmation_requests' AND COLUMN_NAME = 'thread_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE pet_match_confirmation_requests ADD COLUMN thread_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_match_confirmation_requests' AND COLUMN_NAME = 'follow_up_count');
SET @ddl := IF(@has = 0, 'ALTER TABLE pet_match_confirmation_requests ADD COLUMN follow_up_count INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_match_confirmation_requests' AND COLUMN_NAME = 'last_follow_up_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE pet_match_confirmation_requests ADD COLUMN last_follow_up_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_match_confirmation_requests' AND COLUMN_NAME = 'events');
SET @ddl := IF(@has = 0, 'ALTER TABLE pet_match_confirmation_requests ADD COLUMN events JSON NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
