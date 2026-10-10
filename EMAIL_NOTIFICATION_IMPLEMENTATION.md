# StraySafe 2.0 – Email Notification System Architecture & Implementation Plan

**Target Branch:** `emailnotification`  
**Status:** Audit & Architecture Planning Phase (Pending User Approval)  
**Date:** October 10, 2026  

---

## 1. Existing Notification Architecture Audit

A comprehensive code and schema audit of StraySafe 2.0 was performed across backend models, routes, database tables, and frontend navigation components.

### 1.1 In-App Notification System
- **Database Model (`backend/app/models/notification.py`)**:
  - Table: `notifications`
  - Columns: `notification_id` (PK), `user_id` (FK to `users`), `title` (VARCHAR 255), `message` (VARCHAR 1000), `type` (VARCHAR 50, e.g., `'status_update'`, `'alert'`, `'potential_match'`, `'claim'`), `is_read` (BOOLEAN), `is_archived` (BOOLEAN), `created_at` (TIMESTAMP), `related_id` (INT, e.g., report_id or pet_id).
- **Backend API Routes (`backend/app/routes/notifications.py`)**:
  - `GET /notifications/me`: Retrieves current user's notifications.
  - `GET /notifications/user/{user_id}`: Retrieves notifications for specified user (self or Admin).
  - `POST /notifications/`: Manual dispatch endpoint restricted strictly to Admin (`role_id == 4`).
  - `PATCH /notifications/{notification_id}` & `/read`: Marks read status.
  - `POST /notifications/{notification_id}/archive` & `/unarchive`: Moves to/from archived tab.
  - `POST /notifications/mark-all-read/{user_id}`: Bulk mark as read.
  - `POST /notifications/archive-all/{user_id}`: Bulk archive.
  - `DELETE /notifications/archived/clear/{user_id}`: Deletes all archived notifications.
- **Dispatch Pattern**:
  - Across the backend (`reports.py`, `rescue.py`, `matches.py`, `claims.py`, `warnings.py`, `pet_qr.py`, `unassigned_checker.py`), in-app notifications are manually instantiated (`db.add(Notification(...))`) and committed within route handlers. Over 90 call sites exist.
- **Frontend Presentation**:
  - Navbars (`ResiNavbar.tsx`, `SubdNavbar.tsx`, `BrgyNavbar.tsx`, `AdminNavbar.tsx`) display an animated bell with unread badge counter, notification dropdown/drawer with formatted timestamps, and action routing (clicking opens the relevant report, match review, or claim modal).
  - `ResidentSettings.tsx` contains a "Notifications" tab showing inbox history, read/unread status, and archiving.

### 1.2 Existing Email Infrastructure
- **Mailer Module (`backend/app/utils/mailer.py`)**:
  - Built using standard library `smtplib` and `email.message.EmailMessage` using STARTTLS over port 587.
  - Supported Functions:
    - `email_configured()`: Checks if `SMTP_USER` and `SMTP_PASSWORD` exist.
    - `send_email(to, subject, text, html_body)`: Sends email synchronously via SMTP.
    - `send_password_reset_email()`: Password reset 6-digit OTP code.
    - `send_admin_login_code_email()`: Admin 2FA verification code.
    - `send_account_invite_email()`: New staff/officer invitation with temporary setup code.
    - `send_otp_email()`: Citizen registration / verification OTP.
- **Current Environment Configuration (`.env.example`)**:
  - `SMTP_HOST`: `smtp.gmail.com`
  - `SMTP_PORT`: `587`
  - `SMTP_USER`: Account address (e.g. `your_account@gmail.com`)
  - `SMTP_PASSWORD`: Google App Password (16 characters)
  - `SMTP_FROM_NAME`: `StraySafe`
  - `FRONTEND_URL`: `http://localhost:5173`

---

## 2. Issues & Missing Functionality in Current Architecture

1. **Synchronous Blocking Execution**:
   - Calling `send_email()` inside an HTTP endpoint takes **1.5 to 5+ seconds** (or up to 15 seconds on network timeouts). Doing this inside critical endpoints like `POST /reports/` or `PATCH /claims/{id}/status` severely degrades user experience.
2. **No Operational Email Triggers**:
   - Only authentication/security emails (password reset, OTP, invite) currently send emails. Core system events (report confirmation, AI pet matches, claim approvals, handover completions) have **zero** email notifications.
3. **Absence of User Notification Preferences**:
   - Users cannot configure which notification types they wish to receive via email (e.g., opting out of status updates while keeping pet match alerts).
4. **Lack of Email Queue & Retry Mechanism**:
   - If an SMTP server experiences temporary downtime, rate limits, or transient connection reset, the email fails permanently with no retry.
5. **No Email Delivery Logging / Audit**:
   - Failed email attempts are logged to server stderr/stdout only; there is no persistent database log to track delivery status, timestamps, recipient addresses, or error diagnostics.
6. **No Deduplication Guard**:
   - Retried requests or repeated background scans could potentially spam users with duplicate emails without an idempotency key.
7. **HTML Email Templates for Operational Workflows**:
   - While transactional OTP templates exist in `mailer.py`, there are no responsive, branded templates for reports, animal rescues, matches, or citations.

---

## 3. Recommended Email Provider

### Evaluation
| Provider | Setup Complexity | Free Tier Allowance | Pros | Cons | Recommendation |
| :--- | :---: | :---: | :--- | :--- | :---: |
| **Gmail SMTP (Current)** | Very Low (App Password) | 500 emails/day | Zero cost, already partially integrated in `mailer.py`, ideal for dev/testing. | Rate limits, requires App Password configuration. | **Default for Dev & Testing** |
| **Resend** | Low (API Key) | 3,000 emails/month (100/day) | Exceptional developer experience, fast HTTP API, high deliverability, domain DKIM/SPF. | Requires custom domain for production. | **Recommended for Production** |
| **Brevo (Sendinblue)** | Low (SMTP/API Key) | 300 emails/day | Generous permanent free tier, standard SMTP & HTTP API. | Account verification can take 24h. | **Alternative for Production** |

### Proposed Architecture Strategy: Provider-Agnostic Engine
The email system will be built with a **modular provider pattern** in `backend/app/services/email/`:
1. **SMTP Delivery Engine (Universal)**: Works out of the box with Gmail SMTP, Brevo SMTP, Amazon SES, or Mailgun via standard environment variables.
2. **Resend HTTP Provider (Optional)**: Automatically activates if `RESEND_API_KEY` is present, delivering emails via asynchronous HTTP requests without SMTP handshake overhead.
3. **Local Dev / Dry-Run Mode**: If neither SMTP credentials nor API keys are supplied, emails are safely logged to console and database marked as `simulated`, preventing local developer crashes.

---

## 4. Email Notification Events by Role

To avoid inbox fatigue, emails are prioritized strictly for actionable or significant lifecycle events:

### 4.1 Resident (Citizen)
| Trigger Event | Context / Email Content | Action Link |
| :--- | :--- | :--- |
| **Report Submitted** | Confirmation receipt with Report ID, species/breed, landmark, and initial status. | `/citizen/reports` or `/citizen/report/{id}` |
| **Report Status Milestone** | Verified by Leader, Responders Dispatched, Animal Rescued, or Resolved. | `/citizen/report/{id}` |
| **Potential AI Pet Match** | Alert that a look-alike stray matches their lost/registered pet with similarity score. | `/citizen/matches` |
| **Pet Claim Status Decision** | Pet claim Approved (pickup instructions) or Rejected (with explanation remarks). | `/citizen/claims` |
| **Pet Handover / Reunited** | Official confirmation that pet was returned to owner and case closed. | `/citizen/my-pets` |
| **Pet QR Code Scanned** | Alert: Pet's collar QR code was scanned by a finder with timestamp and GPS landmark. | `/citizen/my-pets` |
| **Official Citation / Warning** | Notice of ordinance violation (free-roaming, overdue vaccine) requiring acknowledgement. | `/citizen/settings?tab=warnings` |

### 4.2 Subdivision Leader
| Trigger Event | Context / Email Content | Action Link |
| :--- | :--- | :--- |
| **New Stray Report in Subdivision** | Urgent notification of new resident sighting requiring initial verification. | `/subdivision/reports/{id}` |
| **Unassigned Report Reminder** | Report unhandled after 30 minutes in their jurisdiction. | `/subdivision/reports/{id}` |
| **Report Escalation** | Report transferred to Barangay Staff or Animal Control. | `/subdivision/reports/{id}` |
| **Look-Alike Match Confirmation** | Resident confirmed or disputed sighting of look-alike animal in their subdivision. | `/subdivision/matches` |
| **Pet Recovery / Handover Alert** | Resident or staff submitted proof of physical pet recovery in their subdivision. | `/subdivision/claims` |

### 4.3 Barangay Staff
| Trigger Event | Context / Email Content | Action Link |
| :--- | :--- | :--- |
| **New Endorsed / Escalated Report** | Subdivision leader endorsed report or high-priority incident (e.g., bite/aggressive). | `/barangay/reports/{id}` |
| **Rescue Dispatch Assignment** | Staff member assigned to animal capture or pickup task. | `/barangay/rescues/{id}` |
| **Holding Facility Intake / Overdue** | Animal intake logged or quarantine period reaching holding threshold. | `/barangay/holding` |
| **Adoption Task Assignment** | Staff assigned to Home Visit, Document Verification, or Adoption Handover. | `/barangay/adoptions/{id}` |

### 4.4 Administrator
| Trigger Event | Context / Email Content | Action Link |
| :--- | :--- | :--- |
| **Security & Authentication** | Administrator 2FA login code, staff account invitation, password reset. | `/admin/security` |
| **System Health / Critical Disputes** | High-volume unresolved reports, escalated identity disputes, critical system anomalies. | `/admin/reports` |

---

## 5. Schema, Backend & Frontend Modifications

### 5.1 Database Changes
We introduce two lightweight, resilient tables without altering existing relations:

#### 1. `user_notification_preferences`
Stores granular email preferences per user:
```sql
CREATE TABLE IF NOT EXISTS `user_notification_preferences` (
  `preference_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `email_reports` BOOLEAN NOT NULL DEFAULT TRUE,       -- Report submission & status updates
  `email_rescues` BOOLEAN NOT NULL DEFAULT TRUE,       -- Rescue dispatches & holding status
  `email_pet_matches` BOOLEAN NOT NULL DEFAULT TRUE,   -- AI look-alike sighting alerts
  `email_claims` BOOLEAN NOT NULL DEFAULT TRUE,        -- Pet claims & handover confirmations
  `email_reminders` BOOLEAN NOT NULL DEFAULT TRUE,     -- Unassigned reports & task reminders
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_user_preferences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 2. `email_logs` (Queue & Delivery Audit)
Tracks every queued and delivered email, preventing duplicates and enabling retries:
```sql
CREATE TABLE IF NOT EXISTS `email_logs` (
  `email_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `template_key` VARCHAR(100) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `status` ENUM('Pending', 'Sent', 'Failed', 'Simulated') NOT NULL DEFAULT 'Pending',
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 3,
  `error_message` TEXT NULL,
  `idempotency_key` VARCHAR(120) NULL UNIQUE,         -- Prevents duplicate sending of identical event
  `related_entity_type` VARCHAR(50) NULL,             -- 'report', 'pet', 'claim', 'user'
  `related_entity_id` INT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `sent_at` DATETIME NULL,
  CONSTRAINT `fk_email_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  INDEX `idx_email_status_attempts` (`status`, `attempts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.2 Backend Service Architecture
1. **`app/models/notification_preference.py`**: SQLAlchemy model for `UserNotificationPreference`.
2. **`app/models/email_log.py`**: SQLAlchemy model for `EmailLog`.
3. **`app/services/email_templates.py`**:
   - Reusable template generator producing high-fidelity HTML and plaintext alternatives.
   - Design: StraySafe branding, warm amber headers (`#F97316`), responsive container, clear details card, CTA button, and compliance footer.
4. **`app/services/email_service.py`**:
   - `queue_email()`: Checks recipient preference, computes idempotency key, records in `email_logs`, and dispatches asynchronously via background worker.
   - `process_email_queue_job()`: Processes pending jobs with exponential retry backoff.
5. **`app/utils/notification_dispatcher.py`**:
   - Unified helper `dispatch_notification(db, user_id, title, message, notif_type, related_id, email_event=None)`:
     - Creates the standard in-app `Notification`.
     - Automatically verifies user email preferences and queues the branded email in the background without blocking the caller.
6. **API Endpoints (`app/routes/notifications.py`)**:
   - `GET /notifications/preferences`: Get current user email toggles.
   - `PUT /notifications/preferences`: Update preferences.
   - `POST /notifications/test-email` (Admin only): Diagnostic endpoint to test SMTP/Resend connection.

### 5.3 Frontend Updates
- **Settings Screen (`ResidentSettings.tsx`, `SubdSettings.tsx`, `BrgySettings.tsx`, `AdminAccountSettings.tsx`)**:
  - Add an **Email Notifications** preference card under the existing Notifications section.
  - Interactive switches:
    - Stray Reports & Status Updates
    - Lost Pet & Look-Alike AI Alerts
    - Pet Claims & Handover Confirmations
    - Task & Rescue Reminders

---

## 6. Background Processing & Reliability Design

### Asynchronous Pipeline
```
[Event Trigger (e.g. Report Submitted)]
         │
         ▼
[dispatch_notification()]
   ├── 1. db.add(Notification(...))    ──► In-App DB (Immediate, same transaction)
   │
   └── 2. Check User Preferences & Compute Idempotency Key
         │
         ├── Preferred OFF or Duplicate Key ──► Skip Email
         │
         └── Preferred ON ──► Insert EmailLog(status='Pending')
                                │
                                ▼
         BackgroundTasks / Async Worker Thread (Non-blocking)
                                │
                                ▼
                  [Deliver via SMTP / Resend]
                     ├── Success: Update EmailLog(status='Sent', sent_at=now())
                     └── Failure: Update EmailLog(attempts += 1, status='Failed', error=...)
```

### Key Reliability Safeguards
1. **Zero Latency Impact on User Requests**:
   - Network calls to SMTP or external APIs never occur during the HTTP route execution. FastAPI `BackgroundTasks` or async background execution completes after the response is sent.
2. **Idempotency & Deduplication**:
   - Format: `{event_type}_{entity_id}_{state_or_timestamp_hash}` (e.g., `report_submitted_142`, `claim_approved_89`).
   - If an endpoint is re-hit or retried, duplicate emails are discarded before contacting SMTP.
3. **Automatic Retry with Exponential Backoff**:
   - Transient network glitches are retried up to 3 times in background sweeper tasks.
4. **Safe Isolation**:
   - An email delivery failure will **never** roll back or fail a database transaction for a submitted report, status update, or pet claim.

---

## 7. Security & Privacy Guarantees

1. **Credential Safety**:
   - SMTP passwords, Google App Passwords, and API keys reside exclusively in backend `.env` variables (`SMTP_PASSWORD`, `RESEND_API_KEY`).
   - No credentials are ever passed to the frontend or exposed in API responses.
2. **Data Minimization in Email Content**:
   - Emails contain essential summary details only (Pet Name, Report ID, Landmark/Subdivision, Status).
   - **No** sensitive identification numbers (e.g., full Government ID numbers), uploaded ID photos, or private resident phone numbers are ever embedded in email bodies.
   - Action buttons direct the user to the secure authenticated web application.
3. **HTML Sanitization**:
   - All user-supplied variables (names, landmarks, notes) are sanitized using `html.escape()` to prevent HTML injection attacks in email clients.
4. **Rate Limiting**:
   - Administrative test endpoints and notification dispatch points are protected by SlowAPI rate limits to prevent email flooding.

---

## 8. Required Environment Variables

```env
# =============================================================================
# EMAIL NOTIFICATION SYSTEM CONFIGURATION
# =============================================================================
# Primary Email Provider: 'smtp' or 'resend' (defaults to 'smtp')
EMAIL_PROVIDER=smtp

# SMTP Configuration (Gmail SMTP, Brevo, or other custom SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_16_char_google_app_password
SMTP_FROM_NAME=StraySafe
SMTP_FROM_EMAIL=no-reply@straysafe.com

# Optional Resend API Key (if using Resend instead of SMTP)
RESEND_API_KEY=

# Public Web Application Base URL (used in email CTA buttons)
FRONTEND_URL=http://localhost:5173

# Email Queue Configuration
EMAIL_MAX_RETRIES=3
EMAIL_RETRY_INTERVAL_SECONDS=120
EMAIL_DEV_SIMULATE=false
```

---

## 9. Comprehensive Testing Checklist

- [ ] **Unit Tests**:
  - HTML email template rendering across all notification categories.
  - User preference evaluation logic (suppression when toggled off, allow when on).
  - Idempotency key generation and duplicate prevention.
- [ ] **Delivery Verification**:
  - Verification of delivery via Gmail SMTP with valid App Password.
  - Graceful fallback when `SMTP_USER` / `SMTP_PASSWORD` are missing (simulation mode).
- [ ] **Background Processing**:
  - Confirm API endpoint response time is < 100ms when sending an email (non-blocking).
  - Verification of retry handling on simulated SMTP timeout.
- [ ] **Role-Based Workflow Verification**:
  - Resident: Report Submitted, Status Approved/Rejected, Match Sighting Alert, Pet Claim Decision.
  - Subdivision Leader: New Report Alert, Unassigned Reminder, Match Confirmation.
  - Barangay Staff: Escalated Report, Dispatch Assignment, Handover Complete.
  - Admin: Security OTP / 2FA Login.
- [ ] **Frontend Integration**:
  - Toggle email preferences in Settings and verify database sync.
  - Verify email CTA buttons open the correct application routes.

---

## 10. Implementation Phases (Pending User Approval)

| Phase | Description | Deliverables |
| :---: | :--- | :--- |
| **Phase 1** | **Database Schema & Models** | Add `UserNotificationPreference` and `EmailLog` models, startup table initialization in `main.py`, update `Database3.3.txt`. |
| **Phase 2** | **Core Email Engine & Templates** | Build `email_templates.py` with responsive StraySafe branding and `email_service.py` with background queuing & retry logic. |
| **Phase 3** | **Unified Notification Dispatcher** | Implement `dispatch_notification()` and integrate into key route triggers (`reports.py`, `matches.py`, `claims.py`, `rescue.py`, `warnings.py`, `pet_qr.py`). |
| **Phase 4** | **API & Preference Management** | Add preference endpoints in `notifications.py` and test mailer endpoint for Admins. |
| **Phase 5** | **Frontend UI Settings** | Add Notification Preference switches in `ResidentSettings.tsx` and official settings pages. |
| **Phase 6** | **End-to-End Verification & Audit** | Run full test suite, verify delivery logs, and audit against the specification. |
