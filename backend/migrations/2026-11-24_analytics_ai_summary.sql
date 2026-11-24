-- =============================================================================================================
-- StraySafe 2.0: cached "AI Trend & Hotspot Summary" for the Analytics page (2026-11-24)
-- One cached Gemini summary per subdivision, date range and hash of the aggregated statistics. It only SUGGESTS (advisory text).
-- It holds no personal data: only aggregated, anonymised statistics are sent, and the answer is cleaned again before it is stored.
--
-- Apply ONCE before starting the backend with this release (running it again changes nothing):
--
--     mysql -u root -p straysafe_subdivision -e "source backend/migrations/2026-11-24_analytics_ai_summary.sql"
--
-- ADDITIVE ONLY: one new table. No existing table or row is touched.
-- =============================================================================================================

CREATE TABLE IF NOT EXISTS analytics_ai_summaries (
  summary_id          INT          NOT NULL AUTO_INCREMENT,
  subdivision_id      INT          NOT NULL,
  range_start         DATE         NOT NULL,
  range_end           DATE         NOT NULL,
  stats_hash          VARCHAR(64)  NOT NULL,
  trend_summary       TEXT         NOT NULL,
  hotspot_explanation TEXT         NOT NULL,
  repeat_patterns     TEXT         NOT NULL COMMENT 'JSON list of strings',
  monthly_digest      TEXT         NOT NULL,
  model               VARCHAR(60)  NULL,
  generated_by        INT          NULL,
  generated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (summary_id),
  UNIQUE KEY uq_analytics_ai_summary (subdivision_id, range_start, range_end, stats_hash),
  KEY ix_analytics_ai_summaries_subdivision (subdivision_id),
  CONSTRAINT fk_analytics_ai_summaries_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id) ON DELETE CASCADE,
  CONSTRAINT fk_analytics_ai_summaries_user        FOREIGN KEY (generated_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
