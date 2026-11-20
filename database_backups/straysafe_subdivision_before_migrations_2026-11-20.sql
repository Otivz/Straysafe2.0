-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: straysafe_subdivision
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `ai_jobs`
--

DROP TABLE IF EXISTS `ai_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_jobs` (
  `job_id` int NOT NULL AUTO_INCREMENT,
  `kind` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_id` int NOT NULL,
  `media_id` int DEFAULT NULL,
  `payload` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `attempts` int NOT NULL DEFAULT '0',
  `max_attempts` int NOT NULL DEFAULT '3',
  `error` text COLLATE utf8mb4_unicode_ci,
  `available_at` datetime NOT NULL,
  `locked_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`),
  KEY `ix_ai_jobs_job_id` (`job_id`),
  KEY `ix_ai_jobs_report_id` (`report_id`),
  KEY `idx_ai_jobs_status_available` (`status`,`available_at`),
  KEY `idx_ai_jobs_report_kind_status` (`report_id`,`kind`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ai_jobs`
--

LOCK TABLES `ai_jobs` WRITE;
/*!40000 ALTER TABLE `ai_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ai_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ai_vision_comparisons`
--

DROP TABLE IF EXISTS `ai_vision_comparisons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_vision_comparisons` (
  `pair_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `result` json NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pair_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ai_vision_comparisons`
--

LOCK TABLES `ai_vision_comparisons` WRITE;
/*!40000 ALTER TABLE `ai_vision_comparisons` DISABLE KEYS */;
/*!40000 ALTER TABLE `ai_vision_comparisons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcement_categories`
--

DROP TABLE IF EXISTS `announcement_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcement_categories` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcement_categories`
--

LOCK TABLES `announcement_categories` WRITE;
/*!40000 ALTER TABLE `announcement_categories` DISABLE KEYS */;
INSERT INTO `announcement_categories` VALUES (1,'Emergency Alert',NULL,'2026-07-31 18:32:56'),(2,'General Advisory',NULL,'2026-07-31 18:32:56'),(3,'Community Event',NULL,'2026-07-31 18:32:56'),(4,'Lost and Found',NULL,'2026-07-31 18:32:56'),(5,'Rabies Alert',NULL,'2026-07-31 18:32:56'),(6,'Rescue Operation',NULL,'2026-07-31 18:32:56');
/*!40000 ALTER TABLE `announcement_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcement_media`
--

DROP TABLE IF EXISTS `announcement_media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcement_media` (
  `media_id` int NOT NULL AUTO_INCREMENT,
  `announcement_id` int NOT NULL,
  `file_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `media_type` enum('Image','Video','Document') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `caption` text COLLATE utf8mb4_unicode_ci,
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`media_id`),
  KEY `fk_ann_media_announcement` (`announcement_id`),
  CONSTRAINT `fk_ann_media_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcement_media`
--

LOCK TABLES `announcement_media` WRITE;
/*!40000 ALTER TABLE `announcement_media` DISABLE KEYS */;
/*!40000 ALTER TABLE `announcement_media` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `announcement_id` int NOT NULL AUTO_INCREMENT,
  `subdivision_id` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `category_id` int DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `visibility` enum('Public','Subdivision Only','Barangay Only') COLLATE utf8mb4_unicode_ci DEFAULT 'Public',
  `priority_level` enum('Low','Normal','High','Emergency') COLLATE utf8mb4_unicode_ci DEFAULT 'Normal',
  `status` enum('Draft','Published','Archived') COLLATE utf8mb4_unicode_ci DEFAULT 'Published',
  `published_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `barangay_id` int DEFAULT NULL,
  `cover_image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`announcement_id`),
  KEY `fk_announcements_subdivision` (`subdivision_id`),
  KEY `fk_announcements_user` (`created_by`),
  KEY `fk_announcements_category` (`category_id`),
  KEY `idx_announcements_published` (`published_at`,`status`),
  CONSTRAINT `fk_announcements_category` FOREIGN KEY (`category_id`) REFERENCES `announcement_categories` (`category_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_announcements_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_announcements_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcements`
--

LOCK TABLES `announcements` WRITE;
/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_table` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `log_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'operation',
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `fk_audit_user` (`user_id`),
  KEY `idx_audit_tbl_id_time` (`target_table`,`target_id`,`created_at`),
  KEY `idx_audit_type_created` (`log_type`,`created_at`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `barangay_referral_updates`
--

DROP TABLE IF EXISTS `barangay_referral_updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barangay_referral_updates` (
  `update_id` int NOT NULL AUTO_INCREMENT,
  `referral_id` int NOT NULL,
  `update_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'acknowledged, dispatched, picked_up, held, impounded, claimed, adopted, not_found, other',
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'barangay_reported' COMMENT 'barangay_reported or straysafe_user',
  `update_date` date NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `evidence_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status_after` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `responder_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assistance_provided` text COLLATE utf8mb4_unicode_ci,
  `progress_notes` text COLLATE utf8mb4_unicode_ci,
  `follow_up_instructions` text COLLATE utf8mb4_unicode_ci,
  `additional_notes` text COLLATE utf8mb4_unicode_ci,
  `supporting_documents` text COLLATE utf8mb4_unicode_ci,
  `recorded_by` int DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`update_id`),
  KEY `ix_barangay_referral_updates_update_id` (`update_id`),
  KEY `ix_barangay_referral_updates_referral_id` (`referral_id`),
  KEY `fk_barangay_referral_updates_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_barangay_referral_updates_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_barangay_referral_updates_referral_id` FOREIGN KEY (`referral_id`) REFERENCES `barangay_referrals` (`referral_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barangay_referral_updates`
--

LOCK TABLES `barangay_referral_updates` WRITE;
/*!40000 ALTER TABLE `barangay_referral_updates` DISABLE KEYS */;
/*!40000 ALTER TABLE `barangay_referral_updates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `barangay_referrals`
--

DROP TABLE IF EXISTS `barangay_referrals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barangay_referrals` (
  `referral_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `barangay_id` int DEFAULT NULL,
  `referred_by` int DEFAULT NULL,
  `referred_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_method` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'call, visit, message, letter, other',
  `final_outcome` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'claimed, released, resolved, deceased, not_found',
  `outcome_date` date DEFAULT NULL,
  `outcome_note` text COLLATE utf8mb4_unicode_ci,
  `outcome_recorded_by` int DEFAULT NULL,
  `outcome_recorded_at` datetime DEFAULT NULL,
  `org_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `org_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_detail` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_urgent` tinyint(1) NOT NULL DEFAULT '0',
  `referral_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status_updated_at` datetime DEFAULT NULL,
  `status_updated_by` int DEFAULT NULL,
  `external_outcome` text COLLATE utf8mb4_unicode_ci,
  `remaining_follow_up` text COLLATE utf8mb4_unicode_ci,
  `follow_up_at` datetime DEFAULT NULL,
  `priority_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `supporting_documents` text COLLATE utf8mb4_unicode_ci,
  `additional_notes` text COLLATE utf8mb4_unicode_ci,
  `assistance_provided` text COLLATE utf8mb4_unicode_ci,
  `actions_completed` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`referral_id`),
  KEY `ix_barangay_referrals_report_id` (`report_id`),
  KEY `ix_barangay_referrals_referral_id` (`referral_id`),
  KEY `fk_barangay_referrals_status_updated_by` (`status_updated_by`),
  KEY `fk_barangay_referrals_barangay_id` (`barangay_id`),
  KEY `fk_barangay_referrals_referred_by` (`referred_by`),
  KEY `fk_barangay_referrals_outcome_recorded_by` (`outcome_recorded_by`),
  CONSTRAINT `fk_barangay_referrals_barangay_id` FOREIGN KEY (`barangay_id`) REFERENCES `barangays` (`barangay_id`),
  CONSTRAINT `fk_barangay_referrals_outcome_recorded_by` FOREIGN KEY (`outcome_recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_barangay_referrals_referred_by` FOREIGN KEY (`referred_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_barangay_referrals_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_barangay_referrals_status_updated_by` FOREIGN KEY (`status_updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barangay_referrals`
--

LOCK TABLES `barangay_referrals` WRITE;
/*!40000 ALTER TABLE `barangay_referrals` DISABLE KEYS */;
/*!40000 ALTER TABLE `barangay_referrals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `barangays`
--

DROP TABLE IF EXISTS `barangays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barangays` (
  `barangay_id` int NOT NULL AUTO_INCREMENT,
  `barangay_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hq_plus_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hq_lat` decimal(10,8) DEFAULT NULL,
  `hq_lng` decimal(11,8) DEFAULT NULL,
  PRIMARY KEY (`barangay_id`),
  UNIQUE KEY `barangay_name` (`barangay_name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barangays`
--

LOCK TABLES `barangays` WRITE;
/*!40000 ALTER TABLE `barangays` DISABLE KEYS */;
INSERT INTO `barangays` VALUES (1,'San Vicente','Santa Maria, Bulacan','09123456789','R243+QH',14.80690600,121.00392970);
/*!40000 ALTER TABLE `barangays` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_alert_sends`
--

DROP TABLE IF EXISTS `case_alert_sends`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_alert_sends` (
  `send_id` int NOT NULL AUTO_INCREMENT,
  `alert_id` int NOT NULL,
  `slot_at` datetime NOT NULL,
  `status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent',
  `recipients` int NOT NULL DEFAULT '0',
  `skipped_before` int NOT NULL DEFAULT '0',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`send_id`),
  UNIQUE KEY `uq_case_alert_slot` (`alert_id`,`slot_at`),
  CONSTRAINT `fk_case_alert_sends_alert` FOREIGN KEY (`alert_id`) REFERENCES `case_alerts` (`alert_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_alert_sends`
--

LOCK TABLES `case_alert_sends` WRITE;
/*!40000 ALTER TABLE `case_alert_sends` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_alert_sends` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_alerts`
--

DROP TABLE IF EXISTS `case_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_alerts` (
  `alert_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `title` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL,
  `include_photo` tinyint(1) NOT NULL DEFAULT '1',
  `destination` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'notice',
  `audience` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all',
  `mode` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `repeat_kind` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `every_minutes` int DEFAULT NULL,
  `times_of_day` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_at` datetime NOT NULL,
  `end_kind` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `max_sends` int DEFAULT NULL,
  `status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `next_send_at` datetime DEFAULT NULL,
  `sends_done` int NOT NULL DEFAULT '0',
  `stop_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `stopped_at` datetime DEFAULT NULL,
  `stopped_by` int DEFAULT NULL,
  PRIMARY KEY (`alert_id`),
  UNIQUE KEY `uq_case_alert_request` (`client_request_id`),
  KEY `ix_case_alerts_report` (`report_id`),
  KEY `ix_case_alerts_due` (`status`,`next_send_at`),
  KEY `fk_case_alerts_subdivision` (`subdivision_id`),
  KEY `fk_case_alerts_created_by` (`created_by`),
  KEY `fk_case_alerts_stopped_by` (`stopped_by`),
  CONSTRAINT `fk_case_alerts_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_alerts_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_case_alerts_stopped_by` FOREIGN KEY (`stopped_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_alerts_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_alerts`
--

LOCK TABLES `case_alerts` WRITE;
/*!40000 ALTER TABLE `case_alerts` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_contact_logs`
--

DROP TABLE IF EXISTS `case_contact_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_contact_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `method` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'in_person, phone, message, letter',
  `with_whom` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `summary` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `outcome` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT 'cooperative, denied_ownership, no_response, other',
  `contact_at` datetime NOT NULL,
  `logged_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `ix_case_contact_logs_log_id` (`log_id`),
  KEY `ix_case_contact_logs_report_id` (`report_id`),
  KEY `ix_case_contact_logs_subdivision_id` (`subdivision_id`),
  KEY `fk_case_contact_logs_logged_by` (`logged_by`),
  CONSTRAINT `fk_case_contact_logs_logged_by` FOREIGN KEY (`logged_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_contact_logs_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_case_contact_logs_subdivision_id` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_contact_logs`
--

LOCK TABLES `case_contact_logs` WRITE;
/*!40000 ALTER TABLE `case_contact_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_contact_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_followups`
--

DROP TABLE IF EXISTS `case_followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_followups` (
  `followup_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `kind` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'follow_up' COMMENT 'follow_up, site_check, reporter_update, referral_check, warning_end, post_closure',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `due_at` datetime DEFAULT NULL,
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending, done, cancelled',
  `referral_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int DEFAULT NULL,
  `completion_note` text COLLATE utf8mb4_unicode_ci,
  `cancel_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`followup_id`),
  KEY `ix_case_followups_followup_id` (`followup_id`),
  KEY `ix_case_followups_report_id` (`report_id`),
  KEY `ix_case_followups_subdivision_id` (`subdivision_id`),
  KEY `ix_case_followups_due_at` (`due_at`),
  KEY `ix_case_followups_status` (`status`),
  KEY `fk_case_followups_referral_id` (`referral_id`),
  KEY `fk_case_followups_created_by` (`created_by`),
  KEY `fk_case_followups_completed_by` (`completed_by`),
  CONSTRAINT `fk_case_followups_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_followups_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_followups_referral_id` FOREIGN KEY (`referral_id`) REFERENCES `barangay_referrals` (`referral_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_followups_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_case_followups_subdivision_id` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_followups`
--

LOCK TABLES `case_followups` WRITE;
/*!40000 ALTER TABLE `case_followups` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_followups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_links`
--

DROP TABLE IF EXISTS `case_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_links` (
  `link_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL COMMENT 'the lower report id of the pair',
  `related_report_id` int NOT NULL,
  `link_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'related' COMMENT 'related, duplicate, same_animal, same_incident',
  `note` text COLLATE utf8mb4_unicode_ci,
  `linked_by` int DEFAULT NULL,
  `linked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unlinked_at` datetime DEFAULT NULL COMMENT 'set when the link is undone; the row is kept',
  `unlinked_by` int DEFAULT NULL,
  `unlink_reason` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`link_id`),
  KEY `ix_case_links_link_id` (`link_id`),
  KEY `ix_case_links_report_id` (`report_id`),
  KEY `ix_case_links_related_report_id` (`related_report_id`),
  KEY `fk_case_links_linked_by` (`linked_by`),
  KEY `fk_case_links_unlinked_by` (`unlinked_by`),
  CONSTRAINT `fk_case_links_linked_by` FOREIGN KEY (`linked_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_links_related_report_id` FOREIGN KEY (`related_report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_case_links_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_case_links_unlinked_by` FOREIGN KEY (`unlinked_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_links`
--

LOCK TABLES `case_links` WRITE;
/*!40000 ALTER TABLE `case_links` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_links` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_message_members`
--

DROP TABLE IF EXISTS `case_message_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_message_members` (
  `member_id` int NOT NULL AUTO_INCREMENT,
  `thread_id` int NOT NULL,
  `user_id` int NOT NULL,
  `role` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_id` int DEFAULT NULL,
  `last_read_message_id` int NOT NULL DEFAULT '0',
  `last_delivered_message_id` int NOT NULL DEFAULT '0',
  `joined_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`member_id`),
  UNIQUE KEY `uq_case_message_member` (`thread_id`,`user_id`),
  KEY `ix_case_message_members_member_id` (`member_id`),
  KEY `ix_case_message_members_thread_id` (`thread_id`),
  KEY `ix_case_message_members_user_id` (`user_id`),
  CONSTRAINT `case_message_members_ibfk_1` FOREIGN KEY (`thread_id`) REFERENCES `case_message_threads` (`thread_id`) ON DELETE CASCADE,
  CONSTRAINT `case_message_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_message_members`
--

LOCK TABLES `case_message_members` WRITE;
/*!40000 ALTER TABLE `case_message_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_message_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_message_threads`
--

DROP TABLE IF EXISTS `case_message_threads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_message_threads` (
  `thread_id` int NOT NULL AUTO_INCREMENT,
  `subdivision_id` int NOT NULL,
  `kind` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_id` int DEFAULT NULL,
  `related_report_id` int DEFAULT NULL,
  `match_id` int DEFAULT NULL,
  `link_id` int DEFAULT NULL,
  `subject` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `close_reason` text COLLATE utf8mb4_unicode_ci,
  `close_trigger` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`thread_id`),
  KEY `closed_by` (`closed_by`),
  KEY `created_by` (`created_by`),
  KEY `ix_case_message_threads_match_id` (`match_id`),
  KEY `ix_case_message_threads_related_report_id` (`related_report_id`),
  KEY `ix_case_message_threads_report_id` (`report_id`),
  KEY `ix_case_message_threads_status` (`status`),
  KEY `ix_case_message_threads_subdivision_id` (`subdivision_id`),
  KEY `ix_case_message_threads_thread_id` (`thread_id`),
  CONSTRAINT `case_message_threads_ibfk_1` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`),
  CONSTRAINT `case_message_threads_ibfk_2` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `case_message_threads_ibfk_3` FOREIGN KEY (`related_report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `case_message_threads_ibfk_4` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `case_message_threads_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_message_threads`
--

LOCK TABLES `case_message_threads` WRITE;
/*!40000 ALTER TABLE `case_message_threads` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_message_threads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `case_messages`
--

DROP TABLE IF EXISTS `case_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `case_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `thread_id` int NOT NULL,
  `sender_id` int DEFAULT NULL,
  `kind` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'message',
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`message_id`),
  UNIQUE KEY `uq_case_message_request` (`client_request_id`),
  KEY `sender_id` (`sender_id`),
  KEY `ix_case_messages_created_at` (`created_at`),
  KEY `ix_case_messages_message_id` (`message_id`),
  KEY `ix_case_messages_thread_id` (`thread_id`),
  CONSTRAINT `case_messages_ibfk_1` FOREIGN KEY (`thread_id`) REFERENCES `case_message_threads` (`thread_id`) ON DELETE CASCADE,
  CONSTRAINT `case_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `case_messages`
--

LOCK TABLES `case_messages` WRITE;
/*!40000 ALTER TABLE `case_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `case_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `thread_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `message_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `media_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `fk_chat_messages_thread` (`thread_id`),
  KEY `fk_chat_messages_sender` (`sender_id`),
  KEY `idx_chat_msg_th_sent` (`thread_id`,`sent_at`),
  CONSTRAINT `fk_chat_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_messages_thread` FOREIGN KEY (`thread_id`) REFERENCES `chat_threads` (`thread_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_threads`
--

DROP TABLE IF EXISTS `chat_threads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_threads` (
  `thread_id` int NOT NULL AUTO_INCREMENT,
  `thread_type` enum('Report','Direct') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Report',
  `related_id` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `recipient_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`thread_id`),
  KEY `fk_chat_threads_creator` (`created_by`),
  KEY `fk_chat_threads_recipient` (`recipient_id`),
  KEY `idx_chat_threads_type_related` (`thread_type`,`related_id`),
  CONSTRAINT `fk_chat_threads_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_threads_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_threads`
--

LOCK TABLES `chat_threads` WRITE;
/*!40000 ALTER TABLE `chat_threads` DISABLE KEYS */;
/*!40000 ALTER TABLE `chat_threads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaint_findings`
--

DROP TABLE IF EXISTS `complaint_findings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaint_findings` (
  `report_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `policy_id` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_reference` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `no_rule` tinyint(1) NOT NULL DEFAULT '0',
  `respondent_id` int DEFAULT NULL,
  `respondent_evidence` json DEFAULT NULL,
  `respondent_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `respondent_by` int DEFAULT NULL,
  `respondent_at` datetime DEFAULT NULL,
  `check_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `check_by` int DEFAULT NULL,
  `check_at` datetime DEFAULT NULL,
  `ruled_out` json DEFAULT NULL,
  `separate_from_report_id` int DEFAULT NULL,
  `separate_by` int DEFAULT NULL,
  `separate_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  KEY `ix_complaint_findings_respondent` (`respondent_id`),
  KEY `ix_complaint_findings_subdivision` (`subdivision_id`),
  KEY `fk_complaint_findings_separate` (`separate_from_report_id`),
  KEY `fk_complaint_findings_resp_by` (`respondent_by`),
  KEY `fk_complaint_findings_check_by` (`check_by`),
  KEY `fk_complaint_findings_sep_by` (`separate_by`),
  CONSTRAINT `fk_complaint_findings_check_by` FOREIGN KEY (`check_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaint_findings_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_complaint_findings_resp_by` FOREIGN KEY (`respondent_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaint_findings_respondent` FOREIGN KEY (`respondent_id`) REFERENCES `complaint_respondents` (`respondent_id`),
  CONSTRAINT `fk_complaint_findings_sep_by` FOREIGN KEY (`separate_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaint_findings_separate` FOREIGN KEY (`separate_from_report_id`) REFERENCES `reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaint_findings_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaint_findings`
--

LOCK TABLES `complaint_findings` WRITE;
/*!40000 ALTER TABLE `complaint_findings` DISABLE KEYS */;
/*!40000 ALTER TABLE `complaint_findings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaint_offenses`
--

DROP TABLE IF EXISTS `complaint_offenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaint_offenses` (
  `offense_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `respondent_id` int NOT NULL,
  `policy_id` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_reference` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `counted` tinyint(1) NOT NULL DEFAULT '1',
  `offense_number` int DEFAULT NULL,
  `incident_at` datetime NOT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `confirmed_by` int DEFAULT NULL,
  `confirmed_at` datetime NOT NULL,
  `voided_at` datetime DEFAULT NULL,
  `voided_by` int DEFAULT NULL,
  `void_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`offense_id`),
  KEY `ix_complaint_offenses_history` (`respondent_id`,`policy_id`,`voided_at`),
  KEY `ix_complaint_offenses_report` (`report_id`),
  KEY `fk_complaint_offenses_subdivision` (`subdivision_id`),
  KEY `fk_complaint_offenses_confirmed_by` (`confirmed_by`),
  KEY `fk_complaint_offenses_voided_by` (`voided_by`),
  CONSTRAINT `fk_complaint_offenses_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaint_offenses_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_complaint_offenses_respondent` FOREIGN KEY (`respondent_id`) REFERENCES `complaint_respondents` (`respondent_id`),
  CONSTRAINT `fk_complaint_offenses_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`),
  CONSTRAINT `fk_complaint_offenses_voided_by` FOREIGN KEY (`voided_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaint_offenses`
--

LOCK TABLES `complaint_offenses` WRITE;
/*!40000 ALTER TABLE `complaint_offenses` DISABLE KEYS */;
/*!40000 ALTER TABLE `complaint_offenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaint_respondents`
--

DROP TABLE IF EXISTS `complaint_respondents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaint_respondents` (
  `respondent_id` int NOT NULL AUTO_INCREMENT,
  `subdivision_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`respondent_id`),
  UNIQUE KEY `uq_complaint_respondent_user` (`subdivision_id`,`user_id`),
  KEY `ix_complaint_respondents_subdivision` (`subdivision_id`),
  KEY `fk_complaint_respondents_user` (`user_id`),
  KEY `fk_complaint_respondents_created_by` (`created_by`),
  CONSTRAINT `fk_complaint_respondents_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaint_respondents_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`),
  CONSTRAINT `fk_complaint_respondents_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaint_respondents`
--

LOCK TABLES `complaint_respondents` WRITE;
/*!40000 ALTER TABLE `complaint_respondents` DISABLE KEYS */;
/*!40000 ALTER TABLE `complaint_respondents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coverage_settings`
--

DROP TABLE IF EXISTS `coverage_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coverage_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subdivision_id` int DEFAULT NULL,
  `center_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `center_latitude` decimal(10,8) NOT NULL,
  `center_longitude` decimal(11,8) NOT NULL,
  `radius_meters` int NOT NULL,
  `boundary_polygon` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT (now()),
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `subdivision_id` (`subdivision_id`),
  KEY `updated_by` (`updated_by`),
  KEY `ix_coverage_settings_id` (`id`),
  CONSTRAINT `coverage_settings_ibfk_1` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`) ON DELETE SET NULL,
  CONSTRAINT `coverage_settings_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coverage_settings`
--

LOCK TABLES `coverage_settings` WRITE;
/*!40000 ALTER TABLE `coverage_settings` DISABLE KEYS */;
INSERT INTO `coverage_settings` VALUES (1,1,'Selera Homes',14.80104200,121.00364800,500,'[{\"lat\": 14.801496, \"lng\": 121.005174}, {\"lat\": 14.799577, \"lng\": 121.003911}, {\"lat\": 14.800634, \"lng\": 121.002228}, {\"lat\": 14.802461, \"lng\": 121.00328}]',1,'2026-09-26 09:41:56',NULL);
/*!40000 ALTER TABLE `coverage_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_logs`
--

DROP TABLE IF EXISTS `email_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_logs` (
  `email_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `recipient_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `template_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Pending','Sent','Failed','Simulated','Expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `attempts` int NOT NULL DEFAULT '0',
  `max_attempts` int NOT NULL DEFAULT '3',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `idempotency_key` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_id` int DEFAULT NULL,
  `text_body` longtext COLLATE utf8mb4_unicode_ci,
  `html_body` longtext COLLATE utf8mb4_unicode_ci,
  `next_attempt_at` datetime DEFAULT NULL,
  `last_attempt_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `sent_at` datetime DEFAULT NULL,
  PRIMARY KEY (`email_id`),
  UNIQUE KEY `uq_email_logs_idempotency` (`idempotency_key`),
  KEY `fk_email_logs_user` (`user_id`),
  KEY `idx_email_status_attempts` (`status`,`attempts`),
  CONSTRAINT `fk_email_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_logs`
--

LOCK TABLES `email_logs` WRITE;
/*!40000 ALTER TABLE `email_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `enforcement_step_events`
--

DROP TABLE IF EXISTS `enforcement_step_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enforcement_step_events` (
  `event_id` int NOT NULL AUTO_INCREMENT,
  `step_id` int NOT NULL,
  `report_id` int NOT NULL,
  `kind` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `occurred_at` datetime NOT NULL,
  `details` json DEFAULT NULL,
  `recorded_by` int DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `client_request_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `uq_enforcement_event_request` (`client_request_id`),
  KEY `ix_enforcement_events_step` (`step_id`),
  KEY `ix_enforcement_events_report` (`report_id`),
  KEY `fk_enforcement_events_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_enforcement_events_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enforcement_events_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enforcement_events_step` FOREIGN KEY (`step_id`) REFERENCES `enforcement_steps` (`step_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enforcement_step_events`
--

LOCK TABLES `enforcement_step_events` WRITE;
/*!40000 ALTER TABLE `enforcement_step_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `enforcement_step_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `enforcement_steps`
--

DROP TABLE IF EXISTS `enforcement_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enforcement_steps` (
  `step_id` int NOT NULL AUTO_INCREMENT,
  `offense_id` int NOT NULL,
  `report_id` int NOT NULL,
  `kind` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `due_at` datetime DEFAULT NULL,
  `details` json DEFAULT NULL,
  `referral_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`step_id`),
  UNIQUE KEY `uq_enforcement_step` (`offense_id`,`kind`),
  KEY `ix_enforcement_steps_report` (`report_id`),
  KEY `fk_enforcement_steps_referral` (`referral_id`),
  CONSTRAINT `fk_enforcement_steps_offense` FOREIGN KEY (`offense_id`) REFERENCES `complaint_offenses` (`offense_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enforcement_steps_referral` FOREIGN KEY (`referral_id`) REFERENCES `barangay_referrals` (`referral_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enforcement_steps_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enforcement_steps`
--

LOCK TABLES `enforcement_steps` WRITE;
/*!40000 ALTER TABLE `enforcement_steps` DISABLE KEYS */;
/*!40000 ALTER TABLE `enforcement_steps` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `followup_contact_logs`
--

DROP TABLE IF EXISTS `followup_contact_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `followup_contact_logs` (
  `contact_log_id` int NOT NULL AUTO_INCREMENT,
  `followup_id` int NOT NULL,
  `logged_by` int NOT NULL,
  `contact_type` enum('Phone Call','In-Person Visit','SMS','Verbal Warning','Other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Phone Call',
  `contact_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `report_id` int DEFAULT NULL,
  `pet_id` int DEFAULT NULL,
  `inspection_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inspection_outcome` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`contact_log_id`),
  UNIQUE KEY `uq_followup_contact_logs_client_request_id` (`client_request_id`),
  UNIQUE KEY `uq_contact_log_client_request` (`client_request_id`),
  KEY `ix_followup_contact_logs_followup_id` (`followup_id`),
  KEY `ix_followup_contact_logs_logged_by` (`logged_by`),
  KEY `ix_followup_contact_logs_pet_id` (`pet_id`),
  KEY `ix_followup_contact_logs_report_id` (`report_id`),
  KEY `idx_contact_log_report` (`report_id`),
  KEY `idx_contact_log_pet` (`pet_id`),
  CONSTRAINT `fk_contact_log_followup` FOREIGN KEY (`followup_id`) REFERENCES `owner_followups` (`followup_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contact_log_logger` FOREIGN KEY (`logged_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_contact_log_pet` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_contact_log_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_followup_contact_logs_followup_id` FOREIGN KEY (`followup_id`) REFERENCES `owner_followups` (`followup_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_followup_contact_logs_logged_by` FOREIGN KEY (`logged_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_followup_contact_logs_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_followup_contact_logs_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `followup_contact_logs`
--

LOCK TABLES `followup_contact_logs` WRITE;
/*!40000 ALTER TABLE `followup_contact_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `followup_contact_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `followup_repeated_incidents`
--

DROP TABLE IF EXISTS `followup_repeated_incidents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `followup_repeated_incidents` (
  `incident_id` int NOT NULL AUTO_INCREMENT,
  `followup_id` int NOT NULL,
  `report_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `logged_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `incident_date` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`incident_id`),
  UNIQUE KEY `uq_followup_repeat_report` (`followup_id`,`report_id`),
  KEY `ix_followup_repeated_incidents_followup_id` (`followup_id`),
  KEY `ix_followup_repeated_incidents_pet_id` (`pet_id`),
  KEY `ix_followup_repeated_incidents_report_id` (`report_id`),
  KEY `fk_followup_repeated_incidents_logged_by` (`logged_by`),
  CONSTRAINT `fk_followup_repeated_incidents_followup_id` FOREIGN KEY (`followup_id`) REFERENCES `owner_followups` (`followup_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_followup_repeated_incidents_logged_by` FOREIGN KEY (`logged_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_followup_repeated_incidents_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_followup_repeated_incidents_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `followup_repeated_incidents`
--

LOCK TABLES `followup_repeated_incidents` WRITE;
/*!40000 ALTER TABLE `followup_repeated_incidents` DISABLE KEYS */;
/*!40000 ALTER TABLE `followup_repeated_incidents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `generated_warning_letters`
--

DROP TABLE IF EXISTS `generated_warning_letters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `generated_warning_letters` (
  `letter_id` int NOT NULL AUTO_INCREMENT,
  `warning_reference` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `subdivision_id` int DEFAULT NULL,
  `warning_id` int DEFAULT NULL,
  `complaint_step_id` int DEFAULT NULL,
  `report_id` int DEFAULT NULL,
  `case_reference` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient_user_id` int DEFAULT NULL,
  `recipient_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient_address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pet_id` int DEFAULT NULL,
  `pet_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pet_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warning_level` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_id` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_reference` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `template_id` int DEFAULT NULL,
  `template_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `template_version_id` int DEFAULT NULL,
  `template_version_number` int NOT NULL,
  `rendered_subject` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rendered_body` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rendered_html` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `placeholders_json` json DEFAULT NULL,
  `issued_by` int DEFAULT NULL,
  `issued_by_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_at` datetime NOT NULL DEFAULT (now()),
  `notification_id` int DEFAULT NULL,
  `notification_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_error` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notification_created_at` datetime DEFAULT NULL,
  `notification_sent_at` datetime DEFAULT NULL,
  `viewed_at` datetime DEFAULT NULL,
  `retry_count` int NOT NULL,
  `last_retry_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`letter_id`),
  UNIQUE KEY `ix_generated_warning_letters_warning_reference` (`warning_reference`),
  KEY `pet_id` (`pet_id`),
  KEY `template_id` (`template_id`),
  KEY `template_version_id` (`template_version_id`),
  KEY `issued_by` (`issued_by`),
  KEY `ix_generated_warning_letters_warning_id` (`warning_id`),
  KEY `ix_generated_warning_letters_complaint_step_id` (`complaint_step_id`),
  KEY `ix_generated_warning_letters_letter_id` (`letter_id`),
  KEY `ix_generated_warning_letters_subdivision_id` (`subdivision_id`),
  KEY `ix_generated_warning_letters_report_id` (`report_id`),
  KEY `ix_generated_warning_letters_notification_id` (`notification_id`),
  KEY `ix_generated_warning_letters_recipient_user_id` (`recipient_user_id`),
  CONSTRAINT `generated_warning_letters_ibfk_1` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_10` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`notification_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_2` FOREIGN KEY (`warning_id`) REFERENCES `owner_warnings` (`warning_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_3` FOREIGN KEY (`complaint_step_id`) REFERENCES `enforcement_steps` (`step_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_4` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_5` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_6` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_7` FOREIGN KEY (`template_id`) REFERENCES `warning_letter_templates` (`template_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_8` FOREIGN KEY (`template_version_id`) REFERENCES `warning_letter_template_versions` (`version_id`) ON DELETE SET NULL,
  CONSTRAINT `generated_warning_letters_ibfk_9` FOREIGN KEY (`issued_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `generated_warning_letters`
--

LOCK TABLES `generated_warning_letters` WRITE;
/*!40000 ALTER TABLE `generated_warning_letters` DISABLE KEYS */;
/*!40000 ALTER TABLE `generated_warning_letters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `landmarks`
--

DROP TABLE IF EXISTS `landmarks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `landmarks` (
  `landmark_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `description` text COLLATE utf8mb4_unicode_ci,
  `subdivision_id` int DEFAULT NULL,
  `barangay_id` int NOT NULL DEFAULT '1',
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `is_holding_facility` tinyint(1) NOT NULL DEFAULT '0',
  `facility_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int DEFAULT NULL,
  `contact_person` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`landmark_id`),
  KEY `fk_landmarks_subdivision` (`subdivision_id`),
  KEY `fk_landmarks_barangay` (`barangay_id`),
  CONSTRAINT `fk_landmarks_barangay` FOREIGN KEY (`barangay_id`) REFERENCES `barangays` (`barangay_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_landmarks_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `landmarks`
--

LOCK TABLES `landmarks` WRITE;
/*!40000 ALTER TABLE `landmarks` DISABLE KEYS */;
INSERT INTO `landmarks` VALUES (1,'Selera Homes Main Entrance Gate','gate','Main guardhouse and security station at the entrance of Selera Homes',1,1,14.80149600,121.00517400,0,NULL,NULL,'Chief Guard Reyes','09171112233','Active','2026-11-20 08:16:17','2026-11-20 08:16:17'),(3,'Selera Community Park & Clubhouse','park','Recreation grounds and event center',1,1,14.80063400,121.00222800,0,NULL,NULL,'HOA Secretariat','09172223344','Active','2026-11-20 08:16:17','2026-11-20 08:16:17'),(4,'Barangay San Vicente Animal Impound Facility','facility','Official municipal holding shelter and veterinary holding cages',NULL,1,14.80690600,121.00392970,1,'Barangay Main Shelter',20,'Barangay Animal Welfare Desk','09123456789','Active','2026-11-20 08:16:17','2026-11-20 08:16:17');
/*!40000 ALTER TABLE `landmarks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leader_identity_verifications`
--

DROP TABLE IF EXISTS `leader_identity_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leader_identity_verifications` (
  `verification_id` int NOT NULL AUTO_INCREMENT,
  `match_id` int NOT NULL,
  `report_id` int NOT NULL,
  `pet_id` int NOT NULL,
  `leader_id` int DEFAULT NULL,
  `method` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `trigger` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `uq_leader_identity_verifications_match_id` (`match_id`),
  KEY `ix_leader_identity_verifications_pet_id` (`pet_id`),
  KEY `ix_leader_identity_verifications_report_id` (`report_id`),
  KEY `fk_leader_identity_verifications_leader_id` (`leader_id`),
  CONSTRAINT `fk_leader_identity_verifications_leader_id` FOREIGN KEY (`leader_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leader_identity_verifications_match_id` FOREIGN KEY (`match_id`) REFERENCES `report_matches` (`match_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leader_identity_verifications_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leader_identity_verifications_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leader_identity_verifications`
--

LOCK TABLES `leader_identity_verifications` WRITE;
/*!40000 ALTER TABLE `leader_identity_verifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `leader_identity_verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lost_found_matches`
--

DROP TABLE IF EXISTS `lost_found_matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lost_found_matches` (
  `match_id` int NOT NULL AUTO_INCREMENT,
  `subdivision_id` int NOT NULL,
  `lost_report_id` int NOT NULL,
  `found_report_id` int NOT NULL,
  `score` int NOT NULL,
  `level` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reasons` json DEFAULT NULL,
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT (now()),
  `decided_by` int DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `link_id` int DEFAULT NULL,
  `coordination_id` int DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  `algorithm` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `history` json DEFAULT NULL,
  `visual` json DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`match_id`),
  UNIQUE KEY `uq_lost_found_pair` (`lost_report_id`,`found_report_id`),
  KEY `decided_by` (`decided_by`),
  KEY `ix_lost_found_matches_found_report_id` (`found_report_id`),
  KEY `ix_lost_found_matches_lost_report_id` (`lost_report_id`),
  KEY `ix_lost_found_matches_match_id` (`match_id`),
  KEY `ix_lost_found_matches_status` (`status`),
  KEY `ix_lost_found_matches_subdivision_id` (`subdivision_id`),
  CONSTRAINT `lost_found_matches_ibfk_1` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`),
  CONSTRAINT `lost_found_matches_ibfk_2` FOREIGN KEY (`lost_report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `lost_found_matches_ibfk_3` FOREIGN KEY (`found_report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `lost_found_matches_ibfk_4` FOREIGN KEY (`decided_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lost_found_matches`
--

LOCK TABLES `lost_found_matches` WRITE;
/*!40000 ALTER TABLE `lost_found_matches` DISABLE KEYS */;
/*!40000 ALTER TABLE `lost_found_matches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lost_pet_alerts`
--

DROP TABLE IF EXISTS `lost_pet_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lost_pet_alerts` (
  `alert_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `owner_id` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `alert_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lost_pet',
  `last_seen_at` datetime DEFAULT NULL,
  `last_seen_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_seen_lat` decimal(10,8) DEFAULT NULL,
  `last_seen_lng` decimal(11,8) DEFAULT NULL,
  `contact_preference` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'app_message',
  `owner_note` text COLLATE utf8mb4_unicode_ci,
  `leader_message` text COLLATE utf8mb4_unicode_ci,
  `requested_by` int DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `activated_by` int DEFAULT NULL,
  `activated_at` datetime DEFAULT NULL,
  `residents_notified` int NOT NULL DEFAULT '0',
  `close_outcome` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `close_reason` text COLLATE utf8mb4_unicode_ci,
  `closed_by` int DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `recovered_at` datetime DEFAULT NULL,
  `recovery_source` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recovery_confirmed_by` int DEFAULT NULL,
  `recovery_recorded_by` int DEFAULT NULL,
  `recovery_recorded_at` datetime DEFAULT NULL,
  `recovery_note` text COLLATE utf8mb4_unicode_ci,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`alert_id`),
  UNIQUE KEY `uq_lost_pet_alerts_report_id` (`report_id`),
  KEY `ix_lost_pet_alerts_owner_id` (`owner_id`),
  KEY `ix_lost_pet_alerts_pet_id` (`pet_id`),
  KEY `ix_lost_pet_alerts_status` (`status`),
  KEY `ix_lost_pet_alerts_subdivision_id` (`subdivision_id`),
  KEY `fk_lost_pet_alerts_activated_by` (`activated_by`),
  KEY `fk_lost_pet_alerts_closed_by` (`closed_by`),
  KEY `fk_lost_pet_alerts_recovery_confirmed_by` (`recovery_confirmed_by`),
  KEY `fk_lost_pet_alerts_recovery_recorded_by` (`recovery_recorded_by`),
  KEY `fk_lost_pet_alerts_requested_by` (`requested_by`),
  CONSTRAINT `fk_lost_pet_alerts_activated_by` FOREIGN KEY (`activated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_recovery_confirmed_by` FOREIGN KEY (`recovery_confirmed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_recovery_recorded_by` FOREIGN KEY (`recovery_recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lost_pet_alerts_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_alerts_subdivision_id` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lost_pet_alerts`
--

LOCK TABLES `lost_pet_alerts` WRITE;
/*!40000 ALTER TABLE `lost_pet_alerts` DISABLE KEYS */;
/*!40000 ALTER TABLE `lost_pet_alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lost_pet_coordination_messages`
--

DROP TABLE IF EXISTS `lost_pet_coordination_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lost_pet_coordination_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `coordination_id` int NOT NULL,
  `sender_id` int DEFAULT NULL,
  `message_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`message_id`),
  UNIQUE KEY `uq_lost_pet_coordination_message_request` (`client_request_id`),
  KEY `ix_lost_pet_coordination_messages_coordination_id` (`coordination_id`),
  KEY `ix_lost_pet_coordination_messages_sent_at` (`sent_at`),
  KEY `fk_lost_pet_coordination_messages_sender_id` (`sender_id`),
  CONSTRAINT `fk_lost_pet_coordination_messages_coordination_id` FOREIGN KEY (`coordination_id`) REFERENCES `lost_pet_coordinations` (`coordination_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lost_pet_coordination_messages_sender_id` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lost_pet_coordination_messages`
--

LOCK TABLES `lost_pet_coordination_messages` WRITE;
/*!40000 ALTER TABLE `lost_pet_coordination_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `lost_pet_coordination_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lost_pet_coordinations`
--

DROP TABLE IF EXISTS `lost_pet_coordinations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lost_pet_coordinations` (
  `coordination_id` int NOT NULL AUTO_INCREMENT,
  `alert_id` int NOT NULL,
  `report_id` int NOT NULL,
  `sighting_id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `finder_id` int DEFAULT NULL,
  `mode` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `owner_consent` tinyint(1) NOT NULL DEFAULT '0',
  `finder_consent` tinyint(1) NOT NULL DEFAULT '0',
  `mediation_requested_by` int DEFAULT NULL,
  `mediation_requested_at` datetime DEFAULT NULL,
  `status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int DEFAULT NULL,
  `resolution_note` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`coordination_id`),
  UNIQUE KEY `uq_lost_pet_coordinations_sighting_id` (`sighting_id`),
  KEY `ix_lost_pet_coordinations_alert_id` (`alert_id`),
  KEY `ix_lost_pet_coordinations_finder_id` (`finder_id`),
  KEY `ix_lost_pet_coordinations_owner_id` (`owner_id`),
  KEY `ix_lost_pet_coordinations_report_id` (`report_id`),
  KEY `ix_lost_pet_coordinations_status` (`status`),
  KEY `fk_lost_pet_coordinations_mediation_requested_by` (`mediation_requested_by`),
  KEY `fk_lost_pet_coordinations_resolved_by` (`resolved_by`),
  CONSTRAINT `fk_lost_pet_coordinations_alert_id` FOREIGN KEY (`alert_id`) REFERENCES `lost_pet_alerts` (`alert_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lost_pet_coordinations_finder_id` FOREIGN KEY (`finder_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_coordinations_mediation_requested_by` FOREIGN KEY (`mediation_requested_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_coordinations_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_coordinations_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lost_pet_coordinations_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_coordinations_sighting_id` FOREIGN KEY (`sighting_id`) REFERENCES `lost_pet_sightings` (`sighting_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lost_pet_coordinations`
--

LOCK TABLES `lost_pet_coordinations` WRITE;
/*!40000 ALTER TABLE `lost_pet_coordinations` DISABLE KEYS */;
/*!40000 ALTER TABLE `lost_pet_coordinations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lost_pet_sightings`
--

DROP TABLE IF EXISTS `lost_pet_sightings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lost_pet_sightings` (
  `sighting_id` int NOT NULL AUTO_INCREMENT,
  `alert_id` int NOT NULL,
  `report_id` int NOT NULL,
  `reporter_id` int DEFAULT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `location_source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'map_pin',
  `location_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seen_at` datetime NOT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `description` text COLLATE utf8mb4_unicode_ci,
  `photo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accuracy_confirmed` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unverified',
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sighting_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'seen',
  `on_behalf` tinyint(1) NOT NULL DEFAULT '0',
  `care_note` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`sighting_id`),
  UNIQUE KEY `uq_lost_pet_sightings_client_request_id` (`client_request_id`),
  KEY `ix_lost_pet_sightings_alert_id` (`alert_id`),
  KEY `ix_lost_pet_sightings_report_id` (`report_id`),
  KEY `ix_lost_pet_sightings_reporter_id` (`reporter_id`),
  KEY `ix_lost_pet_sightings_seen_at` (`seen_at`),
  KEY `ix_lost_pet_sightings_status` (`status`),
  KEY `ix_lost_pet_sightings_submitted_at` (`submitted_at`),
  KEY `fk_lost_pet_sightings_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_lost_pet_sightings_alert_id` FOREIGN KEY (`alert_id`) REFERENCES `lost_pet_alerts` (`alert_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lost_pet_sightings_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lost_pet_sightings_reporter_id` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lost_pet_sightings_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lost_pet_sightings`
--

LOCK TABLES `lost_pet_sightings` WRITE;
/*!40000 ALTER TABLE `lost_pet_sightings` DISABLE KEYS */;
/*!40000 ALTER TABLE `lost_pet_sightings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `manual_match_decisions`
--

DROP TABLE IF EXISTS `manual_match_decisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `manual_match_decisions` (
  `decision_id` int NOT NULL AUTO_INCREMENT,
  `match_id` int DEFAULT NULL,
  `report_a_id` int NOT NULL,
  `report_b_id` int DEFAULT NULL,
  `pet_id` int DEFAULT NULL,
  `decision` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `staff_id` int DEFAULT NULL,
  `staff_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_case_id` int DEFAULT NULL,
  `ai_state` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`decision_id`),
  KEY `ix_manual_match_decisions_match_id` (`match_id`),
  KEY `ix_manual_match_decisions_pet_id` (`pet_id`),
  KEY `ix_manual_match_decisions_report_a_id` (`report_a_id`),
  KEY `ix_manual_match_decisions_report_b_id` (`report_b_id`),
  KEY `fk_manual_match_decisions_staff_id` (`staff_id`),
  CONSTRAINT `fk_manual_match_decisions_match_id` FOREIGN KEY (`match_id`) REFERENCES `report_matches` (`match_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_manual_match_decisions_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `manual_match_decisions`
--

LOCK TABLES `manual_match_decisions` WRITE;
/*!40000 ALTER TABLE `manual_match_decisions` DISABLE KEYS */;
/*!40000 ALTER TABLE `manual_match_decisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_id` int DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `is_archived` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_read` (`user_id`,`is_read`),
  KEY `idx_notif_user_arch_created` (`user_id`,`is_archived`,`created_at`),
  KEY `idx_notif_type_related` (`type`,`related_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otp_verifications`
--

DROP TABLE IF EXISTS `otp_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otp_verifications` (
  `otp_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `otp_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_used` tinyint(1) NOT NULL,
  `attempts` int NOT NULL,
  `max_attempts` int NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT (now()),
  PRIMARY KEY (`otp_id`),
  KEY `ix_otp_verifications_email` (`email`),
  KEY `ix_otp_verifications_user_id` (`user_id`),
  KEY `ix_otp_verifications_otp_id` (`otp_id`),
  CONSTRAINT `otp_verifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_verifications`
--

LOCK TABLES `otp_verifications` WRITE;
/*!40000 ALTER TABLE `otp_verifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `otp_verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `owner_followups`
--

DROP TABLE IF EXISTS `owner_followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `owner_followups` (
  `followup_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `subdivision_id` int NOT NULL,
  `leader_id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `owner_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('observing','complied','closed','escalated','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'observing',
  `due_at` datetime NOT NULL,
  `duration_days` int NOT NULL DEFAULT '3',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_extended` tinyint(1) NOT NULL DEFAULT '0',
  `extended_at` datetime DEFAULT NULL,
  `extended_by` int DEFAULT NULL,
  `extension_reason` text COLLATE utf8mb4_unicode_ci,
  `extension_days` int DEFAULT NULL,
  `compliance_notes` text COLLATE utf8mb4_unicode_ci,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `close_reason` text COLLATE utf8mb4_unicode_ci,
  `owner_acknowledged_at` datetime DEFAULT NULL,
  `owner_acknowledgement_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_photo_submitted_at` datetime DEFAULT NULL,
  `reminder_sent_at` datetime DEFAULT NULL,
  `due_notice_sent_at` datetime DEFAULT NULL,
  `update_reminder_sent_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`followup_id`),
  KEY `ix_owner_followups_due_at` (`due_at`),
  KEY `ix_owner_followups_leader_id` (`leader_id`),
  KEY `ix_owner_followups_owner_id` (`owner_id`),
  KEY `ix_owner_followups_pet_id` (`pet_id`),
  KEY `ix_owner_followups_report_id` (`report_id`),
  KEY `ix_owner_followups_status` (`status`),
  KEY `ix_owner_followups_subdivision_id` (`subdivision_id`),
  KEY `fk_owner_followups_closed_by` (`closed_by`),
  KEY `fk_owner_followups_extended_by` (`extended_by`),
  CONSTRAINT `fk_owner_followups_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_owner_followups_extended_by` FOREIGN KEY (`extended_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_owner_followups_leader_id` FOREIGN KEY (`leader_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_owner_followups_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_owner_followups_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_owner_followups_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_owner_followups_subdivision_id` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `owner_followups`
--

LOCK TABLES `owner_followups` WRITE;
/*!40000 ALTER TABLE `owner_followups` DISABLE KEYS */;
/*!40000 ALTER TABLE `owner_followups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `owner_observation_update_photos`
--

DROP TABLE IF EXISTS `owner_observation_update_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `owner_observation_update_photos` (
  `photo_id` int NOT NULL AUTO_INCREMENT,
  `update_id` int NOT NULL,
  `photo_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`photo_id`),
  KEY `ix_owner_observation_update_photos_update_id` (`update_id`),
  CONSTRAINT `fk_owner_observation_update_photos_update_id` FOREIGN KEY (`update_id`) REFERENCES `owner_observation_updates` (`update_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `owner_observation_update_photos`
--

LOCK TABLES `owner_observation_update_photos` WRITE;
/*!40000 ALTER TABLE `owner_observation_update_photos` DISABLE KEYS */;
/*!40000 ALTER TABLE `owner_observation_update_photos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `owner_observation_updates`
--

DROP TABLE IF EXISTS `owner_observation_updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `owner_observation_updates` (
  `update_id` int NOT NULL AUTO_INCREMENT,
  `followup_id` int NOT NULL,
  `report_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `owner_user_id` int NOT NULL,
  `compliance_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_remarks` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` datetime DEFAULT NULL,
  `reviewed_by` int DEFAULT NULL,
  `review_remarks` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`update_id`),
  UNIQUE KEY `uq_owner_observation_updates_client_request_id` (`client_request_id`),
  KEY `ix_owner_observation_updates_followup_id` (`followup_id`),
  KEY `ix_owner_observation_updates_owner_user_id` (`owner_user_id`),
  KEY `ix_owner_observation_updates_pet_id` (`pet_id`),
  KEY `ix_owner_observation_updates_report_id` (`report_id`),
  KEY `fk_owner_observation_updates_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_owner_observation_updates_followup_id` FOREIGN KEY (`followup_id`) REFERENCES `owner_followups` (`followup_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_owner_observation_updates_owner_user_id` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_owner_observation_updates_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_owner_observation_updates_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_owner_observation_updates_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `owner_observation_updates`
--

LOCK TABLES `owner_observation_updates` WRITE;
/*!40000 ALTER TABLE `owner_observation_updates` DISABLE KEYS */;
/*!40000 ALTER TABLE `owner_observation_updates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `owner_warnings`
--

DROP TABLE IF EXISTS `owner_warnings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `owner_warnings` (
  `warning_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `report_id` int DEFAULT NULL,
  `issued_by` int NOT NULL,
  `warning_level` enum('Notice','1st Warning','2nd Warning','Final Notice / Escalation') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1st Warning',
  `violation_type` enum('Free-Roaming Unleashed','Nuisance / Aggressive Behavior','Overdue Vaccination','Repeated Impoundment Retrieval','Other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Free-Roaming Unleashed',
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `fine_amount` decimal(10,2) DEFAULT '0.00',
  `status` enum('Pending','Acknowledged','Appealed','Resolved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `acknowledged_at` timestamp NULL DEFAULT NULL,
  `policy_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_title` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_reference` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observation_days` int DEFAULT NULL,
  `follow_up_at` datetime DEFAULT NULL,
  `warning_category` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warning_subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `additional_details` text COLLATE utf8mb4_unicode_ci,
  `supporting_documents` text COLLATE utf8mb4_unicode_ci,
  `admin_notes` text COLLATE utf8mb4_unicode_ci,
  `workflow_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT 'Sent',
  `owner_response` text COLLATE utf8mb4_unicode_ci,
  `owner_responded_at` datetime DEFAULT NULL,
  `thread_id` int DEFAULT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`warning_id`),
  KEY `fk_warnings_user` (`user_id`),
  KEY `fk_warnings_pet` (`pet_id`),
  KEY `fk_warnings_report` (`report_id`),
  KEY `fk_warnings_issuer` (`issued_by`),
  KEY `idx_report_pet_violation` (`report_id`,`pet_id`,`violation_type`),
  KEY `idx_warnings_user_status` (`user_id`,`status`),
  CONSTRAINT `fk_warnings_issuer` FOREIGN KEY (`issued_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_warnings_pet` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_warnings_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_warnings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `owner_warnings`
--

LOCK TABLES `owner_warnings` WRITE;
/*!40000 ALTER TABLE `owner_warnings` DISABLE KEYS */;
/*!40000 ALTER TABLE `owner_warnings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ownership_claims`
--

DROP TABLE IF EXISTS `ownership_claims`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ownership_claims` (
  `claim_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `alert_id` int DEFAULT NULL,
  `subdivision_id` int NOT NULL,
  `claimant_user_id` int DEFAULT NULL,
  `claimed_pet_id` int DEFAULT NULL,
  `statement` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `evidence` json DEFAULT NULL COMMENT 'ids of the evidence the claimant says they can show',
  `evidence_urls` json DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted' COMMENT 'submitted, under_review, needs_info, accepted, rejected, withdrawn',
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`claim_id`),
  KEY `ix_ownership_claims_claim_id` (`claim_id`),
  KEY `ix_ownership_claims_report_id` (`report_id`),
  KEY `ix_ownership_claims_subdivision_id` (`subdivision_id`),
  KEY `ix_ownership_claims_claimant_user_id` (`claimant_user_id`),
  KEY `ix_ownership_claims_status` (`status`),
  KEY `fk_ownership_claims_alert_id` (`alert_id`),
  KEY `fk_ownership_claims_claimed_pet_id` (`claimed_pet_id`),
  KEY `fk_ownership_claims_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_ownership_claims_alert_id` FOREIGN KEY (`alert_id`) REFERENCES `lost_pet_alerts` (`alert_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ownership_claims_claimant_user_id` FOREIGN KEY (`claimant_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ownership_claims_claimed_pet_id` FOREIGN KEY (`claimed_pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ownership_claims_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ownership_claims_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ownership_claims_subdivision_id` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ownership_claims`
--

LOCK TABLES `ownership_claims` WRITE;
/*!40000 ALTER TABLE `ownership_claims` DISABLE KEYS */;
/*!40000 ALTER TABLE `ownership_claims` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pet_history`
--

DROP TABLE IF EXISTS `pet_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pet_history` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `pet_id` int NOT NULL,
  `event_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `recovery_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_id` int DEFAULT NULL,
  `actor_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `fk_pet_history_pet` (`pet_id`),
  KEY `fk_pet_history_actor` (`actor_id`),
  CONSTRAINT `fk_pet_history_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pet_history_pet` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pet_history`
--

LOCK TABLES `pet_history` WRITE;
/*!40000 ALTER TABLE `pet_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `pet_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pet_match_confirmation_requests`
--

DROP TABLE IF EXISTS `pet_match_confirmation_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pet_match_confirmation_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `pet_id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `requested_by` int DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `staff_message` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AWAITING_OWNER_CONFIRMATION',
  `owner_response` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_note` text COLLATE utf8mb4_unicode_ci,
  `owner_response_at` datetime DEFAULT NULL,
  `cancelled_by` int DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancel_reason` text COLLATE utf8mb4_unicode_ci,
  `final_decision` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `final_by` int DEFAULT NULL,
  `final_at` datetime DEFAULT NULL,
  `match_id` int DEFAULT NULL,
  `thread_id` int DEFAULT NULL,
  `follow_up_count` int NOT NULL DEFAULT '0',
  `last_follow_up_at` datetime DEFAULT NULL,
  `events` json DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `ix_pet_match_confirmation_requests_owner_id` (`owner_id`),
  KEY `ix_pet_match_confirmation_requests_pet_id` (`pet_id`),
  KEY `ix_pet_match_confirmation_requests_report_id` (`report_id`),
  KEY `ix_pet_match_confirmation_requests_status` (`status`),
  KEY `fk_pet_match_confirmation_requests_cancelled_by` (`cancelled_by`),
  KEY `fk_pet_match_confirmation_requests_final_by` (`final_by`),
  KEY `fk_pet_match_confirmation_requests_match_id` (`match_id`),
  KEY `fk_pet_match_confirmation_requests_requested_by` (`requested_by`),
  CONSTRAINT `fk_pet_match_confirmation_requests_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pet_match_confirmation_requests_final_by` FOREIGN KEY (`final_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pet_match_confirmation_requests_match_id` FOREIGN KEY (`match_id`) REFERENCES `report_matches` (`match_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pet_match_confirmation_requests_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pet_match_confirmation_requests_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pet_match_confirmation_requests_report_id` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pet_match_confirmation_requests_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pet_match_confirmation_requests`
--

LOCK TABLES `pet_match_confirmation_requests` WRITE;
/*!40000 ALTER TABLE `pet_match_confirmation_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `pet_match_confirmation_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pet_owner_confirmations`
--

DROP TABLE IF EXISTS `pet_owner_confirmations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pet_owner_confirmations` (
  `confirmation_id` int NOT NULL AUTO_INCREMENT,
  `pet_id` int NOT NULL,
  `proposed_owner_id` int NOT NULL,
  `proposed_by` int DEFAULT NULL,
  `previous_owner_id` int DEFAULT NULL,
  `source` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'assign',
  `report_id` int DEFAULT NULL,
  `status` enum('Pending','Accepted','Rejected','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `reject_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`confirmation_id`),
  KEY `ix_pet_owner_confirmations_confirmation_id` (`confirmation_id`),
  KEY `ix_pet_owner_confirmations_pet_id` (`pet_id`),
  KEY `ix_pet_owner_confirmations_proposed_owner_id` (`proposed_owner_id`),
  KEY `proposed_by` (`proposed_by`),
  KEY `previous_owner_id` (`previous_owner_id`),
  KEY `report_id` (`report_id`),
  CONSTRAINT `pet_owner_confirmations_ibfk_1` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE,
  CONSTRAINT `pet_owner_confirmations_ibfk_2` FOREIGN KEY (`proposed_owner_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `pet_owner_confirmations_ibfk_3` FOREIGN KEY (`proposed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `pet_owner_confirmations_ibfk_4` FOREIGN KEY (`previous_owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `pet_owner_confirmations_ibfk_5` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pet_owner_confirmations`
--

LOCK TABLES `pet_owner_confirmations` WRITE;
/*!40000 ALTER TABLE `pet_owner_confirmations` DISABLE KEYS */;
/*!40000 ALTER TABLE `pet_owner_confirmations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pet_tag_scans`
--

DROP TABLE IF EXISTS `pet_tag_scans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pet_tag_scans` (
  `scan_id` int NOT NULL AUTO_INCREMENT,
  `tag_id` int NOT NULL,
  `pet_id` int NOT NULL,
  `kind` varchar(20) NOT NULL DEFAULT 'view',
  `scanner_user_id` int DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `location_label` varchar(255) DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `finder_phone` varchar(20) DEFAULT NULL,
  `share_contact` tinyint(1) NOT NULL DEFAULT '0',
  `photo_url` varchar(500) DEFAULT NULL,
  `alert_id` int DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'new',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`scan_id`),
  KEY `ix_pet_tag_scans_tag_id` (`tag_id`),
  KEY `ix_pet_tag_scans_pet_id` (`pet_id`),
  KEY `ix_pet_tag_scans_created_at` (`created_at`),
  KEY `ix_pet_tag_scans_scan_id` (`scan_id`),
  KEY `scanner_user_id` (`scanner_user_id`),
  KEY `alert_id` (`alert_id`),
  CONSTRAINT `pet_tag_scans_ibfk_1` FOREIGN KEY (`tag_id`) REFERENCES `pet_tags` (`tag_id`) ON DELETE CASCADE,
  CONSTRAINT `pet_tag_scans_ibfk_2` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE,
  CONSTRAINT `pet_tag_scans_ibfk_3` FOREIGN KEY (`scanner_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `pet_tag_scans_ibfk_4` FOREIGN KEY (`alert_id`) REFERENCES `lost_pet_alerts` (`alert_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pet_tag_scans`
--

LOCK TABLES `pet_tag_scans` WRITE;
/*!40000 ALTER TABLE `pet_tag_scans` DISABLE KEYS */;
/*!40000 ALTER TABLE `pet_tag_scans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pet_tags`
--

DROP TABLE IF EXISTS `pet_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pet_tags` (
  `tag_id` int NOT NULL AUTO_INCREMENT,
  `pet_id` int NOT NULL,
  `token` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_scanned_at` datetime DEFAULT NULL,
  `disabled_at` datetime DEFAULT NULL,
  `disabled_by` int DEFAULT NULL,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `token` (`token`),
  UNIQUE KEY `uq_pet_tags_pet_id` (`pet_id`),
  KEY `ix_pet_tags_tag_id` (`tag_id`),
  KEY `created_by` (`created_by`),
  KEY `disabled_by` (`disabled_by`),
  CONSTRAINT `pet_tags_ibfk_1` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE,
  CONSTRAINT `pet_tags_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `pet_tags_ibfk_3` FOREIGN KEY (`disabled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pet_tags`
--

LOCK TABLES `pet_tags` WRITE;
/*!40000 ALTER TABLE `pet_tags` DISABLE KEYS */;
/*!40000 ALTER TABLE `pet_tags` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pets`
--

DROP TABLE IF EXISTS `pets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pets` (
  `pet_id` int NOT NULL AUTO_INCREMENT,
  `owner_id` int DEFAULT NULL,
  `pet_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_code` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pet_type` enum('Dog','Cat') COLLATE utf8mb4_unicode_ci NOT NULL,
  `breed` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color_markings` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `colors` json DEFAULT NULL,
  `primary_color` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `secondary_color` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tertiary_color` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `distinctive_markings` text COLLATE utf8mb4_unicode_ci,
  `gender` enum('Male','Female','Unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `birth_date` date DEFAULT NULL,
  `estimated_age` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weight` decimal(5,2) DEFAULT NULL,
  `size_category` enum('Small','Medium','Large') COLLATE utf8mb4_unicode_ci DEFAULT 'Medium',
  `photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_front_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_left_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_right_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vaccine_card_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `health_condition` text COLLATE utf8mb4_unicode_ci,
  `is_vaccinated` tinyint(1) DEFAULT '0',
  `vaccination_date` date DEFAULT NULL,
  `vaccine_expiry` date DEFAULT NULL,
  `is_neutered` tinyint(1) DEFAULT '0',
  `temperament` enum('Friendly','Aggressive','Anxious','Scared','Protective') COLLATE utf8mb4_unicode_ci DEFAULT 'Friendly',
  `has_bite_history` tinyint(1) DEFAULT '0',
  `bite_incident_count` int DEFAULT '0',
  `chase_behavior` tinyint(1) DEFAULT '0',
  `chase_incident_count` int DEFAULT '0',
  `declared_bite_history` tinyint(1) NOT NULL DEFAULT '0',
  `declared_chase_behavior` tinyint(1) NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('Active','Lost','Found','Rescued','Deceased','Archived','Inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `is_verified` tinyint(1) DEFAULT '0',
  `last_seen_lat` decimal(10,8) DEFAULT NULL,
  `last_seen_lng` decimal(11,8) DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT NULL,
  `emergency_contact_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registered_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registered_latitude` decimal(10,8) DEFAULT NULL,
  `registered_longitude` decimal(11,8) DEFAULT NULL,
  `registered_by_user_id` int DEFAULT NULL,
  `registered_by_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_check_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `merged_into_pet_id` int DEFAULT NULL,
  `ai_detection_confidence` decimal(4,3) DEFAULT NULL,
  `photo_check_details` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pet_id`),
  UNIQUE KEY `uq_pets_reference_code` (`reference_code`),
  KEY `idx_pets_owner` (`owner_id`),
  KEY `idx_pets_status` (`status`),
  KEY `fk_pets_registered_by` (`registered_by_user_id`),
  KEY `idx_pets_status_type` (`status`,`pet_type`),
  KEY `idx_pets_owner_status` (`owner_id`,`status`),
  CONSTRAINT `fk_pets_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pets_registered_by` FOREIGN KEY (`registered_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pets`
--

LOCK TABLES `pets` WRITE;
/*!40000 ALTER TABLE `pets` DISABLE KEYS */;
/*!40000 ALTER TABLE `pets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `positions`
--

DROP TABLE IF EXISTS `positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `positions` (
  `position_id` int NOT NULL AUTO_INCREMENT,
  `position_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`position_id`),
  UNIQUE KEY `position_name` (`position_name`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `positions`
--

LOCK TABLES `positions` WRITE;
/*!40000 ALTER TABLE `positions` DISABLE KEYS */;
INSERT INTO `positions` VALUES (5,'Animal Rescuer'),(6,'Barangay Captain'),(8,'Barangay Head Officer'),(3,'Barangay Staff'),(9,'Field Rescuer'),(1,'President'),(2,'Secretary'),(7,'Subdivision President / Leader'),(4,'Tanod');
/*!40000 ALTER TABLE `positions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `push_deliveries`
--

DROP TABLE IF EXISTS `push_deliveries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_deliveries` (
  `delivery_id` int NOT NULL AUTO_INCREMENT,
  `notification_id` int NOT NULL,
  `subscription_id` int NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `attempts` int NOT NULL DEFAULT '0',
  `next_attempt_at` datetime DEFAULT NULL,
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`delivery_id`),
  UNIQUE KEY `uq_push_delivery` (`notification_id`,`subscription_id`),
  KEY `ix_push_deliveries_status` (`status`),
  KEY `ix_push_deliveries_subscription_id` (`subscription_id`),
  CONSTRAINT `push_deliveries_ibfk_1` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`notification_id`) ON DELETE CASCADE,
  CONSTRAINT `push_deliveries_ibfk_2` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions` (`subscription_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `push_deliveries`
--

LOCK TABLES `push_deliveries` WRITE;
/*!40000 ALTER TABLE `push_deliveries` DISABLE KEYS */;
/*!40000 ALTER TABLE `push_deliveries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `push_subscriptions`
--

DROP TABLE IF EXISTS `push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_subscriptions` (
  `subscription_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'webpush',
  `endpoint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `last_success_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`subscription_id`),
  UNIQUE KEY `endpoint_hash` (`endpoint_hash`),
  KEY `ix_push_subscriptions_user_id` (`user_id`),
  CONSTRAINT `push_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `push_subscriptions`
--

LOCK TABLES `push_subscriptions` WRITE;
/*!40000 ALTER TABLE `push_subscriptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `push_subscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qr_collar_requests`
--

DROP TABLE IF EXISTS `qr_collar_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qr_collar_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `pet_id` int NOT NULL,
  `resident_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin_notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `thread_id` int DEFAULT NULL,
  `history` json NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` datetime DEFAULT NULL,
  `accepted_by` int DEFAULT NULL,
  `ready_at` datetime DEFAULT NULL,
  `ready_by` int DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `ix_qr_collar_requests_request_id` (`request_id`),
  KEY `ix_qr_collar_requests_pet_id` (`pet_id`),
  KEY `ix_qr_collar_requests_resident_id` (`resident_id`),
  KEY `ix_qr_collar_requests_subdivision_id` (`subdivision_id`),
  KEY `ix_qr_collar_requests_status` (`status`),
  KEY `fk_qr_collar_requests_thread_id` (`thread_id`),
  KEY `fk_qr_collar_requests_accepted_by` (`accepted_by`),
  KEY `fk_qr_collar_requests_ready_by` (`ready_by`),
  KEY `fk_qr_collar_requests_completed_by` (`completed_by`),
  CONSTRAINT `fk_qr_collar_requests_accepted_by` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_qr_collar_requests_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_qr_collar_requests_pet_id` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qr_collar_requests_ready_by` FOREIGN KEY (`ready_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_qr_collar_requests_resident_id` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qr_collar_requests_subdivision_id` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`),
  CONSTRAINT `fk_qr_collar_requests_thread_id` FOREIGN KEY (`thread_id`) REFERENCES `case_message_threads` (`thread_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qr_collar_requests`
--

LOCK TABLES `qr_collar_requests` WRITE;
/*!40000 ALTER TABLE `qr_collar_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `qr_collar_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_categories`
--

DROP TABLE IF EXISTS `report_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_categories` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_categories`
--

LOCK TABLES `report_categories` WRITE;
/*!40000 ALTER TABLE `report_categories` DISABLE KEYS */;
INSERT INTO `report_categories` VALUES (1,'Injured','Stray animals requiring medical assistance or emergency care'),(2,'Aggressive','Animals exhibiting dangerous or aggressive behavior'),(3,'Rabies Risk','Animals exhibiting signs of rabies infection'),(4,'Roaming Animal','A stray animal roaming in the neighborhood'),(5,'Rescue Needed','General stray animal capture and rescue requests'),(6,'Lost Pet','Report of a missing or lost registered domestic pet'),(7,'Found / Unidentified Animal','An animal with no known owner was found or sighted.'),(8,'Animal Nuisance','Repeated disturbance, roaming or noise from an animal.'),(9,'Animal Safety Concern','Aggressive animal, bite or another risk to residents.'),(10,'Injured / Distressed Animal','An animal that appears hurt, trapped or in distress.'),(11,'Other Animal Concern','Any other animal-related concern.');
/*!40000 ALTER TABLE `report_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_disputes`
--

DROP TABLE IF EXISTS `report_disputes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_disputes` (
  `dispute_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `resident_user_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `dispute_reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `vaccination_card_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supporting_photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Pending','Accepted','Rejected','Upheld','Reversed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `dispute_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'false_report',
  `merged_into_report_id` int DEFAULT NULL,
  `contested_pet_id` int DEFAULT NULL,
  `match_id` int DEFAULT NULL,
  `reviewer_id` int DEFAULT NULL,
  `reviewer_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`dispute_id`),
  KEY `fk_disputes_report` (`report_id`),
  KEY `fk_disputes_resident` (`resident_user_id`),
  KEY `fk_disputes_pet` (`pet_id`),
  KEY `fk_disputes_reviewer` (`reviewer_id`),
  KEY `idx_disputes_rep_status` (`report_id`,`status`),
  CONSTRAINT `fk_disputes_pet` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_disputes_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_disputes_resident` FOREIGN KEY (`resident_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_disputes_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_disputes`
--

LOCK TABLES `report_disputes` WRITE;
/*!40000 ALTER TABLE `report_disputes` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_disputes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_matches`
--

DROP TABLE IF EXISTS `report_matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_matches` (
  `match_id` int NOT NULL AUTO_INCREMENT,
  `source_report_id` int NOT NULL,
  `matched_report_id` int DEFAULT NULL,
  `matched_pet_id` int DEFAULT NULL,
  `similarity_score` int NOT NULL DEFAULT '50',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AI_SUGGESTED',
  `ai_explanation` text COLLATE utf8mb4_unicode_ci,
  `ai_evidence` json DEFAULT NULL,
  `owner_confirmation_status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `owner_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_dispute_count` int NOT NULL DEFAULT '0',
  `covered_by_match_id` int DEFAULT NULL,
  `owner_verification_requested_at` datetime DEFAULT NULL,
  `owner_verification_requested_by` int DEFAULT NULL,
  `owner_verification_note` text COLLATE utf8mb4_unicode_ci,
  `owner_verification_answer` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_verification_answer_note` text COLLATE utf8mb4_unicode_ci,
  `owner_verification_answered_at` datetime DEFAULT NULL,
  `reviewed_by` int DEFAULT NULL,
  `reviewer_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `verified_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`match_id`),
  KEY `source_report_id` (`source_report_id`),
  KEY `matched_report_id` (`matched_report_id`),
  KEY `matched_pet_id` (`matched_pet_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `ix_report_matches_match_id` (`match_id`),
  KEY `idx_rep_matches_src_status` (`source_report_id`,`status`),
  KEY `idx_rep_matches_mat_status` (`matched_report_id`,`status`),
  KEY `idx_rep_matches_status_score` (`status`,`similarity_score`),
  CONSTRAINT `fk_matches_matched_pet` FOREIGN KEY (`matched_pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_matches_matched_report` FOREIGN KEY (`matched_report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_matches_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_matches_source_report` FOREIGN KEY (`source_report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_matches`
--

LOCK TABLES `report_matches` WRITE;
/*!40000 ALTER TABLE `report_matches` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_matches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_media`
--

DROP TABLE IF EXISTS `report_media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_media` (
  `media_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `history_id` int DEFAULT NULL,
  `status_id` int DEFAULT NULL,
  `file_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `media_type` enum('Image','Video','Document') COLLATE utf8mb4_unicode_ci NOT NULL,
  `animal_type` enum('Dog','Cat','Unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `dominant_color` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_evidence` tinyint(1) DEFAULT '0',
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ai_photo_likelihood` decimal(5,2) DEFAULT NULL,
  `ai_photo_status` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_detection_confidence` decimal(4,3) DEFAULT NULL,
  PRIMARY KEY (`media_id`),
  KEY `fk_media_report` (`report_id`),
  KEY `fk_media_history` (`history_id`),
  KEY `fk_media_status` (`status_id`),
  CONSTRAINT `fk_media_history` FOREIGN KEY (`history_id`) REFERENCES `status_history` (`history_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_media_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_media_status` FOREIGN KEY (`status_id`) REFERENCES `report_status` (`status_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_media`
--

LOCK TABLES `report_media` WRITE;
/*!40000 ALTER TABLE `report_media` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_media` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_returns`
--

DROP TABLE IF EXISTS `report_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_returns` (
  `return_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `has_account` tinyint(1) NOT NULL DEFAULT '0',
  `owner_user_id` int DEFAULT NULL,
  `owner_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_email` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relationship_to_animal` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_presented` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_last4` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ownership_verified_by_record` tinyint(1) NOT NULL DEFAULT '0',
  `handover_photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ownership_proof_urls` json DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `returned_by` int DEFAULT NULL,
  `returned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`return_id`),
  KEY `ix_report_returns_return_id` (`return_id`),
  KEY `ix_report_returns_report_id` (`report_id`),
  KEY `ix_report_returns_owner_user_id` (`owner_user_id`),
  KEY `pet_id` (`pet_id`),
  KEY `returned_by` (`returned_by`),
  CONSTRAINT `report_returns_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `report_returns_ibfk_3` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `report_returns_ibfk_4` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `report_returns_ibfk_5` FOREIGN KEY (`returned_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_returns`
--

LOCK TABLES `report_returns` WRITE;
/*!40000 ALTER TABLE `report_returns` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_returns` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_status`
--

DROP TABLE IF EXISTS `report_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_status` (
  `status_id` int NOT NULL AUTO_INCREMENT,
  `status_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`status_id`),
  UNIQUE KEY `status_name` (`status_name`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_status`
--

LOCK TABLES `report_status` WRITE;
/*!40000 ALTER TABLE `report_status` DISABLE KEYS */;
INSERT INTO `report_status` VALUES (17,'Animal Cannot Be Found'),(13,'Approved'),(9,'Claimed by Owner'),(12,'Deceased'),(15,'Disputed'),(14,'False Alarm / Dismissed'),(8,'Impounded'),(11,'Incident Resolved'),(18,'Merged — Duplicate'),(6,'Picked Up'),(4,'Referred to Barangay'),(3,'Rejected'),(10,'Released'),(1,'Reported'),(5,'Rescue In Progress'),(16,'Under Investigation'),(7,'Under Observation'),(2,'Verified');
/*!40000 ALTER TABLE `report_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `report_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `subdivision_id` int NOT NULL,
  `category_id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  `pet_inherited_from_match_id` int DEFAULT NULL,
  `identity_rechecked_by` int DEFAULT NULL,
  `identity_rechecked_at` datetime DEFAULT NULL,
  `identity_recheck_note` text COLLATE utf8mb4_unicode_ci,
  `separate_incident_reason` text COLLATE utf8mb4_unicode_ci,
  `separate_incident_by` int DEFAULT NULL,
  `separate_incident_at` datetime DEFAULT NULL,
  `animal_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `animal_breed` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `animal_color` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `animal_colors` json DEFAULT NULL,
  `estimated_size` enum('Small','Medium','Large') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `condition` text COLLATE utf8mb4_unicode_ci,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `initial_latitude` decimal(10,8) DEFAULT NULL,
  `initial_longitude` decimal(11,8) DEFAULT NULL,
  `initial_landmark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `facility_id` int DEFAULT NULL,
  `custody_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Sighting',
  `animal_count` int DEFAULT '1',
  `landmark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priority_level` enum('Low','Medium','High') COLLATE utf8mb4_unicode_ci DEFAULT 'Medium',
  `visibility` enum('Public','Private','Pending Review') COLLATE utf8mb4_unicode_ci DEFAULT 'Pending Review',
  `visibility_decided_by` int DEFAULT NULL,
  `visibility_decided_at` datetime DEFAULT NULL,
  `visibility_reason` text COLLATE utf8mb4_unicode_ci,
  `is_possible_owned` tinyint(1) DEFAULT '0',
  `current_status_id` int DEFAULT '1',
  `ai_animal_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_dominant_color` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_coat_pattern` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_estimated_size` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_possible_breed` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_suggested_risk_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_suggested_priority` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_suggested_priority_reason` text COLLATE utf8mb4_unicode_ci,
  `ai_behavior_chasing` tinyint(1) DEFAULT '0',
  `ai_behavior_actual_bite` tinyint(1) DEFAULT '0',
  `ai_behavior_attempted_bite` tinyint(1) DEFAULT '0',
  `ai_behavior_injury` tinyint(1) DEFAULT '0',
  `ai_behavior_aggressive` tinyint(1) DEFAULT '0',
  `ai_behavior_explanation` text COLLATE utf8mb4_unicode_ci,
  `assigned_leader_id` int DEFAULT NULL,
  `claimed_at` timestamp NULL DEFAULT NULL,
  `unassigned_notified` tinyint(1) NOT NULL DEFAULT '0',
  `verification_status` enum('unverified','verified_true','false_alarm','disputed') COLLATE utf8mb4_unicode_ci DEFAULT 'unverified',
  `false_alarm_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `verified_by_user_id` int DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `verified_actual_bite` tinyint(1) DEFAULT '0',
  `verified_chasing` tinyint(1) DEFAULT '0',
  `verified_attempted_bite` tinyint(1) DEFAULT '0',
  `verified_injury` tinyint(1) DEFAULT '0',
  `verified_aggressive` tinyint(1) DEFAULT '0',
  `behavior_finding` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pending_transfer_to_id` int DEFAULT NULL,
  `pending_transfer_from_id` int DEFAULT NULL,
  `pending_transfer_notes` text COLLATE utf8mb4_unicode_ci,
  `pending_transfer_created_at` timestamp NULL DEFAULT NULL,
  `duplicate_of_report_id` int DEFAULT NULL,
  `split_from_report_id` int DEFAULT NULL,
  `merged_at` timestamp NULL DEFAULT NULL,
  `merged_by` int DEFAULT NULL,
  `merge_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ai_photo_likelihood` decimal(5,2) DEFAULT NULL,
  `ai_photo_status` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_detection_confidence` decimal(4,3) DEFAULT NULL,
  `ai_description_confidence` json DEFAULT NULL,
  `ai_photo_recommendation` text COLLATE utf8mb4_unicode_ci,
  `ai_photo_details` text COLLATE utf8mb4_unicode_ci,
  `case_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_verification` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_basis` text COLLATE utf8mb4_unicode_ci,
  `evidence_sufficiency` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_reviewed` json DEFAULT NULL,
  `urgency_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `urgency_note` text COLLATE utf8mb4_unicode_ci,
  `assessment_notes` text COLLATE utf8mb4_unicode_ci,
  `assessed_at` datetime DEFAULT NULL,
  `assessed_by` int DEFAULT NULL,
  `identity_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_note` text COLLATE utf8mb4_unicode_ci,
  `ownership_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ownership_owner_id` int DEFAULT NULL,
  `ownership_evidence` json DEFAULT NULL,
  `ownership_note` text COLLATE utf8mb4_unicode_ci,
  `ownership_decided_by` int DEFAULT NULL,
  `ownership_decided_at` datetime DEFAULT NULL,
  `closure_disposition` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `closure_reason` text COLLATE utf8mb4_unicode_ci,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `reopened_count` int NOT NULL DEFAULT '0',
  `last_reopened_at` datetime DEFAULT NULL,
  `last_reopened_by` int DEFAULT NULL,
  `last_reopen_reason` text COLLATE utf8mb4_unicode_ci,
  `is_sensitive` tinyint(1) NOT NULL DEFAULT '0',
  `pet_snapshot` json DEFAULT NULL,
  `client_request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`report_id`),
  KEY `fk_reports_subdivision` (`subdivision_id`),
  KEY `fk_reports_category` (`category_id`),
  KEY `fk_reports_pet` (`pet_id`),
  KEY `fk_reports_facility` (`facility_id`),
  KEY `fk_reports_assigned_leader` (`assigned_leader_id`),
  KEY `fk_reports_verified_by` (`verified_by_user_id`),
  KEY `fk_reports_pending_transfer_to` (`pending_transfer_to_id`),
  KEY `fk_reports_pending_transfer_from` (`pending_transfer_from_id`),
  KEY `fk_reports_duplicate_of` (`duplicate_of_report_id`),
  KEY `fk_reports_split_from` (`split_from_report_id`),
  KEY `fk_reports_merged_by` (`merged_by`),
  KEY `idx_reports_location` (`latitude`,`longitude`),
  KEY `idx_reports_user` (`user_id`),
  KEY `idx_reports_status` (`current_status_id`),
  KEY `idx_reports_subd_status` (`subdivision_id`,`current_status_id`),
  KEY `idx_reports_status_created` (`current_status_id`,`created_at`),
  KEY `idx_reports_unassigned_watch` (`assigned_leader_id`,`unassigned_notified`,`current_status_id`),
  KEY `idx_reports_animal_type_status` (`animal_type`,`current_status_id`,`created_at`),
  KEY `ix_reports_case_status` (`case_status`),
  KEY `fk_reports_assessed_by` (`assessed_by`),
  KEY `fk_reports_ownership_owner_id` (`ownership_owner_id`),
  KEY `fk_reports_ownership_decided_by` (`ownership_decided_by`),
  KEY `fk_reports_closed_by` (`closed_by`),
  KEY `fk_reports_last_reopened_by` (`last_reopened_by`),
  KEY `fk_reports_visibility_decided_by` (`visibility_decided_by`),
  CONSTRAINT `fk_reports_assessed_by` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_assigned_leader` FOREIGN KEY (`assigned_leader_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_category` FOREIGN KEY (`category_id`) REFERENCES `report_categories` (`category_id`),
  CONSTRAINT `fk_reports_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_duplicate_of` FOREIGN KEY (`duplicate_of_report_id`) REFERENCES `reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_facility` FOREIGN KEY (`facility_id`) REFERENCES `landmarks` (`landmark_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_last_reopened_by` FOREIGN KEY (`last_reopened_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_merged_by` FOREIGN KEY (`merged_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_ownership_decided_by` FOREIGN KEY (`ownership_decided_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_ownership_owner_id` FOREIGN KEY (`ownership_owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_pending_transfer_from` FOREIGN KEY (`pending_transfer_from_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_pending_transfer_to` FOREIGN KEY (`pending_transfer_to_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_pet` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`pet_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_split_from` FOREIGN KEY (`split_from_report_id`) REFERENCES `reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_status` FOREIGN KEY (`current_status_id`) REFERENCES `report_status` (`status_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`),
  CONSTRAINT `fk_reports_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_verified_by` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_visibility_decided_by` FOREIGN KEY (`visibility_decided_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reports`
--

LOCK TABLES `reports` WRITE;
/*!40000 ALTER TABLE `reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `revoked_tokens`
--

DROP TABLE IF EXISTS `revoked_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `revoked_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jti` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int DEFAULT NULL,
  `revoked_at` datetime NOT NULL DEFAULT (now()),
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_revoked_tokens_jti` (`jti`),
  KEY `ix_revoked_tokens_id` (`id`),
  KEY `ix_revoked_tokens_expires_at` (`expires_at`),
  KEY `ix_revoked_tokens_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `revoked_tokens`
--

LOCK TABLES `revoked_tokens` WRITE;
/*!40000 ALTER TABLE `revoked_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `revoked_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_name` (`role_name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (4,'Admin'),(3,'Barangay Staff'),(1,'Citizen'),(2,'Subdivision Leader');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `status_history`
--

DROP TABLE IF EXISTS `status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `status_history` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `report_status_id` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `landmark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `facility_id` int DEFAULT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `fk_history_report` (`report_id`),
  KEY `fk_history_status` (`report_status_id`),
  KEY `fk_history_facility` (`facility_id`),
  KEY `fk_history_user` (`updated_by`),
  KEY `idx_status_hist_rep_created` (`report_id`,`created_at`),
  CONSTRAINT `fk_history_facility` FOREIGN KEY (`facility_id`) REFERENCES `landmarks` (`landmark_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_history_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_history_status` FOREIGN KEY (`report_status_id`) REFERENCES `report_status` (`status_id`),
  CONSTRAINT `fk_history_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `status_history`
--

LOCK TABLES `status_history` WRITE;
/*!40000 ALTER TABLE `status_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `status_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subdivisions`
--

DROP TABLE IF EXISTS `subdivisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subdivisions` (
  `subdivision_id` int NOT NULL AUTO_INCREMENT,
  `barangay_id` int NOT NULL,
  `subdivision_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `boundary_polygon` json DEFAULT NULL,
  PRIMARY KEY (`subdivision_id`),
  UNIQUE KEY `uk_barangay_subdivision` (`barangay_id`,`subdivision_name`),
  CONSTRAINT `fk_subdivisions_barangay` FOREIGN KEY (`barangay_id`) REFERENCES `barangays` (`barangay_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subdivisions`
--

LOCK TABLES `subdivisions` WRITE;
/*!40000 ALTER TABLE `subdivisions` DISABLE KEYS */;
INSERT INTO `subdivisions` VALUES (1,1,'Selera Homes','[{\"lat\": 14.801496, \"lng\": 121.005174}, {\"lat\": 14.799577, \"lng\": 121.003911}, {\"lat\": 14.800634, \"lng\": 121.002228}, {\"lat\": 14.802461, \"lng\": 121.00328}]');
/*!40000 ALTER TABLE `subdivisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_system_settings_key` (`setting_key`),
  KEY `fk_system_settings_user` (`updated_by`),
  CONSTRAINT `fk_system_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_settings`
--

LOCK TABLES `system_settings` WRITE;
/*!40000 ALTER TABLE `system_settings` DISABLE KEYS */;
INSERT INTO `system_settings` VALUES (1,'pet_reference_seq','0',1,'Last issued Animal Reference Code number (SS-0001, SS-0002, ...)','2026-11-20 16:16:42',NULL),(2,'gemini_vision_matching','vision',1,'Toggle between Google Gemini Vision AI Biometrics and Free-Tier Attribute Rule-Based Matching','2026-11-20 16:16:42',NULL);
/*!40000 ALTER TABLE `system_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_notification_preferences`
--

DROP TABLE IF EXISTS `user_notification_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_notification_preferences` (
  `preference_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `email_reports` tinyint(1) NOT NULL DEFAULT '1',
  `email_rescues` tinyint(1) NOT NULL DEFAULT '1',
  `email_pet_matches` tinyint(1) NOT NULL DEFAULT '1',
  `email_claims` tinyint(1) NOT NULL DEFAULT '1',
  `email_reminders` tinyint(1) NOT NULL DEFAULT '1',
  `push_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `push_reports` tinyint(1) NOT NULL DEFAULT '1',
  `push_rescues` tinyint(1) NOT NULL DEFAULT '1',
  `push_pet_matches` tinyint(1) NOT NULL DEFAULT '1',
  `push_claims` tinyint(1) NOT NULL DEFAULT '1',
  `push_adoptions` tinyint(1) NOT NULL DEFAULT '1',
  `push_messages` tinyint(1) NOT NULL DEFAULT '1',
  `push_lost_found_alerts` tinyint(1) NOT NULL DEFAULT '1',
  `push_show_preview` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`preference_id`),
  UNIQUE KEY `uq_user_pref_user_id` (`user_id`),
  KEY `fk_user_pref_user` (`user_id`),
  CONSTRAINT `fk_user_pref_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_notification_preferences`
--

LOCK TABLES `user_notification_preferences` WRITE;
/*!40000 ALTER TABLE `user_notification_preferences` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_notification_preferences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role_id` int NOT NULL,
  `position_id` int DEFAULT NULL,
  `subdivision_id` int DEFAULT NULL,
  `barangay_id` int DEFAULT NULL,
  `is_head_officer` tinyint(1) DEFAULT '0',
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `profile_picture` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Active','Inactive','Suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `is_verified` tinyint(1) DEFAULT '0',
  `last_login` timestamp NULL DEFAULT NULL,
  `password_changed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_role` (`role_id`),
  KEY `fk_users_position` (`position_id`),
  KEY `fk_users_subdivision` (`subdivision_id`),
  KEY `fk_users_barangay` (`barangay_id`),
  CONSTRAINT `fk_users_barangay` FOREIGN KEY (`barangay_id`) REFERENCES `barangays` (`barangay_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_position` FOREIGN KEY (`position_id`) REFERENCES `positions` (`position_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`),
  CONSTRAINT `fk_users_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `warning_letter_template_versions`
--

DROP TABLE IF EXISTS `warning_letter_template_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `warning_letter_template_versions` (
  `version_id` int NOT NULL AUTO_INCREMENT,
  `template_id` int NOT NULL,
  `version_number` int NOT NULL,
  `subject_template` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `body_template` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `html_template` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `source_filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_docx_bytes` longblob,
  `placeholders_used` json DEFAULT NULL,
  `change_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`version_id`),
  KEY `created_by` (`created_by`),
  KEY `ix_warning_letter_template_versions_template_id` (`template_id`),
  KEY `ix_warning_letter_template_versions_version_id` (`version_id`),
  CONSTRAINT `warning_letter_template_versions_ibfk_1` FOREIGN KEY (`template_id`) REFERENCES `warning_letter_templates` (`template_id`) ON DELETE CASCADE,
  CONSTRAINT `warning_letter_template_versions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warning_letter_template_versions`
--

LOCK TABLES `warning_letter_template_versions` WRITE;
/*!40000 ALTER TABLE `warning_letter_template_versions` DISABLE KEYS */;
INSERT INTO `warning_letter_template_versions` VALUES (1,1,1,'{{warning_level}}: {{policy_reference}} ({{case_reference}})','Dear {{resident_name}},\n\nThis is a Notice from the Office of the Subdivision Leader of {{subdivision_name}}. It is a courteous first notice about a concern recorded under case {{case_reference}}. It is not a penalty.\n\nOn {{incident_date}}, an incident involving {{pet_name}} ({{pet_type}}) was reported to the subdivision, and the Office of the Subdivision Leader verified it.\n\nWhat Was Reported\n{{violation_description}}\n\nSubdivision Policy\n{{policy_reference}}\n\nWhat We Ask You To Do\n{{required_action}}\n\nWe hope this can be settled between neighbors. If you believe this notice is mistaken, or you would like to explain what happened, please contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.\n\nThis notice was issued on {{issue_date}}.','<div class=\"ss-warning-letter\">\n  <div class=\"ss-warning-letter__header\">\n    <div>\n      <div class=\"ss-warning-letter__org\">StraySafe Subdivision</div>\n      <div class=\"ss-warning-letter__sub\">Office of the Subdivision Leader</div>\n    </div>\n    <div class=\"ss-warning-letter__refs\">\n      <span><strong>Warning Reference:</strong> {{warning_reference}}</span>\n      <span><strong>Case Reference:</strong> {{case_reference}}</span>\n    </div>\n  </div>\n  <h2 class=\"ss-warning-letter__subject\">{{warning_level}}: {{policy_reference}} ({{case_reference}})</h2>\n  <div class=\"ss-warning-letter__body\"><p>Dear {{resident_name}},</p>\n<p>This is a Notice from the Office of the Subdivision Leader of {{subdivision_name}}. It is a courteous first notice about a concern recorded under case {{case_reference}}. It is not a penalty.</p>\n<p>On {{incident_date}}, an incident involving {{pet_name}} ({{pet_type}}) was reported to the subdivision, and the Office of the Subdivision Leader verified it.</p>\n<h3>What Was Reported</h3><p>{{violation_description}}</p>\n<h3>Subdivision Policy</h3><p>{{policy_reference}}</p>\n<h3>What We Ask You To Do</h3><p>{{required_action}}</p>\n<p>We hope this can be settled between neighbors. If you believe this notice is mistaken, or you would like to explain what happened, please contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.</p>\n<p>This notice was issued on {{issue_date}}.</p></div>\n</div>',NULL,NULL,'[\"warning_level\", \"policy_reference\", \"case_reference\", \"resident_name\", \"subdivision_name\", \"incident_date\", \"pet_name\", \"pet_type\", \"violation_description\", \"required_action\", \"warning_reference\", \"issue_date\"]','Initial standard template',NULL,'2026-11-20 16:16:43'),(2,2,1,'{{warning_level}}: {{policy_reference}} ({{case_reference}})','Dear {{resident_name}},\n\nThis is a formal First Warning from the Office of the Subdivision Leader of {{subdivision_name}}, issued under case {{case_reference}}.\n\nOn {{incident_date}}, an incident involving {{pet_name}} ({{pet_type}}), an animal in your care, was reported and verified as a violation of the subdivision policy below.\n\nViolation Details\n{{violation_description}}\n\nSubdivision Policy\n{{policy_reference}}\n\nRequired Corrective Action\n{{required_action}}\n\nPlease carry out the corrective action above. A further violation of the same policy may lead to a Second Warning. If you wish to respond, or believe this warning was issued in error, contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.\n\nThis warning was issued on {{issue_date}}.','<div class=\"ss-warning-letter\">\n  <div class=\"ss-warning-letter__header\">\n    <div>\n      <div class=\"ss-warning-letter__org\">StraySafe Subdivision</div>\n      <div class=\"ss-warning-letter__sub\">Office of the Subdivision Leader</div>\n    </div>\n    <div class=\"ss-warning-letter__refs\">\n      <span><strong>Warning Reference:</strong> {{warning_reference}}</span>\n      <span><strong>Case Reference:</strong> {{case_reference}}</span>\n    </div>\n  </div>\n  <h2 class=\"ss-warning-letter__subject\">{{warning_level}}: {{policy_reference}} ({{case_reference}})</h2>\n  <div class=\"ss-warning-letter__body\"><p>Dear {{resident_name}},</p>\n<p>This is a formal First Warning from the Office of the Subdivision Leader of {{subdivision_name}}, issued under case {{case_reference}}.</p>\n<p>On {{incident_date}}, an incident involving {{pet_name}} ({{pet_type}}), an animal in your care, was reported and verified as a violation of the subdivision policy below.</p>\n<h3>Violation Details</h3><p>{{violation_description}}</p>\n<h3>Subdivision Policy</h3><p>{{policy_reference}}</p>\n<h3>Required Corrective Action</h3><p>{{required_action}}</p>\n<p>Please carry out the corrective action above. A further violation of the same policy may lead to a Second Warning. If you wish to respond, or believe this warning was issued in error, contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.</p>\n<p>This warning was issued on {{issue_date}}.</p></div>\n</div>',NULL,NULL,'[\"warning_level\", \"policy_reference\", \"case_reference\", \"resident_name\", \"subdivision_name\", \"incident_date\", \"pet_name\", \"pet_type\", \"violation_description\", \"required_action\", \"warning_reference\", \"issue_date\"]','Initial standard template',NULL,'2026-11-20 16:16:43'),(3,3,1,'{{warning_level}}: {{policy_reference}} ({{case_reference}})','Dear {{resident_name}},\n\nThis is a formal Second Warning from the Office of the Subdivision Leader of {{subdivision_name}}, issued under case {{case_reference}}. It follows the earlier warning issued to you under the subdivision\'s rules.\n\nOn {{incident_date}}, a further incident involving {{pet_name}} ({{pet_type}}), an animal in your care, was reported and verified as a violation of the subdivision policy below.\n\nViolation Details\n{{violation_description}}\n\nSubdivision Policy\n{{policy_reference}}\n\nRequired Corrective Action\n{{required_action}}\n\nOffice Summons\nYou are asked to meet the Office of the Subdivision Leader to discuss this matter.\nDate and time: {{summons_date}}\nPlace: {{summons_place}}\n\nA further violation of the same policy may lead to a Final Notice. To respond or to ask about the meeting, contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.\n\nThis warning was issued on {{issue_date}}.','<div class=\"ss-warning-letter\">\n  <div class=\"ss-warning-letter__header\">\n    <div>\n      <div class=\"ss-warning-letter__org\">StraySafe Subdivision</div>\n      <div class=\"ss-warning-letter__sub\">Office of the Subdivision Leader</div>\n    </div>\n    <div class=\"ss-warning-letter__refs\">\n      <span><strong>Warning Reference:</strong> {{warning_reference}}</span>\n      <span><strong>Case Reference:</strong> {{case_reference}}</span>\n    </div>\n  </div>\n  <h2 class=\"ss-warning-letter__subject\">{{warning_level}}: {{policy_reference}} ({{case_reference}})</h2>\n  <div class=\"ss-warning-letter__body\"><p>Dear {{resident_name}},</p>\n<p>This is a formal Second Warning from the Office of the Subdivision Leader of {{subdivision_name}}, issued under case {{case_reference}}. It follows the earlier warning issued to you under the subdivision&#x27;s rules.</p>\n<p>On {{incident_date}}, a further incident involving {{pet_name}} ({{pet_type}}), an animal in your care, was reported and verified as a violation of the subdivision policy below.</p>\n<h3>Violation Details</h3><p>{{violation_description}}</p>\n<h3>Subdivision Policy</h3><p>{{policy_reference}}</p>\n<h3>Required Corrective Action</h3><p>{{required_action}}</p>\n<h3>Office Summons</h3><p>You are asked to meet the Office of the Subdivision Leader to discuss this matter.<br/>Date and time: {{summons_date}}<br/>Place: {{summons_place}}</p>\n<p>A further violation of the same policy may lead to a Final Notice. To respond or to ask about the meeting, contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.</p>\n<p>This warning was issued on {{issue_date}}.</p></div>\n</div>',NULL,NULL,'[\"warning_level\", \"policy_reference\", \"case_reference\", \"resident_name\", \"subdivision_name\", \"incident_date\", \"pet_name\", \"pet_type\", \"violation_description\", \"required_action\", \"summons_date\", \"summons_place\", \"warning_reference\", \"issue_date\"]','Initial standard template',NULL,'2026-11-20 16:16:43'),(4,4,1,'{{warning_level}}: {{policy_reference}} ({{case_reference}})','Dear {{resident_name}},\n\nThis is a Final Notice from the Office of the Subdivision Leader of {{subdivision_name}}, issued under case {{case_reference}}. It is the last warning level in the subdivision\'s process.\n\nOn {{incident_date}}, a further incident involving {{pet_name}} ({{pet_type}}), an animal in your care, was reported and verified as a violation of the subdivision policy below, after earlier warnings.\n\nViolation Details\n{{violation_description}}\n\nSubdivision Policy\n{{policy_reference}}\n\nRequired Corrective Action\n{{required_action}}\n\nIf this matter is not resolved, the Subdivision Leader will consider the further steps that the subdivision\'s own rules allow. This letter does not by itself impose any penalty. To respond, or to ask what happens next, contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.\n\nThis notice was issued on {{issue_date}}.','<div class=\"ss-warning-letter\">\n  <div class=\"ss-warning-letter__header\">\n    <div>\n      <div class=\"ss-warning-letter__org\">StraySafe Subdivision</div>\n      <div class=\"ss-warning-letter__sub\">Office of the Subdivision Leader</div>\n    </div>\n    <div class=\"ss-warning-letter__refs\">\n      <span><strong>Warning Reference:</strong> {{warning_reference}}</span>\n      <span><strong>Case Reference:</strong> {{case_reference}}</span>\n    </div>\n  </div>\n  <h2 class=\"ss-warning-letter__subject\">{{warning_level}}: {{policy_reference}} ({{case_reference}})</h2>\n  <div class=\"ss-warning-letter__body\"><p>Dear {{resident_name}},</p>\n<p>This is a Final Notice from the Office of the Subdivision Leader of {{subdivision_name}}, issued under case {{case_reference}}. It is the last warning level in the subdivision&#x27;s process.</p>\n<p>On {{incident_date}}, a further incident involving {{pet_name}} ({{pet_type}}), an animal in your care, was reported and verified as a violation of the subdivision policy below, after earlier warnings.</p>\n<h3>Violation Details</h3><p>{{violation_description}}</p>\n<h3>Subdivision Policy</h3><p>{{policy_reference}}</p>\n<h3>Required Corrective Action</h3><p>{{required_action}}</p>\n<p>If this matter is not resolved, the Subdivision Leader will consider the further steps that the subdivision&#x27;s own rules allow. This letter does not by itself impose any penalty. To respond, or to ask what happens next, contact the Office of the Subdivision Leader and mention reference {{warning_reference}}.</p>\n<p>This notice was issued on {{issue_date}}.</p></div>\n</div>',NULL,NULL,'[\"warning_level\", \"policy_reference\", \"case_reference\", \"resident_name\", \"subdivision_name\", \"incident_date\", \"pet_name\", \"pet_type\", \"violation_description\", \"required_action\", \"warning_reference\", \"issue_date\"]','Initial standard template',NULL,'2026-11-20 16:16:43');
/*!40000 ALTER TABLE `warning_letter_template_versions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `warning_letter_templates`
--

DROP TABLE IF EXISTS `warning_letter_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `warning_letter_templates` (
  `template_id` int NOT NULL AUTO_INCREMENT,
  `subdivision_id` int DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warning_level` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_default` tinyint(1) NOT NULL,
  `current_version_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`template_id`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `ix_warning_letter_templates_status` (`status`),
  KEY `ix_warning_letter_templates_template_id` (`template_id`),
  KEY `ix_warning_letter_templates_subdivision_id` (`subdivision_id`),
  KEY `ix_warning_letter_templates_warning_level` (`warning_level`),
  CONSTRAINT `warning_letter_templates_ibfk_1` FOREIGN KEY (`subdivision_id`) REFERENCES `subdivisions` (`subdivision_id`) ON DELETE CASCADE,
  CONSTRAINT `warning_letter_templates_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `warning_letter_templates_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warning_letter_templates`
--

LOCK TABLES `warning_letter_templates` WRITE;
/*!40000 ALTER TABLE `warning_letter_templates` DISABLE KEYS */;
INSERT INTO `warning_letter_templates` VALUES (1,1,'Notice Letter','A courteous first notice of a recorded concern. It asks for a change and states no consequence.','Notice','editor','active',1,1,NULL,NULL,'2026-11-20 16:16:43','2026-11-20 16:16:43'),(2,1,'First Warning Letter','A formal first warning for a verified violation of a subdivision policy.','1st Warning','editor','active',1,2,NULL,NULL,'2026-11-20 16:16:43','2026-11-20 16:16:43'),(3,1,'Second Warning Letter (with Office Summons)','A formal second warning that follows an earlier warning, with the date and place of a meeting at the subdivision office.','2nd Warning','editor','active',1,3,NULL,NULL,'2026-11-20 16:16:43','2026-11-20 16:16:43'),(4,1,'Final Notice / Escalation Letter','The last warning level. It states that the subdivision will consider further steps under its own rules. It imposes no penalty itself.','Final Notice / Escalation','editor','active',1,4,NULL,NULL,'2026-11-20 16:16:43','2026-11-20 16:16:43');
/*!40000 ALTER TABLE `warning_letter_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'straysafe_subdivision'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-20 16:19:26
