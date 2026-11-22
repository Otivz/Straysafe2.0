-- =============================================================================================================
-- StraySafe 2.0: Official resident records and record-based registration (2026-11-22)
-- docs/01-system/RESIDENT_RECORD_REGISTRATION.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- ADDITIVE ONLY: four new tables. Nothing existing is altered, dropped or rewritten. Apply it ONCE, before you start the
-- backend with this release:
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-22_resident_registry.sql"
--
--   (use your own MySQL user and the database named in DATABASE_URL)
--
-- Running it a second time changes nothing (CREATE TABLE IF NOT EXISTS). The backend never creates these at start-up:
-- it checks for them and refuses to start, with this file's name, until they exist.
-- =============================================================================================================

CREATE TABLE IF NOT EXISTS resident_import_batches (
  batch_id             INT NOT NULL AUTO_INCREMENT,
  subdivision_id       INT NOT NULL,
  uploaded_by          INT NULL,
  filename             VARCHAR(255) NOT NULL,
  file_sha256          VARCHAR(64) NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'Validated',
  total_rows           INT NOT NULL DEFAULT 0,
  valid_rows           INT NOT NULL DEFAULT 0,
  duplicate_rows       INT NOT NULL DEFAULT 0,
  invalid_rows         INT NOT NULL DEFAULT 0,
  missing_rows         INT NOT NULL DEFAULT 0,
  imported_rows        INT NOT NULL DEFAULT 0,
  linked_existing_rows INT NOT NULL DEFAULT 0,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at         DATETIME NULL,
  confirmed_by         INT NULL,
  PRIMARY KEY (batch_id),
  KEY ix_resident_import_batches_subdivision_id (subdivision_id),
  KEY ix_resident_import_batches_status (status),
  CONSTRAINT fk_rib_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_rib_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_rib_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resident_import_rows (
  row_id           INT NOT NULL AUTO_INCREMENT,
  batch_id         INT NOT NULL,
  `row_number`     INT NOT NULL,
  full_name        VARCHAR(150) NULL,
  email            VARCHAR(100) NULL,
  block_number     VARCHAR(30) NULL,
  lot_number       VARCHAR(30) NULL,
  contact_number   VARCHAR(20) NULL,
  result           VARCHAR(12) NOT NULL,
  reason           VARCHAR(255) NULL,
  existing_user_id INT NULL,
  PRIMARY KEY (row_id),
  KEY ix_resident_import_rows_batch_result (batch_id, result, `row_number`),
  CONSTRAINT fk_rir_batch FOREIGN KEY (batch_id) REFERENCES resident_import_batches (batch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS official_resident_records (
  record_id           INT NOT NULL AUTO_INCREMENT,
  subdivision_id      INT NOT NULL,
  full_name           VARCHAR(150) NOT NULL,
  name_key            VARCHAR(150) NOT NULL,
  email               VARCHAR(100) NOT NULL,
  block_number        VARCHAR(30) NOT NULL,
  block_key           VARCHAR(30) NOT NULL,
  lot_number          VARCHAR(30) NOT NULL,
  lot_key             VARCHAR(30) NOT NULL,
  contact_number      VARCHAR(20) NULL,
  registration_status VARCHAR(30) NOT NULL DEFAULT 'Available for Registration',
  user_id             INT NULL,
  imported_batch_id   INT NULL,
  registered_at       DATETIME NULL,
  deactivated_at      DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id),
  UNIQUE KEY uq_official_resident_email (subdivision_id, email),
  UNIQUE KEY uq_official_resident_identity (subdivision_id, name_key, block_key, lot_key),
  UNIQUE KEY uq_official_resident_user (user_id),
  KEY ix_official_resident_lookup (subdivision_id, block_key, lot_key),
  KEY ix_official_resident_records_subdivision_id (subdivision_id),
  KEY ix_official_resident_records_registration_status (registration_status),
  KEY ix_official_resident_records_imported_batch_id (imported_batch_id),
  CONSTRAINT fk_orr_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_orr_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_orr_batch FOREIGN KEY (imported_batch_id) REFERENCES resident_import_batches (batch_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resident_registration_attempts (
  attempt_id        INT NOT NULL AUTO_INCREMENT,
  record_id         INT NOT NULL,
  token_hash        VARCHAR(64) NOT NULL,
  otp_hash          VARCHAR(64) NOT NULL,
  expires_at        DATETIME NOT NULL,
  attempts          INT NOT NULL DEFAULT 0,
  max_attempts      INT NOT NULL DEFAULT 5,
  resend_count      INT NOT NULL DEFAULT 0,
  last_sent_at      DATETIME NULL,
  email_sent        TINYINT(1) NOT NULL DEFAULT 0,
  otp_verified_at   DATETIME NULL,
  setup_token_hash  VARCHAR(64) NULL,
  setup_expires_at  DATETIME NULL,
  is_closed         TINYINT(1) NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id),
  UNIQUE KEY uq_rra_token_hash (token_hash),
  UNIQUE KEY uq_rra_setup_token_hash (setup_token_hash),
  KEY ix_resident_registration_attempts_record_id (record_id),
  CONSTRAINT fk_rra_record FOREIGN KEY (record_id) REFERENCES official_resident_records (record_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
