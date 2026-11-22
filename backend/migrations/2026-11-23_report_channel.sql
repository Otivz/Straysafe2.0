-- =============================================================================================================
-- StraySafe 2.0: who reported a case and how (2026-11-23)
-- A Subdivision Leader can file a report themselves, or for a person who called, walked in or sent a message.
--
-- Apply ONCE before starting the backend with this release (running it again changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-23_report_channel.sql"
--
-- ADDITIVE ONLY: four nullable columns on reports. Existing reports keep NULL, which means "filed by the resident in the app".
-- =============================================================================================================

SET @db := DATABASE();

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'report_channel') = 0,
  'ALTER TABLE reports ADD COLUMN report_channel VARCHAR(10) NULL COMMENT ''NULL = app; self, call, walk_in, message, other = filed by staff''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'reported_by_name') = 0,
  'ALTER TABLE reports ADD COLUMN reported_by_name VARCHAR(150) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'reported_by_contact') = 0,
  'ALTER TABLE reports ADD COLUMN reported_by_contact VARCHAR(30) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'reported_on_behalf_of') = 0,
  'ALTER TABLE reports ADD COLUMN reported_on_behalf_of INT NULL, ADD KEY fk_reports_on_behalf_of (reported_on_behalf_of), ADD CONSTRAINT fk_reports_on_behalf_of FOREIGN KEY (reported_on_behalf_of) REFERENCES users (user_id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
