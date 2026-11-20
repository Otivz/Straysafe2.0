-- Add last_scanned_at column to pet_tags for authoritative 1-hour per-QR-code scan cooldown
ALTER TABLE pet_tags
  ADD COLUMN IF NOT EXISTS last_scanned_at DATETIME NULL AFTER created_at;
