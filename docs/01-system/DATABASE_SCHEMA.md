# Database schema

- **Status:** Current (generated, then edited by hand)
- **Source:** `information_schema` of the local `straysafe_db`, 2026-11-05. Structure only: no data.
- **Edited 2026-11-09 (case workflow alignment):** the sections of `reports`, `barangay_referrals`, `barangay_referral_updates`, `owner_warnings` and `lost_pet_alerts` were changed, and `case_followups`, `case_contact_logs`, `case_links` and `ownership_claims` were added, by hand from the models and `backend/app/db_migrations/case_alignment.py` (a MySQL server was not available to regenerate it). Rows marked **new** are those changes. See [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md).
- **Edited 2026-11-09 (legacy cleanup, batch 1):** the sections of `report_verifications`, `pet_vaccinations`, `behavior_tags`, `comments`, `announcement_comments`, `announcement_reactions`, `pet_qr_codes` and `pet_qr_scans` were removed (80 to 72 tables), and the columns `announcements.allow_comments` and `pet_history.scan_id` (with its foreign key).
- **Edited 2026-11-10 (legacy retirement, batch 2):** the sections of the 21 tables of the retired endorsement-letter, adoption, holding, rescue and legacy claim and fee subsystems were removed (72 to 51 tables), and `report_media.holding_log_id`, `report_returns.holding_id`, `status_history.rescue_id` and `status_history.rescue_status_id` were dropped. `chat_threads.thread_type` is now `('Report','Direct')`. The list is in [DATABASE_FILES_AND_MIGRATIONS](../05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md).
- **Edited 2026-11-11 (Lost Pet end to end):** `reports.client_request_id` (varchar(64), nullable: a Lost Pet filing's retry key); on `lost_pet_alerts` the recovery record (`recovered_at`, `recovery_source`, `recovery_confirmed_by`, `recovery_recorded_by`, `recovery_recorded_at`, `recovery_note`, with two foreign keys to `users`); on `lost_pet_sightings` `sighting_type` (default `seen`), `on_behalf` (default false: second-hand observation) and `care_note`; and two new tables, `lost_pet_coordinations` and `lost_pet_coordination_messages` (51 to 53 tables). By hand from the models and `backend/app/db_migrations/case_alignment.py`, and mirrored in `Database3.4_subdivision.sql` and its `.txt`. The live database gets all of it at the next backend start; nothing was run against it. See [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md).
- **Edited 2026-11-11 (registration-first Lost Pet reports):** one column was added to `reports`, `pet_snapshot` (json, nullable), by hand from the model and `backend/app/db_migrations/case_alignment.py` (a MySQL server was not available to regenerate it). It holds the pet's details and the last-seen details as they were when a Lost Pet report was filed. The live database gets it at the next backend start. See [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md).
- **Edited 2026-11-12 (Lost & Found possible matches):** one table was added, `lost_found_matches`, by hand from the model `backend/app/models/lost_found_match.py` (a MySQL server was not available to regenerate it). It holds the possible matches between a Lost Pet report and a Found Animal report and what a Leader decided about each. The live database gets it at the next backend start (`Base.metadata.create_all`); nothing was run against it. See [LOST_FOUND_MATCHING.md](LOST_FOUND_MATCHING.md).
- **Edited 2026-11-12 (case conversations and linked-report bridge):** `case_message_threads`, `case_message_members` and `case_messages` store participant-scoped Leader conversations and linked-report groups. Together with `lost_found_matches`, all four new tables are registered in the additive case-alignment checks and mirrored in both canonical SQL snapshots. Definitions were checked against the models without accessing the application database.
- **Edited 2026-11-13 (complaint management):** five tables, `complaint_respondents`, `complaint_findings`, `complaint_offenses`, `enforcement_steps` and `enforcement_step_events`, and four `reports` columns, `seen_at`, `suspected_owner_name`, `suspected_owner_address`, `suspected_owner_details`, from `backend/migrations/2026-11-13_complaint_management.sql` and `backend/app/models/complaint.py`. Like the alerts below they come only from the SQL file, applied once; the backend refuses to start until they exist. The column-by-column definitions are in that SQL file; see [COMPLAINT_MANAGEMENT.md](COMPLAINT_MANAGEMENT.md).
- **Edited 2026-11-13 (Lost & Found notification alerts):** two tables, `case_alerts` and `case_alert_sends`, and the column `user_notification_preferences.push_lost_found_alerts`, written by hand from `backend/migrations/2026-11-12_lost_found_alerts.sql` and the models `backend/app/models/case_alert.py` and `notification_preference.py`. Unlike the earlier additions they are **not** created at start-up: the SQL file is applied once by hand, and the backend refuses to start until they exist. Nothing was run against a database. See [LOST_FOUND_ALERTS.md](LOST_FOUND_ALERTS.md).
- **Regenerate** after any schema change; the SQLAlchemy models in `backend/app/models/` are the source of truth.

59 tables.

## Tables

- `ai_jobs`
- `ai_vision_comparisons`
- `announcement_categories`
- `announcement_media`
- `announcements`
- `audit_logs`
- `barangay_referral_updates`
- `barangay_referrals`
- `barangays`
- `case_alert_sends`
- `case_alerts`
- `case_contact_logs`
- `case_followups`
- `case_links`
- `case_message_threads`
- `case_message_members`
- `case_messages`
- `chat_messages`
- `chat_threads`
- `coverage_settings`
- `email_logs`
- `followup_contact_logs`
- `followup_repeated_incidents`
- `landmarks`
- `leader_identity_verifications`
- `lost_found_matches`
- `lost_pet_alerts`
- `lost_pet_coordination_messages`
- `lost_pet_coordinations`
- `lost_pet_sightings`
- `manual_match_decisions`
- `notifications`
- `otp_verifications`
- `owner_followups`
- `owner_observation_update_photos`
- `owner_observation_updates`
- `owner_warnings`
- `ownership_claims`
- `pet_history`
- `pet_match_confirmation_requests`
- `pet_owner_confirmations`
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
- `reports`
- `revoked_tokens`
- `roles`
- `status_history`
- `subdivisions`
- `system_settings`
- `user_notification_preferences`
- `users`

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

## barangay_referral_updates

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| update_id | int | NO | PRI |  | auto_increment |
| referral_id | int | NO | MUL |  |  |
| update_type | varchar(20) | NO |  |  |  |
| source | varchar(20) | NO |  | barangay_reported |  |
| update_date | date | NO |  |  |  |
| note | text | YES |  |  |  |
| evidence_url | varchar(500) | YES |  |  |  |
| status_after | varchar(20) | YES |  |  |  |
| recorded_by | int | YES | MUL |  |  |
| recorded_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `recorded_by` → `users.user_id`, `referral_id` → `barangay_referrals.referral_id`

## barangay_referrals

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| referral_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| barangay_id | int | YES | MUL |  |  |
| referred_by | int | YES | MUL |  |  |
| referred_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| reason | text | NO |  |  |  |
| reference_no | varchar(100) | YES |  |  |  |
| contact_method | varchar(20) | NO |  |  |  |
| final_outcome | varchar(20) | YES |  |  |  |
| outcome_date | date | YES |  |  |  |
| outcome_note | text | YES |  |  |  |
| outcome_recorded_by | int | YES | MUL |  |  |
| outcome_recorded_at | datetime | YES |  |  |  |
| org_type | varchar(20) | YES |  |  |  |
| org_name | varchar(150) | YES |  |  |  |
| contact_person | varchar(150) | YES |  |  |  |
| contact_detail | varchar(255) | YES |  |  |  |
| is_urgent | tinyint(1) | NO |  | 0 |  |
| referral_status | varchar(20) | YES |  |  |  |
| status_updated_at | datetime | YES |  |  |  |
| status_updated_by | int | YES | MUL |  |  |
| external_outcome | text | YES |  |  |  |
| remaining_follow_up | text | YES |  |  |  |
| follow_up_at | datetime | YES |  |  |  |

**Changed 2026-11-09:** `report_id` is no longer unique (a case can have several referrals; it keeps a plain index, `ix_barangay_referrals_report_id`), `barangay_id` may be empty (a referral to an organisation that is not a Barangay), and the columns from `org_type` on are new (`org_type` values: `barangay`, `animal_control`, `veterinary`, `animal_welfare`, `wildlife`, `other`; `referral_status` values: `sent`, `acknowledged`, `in_progress`, `completed`, `declined`, `no_response`). The table keeps its name and its rows.

Foreign keys: `barangay_id` → `barangays.barangay_id`, `outcome_recorded_by` → `users.user_id`, `referred_by` → `users.user_id`, `report_id` → `reports.report_id`, `status_updated_by` → `users.user_id`

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

## case_alert_sends

**New 2026-11-13.** One row per planned send of a notification alert. The unique key (`alert_id`, `slot_at`) is what makes a send happen once: a second worker, a retry or a restart that claims the same occurrence is refused. `recipients` is how many residents it reached; `skipped_before` counts planned sends missed while the server was down (never sent late). Only from the SQL migration.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| send_id | int | NO | PRI |  | auto_increment |
| alert_id | int | NO | MUL |  |  |
| slot_at | datetime | NO |  |  |  |
| status | varchar(10) | NO |  | sent |  |
| recipients | int | NO |  | 0 |  |
| skipped_before | int | NO |  | 0 |  |
| sent_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Unique key: `uq_case_alert_slot` (`alert_id`, `slot_at`). Foreign keys: `alert_id` → `case_alerts.alert_id` (cascade)

## case_alerts

**New 2026-11-13.** A notification alert a Subdivision Leader sends about ONE lost-pet or found-animal case: its own title and message, the photo choice, where a tap goes (`destination`: `notice`, `sighting`, `claim`, `inbox`), who receives it (`audience`: `all`, `helpers`) and its schedule (`mode`: `now`, `later`, `repeat`; `repeat_kind`: `every` with `every_minutes`, or `times` with `times_of_day`; `end_kind`: `resolved` with `end_at` as the latest end, `date`, or `count` with `max_sends`). `status`: `scheduled`, `active`, `paused`, `finished`, `stopped`, `cancelled`. It is not the Community notice (`lost_pet_alerts`) and never changes it. Only from the SQL migration.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| alert_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| subdivision_id | int | NO | MUL |  |  |
| title | varchar(80) | NO |  |  |  |
| message | varchar(300) | NO |  |  |  |
| include_photo | tinyint(1) | NO |  | 1 |  |
| destination | varchar(12) | NO |  | notice |  |
| audience | varchar(10) | NO |  | all |  |
| mode | varchar(8) | NO |  |  |  |
| repeat_kind | varchar(8) | YES |  |  |  |
| every_minutes | int | YES |  |  |  |
| times_of_day | varchar(120) | YES |  |  |  |
| start_at | datetime | NO |  |  |  |
| end_kind | varchar(10) | YES |  |  |  |
| end_at | datetime | YES |  |  |  |
| max_sends | int | YES |  |  |  |
| status | varchar(10) | NO | MUL | scheduled |  |
| next_send_at | datetime | YES |  |  |  |
| sends_done | int | NO |  | 0 |  |
| stop_reason | varchar(255) | YES |  |  |  |
| client_request_id | varchar(64) | YES | UNI |  |  |
| created_by | int | YES | MUL |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| stopped_at | datetime | YES |  |  |  |
| stopped_by | int | YES | MUL |  |  |

Keys: `uq_case_alert_request` (`client_request_id`), `ix_case_alerts_report` (`report_id`), `ix_case_alerts_due` (`status`, `next_send_at`). Foreign keys: `report_id` → `reports.report_id` (cascade), `subdivision_id` → `subdivisions.subdivision_id`, `created_by`, `stopped_by` → `users.user_id` (set null)

## case_contact_logs

**New 2026-11-09.** Who was contacted about a case, how, and what came of it.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| log_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| subdivision_id | int | NO | MUL |  |  |
| method | varchar(12) | NO |  |  |  |
| with_whom | varchar(200) | NO |  |  |  |
| summary | text | NO |  |  |  |
| outcome | varchar(20) | NO |  | other |  |
| contact_at | datetime | NO |  |  |  |
| logged_by | int | YES | MUL |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

`method`: `in_person`, `phone`, `message`, `letter`. `outcome`: `cooperative`, `denied_ownership`, `no_response`, `other`.

Foreign keys: `logged_by` → `users.user_id`, `report_id` → `reports.report_id`, `subdivision_id` → `subdivisions.subdivision_id`

## case_followups

**New 2026-11-09.** A thing to do or check on a case, with a due date.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| followup_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| subdivision_id | int | NO | MUL |  |  |
| kind | varchar(20) | NO |  | follow_up |  |
| title | varchar(200) | NO |  |  |  |
| notes | text | YES |  |  |  |
| due_at | datetime | YES | MUL |  |  |
| status | varchar(12) | NO | MUL | pending |  |
| referral_id | int | YES | MUL |  |  |
| created_by | int | YES | MUL |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| completed_at | datetime | YES |  |  |  |
| completed_by | int | YES | MUL |  |  |
| completion_note | text | YES |  |  |  |
| cancel_reason | varchar(255) | YES |  |  |  |

`kind`: `follow_up`, `site_check`, `reporter_update`, `referral_check`, `warning_end`, `post_closure`. `status`: `pending`, `done`, `cancelled`.

Foreign keys: `completed_by` → `users.user_id`, `created_by` → `users.user_id`, `referral_id` → `barangay_referrals.referral_id`, `report_id` → `reports.report_id`, `subdivision_id` → `subdivisions.subdivision_id`

## case_links

**New 2026-11-09.** Two reports about the same thing, linked without hiding or merging either. Unlinking keeps the row.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| link_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| related_report_id | int | NO | MUL |  |  |
| link_type | varchar(20) | NO |  | related |  |
| note | text | YES |  |  |  |
| linked_by | int | YES | MUL |  |  |
| linked_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| unlinked_at | datetime | YES |  |  |  |
| unlinked_by | int | YES | MUL |  |  |
| unlink_reason | text | YES |  |  |  |

`report_id` is the lower id of the pair. `link_type`: `related`, `duplicate`, `same_animal`, `same_incident`. An active link has `unlinked_at` empty.

Foreign keys: `linked_by` → `users.user_id`, `related_report_id` → `reports.report_id`, `report_id` → `reports.report_id`, `unlinked_by` → `users.user_id`

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
| thread_type | enum('Report','Direct') | NO | MUL | Report |  |
| related_id | int | YES |  |  |  |
| created_by | int | NO | MUL |  |  |
| recipient_id | int | NO | MUL |  |  |
| title | varchar(255) | YES |  |  |  |
| is_closed | tinyint(1) | NO |  | 0 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `created_by` → `users.user_id`, `recipient_id` → `users.user_id`

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

## lost_found_matches

**New 2026-11-12.** A possible match between ONE Lost Pet report and ONE Found Animal report of the same subdivision, written by the background check when either report is filed. `status`: `pending` (only the Leaders were told), `confirmed` (a Leader linked the two reports and both residents were told), `rejected` (ruled out, kept so the pair is never suggested again; it can be reviewed again), `moot` (the found report was linked to another lost report). A link is never ownership and never a recovery. `level` is `strong` or `possible`; `reasons` holds the sentences that spoke in favour, strongest first. `link_id` (the `case_links` row) and `coordination_id` (the possible-recovery conversation) are plain integers set by a confirmation, not foreign keys. See [LOST_FOUND_MATCHING.md](LOST_FOUND_MATCHING.md).

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| match_id | int | NO | PRI |  | auto_increment |
| subdivision_id | int | NO | MUL |  |  |
| lost_report_id | int | NO | MUL |  |  |
| found_report_id | int | NO | MUL |  |  |
| score | int | NO |  |  |  |
| level | varchar(10) | NO |  |  |  |
| reasons | json | YES |  |  |  |
| status | varchar(12) | NO | MUL | pending |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| decided_by | int | YES | MUL |  |  |
| decided_at | datetime | YES |  |  |  |
| link_id | int | YES |  |  |  |
| coordination_id | int | YES |  |  |  |

Unique key: `uq_lost_found_pair` (`lost_report_id`, `found_report_id`). Foreign keys: `subdivision_id` → `subdivisions.subdivision_id`, `lost_report_id`, `found_report_id` → `reports.report_id` (cascade), `decided_by` → `users.user_id` (set null)

## lost_pet_alerts

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| alert_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | UNI |  |  |
| subdivision_id | int | NO | MUL |  |  |
| pet_id | int | YES | MUL |  |  |
| owner_id | int | YES | MUL |  |  |
| status | varchar(20) | NO | MUL | requested |  |
| alert_type | varchar(20) | NO |  | lost_pet |  |
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
| recovered_at | datetime | YES |  |  |  |
| recovery_source | varchar(20) | YES |  |  |  |
| recovery_confirmed_by | int | YES | MUL |  |  |
| recovery_recorded_by | int | YES | MUL |  |  |
| recovery_recorded_at | datetime | YES |  |  |  |
| recovery_note | text | YES |  |  |  |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `activated_by` → `users.user_id`, `closed_by` → `users.user_id`, `owner_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `recovery_confirmed_by` → `users.user_id`, `recovery_recorded_by` → `users.user_id`, `report_id` → `reports.report_id`, `requested_by` → `users.user_id`, `subdivision_id` → `subdivisions.subdivision_id`

**Changed 2026-11-11:** the six `recovery_*` / `recovered_at` columns are new. They are filled only by the one recovery operation (the owner's confirmation, in the app, or recorded by the Leader after a phone call or a visit): `recovery_source` is `owner_app`, `phone` or `in_person`; `recovery_confirmed_by` is the owner who confirmed; `recovery_recorded_by` is who recorded it; `close_outcome = 'recovered'` means it happened. See [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md).

## lost_pet_coordinations

**New 2026-11-11.** How the owner and a neighbour who may have the pet get in touch, one row per possible recovery (`lost_pet_sightings.sighting_type = 'secured'`). `mode`: `none` (nobody agreed), `direct` (both agreed to message in the app), `leader` (either asked the Subdivision Leader to help, with no reason). Kept after it is resolved. See [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md).

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| coordination_id | int | NO | PRI |  | auto_increment |
| alert_id | int | NO | MUL |  |  |
| report_id | int | NO | MUL |  |  |
| sighting_id | int | NO | UNI |  |  |
| owner_id | int | YES | MUL |  |  |
| finder_id | int | YES | MUL |  |  |
| mode | varchar(10) | NO |  | none |  |
| owner_consent | tinyint(1) | NO |  | 0 |  |
| finder_consent | tinyint(1) | NO |  | 0 |  |
| mediation_requested_by | int | YES | MUL |  |  |
| mediation_requested_at | datetime | YES |  |  |  |
| status | varchar(10) | NO | MUL | open |  |
| resolved_at | datetime | YES |  |  |  |
| resolved_by | int | YES | MUL |  |  |
| resolution_note | text | YES |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `alert_id` → `lost_pet_alerts.alert_id` (cascade), `report_id` → `reports.report_id` (cascade), `sighting_id` → `lost_pet_sightings.sighting_id` (cascade), `owner_id`, `finder_id`, `mediation_requested_by`, `resolved_by` → `users.user_id` (set null)

## lost_pet_coordination_messages

**New 2026-11-11.** A private text message between the owner and the neighbour of one coordination. Only while both agreed (`mode = direct`); readable only by the two of them (the Leader does not read them).

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| message_id | int | NO | PRI |  | auto_increment |
| coordination_id | int | NO | MUL |  |  |
| sender_id | int | YES | MUL |  |  |
| message_text | text | NO |  |  |  |
| sent_at | datetime | NO | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| is_read | tinyint(1) | NO |  | 0 |  |
| client_request_id | varchar(64) | YES | UNI |  |  |

Foreign keys: `coordination_id` → `lost_pet_coordinations.coordination_id` (cascade), `sender_id` → `users.user_id` (set null)

The unique index `uq_lost_pet_coordination_message_request` makes private-message retries safe. The same sender and coordination receive the original message; conflicting key reuse is refused.

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
| sighting_type | varchar(20) | NO |  | seen |  |
| on_behalf | tinyint(1) | NO |  | 0 |  |
| care_note | text | YES |  |  |  |

Foreign keys: `alert_id` → `lost_pet_alerts.alert_id`, `reporter_id` → `users.user_id`, `report_id` → `reports.report_id`, `reviewed_by` → `users.user_id`

**Changed 2026-11-11:** `sighting_type` is new (`seen`: "I saw this pet"; `secured`: "I may have this pet safely with me", a possible recovery; every earlier row is `seen`), `on_behalf` preserves second-hand provenance (false for older rows whose source was not recorded), and `care_note` holds where a secured pet is being kept (private to the owner, the Leader and the writer).

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
| policy_id | varchar(60) | YES |  |  |  |
| policy_title | varchar(200) | YES |  |  |  |
| policy_reference | varchar(200) | YES |  |  |  |
| observation_days | int | YES |  |  |  |
| follow_up_at | datetime | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

Foreign keys: `issued_by` → `users.user_id`, `pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `user_id` → `users.user_id`

## ownership_claims

**New 2026-11-09.** A resident's claim that a found animal is theirs. Reviewed by the Subdivision Admin; never establishes ownership by itself.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| claim_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
| alert_id | int | YES | MUL |  |  |
| subdivision_id | int | NO | MUL |  |  |
| claimant_user_id | int | YES | MUL |  |  |
| claimed_pet_id | int | YES | MUL |  |  |
| statement | text | NO |  |  |  |
| evidence | json | YES |  |  |  |
| evidence_urls | json | YES |  |  |  |
| status | varchar(16) | NO | MUL | submitted |  |
| review_note | text | YES |  |  |  |
| reviewed_by | int | YES | MUL |  |  |
| reviewed_at | datetime | YES |  |  |  |
| submitted_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

`status`: `submitted`, `under_review`, `needs_info`, `accepted`, `rejected`, `withdrawn`.

Foreign keys: `alert_id` → `lost_pet_alerts.alert_id`, `claimant_user_id` → `users.user_id`, `claimed_pet_id` → `pets.pet_id`, `report_id` → `reports.report_id`, `reviewed_by` → `users.user_id`, `subdivision_id` → `subdivisions.subdivision_id`

## pet_history

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| history_id | int | NO | PRI |  | auto_increment |
| pet_id | int | NO | MUL |  |  |
| event_type | varchar(100) | NO |  |  |  |
| title | varchar(150) | NO |  |  |  |
| description | text | YES |  |  |  |
| recovery_method | varchar(50) | YES |  |  |  |
| actor_id | int | YES | MUL |  |  |
| actor_name | varchar(100) | YES |  |  |  |
| actor_role | varchar(50) | YES |  |  |  |
| previous_status | varchar(50) | YES |  |  |  |
| new_status | varchar(50) | YES |  |  |  |
| location_name | varchar(255) | YES |  |  |  |
| latitude | decimal(10,8) | YES |  |  |  |
| longitude | decimal(11,8) | YES |  |  |  |
| created_at | datetime | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `actor_id` → `users.user_id`, `pet_id` → `pets.pet_id`

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

**Rows added 2026-11-09 (by name, when missing; existing rows are never changed):** Found / Unidentified Animal, Animal Nuisance, Animal Safety Concern, Injured / Distressed Animal, Other Animal Concern. With the existing Lost Pet they are the six categories of the Admin UI; the older categories (Injured, Aggressive, Rabies Risk, Roaming Animal, Rescue Needed) keep working and are read as one of the six.

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
| file_url | varchar(255) | NO |  |  |  |
| media_type | enum('Image','Video','Document') | NO |  |  |  |
| animal_type | enum('Dog','Cat','Unknown') | YES |  | Unknown |  |
| dominant_color | varchar(100) | YES |  |  |  |
| is_evidence | tinyint(1) | YES |  | 0 |  |
| uploaded_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| ai_photo_likelihood | decimal(5,2) | YES |  |  |  |
| ai_photo_status | varchar(100) | YES |  |  |  |
| ai_detection_confidence | decimal(4,3) | YES |  |  |  |

Foreign keys: `history_id` → `status_history.history_id`, `report_id` → `reports.report_id`, `status_id` → `report_status.status_id`

## report_returns

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| return_id | int | NO | PRI |  | auto_increment |
| report_id | int | NO | MUL |  |  |
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

Foreign keys: `report_id` → `reports.report_id`, `pet_id` → `pets.pet_id`, `owner_user_id` → `users.user_id`, `returned_by` → `users.user_id`

## report_status

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| status_id | int | NO | PRI |  | auto_increment |
| status_name | varchar(50) | NO | UNI |  |  |

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
| animal_type | enum('Dog','Cat','Unknown','Bird','Small mammal','Reptile','Livestock','Wildlife','Other') | YES | MUL | Unknown |  |
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
| case_status | varchar(20) | YES | MUL |  |  |
| incident_verification | varchar(20) | YES |  |  |  |
| incident_basis | text | YES |  |  |  |
| evidence_sufficiency | varchar(20) | YES |  |  |  |
| evidence_reviewed | json | YES |  |  |  |
| urgency_level | varchar(20) | YES |  |  |  |
| urgency_note | text | YES |  |  |  |
| assessment_notes | text | YES |  |  |  |
| assessed_at | datetime | YES |  |  |  |
| assessed_by | int | YES | MUL |  |  |
| identity_status | varchar(20) | YES |  |  |  |
| identity_note | text | YES |  |  |  |
| ownership_status | varchar(20) | YES |  |  |  |
| ownership_owner_id | int | YES | MUL |  |  |
| ownership_evidence | json | YES |  |  |  |
| ownership_note | text | YES |  |  |  |
| ownership_decided_by | int | YES | MUL |  |  |
| ownership_decided_at | datetime | YES |  |  |  |
| closure_disposition | varchar(40) | YES |  |  |  |
| closure_reason | text | YES |  |  |  |
| closed_at | datetime | YES |  |  |  |
| closed_by | int | YES | MUL |  |  |
| reopened_count | int | NO |  | 0 |  |
| last_reopened_at | datetime | YES |  |  |  |
| last_reopened_by | int | YES | MUL |  |  |
| last_reopen_reason | text | YES |  |  |  |
| is_sensitive | tinyint(1) | NO |  | 0 |  |
| pet_snapshot | json | YES |  |  |  |
| client_request_id | varchar(64) | YES |  |  |  |

Foreign keys: `assigned_leader_id` → `users.user_id`, `category_id` → `report_categories.category_id`, `duplicate_of_report_id` → `reports.report_id`, `facility_id` → `landmarks.landmark_id`, `merged_by` → `users.user_id`, `pending_transfer_from_id` → `users.user_id`, `pending_transfer_to_id` → `users.user_id`, `pet_id` → `pets.pet_id`, `split_from_report_id` → `reports.report_id`, `current_status_id` → `report_status.status_id`, `subdivision_id` → `subdivisions.subdivision_id`, `user_id` → `users.user_id`, `verified_by_user_id` → `users.user_id`, `visibility_decided_by` → `users.user_id`

**Changed 2026-11-09:** `animal_type` accepts Bird, Small mammal, Reptile, Livestock, Wildlife and Other (members appended after `Unknown`, so MySQL changes the ENUM in place); the columns from `case_status` on are new (case workflow: the four global statuses, assessment, identity, ownership, closure, reopening and the sensitive flag; see [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md)). New foreign keys, all to `users.user_id` with `ON DELETE SET NULL`: `assessed_by`, `ownership_owner_id`, `ownership_decided_by`, `closed_by`, `last_reopened_by`. New index: `ix_reports_case_status`.

**Changed 2026-11-11:** `pet_snapshot` is new: the pet's registered details and when and where it was last seen, frozen by the server when a Lost Pet report is filed (null for every other report and for reports filed before this change). No index or foreign key.

**Changed 2026-11-11:** `client_request_id` is new: a Lost Pet filing's retry key (the same key from the same person returns the first report). Empty for every other report. No index or foreign key.

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
| updated_by | int | YES | MUL |  |  |
| latitude | decimal(10,8) | YES |  |  |  |
| longitude | decimal(11,8) | YES |  |  |  |
| landmark | varchar(255) | YES |  |  |  |
| facility_id | int | YES | MUL |  |  |
| remarks | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

Foreign keys: `facility_id` → `landmarks.landmark_id`, `report_id` → `reports.report_id`, `report_status_id` → `report_status.status_id`, `updated_by` → `users.user_id`

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

Rows keyed `case_settings:<subdivision_id>` (added 2026-11-09) hold a subdivision's case settings as JSON (enabled categories, policies, follow-up periods, publication policy); see [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md).

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
| push_lost_found_alerts | tinyint(1) | NO |  | 1 |  |
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

## case_message_threads

| Column | Type | Null | Key | Default |
|---|---|---|---|---|
| thread_id | INTEGER | NO | PRI |  |
| subdivision_id | INTEGER | NO | MUL |  |
| kind | VARCHAR(8) | NO |  |  |
| report_id | INTEGER | NO | MUL |  |
| related_report_id | INTEGER | YES | MUL |  |
| match_id | INTEGER | YES | MUL |  |
| link_id | INTEGER | YES |  |  |
| status | VARCHAR(8) | NO | MUL | open |
| closed_at | DATETIME | YES |  |  |
| closed_by | INTEGER | YES |  |  |
| close_reason | TEXT | YES |  |  |
| created_by | INTEGER | YES |  |  |
| created_at | DATETIME | NO |  | now() |

Foreign keys: `closed_by` ? `users.user_id` (set null), `created_by` ? `users.user_id` (set null), `related_report_id` ? `reports.report_id` (cascade), `report_id` ? `reports.report_id` (cascade), `subdivision_id` ? `subdivisions.subdivision_id`

## case_message_members

| Column | Type | Null | Key | Default |
|---|---|---|---|---|
| member_id | INTEGER | NO | PRI |  |
| thread_id | INTEGER | NO | MUL |  |
| user_id | INTEGER | NO | MUL |  |
| role | VARCHAR(10) | NO |  |  |
| report_id | INTEGER | YES |  |  |
| last_read_message_id | INTEGER | NO |  | 0 |
| joined_at | DATETIME | NO |  | now() |

Foreign keys: `thread_id` ? `case_message_threads.thread_id` (cascade), `user_id` ? `users.user_id` (cascade)

## case_messages

| Column | Type | Null | Key | Default |
|---|---|---|---|---|
| message_id | INTEGER | NO | PRI |  |
| thread_id | INTEGER | NO | MUL |  |
| sender_id | INTEGER | YES |  |  |
| kind | VARCHAR(8) | NO |  | message |
| body | TEXT | NO |  |  |
| client_request_id | VARCHAR(64) | YES | UNI |  |
| created_at | DATETIME | NO | MUL | now() |

Foreign keys: `sender_id` ? `users.user_id` (set null), `thread_id` ? `case_message_threads.thread_id` (cascade)
