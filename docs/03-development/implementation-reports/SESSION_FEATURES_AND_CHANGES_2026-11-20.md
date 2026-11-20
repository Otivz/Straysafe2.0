# Features Added and Changed — 2026-11-20

Summary of all features, UI/UX improvements, and bug fixes implemented in StraySafe 2.0 on **2026-11-20**.

---

## 1. New Features Added

### 1.1 QR Collar Request Workflow (Resident & Subdivision Admin)
- **Resident Side (`frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`)**
  - Added **Request QR Collar** action on the Resident Pet Details page with optional request notes.
  - Displays active request status (`Pending`, `Accepted`, `Ready for Pickup`), direct **Open pickup message** link once ready, and full **Request history** with timestamps and admin names.
  - Prevents duplicate active requests for the same pet.
- **Subdivision Admin Side (`frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`)**
  - Integrated a **QR Collar Requests** tab inside **Pet Registry** showing status summary counts, search/status filtering, resident & pet details, **Accept Request**, **Ready for Pickup & Notify** dialog, **Open Conversation**, and **Mark Picked Up**.
  - Clicking a `qr_collar_request` notification navigates directly to `/pets?tab=collar-requests`.
- **Backend & Messaging Integration (`backend/app/models/qr_collar_request.py`, `backend/app/services/qr_collar_requests.py`, `backend/app/routes/qr_collar_requests.py`, `backend/app/db_migrations/case_alignment.py`, `backend/app/main.py`)**
  - Persists requests in `qr_collar_requests` with status history, timestamps, and processing admin tracking.
  - Notifies Subdivision Leaders when a request is submitted, notifies residents on status changes, and automatically sends a message via `case_messaging.send` when marked **Ready for Pickup**.
- **Change record:** [`2026-11-20_0608_qr-collar-request-workflow.md`](../../05-operations/agents/feature-updates/2026-11-20_0608_qr-collar-request-workflow.md)

### 1.2 Multi-Organization External Coordination Settings & Per-Organization Referral Autofill
- **Separate Settings Sections (`frontend/src/admin/pages/SettingsPage.tsx`)**
  - **Subdivision info & contact** (`?section=profile`): Strictly subdivision-specific identity, office contact person, phone, email, address, and hours (removed all barangay fields/labels from this section).
  - **External coordination** (`?section=external`): Dedicated page to add, edit, and remove multiple external organizations (`Barangay`, `Veterinary Clinic / Office`, `Municipal / City Veterinary Office`, `Animal Welfare Organization`, `Animal Control Unit`, `Other External Agency`), each with its own contact person, phone, email, and office address.
- **Strict Per-Organization Autofill (`backend/app/schemas/case.py`, `frontend/src/admin/components/SubdivisionContactFields.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`)**
  - Added `ExternalAgencyContact` and `agencies` to `CaseSettings.external_coordination` (automatically preserving legacy Barangay data).
  - Referral and coordination forms strictly populate only the selected receiving organization's saved contact details, reset immediately when switching organizations, leave unsaved fields blank for manual input, and never fall back to Barangay details for other agencies.
- **Change records:**
  - [`2026-11-20_0544_separate-subdivision-and-external-coordination-settings.md`](../../05-operations/agents/feature-updates/2026-11-20_0544_separate-subdivision-and-external-coordination-settings.md)
  - [`2026-11-20_0627_multi-external-coordination-agencies.md`](../../05-operations/agents/feature-updates/2026-11-20_0627_multi-external-coordination-agencies.md)

### 1.3 Authorized Report Links & Animal Photos in Report-Related Admin Messages
- **Backend (`backend/app/services/case_messaging.py`)**
  - Automatically appends a direct report link (`/resident-app/reports/<ref>`) when Subdivision Administration sends a message in a report-linked thread, strictly gated by `report_visibility.viewer_access` (or `/resident-app/ownership/<request_id>` for pending ownership verification).
  - Includes `report_photos` (up to 2 animal images from `ReportMedia`, or 1 per report when `related_report_id` is linked) in `view()`.
- **Frontend (`frontend/src/admin/components/MessageThread.tsx`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/reports/ConversationPage.tsx`)**
  - Renders `/resident-app/reports/<ref>` paths as clickable `View report (<ref>)` links.
  - Displays up to 2 animal photos (and a `View report` link when authorized) at the top of report-linked resident conversations when `OwnershipVerificationCard` is not already shown.
- **Change record:** [`2026-11-20_0454_report-link-and-photos-in-admin-messages.md`](../../05-operations/agents/feature-updates/2026-11-20_0454_report-link-and-photos-in-admin-messages.md)

### 1.4 2nd Warning Summons Date & Time
- **Issue a Warning Dialog (`frontend/src/admin/dialogs/ActionDialogs.tsx`)**
  - Added a required **Date and time of summon** (`datetime-local`) field when **Warning level** is set to `2nd Warning`.
  - Passes `summons_at` and formatted `summons_date` (via `field_overrides`) to `previewWarningTemplate` and `case/issueWarning` to populate `{{summons_date}}`.
- **Change record:** [`2026-11-20_0500_second-warning-summons-datetime.md`](../../05-operations/agents/feature-updates/2026-11-20_0500_second-warning-summons-datetime.md)

### 1.5 Dedicated Resident New Message Composition Page
- **Resident Messaging (`frontend/src/resident/pages/messages/MessagesPage.tsx`, `frontend/src/resident/pages/messages/NewMessagePage.tsx`, `frontend/src/resident/ResidentApp.tsx`)**
  - Moved the **New Message** button to the bottom-right corner of the Messages screen as a sticky floating button.
  - Replaced the modal/sheet composer with a dedicated route (`/resident-app/messages/new`) styled to match `ConversationPage`, navigating straight to `/conversations/:thread_id` after sending.
- **Change records:**
  - [`2026-11-20_0445_resident-new-message-page.md`](../../05-operations/agents/feature-updates/2026-11-20_0445_resident-new-message-page.md)
  - [`2026-11-20_0526_fix-new-message-thread-id.md`](../../05-operations/agents/feature-updates/2026-11-20_0526_fix-new-message-thread-id.md)

---

## 2. UI/UX Improvements & Cleanups

### 2.1 Actions & Follow-ups Tab Cleanup and Consolidation
- **Removed redundant UI elements (`frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`)**
  - Removed the duplicate **Activity timeline** block from `ActionsTab.tsx` (since the **History** tab already records all case activity).
  - Hid redundant **Send Warning** and **Create Referral** buttons inside the Follow-ups tab cards (actions remain accessible from Response actions / Actions menu).
  - Consolidated the two duplicate Warnings sections on `ActionsTab.tsx` into a single **Warning & compliance observations** section while retaining acknowledgment badges, owner responses/clarifications, and **Conversation** links inside `WarningCard`.
  - Removed the 3 referral KPI summary cards (`Total Referrals`, `Active / In Progress`, `Resolved`) from `CaseReferralsSection`.
- **Change records:**
  - [`2026-11-20_0438_actions-tab-cleanup.md`](../../05-operations/agents/feature-updates/2026-11-20_0438_actions-tab-cleanup.md)
  - [`2026-11-20_0512_consolidate-warnings-section.md`](../../05-operations/agents/feature-updates/2026-11-20_0512_consolidate-warnings-section.md)
  - [`2026-11-20_0615_remove-referral-kpi-cards.md`](../../05-operations/agents/feature-updates/2026-11-20_0615_remove-referral-kpi-cards.md)

### 2.2 Visual Polish & Animations for Warnings and External Referrals
- **Styled Cards & Motion (`frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`)**
  - Added staggered `sa-fade-up` entrance animations, hover lift/border transitions, warm gradient card surfaces, status-colored left border accents, inset violation details with `[overflow-wrap:anywhere]`, and smooth observation progress bar transitions.
- **Change record:** [`2026-11-20_0549_polish-warnings-and-referrals-ui.md`](../../05-operations/agents/feature-updates/2026-11-20_0549_polish-warnings-and-referrals-ui.md)

### 2.3 Dialog Simplifications
- **Send Official Warning Dialog (`frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`)**: Removed the Barangay Official Contact Information block from `SendOwnerWarningDialog`.
  - Change record: [`2026-11-20_0440_remove-barangay-contact-from-send-warning.md`](../../05-operations/agents/feature-updates/2026-11-20_0440_remove-barangay-contact-from-send-warning.md)
- **Create External Referral Dialog (`frontend/src/admin/dialogs/CoordinationDialogs.tsx`)**: Removed the redundant **Receiving External Agency Contact Details (Optional)** block and **Agency Category** dropdown.
  - Change records:
    - [`2026-11-20_0633_remove-duplicate-receiving-agency-contact-box.md`](../../05-operations/agents/feature-updates/2026-11-20_0633_remove-duplicate-receiving-agency-contact-box.md)
    - [`2026-11-20_0639_remove-agency-category-from-referral-dialog.md`](../../05-operations/agents/feature-updates/2026-11-20_0639_remove-agency-category-from-referral-dialog.md)

### 2.4 Resident Messaging Mobile Responsiveness (No Horizontal Scroll)
- **Layout & Wrapping Fixes (`frontend/src/admin/components/MessageThread.tsx`, `frontend/src/resident/pages/reports/ConversationPage.tsx`, `frontend/src/resident/pages/reports/OwnershipVerificationCard.tsx`, `frontend/src/resident/pages/messages/NewMessagePage.tsx`)**
  - Added `overflow-x-hidden`, `min-w-0` on flex/grid containers and bubble wrappers, `[overflow-wrap:anywhere]` on message text, system notices, inline links, and animal detail fields, plus vertical-only scrolling on mobile viewports.
- **Change record:** [`2026-11-20_0530_resident-messaging-mobile-no-horizontal-scroll.md`](../../05-operations/agents/feature-updates/2026-11-20_0530_resident-messaging-mobile-no-horizontal-scroll.md)
