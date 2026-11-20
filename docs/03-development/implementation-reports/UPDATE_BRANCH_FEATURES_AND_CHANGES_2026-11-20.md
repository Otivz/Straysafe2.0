# `update` Branch — Complete Features, Changes & Audit Report (2026-11-20)

- **Branch:** `update` (`072fc70 Gluck Tom`)
- **Base compared:** `main` (`ca831d5 Merge pull request #113 from Otivz/newupdate`) via `qr` (`5082421 QRTESTING`)
- **Scope:** 230+ files across Backend, Frontend (Subdivision Admin & Resident), Database Schema/Migrations, Tests, and Documentation (**57 feature-update change records** from `2026-11-18` to `2026-11-20`).

---

## 1. Pet QR Tags & QR Collar Request Workflow

### 1.1 Permanent Pet QR Tags (Phases 1–4 + Permanent Tag Simplification)
- **One Permanent Unique QR Tag per Pet:** Auto-generates a unique `PetTag` (`pet_tags`) on pet registration (`UNIQUE (pet_id)` via `uq_pet_tags_pet_id`), persists across profile edits and Lost/Found transitions, and removes Replace/Turn Off tag workflows (`backend/app/models/pet_tag.py`, `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`).
- **60-Minute Scan Cooldown:** Added `pet_tags.last_scanned_at` and `FOR UPDATE` locking to enforce a 1-hour per-tag scan cooldown with live countdown feedback.
- **Public Scan & In-App Scanner:** Public `/t/<token>` scan card (`TagScanPage.tsx`) with lost banner, safety note, optional photo/phone "tell the owner" flow (`pet_tag_scans`), interactive map pin, and "Scan a pet tag" (`ScanTagPage.tsx`) on Resident Home/Community.
- **Resident & Admin UI:** View/Print (`PetTagPage.tsx`), Download PNG (`PetTagSection.tsx`), resolved scan history moved to Pet History, and `QR tag` badge in Admin Pet Registry (`PetsPage.tsx`, `PetTagBlocks.tsx`).

### 1.2 QR Collar Request Workflow (Resident & Subdivision Admin)
- **Resident Side (`frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`):**
  - Added **Request QR Collar** button with optional notes on Pet Details.
  - Displays current active request status (`Pending`, `Accepted`, `Ready for Pickup`), direct **Open pickup message** link once ready, and full **Request history** with timestamps and admin names.
  - Prevents duplicate active requests for the same pet.
- **Subdivision Admin Side (`frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`):**
  - Integrated a **QR Collar Requests** tab in **Pet Registry** with status summary counts, search/status filters, resident & pet details, **Accept Request**, **Ready for Pickup & Notify** dialog, **Open Conversation**, and **Mark Picked Up**.
  - Clicking a `qr_collar_request` notification navigates directly to `/pets?tab=collar-requests`.
- **Backend & Messaging Integration (`backend/app/models/qr_collar_request.py`, `backend/app/services/qr_collar_requests.py`, `backend/app/routes/qr_collar_requests.py`):**
  - Persists requests in `qr_collar_requests`, notifies Subdivision Leaders on submission, notifies residents on status changes, and sends an automated pickup message via `case_messaging.send` when marked **Ready for Pickup**.

---

## 2. Messaging & Notifications

### 2.1 Resident-to-Administration & Case Messaging
- **Core Messaging (`backend/app/services/case_messaging.py`, `backend/app/routes/case_messages.py`):**
  - Supports report-linked `direct` conversations, `general` inquiries (`report_id` nullable on `case_message_threads`), `bridge` owner/finder coordination, `subject`, `close_trigger`, and `last_delivered_message_id` delivery/read watermarks.
  - Automatic server-side thread closure when a linked case is resolved or closed (`case_closure.py`).
- **Admin Inbox & Shared Thread UI (`frontend/src/admin/pages/MessagesPage.tsx`, `frontend/src/admin/components/MessageThread.tsx`):**
  - Messenger-style chat header, date separators, sender initials/role badges, auto-scroll, and fixed bottom composer.
- **Resident Dedicated New Message Page (`frontend/src/resident/pages/messages/MessagesPage.tsx`, `NewMessagePage.tsx`, `ResidentApp.tsx`):**
  - Moved **New Message** to a sticky bottom-right floating button and replaced the composer sheet with a dedicated `/resident-app/messages/new` page that opens `/conversations/:thread_id` after sending.
- **Authorized Report Links & Animal Photos in Report-Related Messages:**
  - Automatically appends `/resident-app/reports/<ref>` when Subdivision Administration replies in a report-linked thread (strictly gated by `report_visibility.viewer_access`, or `/resident-app/ownership/<request_id>` for pending verification) and renders clickable `View report (<ref>)` links in `MessageThread.tsx`.
  - Returns `report_photos` (up to 2 animal photos) and renders them at the top of `ConversationPage.tsx` when `OwnershipVerificationCard` is not already shown.
- **Mobile Responsiveness:**
  - Eliminated horizontal scrolling across `MessageThread.tsx`, `ConversationPage.tsx`, `OwnershipVerificationCard.tsx`, and `NewMessagePage.tsx` using `overflow-x-hidden`, `min-w-0`, and `[overflow-wrap:anywhere]`.

---

## 3. Possible Pet Owner Verification & Official Warnings

### 3.1 Possible Pet Owner Verification
- **End-to-End Verification (`backend/app/services/owner_verification.py`, `backend/app/routes/owner_verification.py`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`):**
  - Lists candidate pet owners on a case, enables **Contact Possible Owner**, follow-ups, **Unable to Contact**, side-by-side animal comparison (`OwnershipVerificationCard.tsx` / `OwnershipVerificationPage.tsx`) with Yes/No response, final staff verification decision, and full event history.
- **Notification & Message Links:** Clicking an `ownership_verification` or `warning_letter` notification/message link routes directly to the verification or warning letter screen.

### 3.2 Official Warning Enhancements
- **Owner Warnings (`backend/app/models/warning.py`, `backend/app/routes/warnings.py`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`):**
  - Added `warning_category`, `warning_subject`, `additional_details`, `supporting_documents`, `admin_notes`, `workflow_status`, `owner_response`, `owner_responded_at`, `thread_id`, and `client_request_id`.
  - Added required **Date and time of summon** (`datetime-local`) field when issuing a **2nd Warning**, populating `summons_at` and `{{summons_date}}`.
  - Consolidated duplicate Warnings panels in `ActionsTab.tsx` into a single **Warning & compliance observations** section (retaining acknowledgment badges, owner responses, **Conversation** link, PDF/DOCX downloads, and compliance observations).
  - Removed Barangay Official Contact block from `SendOwnerWarningDialog`.

---

## 4. Reporting Workflows, Matching & Duplicate Review

### 4.1 Specialized Reporting & Validation
- **Injured / Sick & Dangerous Animal Workflows (`backend/app/utils/injured_rules.py`, `backend/app/utils/dangerous_rules.py`):**
  - Specialized resident questions (mobility, bite/rabies risk), automatic `Urgent` priority assignment, urgent leader notifications, Attention Queue surfacing, and specialized safety/clinical assessments and closure dispositions.
- **Animal Type, Breed & Colour Rules (`backend/app/routes/reports.py`, `backend/app/routes/pets.py`, `frontend/src/resident/components/BreedInput.tsx`, `DetailsPage.tsx`, `PetFormPage.tsx`):**
  - Restricted animal type options to **Dog**, **Cat**, and **Others** (with custom animal text stored in `reports.animal_type` `VARCHAR(100)`).
  - Added searchable `BreedInput` combobox with species-specific breed suggestions and freeform custom typing.
  - Enforced **mandatory photo upload** on both report submission and pet registration (frontend + backend).
  - Stored multi-colour arrays in `pets.colors` and `reports.animal_colors`.

### 4.2 Multi-Attribute Matching & Related/Duplicate Report Review
- **Multi-Attribute Animal Matching (`backend/app/utils/match_scoring.py`, `backend/app/services/lost_found_matching.py`):**
  - 5-attribute scoring engine (`analysis`, `algorithm`, `history`, `visual`, `review_note` on `lost_found_matches`), Leader review workflow, recalculation, and AI photo comparison.
  - Enforced strict 3-step validation: Species match -> Normalized Breed match -> Partial Colour Overlap via set intersection (`Insufficient Information` when missing).
- **Related Report Review & Merging (`backend/app/utils/duplicate_detection.py`, `frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`, `RelatedReportsBlock.tsx`):**
  - Renamed Duplicate Report Review to **Related Report Review**, consolidated candidate cards, enforced species filtering, and added side-by-side comparison and unmerge support.

---

## 5. External Coordination, Multi-Organization Settings & Referrals

### 5.1 Separated Settings & Multi-Organization Management
- **Subdivision Info & Contact (`?section=profile` in `frontend/src/admin/pages/SettingsPage.tsx`):**
  - Strictly subdivision-specific identity and office contact fields (removed all barangay references/fields).
- **External Coordination (`?section=external` in `SettingsPage.tsx`, `backend/app/schemas/case.py`):**
  - Supports adding, editing, and removing multiple external agencies (`Barangay`, `Veterinary Clinic / Office`, `Municipal / City Veterinary Office`, `Animal Welfare Organization`, `Animal Control Unit`, `Other External Agency`) stored in `CaseSettings.external_coordination.agencies`.
- **Per-Organization Referral Autofill (`frontend/src/admin/components/SubdivisionContactFields.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`):**
  - `ReferralDialog` requires selecting a receiving organization from saved External Coordination contacts (or manual entry), populates **only** that organization's saved contact details, leaves unsaved fields blank, and never falls back to Barangay contact info for other agencies.
  - Removed redundant `Receiving External Agency Contact Details (Optional)` box, `Agency Category` dropdown, and referral KPI cards from `CoordinationDialogs.tsx`.
  - Extended `barangay_referrals` and `barangay_referral_updates` with priority level, responder name, assistance provided, actions completed, progress notes, follow-up instructions, and supporting documents.

---

## 6. Case Actions, Follow-ups & UI Polish

- **Actions & Follow-ups Tab (`frontend/src/admin/pages/case/ActionsTab.tsx`, `CaseDetailPage.tsx`):**
  - Standardized `Record Follow-up` label, removed scheduling/due-date options from `Record Follow-up` modal, removed redundant `Warnings`/`Referrals` top-level tabs, removed duplicate `Activity timeline` panel and redundant `Send Warning` / `Create Referral` card buttons, and added staggered `sa-fade-up` animations, warm card surfaces, status-colored left accents, and smooth observation progress transitions.
- **Assessment Logging (`AssessmentTab.tsx`):** Automatically logs history and audit trail entries when clicking **Save Assessment**.

---

## 7. Database Schema & Migrations

Updated [Database3.4_subdivision.sql](file:///c:/Users/user/Straysafe2.0/Database3.4_subdivision.sql) and [Database3.4_subdivision.txt](file:///c:/Users/user/Straysafe2.0/Database3.4_subdivision.txt) alongside migration scripts in `backend/migrations/` and `database/migrations/`:
- **New tables:** `qr_collar_requests`, `pet_tags` (with `last_scanned_at` & `UNIQUE uq_pet_tags_pet_id`), `pet_tag_scans`.
- **Altered tables:**
  - `pets`: `+ colors (JSON)`
  - `reports`: `animal_type -> VARCHAR(100)`, `+ animal_colors (JSON)`
  - `case_message_threads`: nullable `report_id`, `+ subject`, `+ close_trigger`
  - `case_message_members`: `+ last_delivered_message_id`
  - `pet_match_confirmation_requests`: `+ thread_id`, `+ follow_up_count`, `+ last_follow_up_at`, `+ events`
  - `owner_warnings`: `+ warning_category`, `warning_subject`, `additional_details`, `supporting_documents`, `admin_notes`, `workflow_status`, `owner_response`, `owner_responded_at`, `thread_id`, `client_request_id`
  - `barangay_referrals` & `barangay_referral_updates`: `+ priority_level`, `supporting_documents`, `additional_notes`, `assistance_provided`, `actions_completed`, `responder_name`, `progress_notes`, `follow_up_instructions`
  - `lost_found_matches`: `+ analysis`, `algorithm`, `history`, `visual`, `review_note`

---

## 8. Branch Verification Summary (Observed 2026-11-20)

| Check | Result | Notes |
|---|---|---|
| Frontend production build (`cd frontend; npm run build`) | **PASS** | `tsc -b && vite build` passed with exit code `0` (2,127 modules). |
| Backend Python compile (`cd backend; ..\.venv\Scripts\python.exe -m compileall -q app`) | **PASS** | Exited with code `0` across all `app/` modules. |
| Frontend unit tests (`cd frontend; node --test tests/*.test.mjs`) | **205 pass / 15 fail** | 15 failures are stale assertions from older tests expecting pre-change behavior (missing mandatory photo in `residentLostPetFlow` / `residentRegistration`, removed `'other'` category in `residentCategories`, old label casing in `adminLiveAdapters` / `adminMonitoredCase`, and old photo/warning link expectations in `residentLiveAdapters`). |
| Documentation strict audit (`npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`) | **FAIL (pre-existing)** | Pre-existing missing `ERD`/`DFD`/audit targets in `overview.md`/`README.md`, 2 older `single-h1` files (`2026-11-13`, `2026-11-17`), and missing `CODEX.md`/`CLAUDE.md`/`CURSOR.md`/`COPILOT.md` pointers. All `2026-11-20` records passed. |
