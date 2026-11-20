-- =============================================================================================================
-- StraySafe 2.0: Resident-to-Administration messaging (2026-11-19)
-- docs/01-system/RESIDENT_MESSAGING.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- ADDITIVE ONLY: two new nullable columns on case_message_threads, and its report_id becomes nullable (a resident's
-- general conversation is about no report). Nothing is dropped, renamed or rewritten; existing conversations keep
-- their report. Apply it ONCE to your database, before you start the backend with this release:
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-19_resident_messaging.sql"
--
--   (use your own MySQL user and the database named in DATABASE_URL, straysafe_subdivision in the local setup)
--
-- (or import it in phpMyAdmin / MySQL Workbench). Running it a second time changes nothing.
-- The backend never alters these at start-up: it checks for them and refuses to start, with this file's name,
-- until they exist.
-- =============================================================================================================

-- What the conversation is about ("Report SS-2026-0017: Injured", or the resident's own subject line)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'case_message_threads' AND COLUMN_NAME = 'subject');
SET @ddl := IF(@has = 0, 'ALTER TABLE case_message_threads ADD COLUMN subject VARCHAR(160) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- What ended it: case_closed (its report was resolved or closed), link_removed (a lost/found bridge), manual (staff)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'case_message_threads' AND COLUMN_NAME = 'close_trigger');
SET @ddl := IF(@has = 0, 'ALTER TABLE case_message_threads ADD COLUMN close_trigger VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- A general conversation has no report. The foreign key to reports stays as it is.
SET @nullable := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'case_message_threads' AND COLUMN_NAME = 'report_id');
SET @ddl := IF(@nullable = 'NO', 'ALTER TABLE case_message_threads MODIFY COLUMN report_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Earlier conversations of closed reports: record why they ended (the conversations themselves were already read-only).
UPDATE case_message_threads SET close_trigger = 'link_removed' WHERE status = 'closed' AND close_trigger IS NULL AND kind = 'bridge' AND close_reason LIKE '%removed the link%';
UPDATE case_message_threads SET close_trigger = 'case_closed' WHERE status = 'closed' AND close_trigger IS NULL;
