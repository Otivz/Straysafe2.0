-- Pet Owner Communication, Ownership Verification, Warning Management, and Automatic Notifications (2026-11-20)

ALTER TABLE case_message_members
    ADD COLUMN IF NOT EXISTS last_delivered_message_id INT NOT NULL DEFAULT 0;

ALTER TABLE owner_warnings
    ADD COLUMN IF NOT EXISTS warning_category VARCHAR(120) NULL,
    ADD COLUMN IF NOT EXISTS warning_subject VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS additional_details TEXT NULL,
    ADD COLUMN IF NOT EXISTS supporting_documents TEXT NULL,
    ADD COLUMN IF NOT EXISTS admin_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(40) NULL DEFAULT 'Sent',
    ADD COLUMN IF NOT EXISTS owner_response TEXT NULL,
    ADD COLUMN IF NOT EXISTS owner_responded_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS thread_id INT NULL,
    ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64) NULL;
