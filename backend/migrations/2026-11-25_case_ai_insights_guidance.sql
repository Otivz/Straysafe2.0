-- =============================================================================================================
-- StraySafe 2.0: advisory case guidance on the case AI insights (2026-11-25)
-- Next steps, missing information and a case recap. Adds one nullable column to case_ai_insights
-- (created by 2026-11-24_case_ai_insights.sql, then 2026-11-24_case_ai_insights_evidence.sql: apply those first).
--
-- Apply ONCE before starting the backend with this release (running it again changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-25_case_ai_insights_guidance.sql"
--
-- ADDITIVE ONLY: existing insight rows keep NULL, which reads as "no guidance made yet" (the next Refresh makes it).
-- =============================================================================================================

SET @db := DATABASE();

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'case_ai_insights' AND COLUMN_NAME = 'guidance') = 0,
  'ALTER TABLE case_ai_insights ADD COLUMN guidance TEXT NULL COMMENT ''JSON: next steps, missing information, recap (advisory)'' AFTER evidence_check', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
