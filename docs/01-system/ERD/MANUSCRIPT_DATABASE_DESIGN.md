# Database Design — Manuscript Write-up (Chapter 2, short version)

> **How to use this file.** Copy each section into the manuscript, or use the paste-ready `.txt` copy. This version
> covers the modules from User and Access Management to Administration and System (no module overview figure). Figures are
> numbered **2.1–2.20**. The figure list at the end is an export guide, not manuscript text.

---

## Database Design

StraySafe 2.0 uses a MySQL relational database that stores the system's accounts, pets, reports, rescues, adoptions
and messages. The researchers grouped its tables into modules, each matching a feature of the system. The diagrams
below use crow's-foot notation. PK marks a primary key, FK a foreign key and UK a unique column. The line endings show
whether a record is linked to one or many records. Small boxes that show only a key are tables from another module.

---

## User and Access Management Module

*Figure 2.1. User and Access Management ERD*

Every user has one record in the users table and exactly one role: Citizen, Subdivision Leader, Barangay Staff or
Admin. Users may also have a position and belong to a barangay or subdivision. One-time passwords for registration are
kept in otp_verifications. Signed-out sessions are listed in revoked_tokens so that they cannot be reused.

---

## Location and Coverage Module

*Figure 2.2. Location and Coverage ERD*

A barangay contains many subdivisions, and both contain landmarks such as gates, parks and holding facilities. The
coverage_settings table defines the area the system covers on the map.

---

## Pet Management Module

*Figure 2.3. Pet Registry and Health Records ERD*

The pets table stores each animal's details, photos and vaccination status. A pet is linked to its owner and to the
user who registered it. For owners without an account, the owner's name and phone number are saved on the pet record.

*Figure 2.4. QR Tags and Pet History ERD*

Each pet can have one QR tag. When a finder scans it, the scan is saved with the location and the finder's contact.
The pet_history table keeps a timeline of important events in the pet's life.

*Figure 2.5. Ownership Transfer and Owner Compliance ERD*

A change of owner is saved in pet_owner_confirmations and takes effect only after the new owner accepts it. The
owner_warnings table stores violation notices given to pet owners.

---

## Stray Reporting Module

*Figure 2.6. Reports and Classification ERD*

Each report belongs to one subdivision and one category, and has a current status. Several users can be linked to a
report, such as the reporter and the leader who handles it. Duplicate reports of the same animal are merged into one
case through a link from the reports table to itself. When one report shows several animals, the leader splits it into one record per
animal, and each record points back to the group report.

*Figure 2.7. Report Timeline and Media ERD*

Every status change is recorded in status_history, and the photos and videos of a report are kept in report_media.
Together they form the report's timeline.

*Figure 2.8. Comments, Endorsements and Disputes ERD*

Reports can receive comments with replies. A leader can send one endorsement letter per report to the barangay, and
residents can file a dispute if they believe a report is wrong.

---

## Verification, Claims and Reunification Module

*Figure 2.9. Verification, Claims and Reunification ERD*

Owners claim a reported animal through pet_claims, which links pets and reports and stores the owner's proof. When the
animal is handed over, report_returns records who received it and who released it.

---

## AI Matching Module

*Figure 2.10. AI Matching ERD*

The report_matches table stores the possible matches the AI finds between a sighting and another report or a
registered pet. The AI only suggests; staff and the owner make the final decision. The ai_jobs table queues the AI's
work, and ai_vision_comparisons saves earlier photo comparisons so they are not repeated.

---

## Rescue and Holding Operations Module

*Figure 2.11. Rescue Dispatch ERD*

A rescue is created for a report and moves through statuses from Pending Assignment to Animal Secured. Responders are
linked to rescues through rescue_assignments.

*Figure 2.12. Holding Facility ERD*

Animals taken to the facility are recorded in holding_animals, and their care is logged in holding_timeline. Animals
marked For Adoption appear in the adoption catalog.

---

## Adoption Module

*Figure 2.13. Application and Verification ERD*

Residents apply to adopt through the adoptions table, and staff check each applicant in adoption_verifications. Every
step is logged, and a completed adoption creates a new pet record for the adopter.

*Figure 2.14. Staff Assignments and Screening ERD*

Adoption tasks are assigned to staff through adoption_assignments. The interview and home visit results are stored in
adoption_interviews and adoption_home_visits.

*Figure 2.15. Post-Adoption Monitoring ERD*

After handover, adopter check-ins and staff visits are recorded in adoption_monitoring_logs.

*Figure 2.16. Certificate and Case Ownership ERD*

Each completed adoption receives one certificate that can be verified by its number. The adoption_ownership_history
table records which staff member handles each case.

---

## Communication and Notifications Module

*Figure 2.17. Chat and Email ERD*

Users talk through chat threads, each holding many messages. Outgoing emails are logged in email_logs.

*Figure 2.18. Notifications and Push Delivery ERD*

Users receive notifications and have one set of notification preferences. The push_deliveries table records each
notification sent to each of a user's devices.

---

## Announcements Module

*Figure 2.19. Announcements ERD*

Leaders and barangay staff post announcements to a barangay or subdivision, with optional media. Residents can comment
and react, with one reaction per announcement.

---

## Administration and System Module

*Figure 2.20. Administration and System ERD*

The audit_logs table records who did each important action, what changed and when. Since an action can involve any
table, the log saves the table name and record number instead of a direct link. Its only link is to the user who
performed the action. The system_settings table stores system switches, such as turning AI photo matching on or off.

---

## Summary

The database is organized into modules that follow the features of StraySafe 2.0. Foreign keys keep related records
consistent. Linking tables handle many-to-many relationships, such as pet claims and rescue assignments. AI results are
kept as suggestions, separate from the decisions made by staff and owners.

---

## Figure list (export guide — not part of the manuscript text)

| Figure | Title | File (`docs/ERD/mermaid/`) |
|---|---|---|
| 2.1 | User and Access Management | `01_user_access_management.mmd` |
| 2.2 | Location and Coverage | `02_location_coverage.mmd` |
| 2.3 | Pet Registry and Health Records | `03a_pet_registry_health.mmd` |
| 2.4 | QR Tags and Pet History | `03b_qr_tags_pet_history.mmd` |
| 2.5 | Ownership Transfer and Owner Compliance | `03c_ownership_compliance.mmd` |
| 2.6 | Reports and Classification | `04a_reports_classification.mmd` |
| 2.7 | Report Timeline and Media | `04b_report_timeline_media.mmd` |
| 2.8 | Comments, Endorsements and Disputes | `04c_comments_endorsements_disputes.mmd` |
| 2.9 | Verification, Claims and Reunification | `05_verification_claims_reunification.mmd` |
| 2.10 | AI Matching | `06_ai_matching.mmd` |
| 2.11 | Rescue Dispatch | `07a_rescue_dispatch.mmd` |
| 2.12 | Holding Facility | `07b_holding_facility.mmd` |
| 2.13 | Application and Verification | `08a_application_verification.mmd` |
| 2.14 | Staff Assignments and Screening | `08b_assignments_screening.mmd` |
| 2.15 | Post-Adoption Monitoring | `08c_post_adoption_monitoring.mmd` |
| 2.16 | Certificate and Case Ownership | `08d_certificate_case_ownership.mmd` |
| 2.17 | Chat and Email | `09a_chat_email.mmd` |
| 2.18 | Notifications and Push Delivery | `09b_notifications_push.mmd` |
| 2.19 | Announcements | `10_announcements.mmd` |
| 2.20 | Administration and System | `11_administration_system.mmd` |
