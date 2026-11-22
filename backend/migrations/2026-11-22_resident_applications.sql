-- =============================================================================================================
-- StraySafe 2.0: Individual self-registration with residency verification (2026-11-22)
-- docs/01-system/RESIDENT_RECORD_REGISTRATION.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- Apply ONCE, after 2026-11-22_resident_invitations.sql and before starting the backend with this release:
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-22_resident_applications.sql"
--
-- ADDITIVE ONLY: one new table. The users table is not altered; existing and bulk-created accounts are untouched.
-- Running it a second time changes nothing (CREATE TABLE IF NOT EXISTS).
-- =============================================================================================================

CREATE TABLE IF NOT EXISTS resident_applications (
  application_id    INT NOT NULL AUTO_INCREMENT,
  user_id           INT NOT NULL,
  subdivision_id    INT NOT NULL,
  full_name         VARCHAR(150) NOT NULL,
  email             VARCHAR(100) NOT NULL,
  contact_number    VARCHAR(20) NULL,
  block_number      VARCHAR(30) NOT NULL,
  lot_number        VARCHAR(30) NOT NULL,
  status            VARCHAR(40) NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  email_verified_at DATETIME NULL,
  reviewed_by       INT NULL,
  reviewed_at       DATETIME NULL,
  rejection_reason  TEXT NULL,
  resubmit_count    INT NOT NULL DEFAULT 0,
  resubmitted_at    DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (application_id),
  UNIQUE KEY uq_resident_application_user (user_id),
  KEY ix_resident_applications_subdivision_status (subdivision_id, status),
  KEY ix_resident_applications_email (email),
  CONSTRAINT fk_ra_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id),
  CONSTRAINT fk_ra_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
