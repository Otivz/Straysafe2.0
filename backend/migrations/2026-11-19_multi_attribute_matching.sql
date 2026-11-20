-- =============================================================================================================
-- StraySafe 2.0: Multi-attribute animal matching (2026-11-19)
-- docs/01-system/MULTI_ATTRIBUTE_MATCHING.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- ADDITIVE ONLY: five nullable columns on lost_found_matches. Nothing is dropped, renamed or rewritten; existing
-- possible matches keep their score and are shown with a breakdown computed when they are opened.
-- The backend's start-up case alignment step (app/db_migrations/case_alignment.py) makes the same change, so starting
-- the backend applies it. To apply it by hand instead (running it twice changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-19_multi_attribute_matching.sql"
-- =============================================================================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_matches' AND COLUMN_NAME = 'analysis');
SET @ddl := IF(@has = 0, 'ALTER TABLE lost_found_matches ADD COLUMN analysis JSON NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_matches' AND COLUMN_NAME = 'algorithm');
SET @ddl := IF(@has = 0, 'ALTER TABLE lost_found_matches ADD COLUMN algorithm VARCHAR(40) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_matches' AND COLUMN_NAME = 'history');
SET @ddl := IF(@has = 0, 'ALTER TABLE lost_found_matches ADD COLUMN history JSON NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_matches' AND COLUMN_NAME = 'visual');
SET @ddl := IF(@has = 0, 'ALTER TABLE lost_found_matches ADD COLUMN visual JSON NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_matches' AND COLUMN_NAME = 'review_note');
SET @ddl := IF(@has = 0, 'ALTER TABLE lost_found_matches ADD COLUMN review_note TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
