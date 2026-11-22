-- =============================================================================================================
-- StraySafe 2.0: Bulk resident account creation and account claiming (2026-11-22)
-- docs/01-system/RESIDENT_RECORD_REGISTRATION.md, docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md
--
-- Apply ONCE, after 2026-11-22_resident_registry.sql and before starting the backend with this release:
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-22_resident_invitations.sql"
--
-- What it does:
--   1. Adds the activation-invitation table (one row per resident record; the link token is stored only as a hash).
--   2. Renames the resident record statuses to the new account states:
--        'Registered' -> 'Active'      (residents who already registered are treated as Active)
--   3. Drops the old e-mail-code registration table, which the new flow no longer uses.
--
-- Nothing else is altered. Residents, pets, reports and messages are untouched. Running it twice changes nothing more.
-- Records still marked 'Available for Registration' / 'Registration Pending' have no account yet; they become
-- 'Pending Activation', and the backend creates the account the first time an invitation is sent for them (Send invitations).
-- =============================================================================================================

CREATE TABLE IF NOT EXISTS resident_invitations (
  invitation_id   INT NOT NULL AUTO_INCREMENT,
  record_id       INT NOT NULL,
  user_id         INT NULL,
  token_hash      VARCHAR(64) NULL,
  expires_at      DATETIME NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'Pending Delivery',
  send_count      INT NOT NULL DEFAULT 0,
  last_error      VARCHAR(255) NULL,
  last_sent_at    DATETIME NULL,
  claimed_at      DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (invitation_id),
  UNIQUE KEY uq_resident_invitation_record (record_id),
  UNIQUE KEY uq_resident_invitation_token (token_hash),
  KEY ix_resident_invitations_status (delivery_status),
  KEY ix_resident_invitations_user_id (user_id),
  CONSTRAINT fk_ri_record FOREIGN KEY (record_id) REFERENCES official_resident_records (record_id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE official_resident_records SET registration_status = 'Active' WHERE registration_status = 'Registered';
UPDATE official_resident_records SET registration_status = 'Pending Activation'
 WHERE registration_status IN ('Available for Registration', 'Registration Pending');

DROP TABLE IF EXISTS resident_registration_attempts;
