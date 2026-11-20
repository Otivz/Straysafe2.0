-- Enforce one permanent, unique QR tag per pet on pet_tags
UPDATE pet_tags
SET status = 'active', disabled_at = NULL, disabled_by = NULL
WHERE status <> 'active';

CREATE UNIQUE INDEX uq_pet_tags_pet_id ON pet_tags (pet_id);
