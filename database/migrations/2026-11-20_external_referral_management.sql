-- External Referral Management (2026-11-20)
-- Adds structured priority, supporting documents, agency response details, and outcome fields
-- to barangay_referrals and barangay_referral_updates.

ALTER TABLE barangay_referrals
    ADD COLUMN IF NOT EXISTS priority_level VARCHAR(20) NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS supporting_documents TEXT NULL,
    ADD COLUMN IF NOT EXISTS additional_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS assistance_provided TEXT NULL,
    ADD COLUMN IF NOT EXISTS actions_completed TEXT NULL;

ALTER TABLE barangay_referral_updates
    ADD COLUMN IF NOT EXISTS responder_name VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS assistance_provided TEXT NULL,
    ADD COLUMN IF NOT EXISTS progress_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT NULL,
    ADD COLUMN IF NOT EXISTS additional_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS supporting_documents TEXT NULL;
