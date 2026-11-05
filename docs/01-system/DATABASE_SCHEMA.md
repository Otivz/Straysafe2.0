# Database schema

- **Status:** Current (generated)
- **Source:** `information_schema` of the local `straysafe_db`, 2026-11-05. Structure only: no data.
- **Regenerate** after any schema change; the SQLAlchemy models in `backend/app/models/` are the source of truth.

74 tables.

## Tables

- `adoption_assignments`
- `adoption_certificates`
- `adoption_home_visits`
- `adoption_interviews`
- `adoption_monitoring_logs`
- `adoption_ownership_history`
- `adoption_timeline_logs`
- `adoption_verifications`
- `adoptions`
- `ai_jobs`
- `ai_vision_comparisons`
- `announcement_categories`
- `announcement_comments`
- `announcement_media`
- `announcement_reactions`
- `announcements`
- `audit_logs`
- `barangays`
- `behavior_tags`
- `chat_messages`
- `chat_threads`
- `claim_assessment_changes`
- `claim_assessments`
- `claim_fee_schedules`
- `comments`
- `coverage_settings`
- `email_logs`
- `endorsement_letters`
- `facility_status`
- `followup_contact_logs`
- `followup_repeated_incidents`
- `holding_animals`
- `holding_timeline`
- `landmarks`
- `leader_identity_verifications`
- `letter_status`
- `lost_pet_alerts`
- `lost_pet_sightings`
- `manual_match_decisions`
- `notifications`
- `otp_verifications`
- `owner_followups`
- `owner_observation_update_photos`
- `owner_observation_updates`
- `owner_warnings`
- `pet_claims`
- `pet_history`
- `pet_match_confirmation_requests`
- `pet_owner_confirmations`
- `pet_qr_codes`
- `pet_qr_scans`
- `pet_vaccinations`
- `pets`
- `positions`
- `push_deliveries`
- `push_subscriptions`
- `report_categories`
- `report_disputes`
- `report_matches`
- `report_media`
- `report_returns`
- `report_status`
- `report_verifications`
- `reports`
- `rescue_assignments`
- `rescue_status`
- `rescues`
- `revoked_tokens`
- `roles`
- `status_history`
- `subdivisions`
- `system_settings`
- `user_notification_preferences`
- `users`

## adoption_assignments

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| assignment_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| task_type | enum('Verification','Interview','Home_Visit','Handover','Monitoring','Other') | NO |  |  |  |
| monitoring_log_id | int | YES | MUL |  |  |
| assigned_to | int | YES | MUL |  |  |
| assigned_to_name | varchar(100) | YES |  |  |  |
| assigned_by | int | YES | MUL |  |  |
| status | enum('Assigned','Accepted','Declined','In_Progress','Completed','Cancelled','Reassigned') | NO |  | Assigned |  |
| scheduled_at | datetime | YES |  |  |  |
| due_at | datetime | YES |  |  |  |
| assigned_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| accepted_at | datetime | YES |  |  |  |
| declined_at | datetime | YES |  |  |  |
| decline_reason | text | YES |  |  |  |
| completed_at | datetime | YES |  |  |  |
| cancelled_at | datetime | YES |  |  |  |
| remarks | text | YES |  |  |  |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `assigned_by` → `users.user_id`, `monitoring_log_id` → `adoption_monitoring_logs.log_id`, `assigned_to` → `users.user_id`

## adoption_certificates

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| certificate_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | UNI |  |  |
| certificate_number | varchar(100) | NO | UNI |  |  |
| verification_hash | varchar(64) | NO | UNI |  |  |
| pdf_url | varchar(500) | NO |  |  |  |
| qr_code_url | text | NO |  |  |  |
| issued_by | int | YES | MUL |  |  |
| issued_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| certificate_status | enum('Valid','Revoked') | NO |  | Valid |  |
| revoked_at | datetime | YES |  |  |  |
| revoked_by | int | YES | MUL |  |  |
| revoked_reason | text | YES |  |  |  |
| signatory_id | int | YES | MUL |  |  |
| signatory_name | varchar(150) | YES |  |  |  |
| signatory_position | varchar(150) | YES |  |  |  |
| snapshot | json | YES |  |  |  |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `revoked_by` → `users.user_id`, `signatory_id` → `users.user_id`, `issued_by` → `users.user_id`

## adoption_home_visits

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| visit_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| inspector_id | int | YES | MUL |  |  |
| visit_type | varchar(50) | NO |  | Physical |  |
| scheduled_date | datetime | YES |  |  |  |
| is_fencing_secure | tinyint(1) | NO |  | 0 |  |
| is_shelter_adequate | tinyint(1) | NO |  | 0 |  |
| hazard_free | tinyint(1) | NO |  | 0 |  |
| checklist_notes | text | YES |  |  |  |
| gps_latitude | decimal(10,8) | YES |  |  |  |
| gps_longitude | decimal(11,8) | YES |  |  |  |
| visit_photos | json | YES |  |  |  |
| inspection_result | varchar(50) | NO |  | Pending |  |
| conducted_at | datetime | YES |  |  |  |
| assignment_id | int | YES | MUL |  |  |
| evaluated_by | int | YES | MUL |  |  |
| reschedule_count | int | NO |  | 0 |  |
| last_rescheduled_at | datetime | YES |  |  |  |
| reschedule_reason | text | YES |  |  |  |
| residence_condition | varchar(100) | YES |  |  |  |
| available_living_space | varchar(100) | YES |  |  |  |
| environment_safety | varchar(100) | YES |  |  |  |
| cleanliness_sanitation | varchar(100) | YES |  |  |  |
| presence_of_hazards | varchar(255) | YES |  |  |  |
| existing_pets | varchar(255) | YES |  |  |  |
| overall_suitability | varchar(50) | YES |  |  |  |
| recommendations | text | YES |  |  |  |
| additional_observations | text | YES |  |  |  |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `assignment_id` → `adoption_assignments.assignment_id`, `evaluated_by` → `users.user_id`, `inspector_id` → `users.user_id`

## adoption_interviews

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| interview_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| interviewer_id | int | YES | MUL |  |  |
| scheduled_at | datetime | YES |  |  |  |
| interview_mode | varchar(50) | NO |  | In-Person |  |
| meeting_link | varchar(500) | YES |  |  |  |
| score_care_knowledge | int | YES |  |  |  |
| score_financial_readiness | int | YES |  |  |  |
| score_environment_suitability | int | YES |  |  |  |
| total_score | decimal(5,2) | YES |  |  |  |
| recommendation | varchar(50) | NO |  | Pending |  |
| interview_notes | text | YES |  |  |  |
| conducted_at | datetime | YES |  |  |  |
| assignment_id | int | YES | MUL |  |  |
| evaluated_by | int | YES | MUL |  |  |
| interview_result | varchar(50) | YES |  |  |  |
| questions_discussed | text | YES |  |  |  |
| applicant_responses | text | YES |  |  |  |
| additional_observations | text | YES |  |  |  |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `assignment_id` → `adoption_assignments.assignment_id`, `evaluated_by` → `users.user_id`, `interviewer_id` → `users.user_id`

## adoption_monitoring_logs

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| log_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| milestone_name | varchar(50) | NO |  |  |  |
| due_date | date | NO |  |  |  |
| submitted_at | datetime | YES |  |  |  |
| status | varchar(50) | NO |  | Pending |  |
| health_status | varchar(100) | YES |  |  |  |
| photos | json | YES |  |  |  |
| vet_record_url | varchar(500) | YES |  |  |  |
| adopter_notes | text | YES |  |  |  |
| reviewed_by | int | YES | MUL |  |  |
| review_notes | text | YES |  |  |  |
| reviewed_at | datetime | YES |  |  |  |
| entry_type | varchar(30) | NO |  | Adopter_Checkin |  |
| assignment_id | int | YES | MUL |  |  |
| assessed_by | int | YES | MUL |  |  |
| assessed_at | datetime | YES |  |  |  |
| assessment_result | varchar(50) | YES |  |  |  |
| animal_condition | varchar(100) | YES |  |  |  |
| living_condition | varchar(100) | YES |  |  |  |
| food_and_water | varchar(100) | YES |  |  |  |
| shelter_condition | varchar(100) | YES |  |  |  |
| vaccination_status | varchar(100) | YES |  |  |  |
| assessment_notes | text | YES |  |  |  |
| assessment_photos | json | YES |  |  |  |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `assessed_by` → `users.user_id`, `assignment_id` → `adoption_assignments.assignment_id`, `reviewed_by` → `users.user_id`

## adoption_ownership_history

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| history_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| from_user_id | int | YES | MUL |  |  |
| to_user_id | int | YES | MUL |  |  |
| action | enum('Claimed','Auto_Claimed_On_Approval','Transferred','Takeover','Released','Auto_Released') | NO |  |  |  |
| reason | text | YES |  |  |  |
| performed_by | int | YES | MUL |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `performed_by` → `users.user_id`, `from_user_id` → `users.user_id`, `to_user_id` → `users.user_id`

## adoption_timeline_logs

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| timeline_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| stage | varchar(50) | NO |  |  |  |
| action | varchar(100) | NO |  |  |  |
| performed_by | int | YES | MUL |  |  |
| notes | text | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `performed_by` → `users.user_id`

## adoption_verifications

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| verification_id | int | NO | PRI |  | auto_increment |
| adoption_id | int | NO | MUL |  |  |
| verified_by | int | YES | MUL |  |  |
| id_match_status | varchar(50) | NO |  | Pending |  |
| residency_status | varchar(50) | NO |  | Unknown |  |
| blacklist_checked | tinyint(1) | NO |  | 0 |  |
| is_blacklisted | tinyint(1) | NO |  | 0 |  |
| verification_notes | text | YES |  |  |  |
| verified_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `adoption_id` → `adoptions.adoption_id`, `verified_by` → `users.user_id`

## adoptions

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| adoption_id | int | NO | PRI |  | auto_increment |
| holding_id | int | NO | MUL |  |  |
| applicant_id | int | YES | MUL |  |  |
| is_manual_walkin | tinyint(1) | NO |  | 0 |  |
| manual_applicant_name | varchar(150) | YES |  |  |  |
| manual_applicant_phone | varchar(50) | YES |  |  |  |
| manual_applicant_email | varchar(100) | YES |  |  |  |
| manual_applicant_address | varchar(255) | YES |  |  |  |
| manual_id_type_number | varchar(100) | YES |  |  |  |
| status | enum('Pending','Approved','Rejected','Cancelled') | NO |  | Pending |  |
| full_name | varchar(150) | NO |  |  |  |
| address | text | NO |  |  |  |
| contact_no | varchar(20) | NO |  |  |  |
| has_other_pets | tinyint(1) | NO |  | 0 |  |
| living_space | enum('House with yard','Apartment','Condo','Other') | NO |  | House with yard |  |
| reason | text | NO |  |  |  |
| reviewed_by | int | YES | MUL |  |  |
| reviewer_role | enum('Subdivision Leader','Barangay Head Officer','Admin') | YES |  |  |  |
| review_notes | text | YES |  |  |  |
| reviewed_at | datetime | YES |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| is_handed_over | tinyint(1) | NO |  | 0 |  |
| handover_date | datetime | YES |  |  |  |
| created_pet_id | int | YES | MUL |  |  |
| id_type | varchar(100) | YES |  |  |  |
| id_number | varchar(255) | YES |  |  |  |
| id_photo_url | varchar(255) | YES |  |  |  |
| handover_evidence_url | varchar(255) | YES |  |  |  |
| staff_handed_over | tinyint(1) | NO |  | 0 |  |
| staff_handover_date | datetime | YES |  |  |  |
| staff_handover_by | int | YES |  |  |  |
| cancellation_reason | text | YES |  |  |  |
| cancelled_at | datetime | YES |  |  |  |
| current_stage | varchar(50) | NO |  | Application |  |
| application_stage_status | varchar(50) | NO |  | Submitted |  |
| agreement_signed_at | datetime | YES |  |  |  |
| agreement_signature_url | varchar(500) | YES |  |  |  |
| certificate_id | int | YES |  |  |  |
| handover_location | varchar(255) | YES |  |  |  |
| handover_photo_url | varchar(500) | YES |  |  |  |
| post_monitoring_status | varchar(50) | NO |  | Not_Started |  |
| adoption_completed_at | datetime | YES |  |  |  |
| is_certificate_sent | tinyint(1) | NO |  | 0 |  |
| certificate_sent_at | datetime | YES |  |  |  |
| handover_scheduled_date | datetime | YES |  |  |  |
| handover_scheduled_time | varchar(50) | YES |  |  |  |
| handover_assigned_staff | varchar(100) | YES |  |  |  |
| handover_notes | text | YES |  |  |  |
| handover_status | varchar(50) | YES |  | Pending |  |
| resident_handover_confirmed | tinyint(1) | NO |  | 0 |  |
| resident_handover_confirmed_at | datetime | YES |  |  |  |
| case_owner_id | int | YES | MUL |  |  |
| case_owner_assigned_at | datetime | YES |  |  |  |
| case_owner_assigned_by | int | YES | MUL |  |  |

Foreign keys: `case_owner_id` → `users.user_id`, `case_owner_assigned_by` → `users.user_id`, `created_pet_id` → `pets.pet_id`, `applicant_id` → `users.user_id`, `holding_id` → `holding_animals.holding_id`, `reviewed_by` → `users.user_id`

## ai_jobs

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| job_id | int | NO | PRI |  | auto_increment |
| kind | varchar(20) | NO |  |  |  |
| report_id | int | NO | MUL |  |  |
| media_id | int | YES |  |  |  |
| payload | json | YES |  |  |  |
| status | varchar(20) | NO | MUL | queued |  |
| attempts | int | NO |  | 0 |  |
| max_attempts | int | NO |  | 3 |  |
| error | text | YES |  |  |  |
| available_at | datetime | NO |  |  |  |
| locked_by | varchar(64) | YES |  |  |  |
| started_at | datetime | YES |  |  |  |
| finished_at | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

## ai_vision_comparisons

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| pair_key | varchar(64) | NO | PRI |  |  |
| result | json | NO |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

## announcement_categories

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| category_id | int | NO | PRI |  | auto_increment |
| category_name | varchar(100) | NO | UNI |  |  |
| description | text | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

## announcement_comments

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| comment_id | int | NO | PRI |  | auto_increment |
| announcement_id | int | NO | MUL |  |  |
| user_id | int | NO | MUL |  |  |
| parent_comment_id | int | YES | MUL |  |  |
| comment | text | NO |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `announcement_id` → `announcements.announcement_id`, `parent_comment_id` → `announcement_comments.comment_id`, `user_id` → `users.user_id`

## announcement_media

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| media_id | int | NO | PRI |  | auto_increment |
| announcement_id | int | NO | MUL |  |  |
| file_url | varchar(255) | NO |  |  |  |
| media_type | enum('Image','Video','Document') | NO |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| caption | text | YES |  |  |  |
| uploaded_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `announcement_id` → `announcements.announcement_id`

## announcement_reactions

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| reaction_id | int | NO | PRI |  | auto_increment |
| announcement_id | int | NO | MUL |  |  |
| user_id | int | NO | MUL |  |  |
| reaction_type | varchar(50) | YES |  | Like |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `announcement_id` → `announcements.announcement_id`, `user_id` → `users.user_id`

## announcements

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| announcement_id | int | NO | PRI |  | auto_increment |
| subdivision_id | int | YES | MUL |  |  |
| created_by | int | NO | MUL |  |  |
| category_id | int | YES | MUL |  |  |
| title | varchar(255) | NO |  |  |  |
| content | text | NO |  |  |  |
| visibility | enum('Public','Subdivision Only','Barangay Only') | YES |  | Public |  |
| priority_level | enum('Low','Normal','High','Emergency') | YES |  | Normal |  |
| status | enum('Draft','Published','Archived') | YES |  | Published |  |
| published_at | timestamp | YES | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| expires_at | timestamp | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| barangay_id | int | YES |  |  |  |
| cover_image | varchar(255) | YES |  |  |  |
| allow_comments | tinyint(1) | YES |  | 1 |  |

Foreign keys: `category_id` → `announcement_categories.category_id`, `subdivision_id` → `subdivisions.subdivision_id`, `created_by` → `users.user_id`

## audit_logs

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| log_id | int | NO | PRI |  | auto_increment |
| user_id | int | YES | MUL |  |  |
| action | varchar(100) | NO |  |  |  |
| target_table | varchar(100) | YES | MUL |  |  |
| target_id | int | YES |  |  |  |
| description | text | YES |  |  |  |
| ip_address | varchar(45) | YES |  |  |  |
| user_agent | text | YES |  |  |  |
| log_type | varchar(50) | NO | MUL | operation |  |
| old_values | json | YES |  |  |  |
| new_values | json | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `user_id` → `users.user_id`

## barangays

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| barangay_id | int | NO | PRI |  | auto_increment |
| barangay_name | varchar(100) | NO | UNI |  |  |
| city | varchar(100) | NO |  |  |  |
| contact_no | varchar(20) | YES |  |  |  |
| hq_plus_code | varchar(20) | YES |  |  |  |
| hq_lat | decimal(10,8) | YES |  |  |  |
| hq_lng | decimal(11,8) | YES |  |  |  |

## behavior_tags

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| tag_id | int | NO | PRI |  | auto_increment |
| tag_name | varchar(100) | NO | UNI |  |  |

## chat_messages

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| message_id | int | NO | PRI |  | auto_increment |
| thread_id | int | NO | MUL |  |  |
| sender_id | int | NO | MUL |  |  |
| message_text | text | NO |  |  |  |
| media_url | varchar(255) | YES |  |  |  |
| is_read | tinyint(1) | NO |  | 0 |  |
| is_system | tinyint(1) | NO |  | 0 |  |
| sent_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `sender_id` → `users.user_id`, `thread_id` → `chat_threads.thread_id`

## chat_threads

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| thread_id | int | NO | PRI |  | auto_increment |
| thread_type | enum('Report','Pet_Claim','Direct','Adoption') | NO | MUL | Report |  |
| related_id | int | YES |  |  |  |
| created_by | int | NO | MUL |  |  |
| recipient_id | int | NO | MUL |  |  |
| title | varchar(255) | YES |  |  |  |
| is_closed | tinyint(1) | NO |  | 0 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `created_by` → `users.user_id`, `recipient_id` → `users.user_id`

## claim_assessment_changes

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| change_id | int | NO | PRI |  | auto_increment |
| assessment_id | int | NO | MUL |  |  |
| action | varchar(30) | NO |  |  |  |
| field | varchar(40) | YES |  |  |  |
| previous_value | varchar(120) | YES |  |  |  |
| new_value | varchar(120) | YES |  |  |  |
| reason | text | YES |  |  |  |
| changed_by | int | YES | MUL |  |  |
| changed_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `assessment_id` → `claim_assessments.assessment_id`, `changed_by` → `users.user_id`

## claim_assessments

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| assessment_id | int | NO | PRI |  | auto_increment |
| claim_id | int | NO | MUL |  |  |
| report_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| holding_id | int | YES | MUL |  |  |
| species | varchar(10) | NO |  |  |  |
| fine_category | varchar(40) | NO |  |  |  |
| fine_amount | decimal(10,2) | YES |  |  |  |
| fine_legal_basis | text | YES |  |  |  |
| charge_description | varchar(200) | YES |  |  |  |
| no_charge_applicable | tinyint(1) | NO |  | 0 |  |
| impounding_fee | decimal(10,2) | NO |  | 0.00 |  |
| impounding_fee_basis | text | YES |  |  |  |
| boarding_days | int | NO |  | 0 |  |
| boarding_fee | decimal(10,2) | NO |  | 0.00 |  |
| boarding_fee_basis | text | YES |  |  |  |
| total_due | decimal(10,2) | NO |  | 0.00 |  |
| status | varchar(20) | NO | MUL | Assessed |  |
| notes | text | YES |  |  |  |
| assessed_by | int | YES | MUL |  |  |
| assessed_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| amount_paid | decimal(10,2) | YES |  |  |  |
| receipt_number | varchar(60) | YES |  |  |  |
| payment_recorded_by | int | YES | MUL |  |  |
| paid_at | datetime | YES |  |  |  |
| waiver_reason | text | YES |  |  |  |
| waived_by | int | YES | MUL |  |  |
| waived_at | datetime | YES |  |  |  |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `assessed_by` → `users.user_id`, `claim_id` → `pet_claims.claim_id`, `holding_id` → `holding_animals.holding_id`, `payment_recorded_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `waived_by` → `users.user_id`

## claim_fee_schedules

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| schedule_id | int | NO | PRI |  | auto_increment |
| fee_type | varchar(40) | NO | MUL |  |  |
| species | varchar(10) | YES |  |  |  |
| min_amount | decimal(10,2) | NO |  |  |  |
| max_amount | decimal(10,2) | NO |  |  |  |
| legal_basis | text | NO |  |  |  |
| barangay_id | int | YES | MUL |  |  |
| is_active | tinyint(1) | NO |  | 1 |  |
| created_by | int | YES | MUL |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| deactivated_by | int | YES | MUL |  |  |
| deactivated_at | datetime | YES |  |  |  |

Foreign keys: `barangay_id` → `barangays.barangay_id`, `created_by` → `users.user_id`, `deactivated_by` → `users.user_id`

## comments

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| comment_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| user_id | int | NO | MUL |  |  |
| parent_comment_id | int | YES | MUL |  |  |
| comment | text | NO |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `parent_comment_id` → `comments.comment_id`, `report_id` → `reports.report_id`, `user_id` → `users.user_id`

## coverage_settings

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI |  | auto_increment |
| subdivision_id | int | YES | MUL |  |  |
| center_label | varchar(100) | NO |  |  |  |
| center_latitude | decimal(10,8) | NO |  |  |  |
| center_longitude | decimal(11,8) | NO |  |  |  |
| radius_meters | int | NO |  |  |  |
| boundary_polygon | json | YES |  |  |  |
| is_active | tinyint(1) | NO |  |  |  |
| updated_at | datetime | NO |  | now() | DEFAULT_GENERATED |
| updated_by | int | YES | MUL |  |  |

Foreign keys: `subdivision_id` → `subdivisions.subdivision_id`, `updated_by` → `users.user_id`

## email_logs

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| email_id | int | NO | PRI |  | auto_increment |
| user_id | int | YES | MUL |  |  |
| recipient_email | varchar(255) | NO |  |  |  |
| template_key | varchar(100) | NO |  |  |  |
| subject | varchar(255) | NO |  |  |  |
| status | enum('Pending','Sent','Failed','Simulated','Expired') | NO | MUL | Pending |  |
| attempts | int | NO |  | 0 |  |
| max_attempts | int | NO |  | 3 |  |
| error_message | text | YES |  |  |  |
| idempotency_key | varchar(120) | YES | UNI |  |  |
| related_entity_type | varchar(50) | YES |  |  |  |
| related_entity_id | int | YES |  |  |  |
| text_body | longtext | YES |  |  |  |
| html_body | longtext | YES |  |  |  |
| next_attempt_at | datetime | YES |  |  |  |
| last_attempt_at | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| sent_at | datetime | YES |  |  |  |

Foreign keys: `user_id` → `users.user_id`

## endorsement_letters

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| letter_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| leader_id | int | NO | MUL |  |  |
| status_id | int | NO | MUL | 1 |  |
| pdf_url | varchar(255) | YES |  |  |  |
| remarks | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| title | varchar(255) | YES |  |  |  |
| letter_content | text | YES |  |  |  |
| file_url | varchar(255) | YES |  |  |  |
| issued_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `leader_id` → `users.user_id`, `report_id` → `reports.report_id`, `status_id` → `letter_status.status_id`

## facility_status

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| status_id | int | NO | PRI |  | auto_increment |
| status_name | varchar(50) | NO | UNI |  |  |

## followup_contact_logs

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| contact_log_id | int | NO | PRI |  | auto_increment |
| followup_id | int | NO | MUL |  |  |
| logged_by | int | NO | MUL |  |  |
| contact_type | enum('Phone Call','In-Person Visit','SMS','Verbal Warning','Other') | NO |  | Phone Call |  |
| contact_date | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| notes | text | NO |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| report_id | int | YES | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| inspection_method | varchar(50) | YES |  |  |  |
| inspection_outcome | varchar(50) | YES |  |  |  |
| client_request_id | varchar(64) | YES | UNI |  |  |

Foreign keys: `followup_id` → `owner_followups.followup_id`, `logged_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `followup_id` → `owner_followups.followup_id`, `logged_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`

## followup_repeated_incidents

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| incident_id | int | NO | PRI |  | auto_increment |
| followup_id | int | NO | MUL |  |  |
| report_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| logged_by | int | YES | MUL |  |  |
| notes | text | NO |  |  |  |
| incident_date | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `followup_id` → `owner_followups.followup_id`, `logged_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`

## holding_animals

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| holding_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | UNI |  |  |
| rescue_id | int | YES | MUL |  |  |
| animal_type | enum('Dog','Cat','Unknown') | YES |  | Unknown |  |
| animal_name | varchar(100) | YES |  |  |  |
| breed | varchar(100) | YES |  |  |  |
| color | varchar(100) | YES |  |  |  |
| estimated_size | varchar(50) | YES |  |  |  |
| facility_status | int | NO | MUL | 1 |  |
| kennel_slot | varchar(50) | YES |  |  |  |
| medical_notes | text | YES |  |  |  |
| adoption_catalog_notes | text | YES |  |  |  |
| promoted_at | timestamp | YES |  |  |  |
| promoted_by | int | YES | MUL |  |  |
| intake_date | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| discharge_date | timestamp | YES |  |  |  |
| intake_staff_id | int | YES | MUL |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| overdue_notified | tinyint(1) | YES |  | 0 |  |
| sex | enum('Male','Female','Unknown') | YES |  | Unknown |  |
| estimated_age | varchar(50) | YES |  |  |  |

Foreign keys: `promoted_by` → `users.user_id`, `report_id` → `reports.report_id`, `rescue_id` → `rescues.rescue_id`, `intake_staff_id` → `users.user_id`, `facility_status` → `facility_status.status_id`

## holding_timeline

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| log_id | int | NO | PRI |  | auto_increment |
| holding_id | int | NO | MUL |  |  |
| event_type | varchar(50) | NO |  | observation |  |
| title | varchar(255) | NO |  |  |  |
| notes | text | YES |  |  |  |
| logged_by | int | YES | MUL |  |  |
| logged_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `holding_id` → `holding_animals.holding_id`, `logged_by` → `users.user_id`

## landmarks

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| landmark_id | int | NO | PRI |  | auto_increment |
| name | varchar(150) | NO |  |  |  |
| category | varchar(50) | NO |  | general |  |
| description | text | YES |  |  |  |
| subdivision_id | int | YES | MUL |  |  |
| barangay_id | int | NO | MUL | 1 |  |
| latitude | decimal(10,8) | NO |  |  |  |
| longitude | decimal(11,8) | NO |  |  |  |
| is_holding_facility | tinyint(1) | NO |  | 0 |  |
| facility_type | varchar(50) | YES |  |  |  |
| capacity | int | YES |  |  |  |
| contact_person | varchar(100) | YES |  |  |  |
| contact_number | varchar(20) | YES |  |  |  |
| status | enum('Active','Inactive') | NO |  | Active |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `barangay_id` → `barangays.barangay_id`, `subdivision_id` → `subdivisions.subdivision_id`

## leader_identity_verifications

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| verification_id | int | NO | PRI |  | auto_increment |
| match_id | int | NO | UNI |  |  |
| report_id | int | NO | MUL |  |  |
| pet_id | int | NO | MUL |  |  |
| leader_id | int | YES | MUL |  |  |
| method | varchar(50) | NO |  |  |  |
| reason | text | NO |  |  |  |
| trigger | varchar(30) | NO |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `leader_id` → `users.user_id`, `match_id` → `report_matches.match_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`

## letter_status

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| status_id | int | NO | PRI |  | auto_increment |
| status_name | varchar(50) | NO | UNI |  |  |

## lost_pet_alerts

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| alert_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | UNI |  |  |
| subdivision_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| owner_id | int | YES | MUL |  |  |
| status | varchar(20) | NO | MUL | requested |  |
| last_seen_at | datetime | YES |  |  |  |
| last_seen_location | varchar(255) | YES |  |  |  |
| last_seen_lat | decimal(10,8) | YES |  |  |  |
| last_seen_lng | decimal(11,8) | YES |  |  |  |
| contact_preference | varchar(30) | NO |  | app_message |  |
| owner_note | text | YES |  |  |  |
| leader_message | text | YES |  |  |  |
| requested_by | int | YES | MUL |  |  |
| requested_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| activated_by | int | YES | MUL |  |  |
| activated_at | datetime | YES |  |  |  |
| residents_notified | int | NO |  | 0 |  |
| close_outcome | varchar(30) | YES |  |  |  |
| close_reason | text | YES |  |  |  |
| closed_by | int | YES | MUL |  |  |
| closed_at | datetime | YES |  |  |  |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `activated_by` → `users.user_id`, `closed_by` → `users.user_id`, `owner_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `requested_by` → `users.user_id`, `subdivision_id` → `subdivisions.subdivision_id`

## lost_pet_sightings

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| sighting_id | int | NO | PRI |  | auto_increment |
| alert_id | int | NO | MUL |  |  |
| report_id | int | NO | MUL |  |  |
| reporter_id | int | YES | MUL |  |  |
| latitude | decimal(10,8) | NO |  |  |  |
| longitude | decimal(11,8) | NO |  |  |  |
| location_source | varchar(20) | NO |  | map_pin |  |
| location_label | varchar(255) | YES |  |  |  |
| seen_at | datetime | NO | MUL |  |  |
| submitted_at | datetime | NO | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| description | text | YES |  |  |  |
| photo_url | varchar(500) | YES |  |  |  |
| accuracy_confirmed | tinyint(1) | NO |  | 0 |  |
| status | varchar(20) | NO | MUL | unverified |  |
| review_note | text | YES |  |  |  |
| reviewed_by | int | YES | MUL |  |  |
| reviewed_at | datetime | YES |  |  |  |
| client_request_id | varchar(64) | YES | UNI |  |  |

Foreign keys: `alert_id` → `lost_pet_alerts.alert_id`, `reporter_id` → `users.user_id`, `report_id` → `reports.report_id`, `reviewed_by` → `users.user_id`

## manual_match_decisions

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| decision_id | int | NO | PRI |  | auto_increment |
| match_id | int | YES | MUL |  |  |
| report_a_id | int | NO | MUL |  |  |
| report_b_id | int | YES | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| decision | varchar(30) | NO |  |  |  |
| previous_status | varchar(50) | YES |  |  |  |
| notes | text | NO |  |  |  |
| staff_id | int | YES | MUL |  |  |
| staff_role | varchar(50) | YES |  |  |  |
| linked_case_id | int | YES |  |  |  |
| ai_state | varchar(30) | YES |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `match_id` → `report_matches.match_id`, `staff_id` → `users.user_id`

## notifications

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| notification_id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| type | varchar(50) | NO | MUL |  |  |
| title | varchar(255) | NO |  |  |  |
| message | text | NO |  |  |  |
| related_id | int | YES |  |  |  |
| is_read | tinyint(1) | YES |  | 0 |  |
| is_archived | tinyint(1) | YES |  | 0 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `user_id` → `users.user_id`

## otp_verifications

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| otp_id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| email | varchar(100) | NO | MUL |  |  |
| phone | varchar(20) | YES |  |  |  |
| otp_code | varchar(10) | NO |  |  |  |
| purpose | varchar(50) | NO |  |  |  |
| is_used | tinyint(1) | NO |  |  |  |
| attempts | int | NO |  |  |  |
| max_attempts | int | NO |  |  |  |
| expires_at | datetime | NO |  |  |  |
| created_at | datetime | YES |  | now() | DEFAULT_GENERATED |

Foreign keys: `user_id` → `users.user_id`

## owner_followups

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| followup_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| subdivision_id | int | NO | MUL |  |  |
| leader_id | int | NO | MUL |  |  |
| owner_id | int | YES | MUL |  |  |
| owner_name | varchar(150) | YES |  |  |  |
| owner_phone | varchar(50) | YES |  |  |  |
| owner_address | varchar(255) | YES |  |  |  |
| status | enum('observing','complied','closed','escalated','cancelled') | NO | MUL | observing |  |
| due_at | datetime | NO | MUL |  |  |
| duration_days | int | NO |  | 3 |  |
| notes | text | YES |  |  |  |
| is_extended | tinyint(1) | NO |  | 0 |  |
| extended_at | datetime | YES |  |  |  |
| extended_by | int | YES | MUL |  |  |
| extension_reason | text | YES |  |  |  |
| extension_days | int | YES |  |  |  |
| compliance_notes | text | YES |  |  |  |
| closed_at | datetime | YES |  |  |  |
| closed_by | int | YES | MUL |  |  |
| close_reason | text | YES |  |  |  |
| owner_acknowledged_at | datetime | YES |  |  |  |
| owner_acknowledgement_method | varchar(50) | YES |  |  |  |
| owner_notes | text | YES |  |  |  |
| owner_photo_url | varchar(255) | YES |  |  |  |
| owner_photo_submitted_at | datetime | YES |  |  |  |
| reminder_sent_at | datetime | YES |  |  |  |
| due_notice_sent_at | datetime | YES |  |  |  |
| update_reminder_sent_at | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `closed_by` → `users.user_id`, `extended_by` → `users.user_id`, `leader_id` → `users.user_id`, `owner_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `subdivision_id` → `subdivisions.subdivision_id`

## owner_observation_update_photos

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| photo_id | int | NO | PRI |  | auto_increment |
| update_id | int | NO | MUL |  |  |
| photo_url | varchar(500) | NO |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `update_id` → `owner_observation_updates.update_id`

## owner_observation_updates

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| update_id | int | NO | PRI |  | auto_increment |
| followup_id | int | NO | MUL |  |  |
| report_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| owner_user_id | int | NO | MUL |  |  |
| compliance_status | varchar(30) | NO |  |  |  |
| owner_remarks | text | NO |  |  |  |
| client_request_id | varchar(64) | YES | UNI |  |  |
| submitted_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| reviewed_at | datetime | YES |  |  |  |
| reviewed_by | int | YES | MUL |  |  |
| review_remarks | text | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `followup_id` → `owner_followups.followup_id`, `owner_user_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `reviewed_by` → `users.user_id`

## owner_warnings

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| warning_id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| report_id | int | YES | MUL |  |  |
| issued_by | int | NO | MUL |  |  |
| warning_level | enum('Notice','1st Warning','2nd Warning','Final Notice / Escalation') | NO |  | 1st Warning |  |
| violation_type | enum('Free-Roaming Unleashed','Nuisance / Aggressive Behavior','Overdue Vaccination','Repeated Impoundment Retrieval','Other') | NO |  | Free-Roaming Unleashed |  |
| description | text | NO |  |  |  |
| fine_amount | decimal(10,2) | YES |  | 0.00 |  |
| status | enum('Pending','Acknowledged','Appealed','Resolved') | NO |  | Pending |  |
| acknowledged_at | timestamp | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `issued_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `user_id` → `users.user_id`

## pet_claims

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| claim_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| pet_id | int | NO | MUL |  |  |
| status | enum('Potential Owner Match','Possible Match Found','Pending Review','Approved','Rejected','Evidence Requested','Handover Complete','Pet Received','Merged','Not Needed') | NO |  | Potential Owner Match |  |
| evidence_url | varchar(255) | YES |  |  |  |
| vaccine_card_url | varchar(255) | YES |  |  |  |
| vet_record_url | varchar(255) | YES |  |  |  |
| registration_record_url | varchar(255) | YES |  |  |  |
| additional_photos_url | text | YES |  |  |  |
| distinctive_markings | text | YES |  |  |  |
| remarks | text | YES |  |  |  |
| match_score | int | YES |  |  |  |
| merged_into_claim_id | int | YES |  |  |  |
| status_before_merge | varchar(30) | YES |  |  |  |
| status_before_approval | int | YES |  |  |  |
| owner_whereabouts | varchar(20) | YES |  |  |  |
| owner_whereabouts_note | text | YES |  |  |  |
| owner_whereabouts_at | datetime | YES |  |  |  |
| closed_reason | text | YES |  |  |  |
| closed_by | int | YES |  |  |  |
| closed_at | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`

## pet_history

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| history_id | int | NO | PRI |  | auto_increment |
| pet_id | int | NO | MUL |  |  |
| event_type | varchar(100) | NO |  |  |  |
| title | varchar(150) | NO |  |  |  |
| description | text | YES |  |  |  |
| recovery_method | varchar(50) | YES |  |  |  |
| scan_id | int | YES | MUL |  |  |
| actor_id | int | YES | MUL |  |  |
| actor_name | varchar(100) | YES |  |  |  |
| actor_role | varchar(50) | YES |  |  |  |
| previous_status | varchar(50) | YES |  |  |  |
| new_status | varchar(50) | YES |  |  |  |
| location_name | varchar(255) | YES |  |  |  |
| latitude | decimal(10,8) | YES |  |  |  |
| longitude | decimal(11,8) | YES |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `actor_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `scan_id` → `pet_qr_scans.scan_id`

## pet_match_confirmation_requests

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| request_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| pet_id | int | NO | MUL |  |  |
| owner_id | int | YES | MUL |  |  |
| requested_by | int | YES | MUL |  |  |
| requested_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| staff_message | text | YES |  |  |  |
| status | varchar(40) | NO | MUL | AWAITING_OWNER_CONFIRMATION |  |
| owner_response | varchar(10) | YES |  |  |  |
| owner_note | text | YES |  |  |  |
| owner_response_at | datetime | YES |  |  |  |
| cancelled_by | int | YES | MUL |  |  |
| cancelled_at | datetime | YES |  |  |  |
| cancel_reason | text | YES |  |  |  |
| final_decision | varchar(30) | YES |  |  |  |
| final_by | int | YES | MUL |  |  |
| final_at | datetime | YES |  |  |  |
| match_id | int | YES | MUL |  |  |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `cancelled_by` → `users.user_id`, `final_by` → `users.user_id`, `match_id` → `report_matches.match_id`, `owner_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `requested_by` → `users.user_id`

## pet_owner_confirmations

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| confirmation_id | int | NO | PRI |  | auto_increment |
| pet_id | int | NO | MUL |  |  |
| proposed_owner_id | int | NO | MUL |  |  |
| proposed_by | int | YES | MUL |  |  |
| previous_owner_id | int | YES | MUL |  |  |
| source | varchar(30) | NO |  | assign |  |
| report_id | int | YES | MUL |  |  |
| status | enum('Pending','Accepted','Rejected','Cancelled') | NO |  | Pending |  |
| reject_reason | text | YES |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| responded_at | datetime | YES |  |  |  |

Foreign keys: `pet_id` → `pets.pet_id`, `proposed_owner_id` → `users.user_id`, `proposed_by` → `users.user_id`, `previous_owner_id` → `users.user_id`, `report_id` → `reports.report_id`

## pet_qr_codes

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| qr_id | int | NO | PRI |  | auto_increment |
| pet_id | int | NO | UNI |  |  |
| qr_token | varchar(255) | NO | UNI |  |  |
| qr_image_url | varchar(255) | YES |  |  |  |
| is_active | tinyint(1) | YES |  | 1 |  |
| scan_count | int | YES |  | 0 |  |
| last_scanned_at | timestamp | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `pet_id` → `pets.pet_id`

## pet_qr_scans

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| scan_id | int | NO | PRI |  | auto_increment |
| qr_id | int | NO | MUL |  |  |
| pet_id | int | NO | MUL |  |  |
| scanned_by | int | YES | MUL |  |  |
| finder_name | varchar(100) | YES |  |  |  |
| finder_contact | varchar(20) | YES |  |  |  |
| scan_lat | decimal(10,8) | YES |  |  |  |
| scan_lng | decimal(11,8) | YES |  |  |  |
| street_address | varchar(255) | YES |  |  |  |
| barangay | varchar(100) | YES |  |  |  |
| city | varchar(100) | YES |  |  |  |
| landmark | varchar(255) | YES |  |  |  |
| location_type | enum('Found Location','Barangay Hall','Temporary Shelter') | YES |  | Found Location |  |
| notes | varchar(255) | YES |  |  |  |
| status | enum('PENDING','CONFIRMED','REJECTED','EXPIRED') | NO |  | PENDING |  |
| confirmed_at | datetime | YES |  |  |  |
| confirmed_by | int | YES | MUL |  |  |
| rejection_reason | varchar(255) | YES |  |  |  |
| pet_status_at_scan | varchar(50) | YES |  |  |  |
| scanned_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `confirmed_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `qr_id` → `pet_qr_codes.qr_id`, `scanned_by` → `users.user_id`

## pet_vaccinations

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| vaccination_id | int | NO | PRI |  | auto_increment |
| pet_id | int | NO | MUL |  |  |
| vaccine_name | varchar(100) | NO |  |  |  |
| administered_date | date | NO |  |  |  |
| expiry_date | date | YES |  |  |  |
| clinic_name | varchar(100) | YES |  |  |  |
| veterinarian | varchar(100) | YES |  |  |  |
| notes | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `pet_id` → `pets.pet_id`

## pets

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| pet_id | int | NO | PRI |  | auto_increment |
| owner_id | int | YES | MUL |  |  |
| pet_name | varchar(100) | NO |  |  |  |
| reference_code | varchar(16) | YES | UNI |  |  |
| pet_type | enum('Dog','Cat') | NO |  |  |  |
| breed | varchar(100) | YES |  |  |  |
| color_markings | varchar(255) | YES |  |  |  |
| primary_color | varchar(100) | YES |  |  |  |
| secondary_color | varchar(100) | YES |  |  |  |
| tertiary_color | varchar(100) | YES |  |  |  |
| distinctive_markings | text | YES |  |  |  |
| gender | enum('Male','Female','Unknown') | YES |  | Unknown |  |
| birth_date | date | YES |  |  |  |
| estimated_age | varchar(50) | YES |  |  |  |
| weight | decimal(5,2) | YES |  |  |  |
| size_category | enum('Small','Medium','Large') | YES |  | Medium |  |
| photo_url | varchar(255) | YES |  |  |  |
| photo_front_url | varchar(255) | YES |  |  |  |
| photo_left_url | varchar(255) | YES |  |  |  |
| photo_right_url | varchar(255) | YES |  |  |  |
| vaccine_card_url | varchar(255) | YES |  |  |  |
| health_condition | text | YES |  |  |  |
| is_vaccinated | tinyint(1) | YES |  | 0 |  |
| vaccination_date | date | YES |  |  |  |
| vaccine_expiry | date | YES |  |  |  |
| is_neutered | tinyint(1) | YES |  | 0 |  |
| temperament | enum('Friendly','Aggressive','Anxious','Scared','Protective') | YES |  | Friendly |  |
| has_bite_history | tinyint(1) | YES |  | 0 |  |
| bite_incident_count | int | YES |  | 0 |  |
| chase_behavior | tinyint(1) | YES |  | 0 |  |
| chase_incident_count | int | YES |  | 0 |  |
| declared_bite_history | tinyint(1) | NO |  | 0 |  |
| declared_chase_behavior | tinyint(1) | NO |  | 0 |  |
| notes | text | YES |  |  |  |
| status | enum('Active','Lost','Found','Rescued','Deceased','Archived','Inactive') | YES | MUL | Active |  |
| is_verified | tinyint(1) | YES |  | 0 |  |
| last_seen_lat | decimal(10,8) | YES |  |  |  |
| last_seen_lng | decimal(11,8) | YES |  |  |  |
| last_seen_at | timestamp | YES |  |  |  |
| emergency_contact_name | varchar(100) | YES |  |  |  |
| emergency_contact_phone | varchar(20) | YES |  |  |  |
| registered_address | varchar(255) | YES |  |  |  |
| registered_latitude | decimal(10,8) | YES |  |  |  |
| registered_longitude | decimal(11,8) | YES |  |  |  |
| registered_by_user_id | int | YES | MUL |  |  |
| registered_by_name | varchar(100) | YES |  |  |  |
| photo_check_status | varchar(30) | YES |  |  |  |
| merged_into_pet_id | int | YES |  |  |  |
| ai_detection_confidence | decimal(4,3) | YES |  |  |  |
| photo_check_details | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `owner_id` → `users.user_id`, `registered_by_user_id` → `users.user_id`

## positions

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| position_id | int | NO | PRI |  | auto_increment |
| position_name | varchar(100) | NO | UNI |  |  |

## push_deliveries

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| delivery_id | int | NO | PRI |  | auto_increment |
| notification_id | int | NO | MUL |  |  |
| subscription_id | int | NO | MUL |  |  |
| status | varchar(20) | NO | MUL | queued |  |
| attempts | int | NO |  | 0 |  |
| next_attempt_at | datetime | YES |  |  |  |
| last_error | varchar(500) | YES |  |  |  |
| sent_at | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `notification_id` → `notifications.notification_id`, `subscription_id` → `push_subscriptions.subscription_id`

## push_subscriptions

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| subscription_id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| channel | varchar(20) | NO |  | webpush |  |
| endpoint | text | NO |  |  |  |
| endpoint_hash | varchar(64) | NO | UNI |  |  |
| p256dh | varchar(255) | YES |  |  |  |
| auth | varchar(255) | YES |  |  |  |
| user_agent | varchar(255) | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| last_success_at | datetime | YES |  |  |  |
| revoked_at | datetime | YES |  |  |  |

Foreign keys: `user_id` → `users.user_id`

## report_categories

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| category_id | int | NO | PRI |  | auto_increment |
| category_name | varchar(100) | NO | UNI |  |  |
| description | text | YES |  |  |  |

## report_disputes

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| dispute_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| resident_user_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| dispute_reason | text | NO |  |  |  |
| vaccination_card_url | varchar(255) | YES |  |  |  |
| supporting_photo_url | varchar(255) | YES |  |  |  |
| status | enum('Pending','Accepted','Rejected','Upheld','Reversed') | NO |  | Pending |  |
| dispute_type | varchar(30) | NO |  | false_report |  |
| merged_into_report_id | int | YES |  |  |  |
| contested_pet_id | int | YES |  |  |  |
| match_id | int | YES |  |  |  |
| reviewer_id | int | YES | MUL |  |  |
| reviewer_notes | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| resolved_at | timestamp | YES |  |  |  |

Foreign keys: `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `resident_user_id` → `users.user_id`, `reviewer_id` → `users.user_id`

## report_matches

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| match_id | int | NO | PRI |  | auto_increment |
| source_report_id | int | NO | MUL |  |  |
| matched_report_id | int | YES | MUL |  |  |
| matched_pet_id | int | YES | MUL |  |  |
| similarity_score | int | NO |  | 50 |  |
| status | varchar(50) | NO | MUL | AI_SUGGESTED |  |
| ai_explanation | text | YES |  |  |  |
| ai_evidence | json | YES |  |  |  |
| owner_confirmation_status | varchar(50) | NO |  | PENDING |  |
| owner_notes | text | YES |  |  |  |
| owner_dispute_count | int | NO |  | 0 |  |
| covered_by_match_id | int | YES |  |  |  |
| owner_verification_requested_at | datetime | YES |  |  |  |
| owner_verification_requested_by | int | YES |  |  |  |
| owner_verification_note | text | YES |  |  |  |
| owner_verification_answer | varchar(10) | YES |  |  |  |
| owner_verification_answer_note | text | YES |  |  |  |
| owner_verification_answered_at | datetime | YES |  |  |  |
| reviewed_by | int | YES | MUL |  |  |
| reviewer_role | varchar(50) | YES |  |  |  |
| verification_notes | text | YES |  |  |  |
| verified_at | datetime | YES |  |  |  |
| created_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `matched_pet_id` → `pets.pet_id`, `matched_report_id` → `reports.report_id`, `reviewed_by` → `users.user_id`, `source_report_id` → `reports.report_id`

## report_media

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| media_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| history_id | int | YES | MUL |  |  |
| status_id | int | YES | MUL |  |  |
| holding_log_id | int | YES | MUL |  |  |
| file_url | varchar(255) | NO |  |  |  |
| media_type | enum('Image','Video','Document') | NO |  |  |  |
| animal_type | enum('Dog','Cat','Unknown') | YES |  | Unknown |  |
| dominant_color | varchar(100) | YES |  |  |  |
| is_evidence | tinyint(1) | YES |  | 0 |  |
| uploaded_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| ai_photo_likelihood | decimal(5,2) | YES |  |  |  |
| ai_photo_status | varchar(100) | YES |  |  |  |
| ai_detection_confidence | decimal(4,3) | YES |  |  |  |

Foreign keys: `history_id` → `status_history.history_id`, `holding_log_id` → `holding_timeline.log_id`, `report_id` → `reports.report_id`, `status_id` → `report_status.status_id`

## report_returns

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| return_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| holding_id | int | YES | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| has_account | tinyint(1) | NO |  | 0 |  |
| owner_user_id | int | YES | MUL |  |  |
| owner_name | varchar(150) | NO |  |  |  |
| owner_phone | varchar(30) | YES |  |  |  |
| owner_email | varchar(120) | YES |  |  |  |
| owner_address | varchar(255) | YES |  |  |  |
| relationship_to_animal | varchar(60) | YES |  |  |  |
| id_presented | varchar(120) | YES |  |  |  |
| id_type | varchar(60) | YES |  |  |  |
| id_last4 | varchar(4) | YES |  |  |  |
| ownership_verified_by_record | tinyint(1) | NO |  | 0 |  |
| handover_photo_url | varchar(255) | YES |  |  |  |
| ownership_proof_urls | json | YES |  |  |  |
| notes | text | YES |  |  |  |
| returned_by | int | YES | MUL |  |  |
| returned_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `report_id` → `reports.report_id`, `holding_id` → `holding_animals.holding_id`, `pet_id` → `pets.pet_id`, `owner_user_id` → `users.user_id`, `returned_by` → `users.user_id`

## report_status

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| status_id | int | NO | PRI |  | auto_increment |
| status_name | varchar(50) | NO | UNI |  |  |

## report_verifications

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| verification_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| verified_by | int | NO | MUL |  |  |
| is_valid | tinyint(1) | NO |  |  |  |
| remarks | text | YES |  |  |  |
| verified_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| leader_id | int | YES |  |  |  |
| status_id | int | YES |  |  |  |

Foreign keys: `report_id` → `reports.report_id`, `verified_by` → `users.user_id`

## reports

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| report_id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| subdivision_id | int | NO | MUL |  |  |
| category_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| pet_inherited_from_match_id | int | YES |  |  |  |
| identity_rechecked_by | int | YES |  |  |  |
| identity_rechecked_at | datetime | YES |  |  |  |
| identity_recheck_note | text | YES |  |  |  |
| separate_incident_reason | text | YES |  |  |  |
| separate_incident_by | int | YES |  |  |  |
| separate_incident_at | datetime | YES |  |  |  |
| animal_type | enum('Dog','Cat','Unknown') | YES | MUL | Unknown |  |
| animal_breed | varchar(100) | YES |  |  |  |
| animal_color | varchar(255) | YES |  |  |  |
| estimated_size | enum('Small','Medium','Large') | YES |  |  |  |
| description | text | YES |  |  |  |
| condition | text | YES |  |  |  |
| latitude | decimal(10,8) | NO | MUL |  |  |
| longitude | decimal(11,8) | NO |  |  |  |
| initial_latitude | decimal(10,8) | YES |  |  |  |
| initial_longitude | decimal(11,8) | YES |  |  |  |
| initial_landmark | varchar(255) | YES |  |  |  |
| facility_id | int | YES | MUL |  |  |
| custody_status | varchar(50) | YES |  | Sighting |  |
| animal_count | int | YES |  | 1 |  |
| landmark | varchar(255) | YES |  |  |  |
| priority_level | enum('Low','Medium','High') | YES |  | Medium |  |
| visibility | enum('Public','Private','Pending Review') | YES |  | Pending Review |  |
| visibility_decided_by | int | YES | MUL |  |  |
| visibility_decided_at | datetime | YES |  |  |  |
| visibility_reason | text | YES |  |  |  |
| is_possible_owned | tinyint(1) | YES |  | 0 |  |
| current_status_id | int | YES | MUL | 1 |  |
| ai_animal_type | varchar(50) | YES |  |  |  |
| ai_dominant_color | varchar(100) | YES |  |  |  |
| ai_coat_pattern | varchar(50) | YES |  |  |  |
| ai_estimated_size | varchar(50) | YES |  |  |  |
| ai_possible_breed | varchar(100) | YES |  |  |  |
| ai_suggested_risk_level | varchar(50) | YES |  |  |  |
| ai_suggested_priority | varchar(50) | YES |  |  |  |
| ai_suggested_priority_reason | text | YES |  |  |  |
| ai_behavior_chasing | tinyint(1) | YES |  | 0 |  |
| ai_behavior_actual_bite | tinyint(1) | YES |  | 0 |  |
| ai_behavior_attempted_bite | tinyint(1) | YES |  | 0 |  |
| ai_behavior_injury | tinyint(1) | YES |  | 0 |  |
| ai_behavior_aggressive | tinyint(1) | YES |  | 0 |  |
| ai_behavior_explanation | text | YES |  |  |  |
| assigned_leader_id | int | YES | MUL |  |  |
| claimed_at | timestamp | YES |  |  |  |
| unassigned_notified | tinyint(1) | NO |  | 0 |  |
| verification_status | enum('unverified','verified_true','false_alarm','disputed') | YES |  | unverified |  |
| false_alarm_reason | varchar(100) | YES |  |  |  |
| verification_notes | text | YES |  |  |  |
| verified_by_user_id | int | YES | MUL |  |  |
| verified_at | timestamp | YES |  |  |  |
| verified_actual_bite | tinyint(1) | YES |  | 0 |  |
| verified_chasing | tinyint(1) | YES |  | 0 |  |
| verified_attempted_bite | tinyint(1) | YES |  | 0 |  |
| verified_injury | tinyint(1) | YES |  | 0 |  |
| verified_aggressive | tinyint(1) | YES |  | 0 |  |
| behavior_finding | varchar(100) | YES |  |  |  |
| pending_transfer_to_id | int | YES | MUL |  |  |
| pending_transfer_from_id | int | YES | MUL |  |  |
| pending_transfer_notes | text | YES |  |  |  |
| pending_transfer_created_at | timestamp | YES |  |  |  |
| duplicate_of_report_id | int | YES | MUL |  |  |
| split_from_report_id | int | YES | MUL |  |  |
| merged_at | timestamp | YES |  |  |  |
| merged_by | int | YES | MUL |  |  |
| merge_notes | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| ai_photo_likelihood | decimal(5,2) | YES |  |  |  |
| ai_photo_status | varchar(100) | YES |  |  |  |
| ai_detection_confidence | decimal(4,3) | YES |  |  |  |
| ai_description_confidence | json | YES |  |  |  |
| ai_photo_recommendation | text | YES |  |  |  |
| ai_photo_details | text | YES |  |  |  |

Foreign keys: `assigned_leader_id` → `users.user_id`, `category_id` → `report_categories.category_id`, `duplicate_of_report_id` → `reports.report_id`, `facility_id` → `landmarks.landmark_id`, `merged_by` → `users.user_id`, `pending_transfer_from_id` → `users.user_id`, `pending_transfer_to_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `split_from_report_id` → `reports.report_id`, `current_status_id` → `report_status.status_id`, `subdivision_id` → `subdivisions.subdivision_id`, `user_id` → `users.user_id`, `verified_by_user_id` → `users.user_id`, `visibility_decided_by` → `users.user_id`

## rescue_assignments

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| assignment_id | int | NO | PRI |  | auto_increment |
| rescue_id | int | NO | MUL |  |  |
| user_id | int | NO | MUL |  |  |
| assigned_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| staff_id | int | YES |  |  |  |
| assigned_by | int | YES |  |  |  |
| assignment_status | enum('Assigned','In Transit','On Site','Completed','Cancelled') | YES |  | Assigned |  |
| remarks | text | YES |  |  |  |

Foreign keys: `rescue_id` → `rescues.rescue_id`, `user_id` → `users.user_id`

## rescue_status

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| status_id | int | NO | PRI |  | auto_increment |
| status_name | varchar(50) | NO | UNI |  |  |

## rescues

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| rescue_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| status_id | int | NO | MUL | 1 |  |
| assigned_team | varchar(100) | YES |  |  |  |
| notes | text | YES |  |  |  |
| scheduled_at | timestamp | YES |  |  |  |
| completed_at | timestamp | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| staff_id | int | YES |  |  |  |
| leader_id | int | YES |  |  |  |
| started_at | datetime | YES |  |  |  |

Foreign keys: `report_id` → `reports.report_id`, `status_id` → `rescue_status.status_id`

## revoked_tokens

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI |  | auto_increment |
| jti | varchar(255) | NO | UNI |  |  |
| token_type | varchar(50) | NO |  |  |  |
| user_id | int | YES | MUL |  |  |
| revoked_at | datetime | NO |  | now() | DEFAULT_GENERATED |
| expires_at | datetime | NO | MUL |  |  |

## roles

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| role_id | int | NO | PRI |  | auto_increment |
| role_name | varchar(50) | NO | UNI |  |  |

## status_history

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| history_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| report_status_id | int | YES | MUL |  |  |
| rescue_status_id | int | YES | MUL |  |  |
| updated_by | int | YES | MUL |  |  |
| latitude | decimal(10,8) | YES |  |  |  |
| longitude | decimal(11,8) | YES |  |  |  |
| landmark | varchar(255) | YES |  |  |  |
| facility_id | int | YES | MUL |  |  |
| remarks | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| rescue_id | int | YES |  |  |  |

Foreign keys: `facility_id` → `landmarks.landmark_id`, `report_id` → `reports.report_id`, `rescue_status_id` → `rescue_status.status_id`, `report_status_id` → `report_status.status_id`, `updated_by` → `users.user_id`

## subdivisions

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| subdivision_id | int | NO | PRI |  | auto_increment |
| barangay_id | int | NO | MUL |  |  |
| subdivision_name | varchar(100) | NO |  |  |  |
| boundary_polygon | json | YES |  |  |  |

Foreign keys: `barangay_id` → `barangays.barangay_id`

## system_settings

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI |  | auto_increment |
| setting_key | varchar(100) | NO | UNI |  |  |
| setting_value | text | YES |  |  |  |
| is_enabled | tinyint(1) | NO |  | 1 |  |
| description | varchar(255) | YES |  |  |  |
| updated_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| updated_by | int | YES | MUL |  |  |

Foreign keys: `updated_by` → `users.user_id`

## user_notification_preferences

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| preference_id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | UNI |  |  |
| email_reports | tinyint(1) | NO |  | 1 |  |
| email_rescues | tinyint(1) | NO |  | 1 |  |
| email_pet_matches | tinyint(1) | NO |  | 1 |  |
| email_claims | tinyint(1) | NO |  | 1 |  |
| email_reminders | tinyint(1) | NO |  | 1 |  |
| push_enabled | tinyint(1) | NO |  | 1 |  |
| push_reports | tinyint(1) | NO |  | 1 |  |
| push_rescues | tinyint(1) | NO |  | 1 |  |
| push_pet_matches | tinyint(1) | NO |  | 1 |  |
| push_claims | tinyint(1) | NO |  | 1 |  |
| push_adoptions | tinyint(1) | NO |  | 1 |  |
| push_messages | tinyint(1) | NO |  | 1 |  |
| push_show_preview | tinyint(1) | NO |  | 1 |  |
| updated_at | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `user_id` → `users.user_id`

## users

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| user_id | int | NO | PRI |  | auto_increment |
| name | varchar(100) | NO |  |  |  |
| email | varchar(100) | NO | UNI |  |  |
| password | varchar(255) | NO |  |  |  |
| phone | varchar(20) | YES |  |  |  |
| role_id | int | NO | MUL |  |  |
| position_id | int | YES | MUL |  |  |
| subdivision_id | int | YES | MUL |  |  |
| barangay_id | int | YES | MUL |  |  |
| is_head_officer | tinyint(1) | YES |  | 0 |  |
| address | varchar(255) | YES |  |  |  |
| latitude | decimal(10,8) | YES |  |  |  |
| longitude | decimal(11,8) | YES |  |  |  |
| profile_picture | varchar(255) | YES |  |  |  |
| status | enum('Active','Inactive','Suspended') | YES |  | Active |  |
| is_verified | tinyint(1) | YES |  | 0 |  |
| last_login | timestamp | YES |  |  |  |
| password_changed_at | datetime | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `barangay_id` → `barangays.barangay_id`, `position_id` → `positions.position_id`, `role_id` → `roles.role_id`, `subdivision_id` → `subdivisions.subdivision_id`
