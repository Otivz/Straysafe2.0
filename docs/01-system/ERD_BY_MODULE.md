# StraySafe 2.0 Entity Relationship Diagrams (ERD), divided by module

Status: **Current** (written 2026-11-24 from the SQLAlchemy models in `backend/app/models/`; 77 tables read from the live model metadata).

The full database is too large for one readable diagram, so it is split into **12 smaller ERDs** (10 modules, with modules 8 and 9 each drawn in two parts). Each one shows the tables of a single module. Tables that belong to another module appear only as a small box (`users`, `reports`, `pets`, `subdivisions`) so you can see how the modules connect without redrawing everything.

## How to read these diagrams

- `||--o{` means "one to many" (one parent row, many child rows).
- `||--o|` means "one to zero-or-one".
- `PK` primary key, `FK` foreign key. Only the important columns are listed; the full column list is in the model files.
- A few columns hold an id without a database foreign key (for example `report_matches.owner_verification_requested_by`). They are listed as plain columns.

## Index

| # | Module | Tables |
|---|---|---|
| 1 | Users, roles and subdivisions | `roles`, `positions`, `subdivisions`, `users`, `coverage_settings`, `landmarks`, `system_settings` |
| 2 | Resident registration | `resident_applications`, `resident_import_batches`, `resident_import_rows`, `official_resident_records`, `resident_invitations`, `otp_verifications`, `revoked_tokens` |
| 3 | Pets and QR tags | `pets`, `pet_history`, `pet_tags`, `pet_tag_scans`, `qr_collar_requests`, `pet_owner_confirmations` |
| 4 | Reports (the case) | `report_categories`, `report_status`, `reports`, `status_history`, `report_media`, `case_links`, `case_concerns`, `report_returns`, `report_disputes` |
| 5 | Lost pet and sightings | `lost_pet_alerts`, `lost_pet_sightings`, `lost_pet_coordinations`, `lost_pet_coordination_messages`, `ownership_claims` |
| 6 | Matching | `lost_found_matches`, `report_matches`, `manual_match_decisions`, `pet_match_confirmation_requests`, `leader_identity_verifications` |
| 7 | Case work: referrals, follow-ups, alerts | `referrals`, `referral_updates`, `case_followups`, `case_contact_logs`, `case_alerts`, `case_alert_sends` |
| 8A | Complaints, enforcement and warning letters | `complaint_respondents`, `complaint_findings`, `complaint_offenses`, `enforcement_steps`, `enforcement_step_events`, `owner_warnings`, `warning_letter_templates`, `warning_letter_template_versions`, `generated_warning_letters` |
| 8B | Owner follow-up (observation period) | `owner_followups`, `followup_contact_logs`, `followup_repeated_incidents`, `owner_observation_updates`, `owner_observation_update_photos` |
| 9A | Case messaging and chat | `case_message_threads`, `case_message_members`, `case_messages`, `chat_threads`, `chat_messages` |
| 9B | Notices and notifications | `announcement_categories`, `announcements`, `announcement_media`, `notifications`, `user_notification_preferences`, `push_subscriptions`, `push_deliveries`, `email_logs` |
| 10 | AI and audit | `ai_jobs`, `ai_vision_comparisons`, `case_ai_insights`, `analytics_ai_summaries`, `audit_logs` |

---

## ERD 1. Users, roles and subdivisions

The base of the system. Every other module points to `users` and `subdivisions`.

```mermaid
erDiagram
    roles ||--o{ users : "has role"
    positions ||--o{ users : "has position"
    subdivisions ||--o{ users : "residents and leaders"
    subdivisions ||--o| coverage_settings : "reporting area"
    subdivisions ||--o{ landmarks : "has"
    users ||--o{ coverage_settings : "updated by"

    roles {
        int role_id PK
        string role_name
    }
    positions {
        int position_id PK
        string position_name
    }
    subdivisions {
        int subdivision_id PK
        string subdivision_name
    }
    users {
        int user_id PK
        string name
        string email
        string phone
        int role_id FK
        int position_id FK
        int subdivision_id FK
        string address
        string status
        boolean is_verified
        datetime last_login
    }
    coverage_settings {
        int id PK
        int subdivision_id FK
        string center_label
        float center_latitude
        float center_longitude
        int radius_meters
        json boundary_polygon
        boolean is_active
        int updated_by FK
    }
    landmarks {
        int landmark_id PK
        string name
        string category
        int subdivision_id FK
        float latitude
        float longitude
        boolean is_holding_facility
        string status
    }
    system_settings {
        int id PK
        string setting_key
        string setting_value
        boolean is_enabled
    }
```

`system_settings` stands alone: it stores per-subdivision switches such as `case_settings:1` (report categories on or off, policy references) as key and value, so it has no foreign key.

---

## ERD 2. Resident registration

How a resident gets an account: from the Leader's official list, or by self-registration that the Leader approves.

```mermaid
erDiagram
    subdivisions ||--o{ resident_applications : "receives"
    users ||--o| resident_applications : "applicant"
    users ||--o{ resident_applications : "reviewed by"
    subdivisions ||--o{ resident_import_batches : "has"
    users ||--o{ resident_import_batches : "uploaded and confirmed by"
    resident_import_batches ||--o{ resident_import_rows : "contains"
    resident_import_batches ||--o{ official_resident_records : "creates"
    subdivisions ||--o{ official_resident_records : "official list"
    users ||--o| official_resident_records : "linked account"
    official_resident_records ||--o{ resident_invitations : "invited by e-mail"
    users ||--o{ resident_invitations : "claims"
    users ||--o{ otp_verifications : "verifies with"

    resident_applications {
        int application_id PK
        int user_id FK
        int subdivision_id FK
        string full_name
        string email
        string block_number
        string lot_number
        string status
        datetime email_verified_at
        int reviewed_by FK
        string rejection_reason
    }
    resident_import_batches {
        int batch_id PK
        int subdivision_id FK
        int uploaded_by FK
        string filename
        string status
        int total_rows
        int imported_rows
        int confirmed_by FK
    }
    resident_import_rows {
        int row_id PK
        int batch_id FK
        int row_number
        string full_name
        string email
        string result
        string reason
    }
    official_resident_records {
        int record_id PK
        int subdivision_id FK
        string full_name
        string email
        string block_number
        string lot_number
        string registration_status
        int user_id FK
        int imported_batch_id FK
    }
    resident_invitations {
        int invitation_id PK
        int record_id FK
        int user_id FK
        string token_hash
        datetime expires_at
        string delivery_status
        datetime claimed_at
    }
    otp_verifications {
        int otp_id PK
        int user_id FK
        string email
        string purpose
        boolean is_used
        datetime expires_at
    }
    revoked_tokens {
        int id PK
        string jti
        string token_type
        int user_id
        datetime expires_at
    }
```

`revoked_tokens` stores signed-out login tokens and has no foreign key.

---

## ERD 3. Pets and QR tags

```mermaid
erDiagram
    users ||--o{ pets : "owns"
    pets ||--o{ pet_history : "has"
    users ||--o{ pet_history : "actor"
    pets ||--o{ pet_tags : "wears"
    pet_tags ||--o{ pet_tag_scans : "scanned"
    pets ||--o{ pet_tag_scans : "of"
    users ||--o{ pet_tag_scans : "scanner"
    pets ||--o{ qr_collar_requests : "requested for"
    users ||--o{ qr_collar_requests : "requested by"
    subdivisions ||--o{ qr_collar_requests : "handled in"
    pets ||--o{ pet_owner_confirmations : "ownership change"
    reports ||--o{ pet_owner_confirmations : "source case"
    lost_pet_alerts ||--o{ pet_tag_scans : "opened from"

    pets {
        int pet_id PK
        int owner_id FK
        string pet_name
        string reference_code
        string pet_type
        string breed
        string primary_color
        string gender
        string size_category
        string photo_url
        boolean is_vaccinated
        string status
        int merged_into_pet_id
        float last_seen_lat
        float last_seen_lng
    }
    pet_history {
        int history_id PK
        int pet_id FK
        string event_type
        string title
        int actor_id FK
        string previous_status
        string new_status
        datetime created_at
    }
    pet_tags {
        int tag_id PK
        int pet_id FK
        string token
        string status
        int created_by FK
        datetime last_scanned_at
        int disabled_by FK
    }
    pet_tag_scans {
        int scan_id PK
        int tag_id FK
        int pet_id FK
        string kind
        int scanner_user_id FK
        float latitude
        float longitude
        string finder_phone
        boolean share_contact
        int alert_id FK
        string status
    }
    qr_collar_requests {
        int request_id PK
        int pet_id FK
        int resident_id FK
        int subdivision_id FK
        string status
        int thread_id FK
        int accepted_by FK
        int completed_by FK
    }
    pet_owner_confirmations {
        int confirmation_id PK
        int pet_id FK
        int proposed_owner_id FK
        int proposed_by FK
        int previous_owner_id FK
        int report_id FK
        string status
        string reject_reason
    }
```

The public tag page uses `pet_tags.token` only. It never shows the owner (see [REPORT_LIFECYCLE_AND_FEATURES.md](REPORT_LIFECYCLE_AND_FEATURES.md)).

---

## ERD 4. Reports (the case)

`reports` is the center of the system. Every module in ERDs 5 to 9 hangs off it. A report **is** the case; there is no separate case table.

```mermaid
erDiagram
    users ||--o{ reports : "reporter"
    subdivisions ||--o{ reports : "belongs to"
    report_categories ||--o{ reports : "category"
    report_status ||--o{ reports : "current status"
    landmarks ||--o{ reports : "facility"
    users ||--o{ reports : "assigned leader"
    reports ||--o{ reports : "duplicate or split of"
    reports ||--o{ status_history : "timeline"
    report_status ||--o{ status_history : "status"
    users ||--o{ status_history : "updated by"
    reports ||--o{ report_media : "photos and videos"
    status_history ||--o{ report_media : "attached to step"
    reports ||--o{ case_links : "linked to"
    reports ||--o{ case_concerns : "merged concerns"
    reports ||--o{ report_returns : "handed back"
    pets ||--o{ report_returns : "returned pet"
    reports ||--o{ report_disputes : "disputed"
    users ||--o{ report_disputes : "resident disputing"
    pets ||--o{ report_disputes : "claimed pet"

    report_categories {
        int category_id PK
        string category_name
    }
    report_status {
        int status_id PK
        string status_name
    }
    reports {
        int report_id PK
        int user_id FK
        int subdivision_id FK
        int category_id FK
        int pet_id
        string animal_type
        string animal_color
        text description
        float latitude
        float longitude
        string priority_level
        string visibility
        boolean is_sensitive
        string case_status
        int current_status_id FK
        int assigned_leader_id FK
        string incident_verification
        string urgency_level
        string identity_status
        string ownership_status
        int ownership_owner_id FK
        string closure_disposition
        string closure_reason
        datetime closed_at
        int closed_by FK
        int duplicate_of_report_id FK
        int split_from_report_id FK
        string report_channel
        int reported_on_behalf_of FK
        string client_request_id
        datetime created_at
    }
    status_history {
        int history_id PK
        int report_id FK
        int report_status_id FK
        int updated_by FK
        string remarks
        datetime created_at
    }
    report_media {
        int media_id PK
        int report_id FK
        int history_id FK
        int status_id FK
        string file_url
        string media_type
        boolean is_evidence
        string ai_photo_status
    }
    case_links {
        int link_id PK
        int report_id FK
        int related_report_id FK
        string link_type
        int linked_by FK
        datetime unlinked_at
    }
    case_concerns {
        int concern_id PK
        int master_report_id FK
        int source_report_id FK
        string concern_family
        string status
        string outcome
        int resolved_by FK
    }
    report_returns {
        int return_id PK
        int report_id FK
        int pet_id FK
        int owner_user_id FK
        string owner_name
        string id_presented
        string handover_photo_url
        int returned_by FK
        datetime returned_at
    }
    report_disputes {
        int dispute_id PK
        int report_id FK
        int resident_user_id FK
        int pet_id FK
        string dispute_reason
        string status
        int reviewer_id FK
        datetime resolved_at
    }
```

The four statuses (`reported`, `under_review`, `in_progress`, `closed`) are stored on `reports.case_status`. The six categories live in `report_categories`.

---

## ERD 5. Lost pet and sightings

```mermaid
erDiagram
    reports ||--o| lost_pet_alerts : "notice for"
    pets ||--o{ lost_pet_alerts : "missing pet"
    users ||--o{ lost_pet_alerts : "owner"
    subdivisions ||--o{ lost_pet_alerts : "published in"
    lost_pet_alerts ||--o{ lost_pet_sightings : "sightings"
    reports ||--o{ lost_pet_sightings : "case"
    users ||--o{ lost_pet_sightings : "reporter"
    lost_pet_alerts ||--o{ lost_pet_coordinations : "contact thread"
    lost_pet_sightings ||--o| lost_pet_coordinations : "from sighting"
    users ||--o{ lost_pet_coordinations : "owner and finder"
    lost_pet_coordinations ||--o{ lost_pet_coordination_messages : "messages"
    users ||--o{ lost_pet_coordination_messages : "sender"
    reports ||--o{ ownership_claims : "claimed"
    lost_pet_alerts ||--o{ ownership_claims : "claim on"
    users ||--o{ ownership_claims : "claimant"
    pets ||--o{ ownership_claims : "claimed pet"

    lost_pet_alerts {
        int alert_id PK
        int report_id FK
        int subdivision_id FK
        int pet_id FK
        int owner_id FK
        string status
        string alert_type
        datetime last_seen_at
        string last_seen_location
        string contact_preference
        int residents_notified
        string close_outcome
        datetime recovered_at
        string recovery_source
    }
    lost_pet_sightings {
        int sighting_id PK
        int alert_id FK
        int report_id FK
        int reporter_id FK
        float latitude
        float longitude
        datetime seen_at
        string description
        string photo_url
        string status
        int reviewed_by FK
        string sighting_type
    }
    lost_pet_coordinations {
        int coordination_id PK
        int alert_id FK
        int report_id FK
        int sighting_id FK
        int owner_id FK
        int finder_id FK
        string mode
        boolean owner_consent
        boolean finder_consent
        string status
    }
    lost_pet_coordination_messages {
        int message_id PK
        int coordination_id FK
        int sender_id FK
        text message_text
        boolean is_read
        datetime sent_at
    }
    ownership_claims {
        int claim_id PK
        int report_id FK
        int alert_id FK
        int subdivision_id FK
        int claimant_user_id FK
        int claimed_pet_id FK
        text statement
        string status
        int reviewed_by FK
    }
```

---

## ERD 6. Matching (lost, found and look-alike pets)

```mermaid
erDiagram
    subdivisions ||--o{ lost_found_matches : "in"
    reports ||--o{ lost_found_matches : "lost report"
    reports ||--o{ lost_found_matches : "found report"
    users ||--o{ lost_found_matches : "decided by"
    reports ||--o{ report_matches : "source report"
    reports ||--o{ report_matches : "matched report"
    pets ||--o{ report_matches : "matched pet"
    users ||--o{ report_matches : "reviewed by"
    report_matches ||--o{ manual_match_decisions : "decisions"
    users ||--o{ manual_match_decisions : "staff"
    report_matches ||--o{ leader_identity_verifications : "identity check"
    reports ||--o{ leader_identity_verifications : "case"
    pets ||--o{ leader_identity_verifications : "pet"
    users ||--o{ leader_identity_verifications : "leader"
    reports ||--o{ pet_match_confirmation_requests : "asks owner"
    pets ||--o{ pet_match_confirmation_requests : "pet"
    users ||--o{ pet_match_confirmation_requests : "owner"
    report_matches ||--o{ pet_match_confirmation_requests : "for match"

    lost_found_matches {
        int match_id PK
        int subdivision_id FK
        int lost_report_id FK
        int found_report_id FK
        float score
        string level
        json reasons
        string status
        string algorithm
        text review_note
        int decided_by FK
        datetime decided_at
    }
    report_matches {
        int match_id PK
        int source_report_id FK
        int matched_report_id FK
        int matched_pet_id FK
        float similarity_score
        string status
        text ai_explanation
        string owner_confirmation_status
        int owner_dispute_count
        string owner_verification_answer
        int reviewed_by FK
        datetime verified_at
    }
    manual_match_decisions {
        int decision_id PK
        int match_id FK
        int report_a_id
        int report_b_id
        int pet_id
        string decision
        string previous_status
        int staff_id FK
        string staff_role
    }
    leader_identity_verifications {
        int verification_id PK
        int match_id FK
        int report_id FK
        int pet_id FK
        int leader_id FK
        string method
        string reason
    }
    pet_match_confirmation_requests {
        int request_id PK
        int report_id FK
        int pet_id FK
        int owner_id FK
        int requested_by FK
        string status
        string owner_response
        string final_decision
        int match_id FK
        int follow_up_count
    }
```

`lost_found_matches` pairs a Lost Pet report with a Found report. `report_matches` pairs a report with a registered pet that looks like it. Both only suggest; the Leader decides.

---

## ERD 7. Case work: referrals, follow-ups and alerts

**`referrals`** is the Leader's record of handing a case to an outside party.

```mermaid
erDiagram
    reports ||--o{ referrals : "referred"
    users ||--o{ referrals : "recorded by Leader"
    referrals ||--o{ referral_updates : "updates"
    users ||--o{ referral_updates : "recorded by"
    reports ||--o{ case_followups : "follow-ups"
    subdivisions ||--o{ case_followups : "in"
    referrals ||--o{ case_followups : "tracks"
    users ||--o{ case_followups : "created and completed by"
    reports ||--o{ case_contact_logs : "contact log"
    subdivisions ||--o{ case_contact_logs : "in"
    users ||--o{ case_contact_logs : "logged by"
    reports ||--o{ case_alerts : "alerts"
    subdivisions ||--o{ case_alerts : "audience"
    users ||--o{ case_alerts : "created and stopped by"
    case_alerts ||--o{ case_alert_sends : "each send"

    referrals {
        int referral_id PK
        int report_id FK
        int referred_by FK
        datetime referred_at
        string org_type
        string org_name
        string contact_person
        string contact_method
        string reason
        string reference_no
        boolean is_urgent
        string referral_status
        string external_outcome
        string final_outcome
        datetime follow_up_at
        string priority_level
    }
    referral_updates {
        int update_id PK
        int referral_id FK
        string update_type
        string source
        datetime update_date
        text note
        string status_after
        string responder_name
        int recorded_by FK
    }
    case_followups {
        int followup_id PK
        int report_id FK
        int subdivision_id FK
        string kind
        string title
        datetime due_at
        string status
        int referral_id FK
        int created_by FK
        int completed_by FK
    }
    case_contact_logs {
        int log_id PK
        int report_id FK
        int subdivision_id FK
        string method
        string with_whom
        text summary
        string outcome
        datetime contact_at
        int logged_by FK
    }
    case_alerts {
        int alert_id PK
        int report_id FK
        int subdivision_id FK
        string title
        text message
        string audience
        string mode
        string repeat_kind
        string status
        datetime next_send_at
        int sends_done
        int created_by FK
        int stopped_by FK
    }
    case_alert_sends {
        int send_id PK
        int alert_id FK
        datetime slot_at
        string status
        int recipients
        datetime sent_at
    }
```

> [!TIP]
> The `referrals.org_type` and `org_name` columns hold *who* the case was handed to (for example a veterinarian or animal control). The Leader makes the contact outside the system and only records it here.

---

## ERD 8A. Complaints, enforcement and warning letters

How a Nuisance complaint turns into a respondent, counted offenses, enforcement steps and warning letters.

```mermaid
erDiagram
    subdivisions ||--o{ complaint_respondents : "in"
    users ||--o{ complaint_respondents : "resident respondent"
    reports ||--o| complaint_findings : "finding"
    complaint_respondents ||--o{ complaint_findings : "respondent"
    reports ||--o{ complaint_offenses : "offenses"
    complaint_respondents ||--o{ complaint_offenses : "committed by"
    complaint_offenses ||--o{ enforcement_steps : "leads to"
    reports ||--o{ enforcement_steps : "case"
    referrals ||--o{ enforcement_steps : "referral step"
    enforcement_steps ||--o{ enforcement_step_events : "events"
    reports ||--o{ owner_warnings : "warning"
    users ||--o{ owner_warnings : "warned owner"
    pets ||--o{ owner_warnings : "pet"
    subdivisions ||--o{ warning_letter_templates : "owns"
    warning_letter_templates ||--o{ warning_letter_template_versions : "versions"
    owner_warnings ||--o{ generated_warning_letters : "letter"
    enforcement_steps ||--o{ generated_warning_letters : "letter"
    warning_letter_templates ||--o{ generated_warning_letters : "template"
    warning_letter_template_versions ||--o{ generated_warning_letters : "version"
    notifications ||--o{ generated_warning_letters : "delivered by"

    complaint_respondents {
        int respondent_id PK
        int subdivision_id FK
        int user_id FK
        string name
        string address
        int created_by FK
    }
    complaint_findings {
        int report_id PK
        int subdivision_id FK
        string policy_id
        string policy_title
        boolean no_rule
        int respondent_id FK
        boolean ruled_out
        int separate_from_report_id FK
    }
    complaint_offenses {
        int offense_id PK
        int report_id FK
        int respondent_id FK
        string policy_id
        boolean counted
        int offense_number
        datetime incident_at
        int confirmed_by FK
        datetime voided_at
    }
    enforcement_steps {
        int step_id PK
        int offense_id FK
        int report_id FK
        string kind
        string state
        datetime due_at
        int referral_id FK
    }
    enforcement_step_events {
        int event_id PK
        int step_id FK
        int report_id FK
        string kind
        datetime occurred_at
        int recorded_by FK
    }
    owner_warnings {
        int warning_id PK
        int user_id FK
        int pet_id FK
        int report_id FK
        int issued_by FK
        string warning_level
        string violation_type
        string status
        string policy_id
        datetime follow_up_at
        string workflow_status
    }
    warning_letter_templates {
        int template_id PK
        int subdivision_id FK
        string name
        string warning_level
        string status
        boolean is_default
        int current_version_id
    }
    warning_letter_template_versions {
        int version_id PK
        int template_id FK
        int version_number
        string subject_template
        text body_template
        int created_by FK
    }
    generated_warning_letters {
        int letter_id PK
        string warning_reference
        int warning_id FK
        int complaint_step_id FK
        int report_id FK
        int recipient_user_id FK
        int template_id FK
        int template_version_id FK
        string rendered_subject
        int issued_by FK
        datetime issued_at
        int notification_id FK
        string notification_status
        datetime viewed_at
    }
```

---

## ERD 8B. Owner follow-up (observation period)

After a warning or a pet report, the Leader sets an observation period. The owner sends updates and the Leader reviews them.

```mermaid
erDiagram
    reports ||--o{ owner_followups : "observation"
    pets ||--o{ owner_followups : "pet"
    subdivisions ||--o{ owner_followups : "in"
    users ||--o{ owner_followups : "owner and leader"
    owner_followups ||--o{ followup_contact_logs : "contacts"
    owner_followups ||--o{ followup_repeated_incidents : "repeat incidents"
    owner_followups ||--o{ owner_observation_updates : "owner updates"
    owner_observation_updates ||--o{ owner_observation_update_photos : "photos"

    owner_followups {
        int followup_id PK
        int report_id FK
        int pet_id FK
        int subdivision_id FK
        int leader_id FK
        int owner_id FK
        string status
        datetime due_at
        int duration_days
        boolean is_extended
        datetime closed_at
    }
    followup_contact_logs {
        int contact_log_id PK
        int followup_id FK
        int logged_by FK
        string contact_type
        datetime contact_date
        string inspection_outcome
    }
    followup_repeated_incidents {
        int incident_id PK
        int followup_id FK
        int report_id FK
        int pet_id FK
        int logged_by FK
        datetime incident_date
    }
    owner_observation_updates {
        int update_id PK
        int followup_id FK
        int report_id FK
        int pet_id FK
        int owner_user_id FK
        string compliance_status
        text owner_remarks
        datetime submitted_at
        int reviewed_by FK
    }
    owner_observation_update_photos {
        int photo_id PK
        int update_id FK
        string photo_url
    }
```

---

## ERD 9A. Case messaging and chat

```mermaid
erDiagram
    subdivisions ||--o{ case_message_threads : "in"
    reports ||--o{ case_message_threads : "about"
    case_message_threads ||--o{ case_message_members : "members"
    users ||--o{ case_message_members : "member"
    case_message_threads ||--o{ case_messages : "messages"
    users ||--o{ case_messages : "sender"
    users ||--o{ chat_threads : "created or addressed"
    chat_threads ||--o{ chat_messages : "messages"
    users ||--o{ chat_messages : "sender"

    case_message_threads {
        int thread_id PK
        int subdivision_id FK
        string kind
        int report_id FK
        int related_report_id FK
        string subject
        string status
        string close_reason
        int created_by FK
    }
    case_message_members {
        int member_id PK
        int thread_id FK
        int user_id FK
        string role
        int last_read_message_id
    }
    case_messages {
        int message_id PK
        int thread_id FK
        int sender_id FK
        string kind
        text body
        string client_request_id
        datetime created_at
    }
    chat_threads {
        int thread_id PK
        string thread_type
        int related_id
        int created_by FK
        int recipient_id FK
        boolean is_closed
    }
    chat_messages {
        int message_id PK
        int thread_id FK
        int sender_id FK
        text message_text
        boolean is_read
        boolean is_system
    }
```

Two messaging tables exist. `case_message_*` is the current case messaging (Resident and Leader about a case). `chat_*` is the older general chat. Both are still in the code.

---

## ERD 9B. Notices and notifications

```mermaid
erDiagram
    announcement_categories ||--o{ announcements : "category"
    users ||--o{ announcements : "created by"
    subdivisions ||--o{ announcements : "audience"
    announcements ||--o{ announcement_media : "media"
    users ||--o{ notifications : "receives"
    users ||--o| user_notification_preferences : "settings"
    users ||--o{ push_subscriptions : "devices"
    notifications ||--o{ push_deliveries : "push sends"
    push_subscriptions ||--o{ push_deliveries : "to device"
    users ||--o{ email_logs : "e-mails"

    announcement_categories {
        int category_id PK
        string category_name
    }
    announcements {
        int announcement_id PK
        int subdivision_id FK
        int created_by FK
        int category_id FK
        string title
        text content
        string visibility
        string priority_level
        string status
        datetime published_at
        datetime expires_at
    }
    announcement_media {
        int media_id PK
        int announcement_id FK
        string file_url
        string media_type
    }
    notifications {
        int notification_id PK
        int user_id FK
        string title
        text message
        string type
        boolean is_read
        int related_id
    }
    user_notification_preferences {
        int preference_id PK
        int user_id FK
        boolean email_reports
        boolean push_enabled
        boolean push_messages
    }
    push_subscriptions {
        int subscription_id PK
        int user_id FK
        string channel
        string endpoint_hash
        datetime revoked_at
    }
    push_deliveries {
        int delivery_id PK
        int notification_id FK
        int subscription_id FK
        string status
        int attempts
    }
    email_logs {
        int email_id PK
        int user_id FK
        string recipient_email
        string template_key
        string status
        int attempts
        datetime sent_at
    }
```

---

## ERD 10. AI and audit

```mermaid
erDiagram
    reports ||--o{ ai_jobs : "queued for"
    reports ||--o{ case_ai_insights : "insight"
    users ||--o{ case_ai_insights : "requested by"
    subdivisions ||--o{ analytics_ai_summaries : "summary of"
    users ||--o{ analytics_ai_summaries : "generated by"
    users ||--o{ audit_logs : "actions"

    ai_jobs {
        int job_id PK
        string kind
        int report_id
        int media_id
        json payload
        string status
        int attempts
        int max_attempts
        datetime available_at
        datetime finished_at
    }
    ai_vision_comparisons {
        string pair_key PK
        json result
        datetime created_at
    }
    case_ai_insights {
        int insight_id PK
        int report_id FK
        string content_hash
        text summary
        string suggested_priority
        float priority_confidence
        boolean category_mismatch
        string suggested_category
        string model
        int generated_by FK
    }
    analytics_ai_summaries {
        int summary_id PK
        int subdivision_id FK
        date range_start
        date range_end
        string stats_hash
        text trend_summary
        text hotspot_explanation
        text monthly_digest
        string model
        int generated_by FK
    }
    audit_logs {
        int log_id PK
        int user_id FK
        string action
        string target_table
        int target_id
        text description
        string ip_address
        string log_type
        json old_values
        json new_values
        datetime created_at
    }
```

`ai_jobs.report_id` and `ai_vision_comparisons.pair_key` are plain values with no database foreign key. AI results only suggest; a Leader decides ([AI_COMPONENTS.md](AI_COMPONENTS.md)).

---

## How the modules connect (overview)

```mermaid
flowchart LR
    M1["1 Users and subdivisions"] --> M2["2 Resident registration"]
    M1 --> M3["3 Pets and QR tags"]
    M1 --> M4["4 Reports (the case)"]
    M3 --> M4
    M4 --> M5["5 Lost pet and sightings"]
    M4 --> M6["6 Matching"]
    M3 --> M6
    M4 --> M7["7 Referrals, follow-ups, alerts"]
    M4 --> M8["8A and 8B Complaints, warnings, follow-up"]
    M4 --> M9["9A and 9B Messaging and notifications"]
    M4 --> M10["10 AI and audit"]
```

## Notes for the capstone paper

- Present **ERD 4** as the main figure, then the others as module figures. A reader can follow the whole system from `reports` outward.
- Each diagram is kept small so the text stays readable when printed. Export the images at a large size or in landscape.
- The diagrams show the key columns only; the full column lists are in the model files.
- If you only have room for a few figures, use ERDs 1, 3, 4, 5 and 7.
- Use `referrals` and `referral_updates` in the paper. The diagrams show a simplified model of the database.
