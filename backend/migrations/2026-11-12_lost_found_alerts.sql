-- =============================================================================================================
-- StraySafe 2.0: Lost & found notification alerts (2026-11-12)
-- docs/01-system/LOST_FOUND_ALERTS.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- ADDITIVE ONLY: two new tables and one new column. Nothing is dropped, renamed or rewritten.
-- Apply it ONCE to your database, before you start the backend with this release:
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-12_lost_found_alerts.sql"
--
--   (works in Windows PowerShell, which has no '<' input redirection; use your own MySQL user and the database
--   named in DATABASE_URL, straysafe_subdivision in the local setup)
--
-- (or import it in phpMyAdmin / MySQL Workbench). Running it a second time changes nothing.
-- The backend never creates these at start-up: it checks for them and refuses to start, with this file's name,
-- until they exist.
-- =============================================================================================================

-- One notification alert a Subdivision Leader sends about ONE lost-pet or found-animal case: its own title, message
-- and photo choice, where a tap goes, who receives it, and its schedule (now, at a time, or repeating). It is not the
-- Community notice (lost_pet_alerts) and never changes it.
CREATE TABLE IF NOT EXISTS case_alerts (
  alert_id          INT          NOT NULL AUTO_INCREMENT,
  report_id         INT          NOT NULL,
  subdivision_id    INT          NOT NULL,
  title             VARCHAR(80)  NOT NULL,
  message           VARCHAR(300) NOT NULL,
  include_photo     TINYINT(1)   NOT NULL DEFAULT 1,
  destination       VARCHAR(12)  NOT NULL DEFAULT 'notice',   -- notice | sighting | claim | inbox
  audience          VARCHAR(10)  NOT NULL DEFAULT 'all',      -- all | helpers
  mode              VARCHAR(8)   NOT NULL,                    -- now | later | repeat
  repeat_kind       VARCHAR(8)   NULL,                        -- every | times
  every_minutes     INT          NULL,
  times_of_day      VARCHAR(120) NULL,                        -- "07:00,12:00,18:00"
  start_at          DATETIME     NOT NULL,
  end_kind          VARCHAR(10)  NULL,                        -- resolved | date | count
  end_at            DATETIME     NULL,                        -- the end date, or the latest end of "until resolved"
  max_sends         INT          NULL,
  status            VARCHAR(10)  NOT NULL DEFAULT 'scheduled', -- scheduled | active | paused | finished | stopped | cancelled
  next_send_at      DATETIME     NULL,
  sends_done        INT          NOT NULL DEFAULT 0,
  stop_reason       VARCHAR(255) NULL,
  client_request_id VARCHAR(64)  NULL,
  created_by        INT          NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  stopped_at        DATETIME     NULL,
  stopped_by        INT          NULL,
  PRIMARY KEY (alert_id),
  UNIQUE KEY uq_case_alert_request (client_request_id),
  KEY ix_case_alerts_report (report_id),
  KEY ix_case_alerts_due (status, next_send_at),
  CONSTRAINT fk_case_alerts_report      FOREIGN KEY (report_id)      REFERENCES reports (report_id)           ON DELETE CASCADE,
  CONSTRAINT fk_case_alerts_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_case_alerts_created_by  FOREIGN KEY (created_by)     REFERENCES users (user_id)               ON DELETE SET NULL,
  CONSTRAINT fk_case_alerts_stopped_by  FOREIGN KEY (stopped_by)     REFERENCES users (user_id)               ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per planned send of an alert. The unique key (alert, planned time) is what makes a send happen once:
-- a second worker, a retry or a restart that tries the same occurrence is refused by the database.
CREATE TABLE IF NOT EXISTS case_alert_sends (
  send_id         INT         NOT NULL AUTO_INCREMENT,
  alert_id        INT         NOT NULL,
  slot_at         DATETIME    NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'sent',
  recipients      INT         NOT NULL DEFAULT 0,
  skipped_before  INT         NOT NULL DEFAULT 0,             -- planned sends missed while the server was down (never sent late)
  sent_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (send_id),
  UNIQUE KEY uq_case_alert_slot (alert_id, slot_at),
  CONSTRAINT fk_case_alert_sends_alert FOREIGN KEY (alert_id) REFERENCES case_alerts (alert_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The residents' switch "Lost & found alerts" (on by default). MySQL has no ADD COLUMN IF NOT EXISTS, so the column
-- is added only when it is missing.
SET @has_column := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_notification_preferences' AND COLUMN_NAME = 'push_lost_found_alerts');
SET @ddl := IF(@has_column = 0,
               'ALTER TABLE user_notification_preferences ADD COLUMN push_lost_found_alerts TINYINT(1) NOT NULL DEFAULT 1 AFTER push_messages',
               'SELECT ''push_lost_found_alerts is already there'' AS note');
PREPARE add_column FROM @ddl;
EXECUTE add_column;
DEALLOCATE PREPARE add_column;
