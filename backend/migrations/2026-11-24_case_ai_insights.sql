-- =============================================================================================================
-- StraySafe 2.0: cached "AI Insights (Suggested)" for a case (2026-11-24)
-- One cached Gemini suggestion (summary, suggested priority, category check) per report content. It only SUGGESTS:
-- nothing in this table is ever applied to a report by itself. It holds no personal data (the text was redacted first).
--
-- Apply ONCE before starting the backend with this release (running it again changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-24_case_ai_insights.sql"
--
-- ADDITIVE ONLY: one new table. No existing table or row is touched.
-- =============================================================================================================

CREATE TABLE IF NOT EXISTS case_ai_insights (
  insight_id          INT          NOT NULL AUTO_INCREMENT,
  report_id           INT          NOT NULL,
  content_hash        VARCHAR(64)  NOT NULL,
  summary             TEXT         NOT NULL,
  suggested_priority  VARCHAR(10)  NOT NULL COMMENT 'Urgent | High | Normal',
  priority_confidence VARCHAR(10)  NULL COMMENT 'high | medium | low',
  priority_reason     TEXT         NULL,
  category_mismatch   TINYINT(1)   NOT NULL DEFAULT 0,
  suggested_category  VARCHAR(20)  NULL COMMENT 'a category family id, e.g. injured',
  category_reason     TEXT         NULL,
  model               VARCHAR(60)  NULL,
  generated_by        INT          NULL,
  generated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (insight_id),
  UNIQUE KEY uq_case_ai_insight_content (report_id, content_hash),
  KEY ix_case_ai_insights_report (report_id),
  CONSTRAINT fk_case_ai_insights_report FOREIGN KEY (report_id) REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_case_ai_insights_user   FOREIGN KEY (generated_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
