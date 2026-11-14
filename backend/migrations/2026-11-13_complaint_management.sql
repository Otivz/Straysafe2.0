-- =============================================================================================================
-- StraySafe 2.0: Complaint management and progressive enforcement (2026-11-13)
-- docs/01-system/COMPLAINT_MANAGEMENT.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- ADDITIVE ONLY: five new tables and four new columns on reports. Nothing is dropped, renamed or rewritten.
-- Apply it ONCE to your database, before you start the backend with this release:
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-13_complaint_management.sql"
--
--   (works in Windows PowerShell, which has no '<' input redirection; use your own MySQL user and the database
--   named in DATABASE_URL, straysafe_subdivision in the local setup)
--
-- (or import it in phpMyAdmin / MySQL Workbench). Running it a second time changes nothing.
-- The backend never creates these at start-up: it checks for them and refuses to start, with this file's name,
-- until they exist.
-- =============================================================================================================

-- ------------------------------------------------------------------------------------------- reports: 4 columns
-- When the resident saw it (the report form asks; until now it was only written into the description), and what the
-- complainant knows about the owner: a lead for the Subdivision Leader, never a finding. Shown to the reporter and staff only.
-- MySQL has no ADD COLUMN IF NOT EXISTS, so each column is added only when it is missing.
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'seen_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE reports ADD COLUMN seen_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'suspected_owner_name');
SET @ddl := IF(@has = 0, 'ALTER TABLE reports ADD COLUMN suspected_owner_name VARCHAR(150) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'suspected_owner_address');
SET @ddl := IF(@has = 0, 'ALTER TABLE reports ADD COLUMN suspected_owner_address VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'suspected_owner_details');
SET @ddl := IF(@has = 0, 'ALTER TABLE reports ADD COLUMN suspected_owner_details TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------- the person responsible (respondent)
-- A resident with an account, or a household recorded by name and house address. Never deleted: when an account goes,
-- user_id becomes NULL and the name and address stay, so the history survives.
CREATE TABLE IF NOT EXISTS complaint_respondents (
  respondent_id   INT          NOT NULL AUTO_INCREMENT,
  subdivision_id  INT          NOT NULL,
  user_id         INT          NULL,
  name            VARCHAR(150) NOT NULL,
  address         VARCHAR(255) NOT NULL,
  created_by      INT          NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (respondent_id),
  UNIQUE KEY uq_complaint_respondent_user (subdivision_id, user_id),
  KEY ix_complaint_respondents_subdivision (subdivision_id),
  CONSTRAINT fk_complaint_respondents_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_complaint_respondents_user        FOREIGN KEY (user_id)        REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_complaint_respondents_created_by  FOREIGN KEY (created_by)     REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------- the Leader's findings on one complaint
-- One row per complaint (a nuisance report): which rule was broken (a copy of the confirmed policy's title and reference),
-- who is responsible and on what evidence, what is still being checked, which leads were ruled out, and a decision that
-- another complaint is a separate incident. Whether it happened stays in the report's existing incident verification.
CREATE TABLE IF NOT EXISTS complaint_findings (
  report_id                INT          NOT NULL,
  subdivision_id           INT          NOT NULL,
  policy_id                VARCHAR(60)  NULL,
  policy_title             VARCHAR(200) NULL,
  policy_reference         VARCHAR(200) NULL,
  no_rule                  TINYINT(1)   NOT NULL DEFAULT 0,
  respondent_id            INT          NULL,
  respondent_evidence      JSON         NULL,
  respondent_note          TEXT         NULL,
  respondent_by            INT          NULL,
  respondent_at            DATETIME     NULL,
  check_note               TEXT         NULL,
  check_by                 INT          NULL,
  check_at                 DATETIME     NULL,
  ruled_out                JSON         NULL,
  separate_from_report_id  INT          NULL,
  separate_by              INT          NULL,
  separate_at              DATETIME     NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id),
  KEY ix_complaint_findings_respondent (respondent_id),
  KEY ix_complaint_findings_subdivision (subdivision_id),
  CONSTRAINT fk_complaint_findings_report      FOREIGN KEY (report_id)               REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_complaint_findings_subdivision FOREIGN KEY (subdivision_id)          REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_complaint_findings_respondent  FOREIGN KEY (respondent_id)           REFERENCES complaint_respondents (respondent_id),
  CONSTRAINT fk_complaint_findings_separate    FOREIGN KEY (separate_from_report_id) REFERENCES reports (report_id) ON DELETE SET NULL,
  CONSTRAINT fk_complaint_findings_resp_by     FOREIGN KEY (respondent_by)           REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_complaint_findings_check_by    FOREIGN KEY (check_by)                REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_complaint_findings_sep_by      FOREIGN KEY (separate_by)             REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------------------------- offenses
-- The Leader's decision on one complaint: counted as the Nth offense of this person under this rule (the number as it was
-- confirmed), or not counted, with the reason. A correction never deletes a row: it is voided, with who, when and why.
CREATE TABLE IF NOT EXISTS complaint_offenses (
  offense_id        INT          NOT NULL AUTO_INCREMENT,
  report_id         INT          NOT NULL,
  subdivision_id    INT          NOT NULL,
  respondent_id     INT          NOT NULL,
  policy_id         VARCHAR(60)  NOT NULL,
  policy_title      VARCHAR(200) NOT NULL,
  policy_reference  VARCHAR(200) NULL,
  counted           TINYINT(1)   NOT NULL DEFAULT 1,
  offense_number    INT          NULL,
  incident_at       DATETIME     NOT NULL,
  note              TEXT         NULL,
  confirmed_by      INT          NULL,
  confirmed_at      DATETIME     NOT NULL,
  voided_at         DATETIME     NULL,
  voided_by         INT          NULL,
  void_reason       TEXT         NULL,
  PRIMARY KEY (offense_id),
  KEY ix_complaint_offenses_history (respondent_id, policy_id, voided_at),
  KEY ix_complaint_offenses_report (report_id),
  CONSTRAINT fk_complaint_offenses_report       FOREIGN KEY (report_id)      REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_complaint_offenses_subdivision  FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_complaint_offenses_respondent   FOREIGN KEY (respondent_id)  REFERENCES complaint_respondents (respondent_id),
  CONSTRAINT fk_complaint_offenses_confirmed_by FOREIGN KEY (confirmed_by)   REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_complaint_offenses_voided_by    FOREIGN KEY (voided_by)      REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------------- enforcement steps
-- What the rule asks for one counted offense: the first or second warning letter, the summons to the subdivision office,
-- the fine, the meeting at the Barangay. `state` is where it stands now; `details` holds the current facts (dates, who
-- received it, the place); every change is also an event below.
CREATE TABLE IF NOT EXISTS enforcement_steps (
  step_id      INT          NOT NULL AUTO_INCREMENT,
  offense_id   INT          NOT NULL,
  report_id    INT          NOT NULL,
  kind         VARCHAR(20)  NOT NULL,                     -- letter_1 | letter_2 | summons | fine | meeting
  state        VARCHAR(20)  NOT NULL,
  due_at       DATETIME     NULL,                         -- the summons or meeting time
  details      JSON         NULL,
  referral_id  INT          NULL,                         -- the meeting's entry in the Barangay referral log
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (step_id),
  UNIQUE KEY uq_enforcement_step (offense_id, kind),
  KEY ix_enforcement_steps_report (report_id),
  CONSTRAINT fk_enforcement_steps_offense  FOREIGN KEY (offense_id)  REFERENCES complaint_offenses (offense_id) ON DELETE CASCADE,
  CONSTRAINT fk_enforcement_steps_report   FOREIGN KEY (report_id)   REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_enforcement_steps_referral FOREIGN KEY (referral_id) REFERENCES barangay_referrals (referral_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only: every print, issue, delivery attempt, attendance, payment record and meeting outcome, with when it
-- happened (as the Leader says) and who recorded it. client_request_id makes a retried save return the first one.
CREATE TABLE IF NOT EXISTS enforcement_step_events (
  event_id           INT          NOT NULL AUTO_INCREMENT,
  step_id            INT          NOT NULL,
  report_id          INT          NOT NULL,
  kind               VARCHAR(30)  NOT NULL,
  occurred_at        DATETIME     NOT NULL,
  details            JSON         NULL,
  recorded_by        INT          NULL,
  recorded_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_request_id  VARCHAR(64)  NULL,
  PRIMARY KEY (event_id),
  UNIQUE KEY uq_enforcement_event_request (client_request_id),
  KEY ix_enforcement_events_step (step_id),
  KEY ix_enforcement_events_report (report_id),
  CONSTRAINT fk_enforcement_events_step        FOREIGN KEY (step_id)     REFERENCES enforcement_steps (step_id) ON DELETE CASCADE,
  CONSTRAINT fk_enforcement_events_report      FOREIGN KEY (report_id)   REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_enforcement_events_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
