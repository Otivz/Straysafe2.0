-- =============================================================================================================
-- StraySafe 2.0: advisory Evidence Check on the case AI insights (2026-11-24)
-- Adds one nullable column to case_ai_insights (created by 2026-11-24_case_ai_insights.sql, apply that first).
--
-- Apply ONCE before starting the backend with this release (running it again changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-24_case_ai_insights_evidence.sql"
--
-- ADDITIVE ONLY: existing insight rows keep NULL, which reads as "no evidence check made".
-- =============================================================================================================

SET @db := DATABASE();

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'case_ai_insights' AND COLUMN_NAME = 'evidence_check') = 0,
  'ALTER TABLE case_ai_insights ADD COLUMN evidence_check TEXT NULL COMMENT ''JSON: status, flags, summary, confidence (advisory)'' AFTER category_reason', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
